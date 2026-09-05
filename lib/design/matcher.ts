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

import { getArchetype } from './catalog';
import { styleAffinity } from './styles';
import type { PlacedItem, SceneProduct, StyleId } from './types';

/** A catalogue row as the client receives it. */
export interface CatalogProduct {
  id: number;
  nameKa: string;
  slug: string;
  brand: string | null;
  categorySlug: string;
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
}

export type BudgetLevel = 'value' | 'balanced' | 'premium';

export interface MatchOptions {
  styleId: StyleId;
  /** Total furniture budget in GEL, or null for "no limit". */
  budgetGel?: number | null;
  /** Bias towards cheaper or dearer options within the matching set. */
  level?: BudgetLevel;
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

  for (const item of items) {
    if (byKind.has(item.kind)) continue;
    byKind.set(item.kind, candidatesFor(item.kind, catalog, options.styleId));
  }

  // Same kind in the same room → the same product (six matching dining chairs). Same kind in
  // another room → the next-best product of the same style tier, so a flat with five
  // pendants does not hang the same lamp five times. Rooms are taken in order of appearance.
  const chosenByRoom = new Map<string, CatalogProduct>();
  const rotation = new Map<string, number>();

  return items.map((item) => {
    if (item.pinned && item.product) return item;

    const candidates = byKind.get(item.kind) ?? [];
    if (candidates.length === 0) return { ...item, product: null };

    const roomKey = `${item.kind}|${item.roomId}`;
    let chosen = chosenByRoom.get(roomKey);
    if (!chosen) {
      const scored = candidates
        .map((product) => ({ product, score: scoreProduct(product, options.styleId, level, item) }))
        .sort((a, b) => b.score - a.score);
      const topAffinity = styleAffinity(options.styleId, scored[0].product.styleTags, scored[0].product.tags);
      const tier = scored.filter(
        (s) => styleAffinity(options.styleId, s.product.styleTags, s.product.tags) === topAffinity
      );
      const turn = rotation.get(item.kind) ?? 0;
      chosen = tier[turn % tier.length].product;
      rotation.set(item.kind, turn + 1);
      chosenByRoom.set(roomKey, chosen);
    }
    return {
      ...item,
      product: toSceneProduct(chosen, quantityFor(item)),
      // A product with real dimensions overrides the archetype's defaults, so the room
      // reflects the thing you would actually receive.
      size: sizeFromProduct(chosen, item),
      origin: 'style' as const,
    };
  });
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
  const pool = catalog.filter((c) => !!c.model3dUrl && c.model3dKind === kind);

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
  // Kitchen runs and rugs are sized to the room by the layout engine, not by the SKU.
  if (item.slot === 'kitchen_run' || item.slot === 'rug' || item.slot === 'curtain') {
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
    return {
      ...item,
      product: toSceneProduct(product, quantityFor(item)),
      size: sizeFromProduct(product, item),
      pinned: true,
      origin: 'studio' as const,
    };
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
