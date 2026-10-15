/**
 * Picks a real product for every furniture slot the layout engine produced.
 *
 * This runs on the **client**, against the full design catalogue fetched once from
 * `/api/design/catalog`. That is a deliberate choice: the catalogue is a few dozen kilobytes,
 * and holding it locally makes changing style, budget or a single product instantaneous
 * instead of a round trip each time.
 *
 * Selection is a transparent score, not a black box — the user can see why a piece was chosen
 * and swap it, and the same inputs always give the same room.
 */

import { blockingItems, clampInsideRoom, footprintInRoom, footprintOf, footprintsOverlap, PIECE_TOUCH_M, tucksUnder } from './manipulate';
import { getArchetype, isKitchenMaterial } from './catalog';
import { asPlacedKitchen, kitchenMaterialCandidates } from './kitchen';
import { styleAffinity } from './styles';
import { weightedOrder, weightedPick, type Rng } from './random';
import type { PlacedItem, PlanRoom, SceneProduct, StyleId, Vec2 } from './types';

/** A catalogue row as the client receives it. */
export interface CatalogProduct {
  id: number;
  nameKa: string;
  nameEn?: string | null;
  nameRu?: string | null;
  slug: string;
  brand: string | null;
  /**
   * The category the studio's code knows the product by — its own, or the nearest one up the
   * tree the code names ("sanitary" for a toilet in "Toilets"; `nearestSlug`).
   */
  categorySlug: string;
  /** The product's own category, where the shelf's rooms find it (`lib/design/shelf.ts`). */
  categoryId?: number | null;
  pricePerUnit: number;
  unit: string;
  imageUrl: string | null;
  colorHex: string | null;
  textureUrl: string | null;
  model3dKind: string | null;
  model3dUrl: string | null;
  widthCm: number | null;
  depthCm: number | null;
  heightCm: number | null;
  styleTags: unknown;
  tags: unknown;
  isFeatured: boolean;
  /** Free-form product data; surface finishes keep their texture scale and maps here. */
  specs: unknown;
  /** m² one unit covers — how a tin of paint becomes a price per square metre. */
  coveragePerUnit: number | null;
  store: SceneProduct['store'];
  /** Uploaded by the person themself, for their own flats; nobody else sees it and it costs nothing. */
  own?: boolean;
  /** An own photo waiting to be made into a model: listed under "my items", not placeable yet. */
  pending?: boolean;
}

export type BudgetLevel = 'value' | 'balanced' | 'premium';

export interface MatchOptions {
  /** The rooms the items stand in; with them, a product that does not fit its slot is not placed at that size. */
  rooms?: PlanRoom[];
  styleId: StyleId;
  /** Total furniture budget in GEL, or null for "no limit". */
  budgetGel?: number | null;
  /** Bias towards cheaper or dearer options within the matching set. */
  level?: BudgetLevel;
  /**
   * Seeded randomness (`lib/design/random`), when generating: each slot's product is drawn from
   * every candidate of its kind (`generationWeight`) instead of taken off the top, so any product
   * with a model can turn up and the same plan furnishes differently each time. None: the best.
   */
  rng?: Rng;
}

/** How often a generated kitchen run is a shop's kitchen unit (that fits the wall) rather than made to measure. */
const STORE_KITCHEN_SHARE = 0.35;

/** How strongly a style tag counts in the draw (`generationWeight`): its own style, a kindred tag, none. */
const STYLE_WEIGHT = [1, 3, 10];

/**
 * A product's chance in a generated design's draw, relative to the slot's other candidates:
 * its own style ten times another's, a price that suits the budget level up to half again as
 * likely, much wider than the slot it would fill a seventh as likely, and a product already
 * placed in another room a third — never zero, so every product with a model can appear.
 */
export function generationWeight(product: CatalogProduct, styleId: StyleId, level: BudgetLevel, slot: PlacedItem | undefined, usedElsewhere: boolean): number {
  let weight = STYLE_WEIGHT[styleAffinity(styleId, product.styleTags, product.tags)] ?? 1;
  const price = product.pricePerUnit;
  const suits = level === 'value' ? 1 / (1 + price / 1500) : level === 'premium' ? Math.min(1, price / 3000) : 1 / (1 + Math.abs(price - 1200) / 1200);
  weight *= 0.5 + suits;
  if (slot && product.widthCm && slot.slot !== 'kitchen_run' && slot.slot !== 'rug' && slot.slot !== 'curtain' && product.widthCm / 100 / slot.size.width > 1.12) weight *= 0.15;
  if (usedElsewhere) weight *= 0.35;
  return weight;
}

/**
 * Fills every unpinned slot in `items` with a product.
 *
 * Pinned items — anything the user has chosen by hand — are left exactly as they are, so
 * re-running the matcher after a budget change never undoes someone's decision.
 */
export function matchProducts(
  items: PlacedItem[],
  catalog: CatalogProduct[],
  options: MatchOptions
): PlacedItem[] {
  const level = options.level ?? inferLevel(items, catalog, options);
  const byKind = new Map<string, CatalogProduct[]>();
  const roomsById = new Map((options.rooms ?? []).map((r) => [r.id, r]));
  // Sizes settle as items are matched: earlier items count with the size they got, later
  // ones with the archetype's until their turn.
  const settled: PlacedItem[] = [];
  // Where every piece stood as laid out, before a product took its slot: which chairs the
  // engine tucked under their table is read off these (`tuckedChair`).
  const slots = new Map(items.map((item) => [item.id, item]));

  for (const item of items) {
    if (byKind.has(item.kind)) continue;
    byKind.set(item.kind, candidatesFor(item.kind, catalog, options.styleId));
  }

  // Same kind in the same room → the same product (six matching dining chairs). Same kind in
  // another room → the next-best product of the same style tier, so a flat with five
  // pendants does not hang the same lamp five times. Rooms are taken in order of appearance.
  const chosenByRoom = new Map<string, CatalogProduct>();
  const rotation = new Map<string, number>();
  // Generating: the products of each kind already placed, drawn less often in the next room.
  const usedByKind = new Map<string, Set<number>>();

  return items.map((item, index) => {
    const finish = (matched: PlacedItem) => {
      settled.push(matched);
      return matched;
    };
    if (item.pinned && item.product) return finish(item);

    const candidates = byKind.get(item.kind) ?? [];

    // A kitchen run along its wall is made to measure ("ავეჯის დამზადება"): stretched to the
    // run the engine laid, in one of the kitchen maker's materials (the style's, or drawn), bought
    // by its façade. Generating, now and then a shop's kitchen unit that fits the run takes it
    // instead, at its own size and price — so the shops' units turn up too.
    // Wall cabinets over the run: over a shop's unit, none (the shop's run is its own design);
    // over a run made to measure, made to measure in the same material's wall version (the
    // grey-oak run under grey-oak cabinets), else one drawn like the run's; with no wall-cabinet
    // material, a shop's wall cabinet that fits.
    if (item.slot === 'kitchen_wall') {
      const run = settled.find((i) => i.roomId === item.roomId && i.slot === 'kitchen_run');
      if (run && run.custom === false) return finish({ ...item, product: null });
      const materials = kitchenMaterialCandidates(catalog, options.styleId, item.slot).filter((m) => m.model3dKind === item.slot);
      if (materials.length > 0) {
        const runFinish = run?.kitchenMaterial?.slug?.split('-').pop();
        const rng = options.rng;
        const material = materials.find((m) => runFinish && m.slug.endsWith(`-${runFinish}`)) ?? (rng ? weightedPick(materials, (m) => STYLE_WEIGHT[styleAffinity(options.styleId, m.styleTags, m.tags)] ?? 1, rng) : null) ?? materials[0];
        return finish(asPlacedKitchen({ ...item, product: toSceneProduct(material, quantityFor(item)), origin: 'style' as const }, material));
      }
    }

    if (item.slot === 'kitchen_run') {
      const materials = kitchenMaterialCandidates(catalog, options.styleId, item.slot).filter((m) => !m.model3dKind || m.model3dKind === item.slot);
      // Only what is a run — floor-standing, worktop-high or more, wider than deep: the library files
      // hobs, coffee machines and a wall cabinet under the same kind.
      const units = candidates.filter((p) => !!p.widthCm && !!p.depthCm && !!p.heightCm && p.widthCm / 100 <= item.size.width + 0.01 && p.heightCm >= 80 && p.depthCm >= 45 && p.widthCm >= 100 && p.widthCm > p.depthCm);
      const rng = options.rng;
      if (materials.length > 0 && !(rng && units.length > 0 && rng() < STORE_KITCHEN_SHARE)) {
        const material = rng ? (weightedPick(materials, (m) => STYLE_WEIGHT[styleAffinity(options.styleId, m.styleTags, m.tags)] ?? 1, rng) ?? materials[0]) : materials[0];
        return finish(asPlacedKitchen({ ...item, product: toSceneProduct(material, quantityFor(item)), origin: 'style' as const }, material));
      }
      if (materials.length > 0 && rng) {
        const unit = weightedPick(units, (p) => generationWeight(p, options.styleId, level, item, false), rng) ?? units[0];
        return finish(asPlacedKitchen({ ...item, product: toSceneProduct(unit, quantityFor(item)), size: sizeFromProduct(unit, item), origin: 'style' as const }, unit));
      }
    }
    if (candidates.length === 0) return finish({ ...item, product: null });

    const room = roomsById.get(item.roomId);
    const others = [...settled, ...items.slice(index + 1)];
    const scored = candidates
      .map((product) => ({ product, score: scoreProduct(product, options.styleId, level, item) }))
      .sort((a, b) => b.score - a.score);

    const roomKey = `${item.kind}|${item.roomId}`;
    let chosen = chosenByRoom.get(roomKey);
    const rng = options.rng;
    const used = usedByKind.get(item.kind) ?? new Set<number>();
    const weigh = (product: CatalogProduct) => generationWeight(product, options.styleId, level, item, used.has(product.id));
    if (!chosen && rng) {
      chosen = weightedPick(candidates, weigh, rng) ?? scored[0].product;
      chosenByRoom.set(roomKey, chosen);
    }
    if (!chosen) {
      const topAffinity = styleAffinity(options.styleId, scored[0].product.styleTags, scored[0].product.tags);
      const tier = scored.filter(
        (s) => styleAffinity(options.styleId, s.product.styleTags, s.product.tags) === topAffinity
      );
      const turn = rotation.get(item.kind) ?? 0;
      chosen = tier[turn % tier.length].product;
      rotation.set(item.kind, turn + 1);
      chosenByRoom.set(roomKey, chosen);
    }

    // The product's real size has to fit where the slot is. A sofa wider than the wall it was
    // laid against, or a cabinet that would stand in the doorway, is not placed at that size:
    // the next-best product that fits takes the slot, and when nothing fits the slot stays
    // empty rather than poke through the wall.
    // The next to try when the chosen does not fit: the best first, or — generating — another draw.
    const ranked = rng ? weightedOrder(candidates, weigh, rng) : scored.map((s) => s.product);
    const placed = room ? placeFitting(item, chosen, ranked, room, others, slots) : { product: chosen, position: item.position };
    if (!placed) return finish({ ...item, product: null });
    used.add(placed.product.id);
    usedByKind.set(item.kind, used);
    return finish({
      ...item,
      position: placed.position,
      product: toSceneProduct(placed.product, quantityFor(item)),
      // A product with real dimensions overrides the archetype's defaults, so the room
      // reflects the thing you would actually receive.
      size: sizeFromProduct(placed.product, item),
      origin: 'style' as const,
      // A run with no kitchen maker's material in the catalogue is still made to measure — the joiner's estimate.
      ...(item.slot === 'kitchen_run' ? { custom: true, size: item.size } : {}),
    });
  });
}

/** Slots the layout engine sizes itself, or that float above the floor — size is not a fit question there. */
function fitMatters(item: PlacedItem): boolean {
  if (item.slot === 'kitchen_run' || item.slot === 'rug' || item.slot === 'curtain') return false;
  if (getArchetype(item.kind)?.ghost) return false;
  return item.elevationM < 0.05;
}

/**
 * The preferred product when it fits at the slot (nudged inside the room if it only just
 * pokes out), otherwise the best-scoring candidate that does; null when none does.
 */
function placeFitting(
  item: PlacedItem,
  preferred: CatalogProduct,
  ranked: CatalogProduct[],
  room: PlanRoom,
  others: PlacedItem[],
  slots: ReadonlyMap<string, PlacedItem>
): { product: CatalogProduct; position: Vec2 } | null {
  if (!fitMatters(item)) return { product: preferred, position: item.position };
  const blockers = blockingItems(others, room.id, item.id).map((other) => ({
    other,
    box: footprintOf(other.position, other.size, other.rotation),
    chair: tuckedChair(item, other, slots),
  }));
  const tryProduct = (product: CatalogProduct): Vec2 | null => {
    const size = sizeFromProduct(product, item);
    const position = clampInsideRoom(room, item.position, size, item.rotation);
    const footprint = footprintOf(position, size, item.rotation);
    if (!footprintInRoom(footprint, room.polygon)) return null;
    for (const { other, box, chair } of blockers) {
      // Pieces may touch; a chair the engine tucked under its table may stand under it by up
      // to half its depth besides — its seat under the top, its back clear of it.
      const depth = chair === item ? size.depth : chair === other ? other.size.depth : 0;
      if (footprintsOverlap(footprint, box, Math.max(PIECE_TOUCH_M, depth / 2))) return null;
    }
    return position;
  };
  const first = tryProduct(preferred);
  if (first) return { product: preferred, position: first };
  for (const product of ranked) {
    if (product.id === preferred.id) continue;
    const position = tryProduct(product);
    if (position) return { product, position };
  }
  return null;
}

/**
 * The chair of a dining chair and the table the layout engine tucked it under (`tucksUnder`) —
 * their slots, as laid out, overlapping: `placeSeatAroundTable` pushes a seat in when the room
 * is tight — or null for any other pair, a chair the engine left clear of its table included.
 *
 * Only the engine's tucks, and only up to half the chair, where the studio lets a person put
 * any chair under any table: here a product of another size takes the engine's slot, and with
 * the pair free, table products bigger than their slots came to stand over the chairs round
 * them — some all but wholly — in rooms where the engine had tucked no chair at all.
 */
function tuckedChair(a: PlacedItem, b: PlacedItem, slots: ReadonlyMap<string, PlacedItem>): PlacedItem | null {
  if (!tucksUnder(a, b)) return null;
  const p = slots.get(a.id);
  const q = slots.get(b.id);
  if (!p || !q || !footprintsOverlap(footprintOf(p.position, p.size, p.rotation), footprintOf(q.position, q.size, q.rotation), 0)) return null;
  return getArchetype(a.kind)?.slot === 'dining_chair' ? a : b;
}

/** Every catalogue row that could fill this slot, best first. */
export function candidatesFor(
  kind: string,
  catalog: CatalogProduct[],
  styleId: StyleId
): CatalogProduct[] {
  const archetype = getArchetype(kind);
  if (!archetype) return [];

  // Only products modelled as exactly this archetype, and only those with a model to draw.
  // There used to be a fallback to the whole category; with every product carrying a kind it
  // did nothing but stretch a picture frame to curtain size when no curtain existed. An
  // empty slot is the honest answer.
  // A kitchen maker's material with a model is drawn through the kitchen it is chosen for, not placed or swapped in as a piece.
  const pool = catalog.filter((c) => !!c.model3dUrl && c.model3dKind === kind && !isKitchenMaterial(c));

  return [...pool].sort(
    (a, b) => styleAffinity(styleId, b.styleTags, b.tags) - styleAffinity(styleId, a.styleTags, a.tags)
  );
}

function scoreProduct(product: CatalogProduct, styleId: StyleId, level: BudgetLevel, slot?: PlacedItem): number {
  // Style match dominates: a Scandinavian room should not be furnished from the loft range
  // just because something there is cheaper.
  let score = styleAffinity(styleId, product.styleTags, product.tags) * 100;

  // The layout engine may have found only a narrow wall for this slot. A product that is
  // much wider than the slot would overlap the door the slot was squeezed beside, so it drops
  // below anything that fits — but stays available in the swap panel.
  if (slot && product.widthCm && slot.slot !== 'kitchen_run' && slot.slot !== 'rug' && slot.slot !== 'curtain') {
    const over = product.widthCm / 100 / slot.size.width;
    if (over > 1.12) score -= 60 + Math.min(60, (over - 1.12) * 100);
  }

  // Within the matching set, price preference decides.
  const price = product.pricePerUnit;
  if (level === 'value') score += Math.max(0, 40 - price / 100);
  if (level === 'premium') score += Math.min(40, price / 150);
  if (level === 'balanced') score += 20 - Math.abs(price - 1200) / 120;

  if (product.isFeatured) score += 6;
  // Real dimensions mean the piece will sit correctly in the room.
  if (product.widthCm && product.depthCm && product.heightCm) score += 8;
  if (product.imageUrl) score += 4;
  if (product.model3dUrl) score += 10;

  return score;
}

/**
 * Chooses a price tier that lands near the user's budget.
 *
 * Rather than dropping items when money runs short — which produces a half-empty room — the
 * whole scheme shifts down a tier, which is what a designer working to a number would do.
 */
function inferLevel(
  items: PlacedItem[],
  catalog: CatalogProduct[],
  options: MatchOptions
): BudgetLevel {
  const budget = options.budgetGel;
  if (!budget || budget <= 0) return 'balanced';

  const estimate = (level: BudgetLevel) =>
    items.reduce((sum, item) => {
      const candidates = candidatesFor(item.kind, catalog, options.styleId);
      if (candidates.length === 0) return sum;
      const best = candidates
        .map((product) => ({ product, score: scoreProduct(product, options.styleId, level) }))
        .sort((a, b) => b.score - a.score)[0].product;
      return sum + best.pricePerUnit * quantityFor(item);
    }, 0);

  const balanced = estimate('balanced');
  if (balanced <= budget) {
    return estimate('premium') <= budget ? 'premium' : 'balanced';
  }
  return 'value';
}

/**
 * How many units of a product a slot consumes.
 *
 * Rugs and kitchen counters are sold by area or by the metre, so a 4.8 m run of units costs
 * more than the 3 m the catalogue price quotes.
 */
export function quantityFor(item: PlacedItem): number {
  if (item.slot === 'kitchen_run') {
    return round2(Math.max(1, item.size.width / 3));
  }
  if (item.slot === 'curtain') {
    return round2(Math.max(1, item.size.width / 2));
  }
  return 1;
}

function sizeFromProduct(product: CatalogProduct, item: PlacedItem): PlacedItem['size'] {
  // Rugs and curtains are sized to the room by the layout engine, not by the SKU, and so is a
  // kitchen made to measure (its product a kitchen maker's material). A shop's kitchen unit is its own size.
  if (item.slot === 'rug' || item.slot === 'curtain' || ((item.slot === 'kitchen_run' || item.slot === 'kitchen_wall' || item.slot === 'kitchen_island') && isKitchenMaterial(product))) {
    return item.size;
  }
  if (!product.widthCm || !product.depthCm || !product.heightCm) return item.size;

  return {
    width: product.widthCm / 100,
    depth: product.depthCm / 100,
    height: product.heightCm / 100,
  };
}

export function toSceneProduct(product: CatalogProduct, qty: number): SceneProduct {
  return {
    productId: product.id,
    nameKa: product.nameKa,
    nameEn: product.nameEn ?? null,
    nameRu: product.nameRu ?? null,
    slug: product.slug,
    brand: product.brand,
    pricePerUnit: product.pricePerUnit,
    unit: product.unit,
    qty,
    totalPrice: round2(product.pricePerUnit * qty),
    imageUrl: product.imageUrl,
    colorHex: product.colorHex,
    textureUrl: product.textureUrl,
    model3dUrl: product.model3dUrl,
    categorySlug: product.categorySlug,
    store: product.store,
  };
}

/** Swaps one item's product, marking it pinned so re-matching leaves it alone. */
export function applySwap(
  items: PlacedItem[],
  itemId: string,
  product: CatalogProduct
): PlacedItem[] {
  return items.map((item) => {
    if (item.id !== itemId) return item;
    // A kitchen maker's material makes a kitchen piece made to measure; a shop's unit, a unit (`asPlacedKitchen`).
    return asPlacedKitchen(
      {
        ...item,
        product: toSceneProduct(product, quantityFor(item)),
        size: sizeFromProduct(product, item),
        pinned: true,
        origin: 'studio' as const,
      },
      product
    );
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
