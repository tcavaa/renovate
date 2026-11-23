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

import { isBidet, isBuiltInBath, isRectangularBath, isShowerDoor } from './productRoles';
import { blockingItems, blocksWindow, clampInsideRoom, clearsUnder, floorFootprint, footprintInRoom, footprintOf, footprintsOverlap, inDoorway, isPlacementValid, pieceWall, PIECE_TOUCH_M, type Footprint, type KeepClear } from './manipulate';
import { followsWhenMatched, isTuckingChair, measuredRule, seatedTogether, tucksUnder } from './relations';
import { getArchetype, isKitchenMaterial, type Archetype } from './catalog';
import { isPlausibleForGeneration } from './plausibility';
import { roomEdges } from './planGeometry';
import { ISLAND_CLEAR_M, seatSlots } from './autoLayout';
import { asPlacedKitchen, kitchenMaterialCandidates } from './kitchen';
import { isCustomKitchenSlot, LAID_TO_ANOTHER, SIZED_BY_LAYOUT } from './kinds';
import { BALCONY_CHAIR_MAX_M, BASIN_TOP_M, COMPACT_TABLE_SIDES_M, COMPACT_TABLE_SLACK_M, KITCHEN_CIRCULATION_M, MATCHED_ABOVE_GAP_M, PENDANT_BOTTOM_M, PENDANT_OVER_TABLE_BOTTOM_M, TV_WIDTH_PER_INCH_M, WC_BOX_DEPTH_M, WC_SIDE_M, tvInchesFor } from './rules';
import { round2, wallBehind } from './pieceGeometry';
import { styleAffinity } from './styles';
import { guideFit, styleRejects } from './styleGuide';
import { seededRng, weightedOrder, weightedPick, type RoomRng, type Rng } from './random';
import { isStudio, partAt, partName, partOfId, partRoom, studioParts } from './studio';
import { hangPendants, isLampClone, pendantRehung, pendantSizing } from './ceilingLights';
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
  /**
   * The floor the layout was told to keep clear, per room (`LayoutOptions.obstacles`: the strip
   * before each radiator, the columns, the floor behind a partition): a slot takes a product that
   * keeps it clear — and a door's way, and a kitchen run's working floor — wherever one does.
   */
  keepClear?: Record<string, KeepClear[]>;
  /**
   * A designer's choices (`lib/design/aiProposal`): `${kind}|${roomId}` → product id. A pick that is
   * a candidate of the kind is taken for the room in place of the draw — and, like any choice,
   * only where it fits the slot; otherwise the matcher's own next-best takes it. A pick is held to
   * what the draw is held to: one that fits only by standing in a door's way, on `keepClear` floor
   * or on a kitchen run's working floor gives way to a product that keeps them clear (the room's
   * other candidates, then the slot's ways out), and takes the slot only when no product does.
   */
  picks?: Record<string, number>;
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
  /**
   * Per room, a stream of its own (`roomStreams`), in place of `rng`: a room's slots draw from
   * their room's, each slot's way out from one of its own (`roomRng(roomId, 'way-out:<slot id>')`),
   * so what one room draws never moves another room's products.
   */
  roomRng?: RoomRng;
}

/** How often a generated kitchen run is a shop's kitchen unit (that fits the wall) rather than made to measure. */
const STORE_KITCHEN_SHARE = 0.35;

/**
 * The kinds a flat takes in its own style when the catalogue has any (K-15, Y-7) — and, when none of
 * the style's own fits the slot, in the nearest other style's that does (`slotSteps`).
 */
const STRICT_STYLE_KINDS = new Set(['kitchen_run', 'kitchen_wall', 'kitchen_island', 'sofa_3seat', 'sofa_corner', 'bed_double', 'bed_single', 'bathtub', 'wardrobe', 'dining_table']);

/**
 * The smaller piece a slot takes when none of its own kind fits it: a three-seat sofa where the
 * corner sofa was laid; a single bed where no double fits (Nini, decision 3.2's last fallback — the
 * single beds generation takes are ones a grown-up sleeps in, `KIND_BOUNDS`).
 */
const SMALLER_KIND: Readonly<Record<string, string>> = { sofa_corner: 'sofa_3seat', bed_double: 'bed_single' };
/** The kinds whose smaller piece is the last resort, after the other styles' own (`slotSteps`): a double of another style before a single. */
const SMALLER_LAST: ReadonlySet<string> = new Set(['bed_double']);
/**
 * A kind that is another kind's product laid in a place of its own: the bedroom's rug is laid as
 * `rug_bed` — the rug under the bed — and the catalogue's rugs are all `rug`. With no product of
 * its own, its slot takes the other kind's (`slotSteps`). Named one by one: what merely fills the
 * same slot is not the same thing — a curtain would be squeezed to a blind's size, a double bed
 * stand where the single was laid, an open shelf for a bookcase.
 */
const FILED_AS: Readonly<Record<string, string>> = { rug_bed: 'rug' };

/** The kitchen maker's materials of the style when it has any, else them all (K-15). */
function styleMaterials(materials: CatalogProduct[], styleId: StyleId): CatalogProduct[] {
  const own = materials.filter((m) => styleAffinity(styleId, m.styleTags, m.tags) === 2);
  return own.length > 0 ? own : materials;
}

/** How strongly a style tag counts in the draw (`generationWeight`): its own style, a kindred tag, none. */
const STYLE_WEIGHT = [1, 3, 10];

/**
 * A product's chance in a generated design's draw, relative to the slot's other candidates:
 * its own style ten times another's, a price that suits the budget level up to half again as
 * likely, much wider than the slot it would fill a seventh as likely, and a product already
 * placed in another room a third — never zero, so every product with a model can appear.
 */
export function generationWeight(product: CatalogProduct, styleId: StyleId, level: BudgetLevel, slot: PlacedItem | undefined, usedElsewhere: boolean): number {
  // The style's tags first, then how well its colours and materials fit the style's guide (`guideFit`).
  let weight = (STYLE_WEIGHT[styleAffinity(styleId, product.styleTags, product.tags)] ?? 1) * guideFit(product, styleId);
  const price = product.pricePerUnit;
  const suits = level === 'value' ? 1 / (1 + price / 1500) : level === 'premium' ? Math.min(1, price / 3000) : 1 / (1 + Math.abs(price - 1200) / 1200);
  weight *= 0.5 + suits;
  if (slot && product.widthCm && !SIZED_BY_LAYOUT.has(slot.slot) && product.widthCm / 100 / slot.size.width > 1.12) weight *= 0.15;
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
  const pools = new Map<string, KindPool>();
  const poolOf = (kind: string): KindPool => {
    let pool = pools.get(kind);
    if (!pool) {
      pool = kindPool(kind, catalog, options.styleId);
      pools.set(kind, pool);
    }
    return pool;
  };
  const roomsById = new Map((options.rooms ?? []).map((r) => [r.id, r]));
  // Sizes settle as items are matched: earlier items count with the size they got, later
  // ones with the archetype's until their turn. A slot that got no product is not there: it is in
  // nothing's way, nothing is measured off it and nothing hangs clear of it.
  const settled: PlacedItem[] = [];
  // Where every piece stood as laid out, before a product took its slot: which chairs the
  // engine tucked under their table is read off these (`tuckedChair`), and which seat it gave
  // each chair (`seatingAt`).
  const slots = new Map(items.map((item) => [item.id, item]));
  // Each matched table's seats, which is which chair's and which are taken, by the table's id.
  const seatings = new Map<string, Seating>();

  // Same kind in the same room → the same product (six matching dining chairs). Same kind in
  // another room → the next-best product of the same style tier, so a flat with five
  // pendants does not hang the same lamp five times. Rooms are taken in order of appearance.
  const chosenByRoom = new Map<string, CatalogProduct>();
  const rotation = new Map<string, number>();
  // Generating: the products of each kind already placed, drawn less often in the next room.
  const usedByKind = new Map<string, Set<number>>();
  // The flat's draw, its last number kept: what a slot's way out is drawn from (below). Given a
  // stream per room (`roomRng`), each slot draws from its room's, and a way out from one of its own.
  let lastDraw = 0;
  const flatRng: Rng | undefined = options.rng && (() => (lastDraw = options.rng!()));
  // A studio's half draws from a stream of its own (`partName`), as it is laid out from one: the
  // half that laid the piece (its id, `partOfId`), else — a piece with no half in its id — the half it stands in.
  const rngOf = (slot: PlacedItem): Rng | undefined => {
    if (!options.roomRng) return flatRng;
    const room = roomsById.get(slot.roomId);
    return options.roomRng(slot.roomId, room && isStudio(room) ? partName({ index: partOfId(slot.roomId, slot.id) ?? partAt(room, slot.position) }) : undefined);
  };
  const wayOutOf = (slot: PlacedItem): Rng => (options.roomRng ? options.roomRng(slot.roomId, `way-out:${slot.id}`) : seededRng(lastDraw * 2 ** 32));
  // The rooms whose set of dining chairs has its first chair.
  const setStarted = new Set<string>();

  // What hangs from the ceiling is matched last, once what stands under it has its product: a
  // pendant is a large lamp or small ones by the table it hangs over as bought (`pendantSizing`) —
  // a living room's dining table is laid out after its pendant. The flat comes back in its order.
  const hangs = (item: PlacedItem) => getArchetype(item.kind)?.placement.type === 'ceiling';
  const sequence = [...items.filter((i) => !hangs(i)), ...items.filter(hangs)];
  const inSequence = sequence.map((slotItem, index) => {
    const rng = rngOf(slotItem);
    const finish = (matched: PlacedItem) => {
      if (matched.product) settled.push(matched);
      return matched;
    };
    if (slotItem.pinned && slotItem.product) return finish(slotItem);
    // A dining chair sits round the table as matched, not the archetype's: as many as the real
    // table seats, each at its place — six chairs used to stand round a 0.8 m round table. Its
    // own seat first, then the seats that are no chair's (`seatsAtTable`).
    const seating = seatsAtTable(slotItem, items, settled, slots, seatings);
    if (seating && seating.seats.length === 0) return finish({ ...slotItem, product: null });
    const seated = seating ? { ...slotItem, position: seating.seats[0].position, rotation: seating.seats[0].rotation } : slotItem;
    // A pendant over what it lights as bought (`pendantRehung`): the table as matched, never a
    // four-poster bed. The lamps hung beside it in its line are hung again with it, below.
    const hungIn = hangs(seated) && !isLampClone(seated.id) ? roomsById.get(seated.roomId) : undefined;
    const item = hungIn ? { ...seated, position: pendantRehung(hungIn, [...settled, ...sequence.slice(index + 1)], seated) } : seated;

    const candidates = poolOf(item.kind).first;

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
      const materials = styleMaterials(kitchenMaterialCandidates(catalog, options.styleId, item.slot).filter((m) => m.model3dKind === item.slot), options.styleId);
      if (materials.length > 0) {
        const runFinish = run?.kitchenMaterial?.slug?.split('-').pop();
        const material = materials.find((m) => runFinish && m.slug.endsWith(`-${runFinish}`)) ?? (rng ? weightedPick(materials, (m) => STYLE_WEIGHT[styleAffinity(options.styleId, m.styleTags, m.tags)] ?? 1, rng) : null) ?? materials[0];
        return finish(asPlacedKitchen({ ...item, product: toSceneProduct(material, quantityFor(item)), origin: 'style' as const }, material));
      }
    }

    if (item.slot === 'kitchen_run') {
      const materials = styleMaterials(kitchenMaterialCandidates(catalog, options.styleId, item.slot).filter((m) => !m.model3dKind || m.model3dKind === item.slot), options.styleId);
      // Only what is a run — floor-standing, worktop-high or more, wider than deep: the library files
      // hobs, coffee machines and a wall cabinet under the same kind.
      const runRoom = roomsById.get(item.roomId);
      // …and not one whose wall cabinets would stand across the window over the run.
      // A shop's run is taken by its kind, not its name (the owner's decision 9: no shop names its
      // sink and hob, so a name test kept every one out): what is filed as a run and has a run's
      // shape — at least 1.8 m long, a cabinet's depth, worktop-high, not tall units alone
      // (`KIND_BOUNDS`, already held by the pool: a range cooker of 166 × 67 × 80 cm was once taken
      // for the whole kitchen) — and is 90–100 % of the run's length.
      const units = candidates.filter((p) => !!p.widthCm && !!p.depthCm && !!p.heightCm && p.widthCm / 100 <= item.size.width + 0.01 && p.widthCm / 100 >= item.size.width * 0.9 && !(runRoom && blocksWindow({ ...item, size: sizeFromProduct(p, item) }, runRoom)));
      if (materials.length > 0 && !(rng && units.length > 0 && rng() < STORE_KITCHEN_SHARE)) {
        const material = rng ? (weightedPick(materials, (m) => STYLE_WEIGHT[styleAffinity(options.styleId, m.styleTags, m.tags)] ?? 1, rng) ?? materials[0]) : materials[0];
        return finish(asPlacedKitchen({ ...item, product: toSceneProduct(material, quantityFor(item)), origin: 'style' as const }, material));
      }
      if (materials.length > 0 && rng) {
        const unit = weightedPick(units, (p) => generationWeight(p, options.styleId, level, item, false), rng) ?? units[0];
        const size = sizeFromProduct(unit, item);
        // Its back on the wall the run's was on, at its own depth.
        const position = runRoom ? settledPosition(item, size, runRoom, settled) : item.position;
        return finish(asPlacedKitchen({ ...item, product: toSceneProduct(unit, quantityFor(item)), size, position, origin: 'style' as const }, unit));
      }
    }
    const room = roomsById.get(item.roomId);
    const others = [...settled, ...sequence.slice(index + 1)];
    // The slot's own products first, as drawn; then, where none of them fits it, what else may
    // take it (`slotSteps`: a smaller piece of the style, the nearest other style's) — the first
    // that fits. A product of another kind makes the piece that kind: a three-seat in a corner
    // sofa's slot is a three-seat, in the sofa's slot.
    // A way out is drawn with a draw of its own (`wayOutOf`: its own stream, or one begun from the
    // flat's last number): the pieces matched after it get the products they would have had.
    let wayOut: Rng | undefined;
    const steps = slotSteps(item.kind, poolOf);
    // What each step offers the slot — drawn once, when it is first come to.
    const offers = new Map<number, SlotOffer | null>();
    const offerAt = (step: number): SlotOffer | null => {
      const drawn = offers.get(step);
      if (drawn !== undefined) return drawn;
      const { kind, pool } = steps[step];
      const piece = kind === item.kind ? item : { ...item, kind };
      const candidates = [...pool];
      // What the slot can hold as laid out: a basin that stands on the floor (pedestal or vanity —
      // a countertop basin needs a counter the flat has not got), a mirror over a basin that hangs
      // flat and no taller than 1.2 m. The swap list still offers the rest.
      const fitting = candidates.length > 0 ? slotPool(piece, candidates, room, settled, options.styleId, level, others) : [];
      // No TV is better than one across the window beside its unit.
      // Nor a table for six in a compact table's slot (`compactTable`): the next style's small table
      // rather than the style's own large one.
      if (candidates.length === 0 || ((piece.slot === 'tv' || piece.slot === 'towel_rack' || piece.slot === 'kitchen_island' || compactTable(piece, room)) && fitting.length === 0)) {
        offers.set(step, null);
        return null;
      }
      if (fitting.length > 0 && fitting.length < candidates.length) {
        candidates.splice(0, candidates.length, ...fitting);
      }
      // A TV of the size the sofa's distance asks for (decision 1, `tvsForDistance`) first — weighted,
      // not filtered, so the others are still tried after it where it does not fit, and the draw
      // takes as many numbers as it always did.
      const sized = piece.slot === 'tv' ? new Set(tvsForDistance(candidates, piece, settled).map((p) => p.id)) : null;
      const offSize = (product: CatalogProduct) => !!sized && !sized.has(product.id);
      const scored = candidates
        .map((product) => ({ product, score: scoreProduct(product, options.styleId, level, piece) - (offSize(product) ? 1000 : 0) }))
        .sort((a, b) => b.score - a.score);

      const roomKey = `${piece.kind}|${piece.roomId}`;
      const used = usedByKind.get(piece.kind) ?? new Set<number>();
      const weigh = (product: CatalogProduct) => generationWeight(product, options.styleId, level, piece, used.has(product.id)) * (offSize(product) ? 1e-6 : 1);
      let chosen: CatalogProduct | undefined;
      let ranked: CatalogProduct[];
      if (step === 0) {
        chosen = chosenByRoom.get(roomKey);
        // A studio's two pendants are one kind in one room, but the kitchen half's small lamps over a
        // long table are not the living half's one large lamp: the room's lamp only where it is offered.
        if (chosen && getArchetype(piece.kind)?.placement.type === 'ceiling' && !candidates.includes(chosen)) chosen = undefined;
        if (!chosen && options.picks?.[roomKey] != null) {
          const picked = candidates.find((p) => p.id === options.picks![roomKey]);
          if (picked) {
            chosen = picked;
            chosenByRoom.set(roomKey, chosen);
          }
        }
        if (!chosen && rng) {
          chosen = weightedPick(candidates, weigh, rng) ?? scored[0].product;
          chosenByRoom.set(roomKey, chosen);
        }
        if (!chosen) {
          const topAffinity = styleAffinity(options.styleId, scored[0].product.styleTags, scored[0].product.tags);
          const tier = scored.filter(
            (s) => styleAffinity(options.styleId, s.product.styleTags, s.product.tags) === topAffinity && offSize(s.product) === offSize(scored[0].product)
          );
          const turn = rotation.get(piece.kind) ?? 0;
          chosen = tier[turn % tier.length].product;
          rotation.set(piece.kind, turn + 1);
          chosenByRoom.set(roomKey, chosen);
        }
        // The next to try when the chosen does not fit: the best first, or — generating — another draw.
        // The chairs round a table are one set: once the room has one, a seat its chair does not fit is
        // left empty rather than given another chair — a step stool stood among six dining chairs.
        const inSet = piece.slot === 'dining_chair' && setStarted.has(roomKey);
        ranked = inSet ? [] : rng ? weightedOrder(candidates, weigh, rng) : scored.map((s) => s.product);
      } else {
        // A way out is drawn like the slot's own: the best first, or — generating — a draw.
        if (rng) wayOut ??= wayOutOf(item);
        ranked = wayOut ? weightedOrder(candidates, weigh, wayOut) : scored.map((s) => s.product);
        chosen = ranked[0];
      }
      const offer = { piece, chosen, ranked, roomKey, used };
      offers.set(step, offer);
      return offer;
    };

    // The product's real size has to fit where the slot is. A sofa wider than the wall it was
    // laid against, or a cabinet that would stand in the doorway, is not placed at that size:
    // the next-best product that fits takes the slot, and when nothing fits — of the slot's own
    // products, then of its ways out — the slot stays empty rather than poke through the wall.
    // Four times over (`fitPasses`): first only a product that also keeps clear what the layout
    // kept clear — a door's way, the floor before a radiator, a column, the working floor of a
    // kitchen run, what it keeps round a WC or an island — through every step, each piece as the
    // floor it takes once generation has built round it (`builtFloor`: a shower its tray, a WC its
    // cistern's box); when none does, by the room, the windows and the other pieces alone, as
    // built; and when none does either, the two as they were, each piece its own box, so the room
    // keeps the piece it would have had where it would have had it.
    const passes = fitPasses(room ? (options.keepClear?.[room.id] ?? []) : []);
    // A dining chair goes through all of that at each seat it may take in turn — its own, and only
    // when it does not fit there the ones that are no chair's; anything else, where it was laid.
    const spots = seating && room ? seating.seats : [null];
    // A studio's piece stands in the half that laid it (`partRoom`, as the layout lays it) — the
    // line between the halves is open floor, but what stands across it is in the other half's
    // furniture; only where nothing of it fits there at all, anywhere in the studio, as before.
    const halves = room ? [...(studioHalf(room, item) ? [studioHalf(room, item)!] : []), room] : [undefined];
    for (const within of halves) for (const spot of spots) {
      for (const pass of passes) for (let step = 0; step < steps.length; step++) {
        const offer = offerAt(step);
        if (!offer) continue;
        const { chosen, ranked, roomKey, used } = offer;
        const piece = spot ? { ...offer.piece, position: spot.position, rotation: spot.rotation } : offer.piece;
        const placed = room ? placeFitting(piece, chosen, ranked, room, others, slots, settled, pass.keepClear, pass.asBuilt, within) : { product: chosen, position: piece.position };
        if (!placed) continue;
        if (spot) seating!.taken.add(spot.index);
        if (piece.slot === 'dining_chair') setStarted.add(roomKey);
        // The room's next piece of the kind tries the one that fitted: a set of chairs, two wardrobes alike.
        if (piece.slot === 'dining_chair' || step > 0) chosenByRoom.set(roomKey, placed.product);
        // What a balcony takes (its café table and chairs, its planters) is not counted against the
        // flat's rooms: their tables, chairs and plants are drawn as they would be with no balcony.
        if (room?.type !== 'balcony') {
          used.add(placed.product.id);
          usedByKind.set(piece.kind, used);
        }
        return finish(placedWith(piece, placed, settled, room));
      }
    }
    return finish({ ...item, product: null });
  });
  const matched = items.map((item) => inSequence[sequence.indexOf(item)]);
  const paired = pairsAlike(completePairs(matched, slots, poolOf, roomsById, options.keepClear), catalog, roomsById);
  // Each room's lamps hung over what they light as their product asks — one large, or two or three
  // small (`hangPendants`) — so the studio's re-dressing (a new style, a new budget) keeps the rule.
  return options.rooms ? hangPendants(paired, options.rooms) : paired;
}

/**
 * The tests a slot's products are put through, in turn (`placeFitting`): each piece as built
 * (`builtFloor`) with what the layout kept clear and what it keeps round a piece (`keptRound`), then
 * as built alone; then the matcher's two passes as they were — each piece its own box, with what
 * the layout kept clear, then alone — so a slot none of whose products keeps clear of a shower's
 * tray or a WC's box is fitted as it was before, keeping a door's way where it did.
 */
function fitPasses(keepClear: readonly KeepClear[]): Array<{ keepClear: readonly KeepClear[] | null; asBuilt: boolean }> {
  return [
    { keepClear, asBuilt: true },
    { keepClear: null, asBuilt: true },
    { keepClear, asBuilt: false },
    { keepClear: null, asBuilt: false },
  ];
}

/**
 * Its slot with the product that fits it, where it fits (`placeFitting`): a product with real
 * dimensions overrides the archetype's defaults, so the room reflects the thing you would actually
 * receive; stood or hung at the height it takes (`settledElevation`, clear of what hangs under it).
 */
function placedWith(piece: PlacedItem, placed: { product: CatalogProduct; position: Vec2 }, settled: PlacedItem[], room: PlanRoom | undefined): PlacedItem {
  const size = sizeFromProduct(placed.product, piece);
  const elevationM = hungClearOfHung(piece, size, settledElevation(piece, size, placed.product, settled), settled, room);
  return {
    ...piece,
    position: hungPosition(piece, size, elevationM, settled) ?? placed.position,
    product: toSceneProduct(placed.product, quantityFor(piece)),
    size,
    elevationM,
    origin: 'style' as const,
    // A run with no kitchen maker's material in the catalogue is still made to measure — the joiner's estimate.
    ...(piece.slot === 'kitchen_run' ? { custom: true, size: piece.size } : {}),
  };
}

/**
 * A piece of a pair (`PAIRED_SLOTS`: a nightstand) that found no product beside its piece as the
 * room was being matched, tried again once every piece of the room stands as matched: matched
 * before the pieces laid after it, it was refused by their slots at the archetypes' sizes — a
 * floor lamp's slot laid in the corner beyond the nightstand's, the real bed wider than its slot
 * standing the nightstand into it — where the lamp drawn is 11 cm wide and leaves it room. The
 * pair's product first, then the slot's others from the narrowest, through the matcher's passes
 * (`placeFitting`); the first that fits takes it (`pairsAlike` then makes the two alike where one
 * product fits both). With none, it stays without, as before. Draws nothing: no other piece moves.
 */
function completePairs(
  items: PlacedItem[],
  slots: ReadonlyMap<string, PlacedItem>,
  poolOf: (kind: string) => KindPool,
  rooms: ReadonlyMap<string, PlanRoom>,
  keepClear: Record<string, KeepClear[]> | undefined
): PlacedItem[] {
  let out = items;
  for (const item of items) {
    const room = rooms.get(item.roomId);
    if (!room || item.product || item.pinned || !PAIRED_SLOTS.has(item.slot)) continue;
    const standing = out.filter((other) => other.product && other.id !== item.id);
    const pair = standing.find((other) => other.roomId === item.roomId && other.slot === item.slot)?.product?.productId;
    const pool = poolOf(item.kind).first;
    const order = [...pool.filter((p) => p.id === pair), ...pool.filter((p) => p.id !== pair).sort((a, b) => (a.widthCm ?? 0) - (b.widthCm ?? 0))];
    if (order.length === 0) continue;
    const passes = fitPasses(keepClear?.[room.id] ?? []);
    const half = studioHalf(room, item);
    let placed: { product: CatalogProduct; position: Vec2 } | null = null;
    for (const within of half ? [half, room] : [room]) for (const pass of passes) placed ??= placeFitting(item, order[0], order, room, standing, slots, standing, pass.keepClear, pass.asBuilt, within);
    if (!placed) continue;
    const filled = placedWith(item, placed, standing, room);
    out = out.map((other) => (other.id === item.id ? filled : other));
  }
  return out;
}

/** What one step of `slotSteps` offers a slot: the piece as it would be, the product drawn for it and the order the others are tried in. */
interface SlotOffer {
  piece: PlacedItem;
  chosen: CatalogProduct;
  ranked: CatalogProduct[];
  roomKey: string;
  used: Set<number>;
}

/** A kind's products for a flat of a style: what its slot is drawn from, and what else may take it. */
export interface KindPool {
  /**
   * What the slot is drawn from: for a kind the flat takes in its own style (`STRICT_STYLE_KINDS`)
   * the style's own products when the catalogue has any, else every product of the kind.
   */
  first: CatalogProduct[];
  /** The style's own, when the slot is drawn from them alone. */
  own: CatalogProduct[];
  /** The other styles' products, the nearest style first (`styleAffinity` 1, then 0). */
  others: CatalogProduct[][];
}

/**
 * The products of a kind a flat of this style may be given: every one with a model that can be its
 * kind (`isPlausibleForGeneration`), less what the style keeps out of a flat it lays out
 * (Scandinavian: nothing black) — unless that would leave the kind with nothing at all.
 */
export function kindPool(kind: string, catalog: CatalogProduct[], styleId: StyleId): KindPool {
  // Never a product that cannot be its kind (`KIND_BOUNDS`: a 30 cm floor lamp, a 2 m door mat); the swap list still offers it.
  const all = candidatesFor(kind, catalog, styleId).filter(isPlausibleForGeneration);
  const kept = all.filter((p) => !styleRejects(p, styleId));
  const pool = kept.length > 0 ? kept : all;
  const tier = (affinity: number) => pool.filter((p) => styleAffinity(styleId, p.styleTags, p.tags) === affinity);
  // The big pieces are strictly the style's own when the catalogue has any (the rulebook, K-15 and
  // Y-7: a Scandinavian flat's kitchen, sofa and bed are Scandinavian).
  const own = STRICT_STYLE_KINDS.has(kind) ? tier(2) : [];
  return { first: own.length > 0 ? own : pool, own, others: [tier(1), tier(0)] };
}

/**
 * What a slot is offered, in order — the first product that fits it takes it (the owner's decision
 * of 16 Nov 2026: strict style has a way out, never an empty slot with the room arranged round it):
 * the slot's own products (the style's own for the big pieces); a smaller piece of the style where
 * the kind has one (`SMALLER_KIND`: a three-seat for a corner sofa); the other styles' products of
 * the slot's kind, the nearest style first; the other styles' smaller pieces. A single bed comes only
 * after every style's doubles (`SMALLER_LAST`): a double of another style before a single.
 *
 * A kind the catalogue has no product of at all, and which is another kind's product laid in a
 * place of its own (`FILED_AS`: the bedroom's rug, laid as `rug_bed`, is a `rug`), takes that
 * kind's. Any other kind with no product stays empty, whatever else fills its slot: a blind's slot
 * takes no curtain, a single bed's no double, the hall's shoe cabinet nothing.
 */
function slotSteps(kind: string, poolOf: (kind: string) => KindPool): Array<{ kind: string; pool: CatalogProduct[] }> {
  const main = poolOf(kind);
  const smallerKind = SMALLER_KIND[kind];
  const smaller = smallerKind ? poolOf(smallerKind) : null;
  const filedAs = main.first.length === 0 ? FILED_AS[kind] : undefined;
  const filed = filedAs ? poolOf(filedAs) : null;
  const last = SMALLER_LAST.has(kind);
  return [
    { kind, pool: main.first },
    ...(smaller && !last ? [{ kind: smallerKind, pool: smaller.own }] : []),
    // Drawn from the style's own alone: the others have not been tried yet.
    ...(main.own.length > 0 ? main.others.map((pool) => ({ kind, pool })) : []),
    ...(smaller && last ? [{ kind: smallerKind, pool: smaller.first }] : []),
    ...(smaller && (!last || smaller.own.length > 0) ? smaller.others.map((pool) => ({ kind: smallerKind, pool })) : []),
    ...(filed && filedAs ? [{ kind: filedAs, pool: filed.first }, ...(filed.own.length > 0 ? filed.others.map((pool) => ({ kind: filedAs, pool })) : [])] : []),
  ];
}

/** Slots placed as a pair either side of a piece, which must match: two nightstands, not one of each. */
export const PAIRED_SLOTS: ReadonlySet<string> = new Set(['nightstand']);

/**
 * One product for both of a pair (`PAIRED_SLOTS`). When the room's product did not fit one side —
 * a bed 45 cm off its wall left a sliver there — that side got the next that did, and the bed stood
 * between two different nightstands. Each product the pair got is tried on every one of it, the
 * one most of it has first, then the narrowest, and the first that fits all takes the pair; when
 * none does, the pair stays as matched. Pinned pieces are left. Pure.
 */
export function pairsAlike(items: PlacedItem[], catalog: CatalogProduct[], rooms: ReadonlyMap<string, PlanRoom>): PlacedItem[] {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const groups = new Map<string, PlacedItem[]>();
  for (const item of items) {
    if (!PAIRED_SLOTS.has(item.slot) || !item.product || item.pinned || item.locked) continue;
    const key = `${item.roomId}|${item.slot}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  let out = items;
  for (const group of groups.values()) {
    const room = rooms.get(group[0].roomId);
    const counts = new Map<number, number>();
    for (const item of group) counts.set(item.product!.productId, (counts.get(item.product!.productId) ?? 0) + 1);
    if (!room || counts.size < 2) continue;
    const products = [...counts.keys()]
      .map((id) => byId.get(id))
      .filter((p): p is CatalogProduct => p != null)
      .sort((a, b) => counts.get(b.id)! - counts.get(a.id)! || (a.widthCm ?? 0) - (b.widthCm ?? 0));
    const ids = new Set(group.map((item) => item.id));
    const rest = out.filter((item) => !ids.has(item.id));
    for (const product of products) {
      const moved = group.map((item) => {
        const size = sizeFromProduct(product, item);
        const position = clampInsideRoom(room, settledPosition(item, size, room, rest), size, item.rotation);
        return { ...item, size, position, product: toSceneProduct(product, quantityFor(item)) };
      });
      const fit = moved.every((piece) => !blocksWindow(piece, room) && isPlacementValid(room, piece, [...rest, ...moved.filter((other) => other !== piece)]));
      if (!fit) continue;
      out = out.map((item) => moved.find((piece) => piece.id === item.id) ?? item);
      break;
    }
  }
  return out;
}

/** Slots the layout engine sizes itself, or that float above the floor — size is not a fit question there. */
function fitMatters(item: PlacedItem): boolean {
  if (SIZED_BY_LAYOUT.has(item.slot)) return false;
  if (getArchetype(item.kind)?.ghost) return false;
  return item.elevationM < 0.05;
}

/**
 * What is in no piece's way and no piece in its (`fitMatters`), but has a size of its own that must
 * be in the room all the same: the door mat on the floor, a lamp hanging from the ceiling. (A rug
 * and a curtain are sized to the room by the layout.)
 */
function liesWithinRoom(item: PlacedItem): boolean {
  return item.slot === 'door_mat' || getArchetype(item.kind)?.placement.type === 'ceiling';
}

/** The kitchen's own pieces: the run, what hangs over it and what stands at its end or before it. */
export function isKitchenFurniture(item: Pick<PlacedItem, 'slot'>): boolean {
  return item.slot === 'fridge' || isCustomKitchenSlot(item.slot);
}

/** The working floor in front of a kitchen run: as wide as the run, `KITCHEN_CIRCULATION_M` deep (the layout's `clearanceBox`). */
export function workingFloor(run: Pick<PlacedItem, 'position' | 'rotation' | 'size'>): Footprint {
  const { forward } = axes(run.rotation);
  const ahead = run.size.depth / 2 + KITCHEN_CIRCULATION_M / 2;
  return footprintOf({ x: run.position.x + forward.x * ahead, z: run.position.z + forward.z * ahead }, { width: run.size.width, depth: KITCHEN_CIRCULATION_M }, run.rotation);
}

/**
 * The preferred product when it fits at the slot (nudged inside the room if it only just
 * pokes out), otherwise the best-scoring candidate that does; null when none does.
 *
 * Given `keepClear` — the floor the layout was told to keep clear in this room (the strip before a
 * radiator, a column, a partition's floor) — a product fits only where it also keeps clear what
 * the layout engine kept clear for the slot: that floor, a door's way (`inDoorway`), for what is
 * not the kitchen's own furniture the working floor in front of a kitchen run, and what the layout
 * keeps clear round a piece, measured as built (`keptRound`: a WC's 40 cm either side of its
 * centre, an island's 1.2 m all round) — a product neither stands in another's nor has another in
 * its own, and its own is inside the room. With null, the room, the windows and the other pieces alone.
 *
 * `within`: the floor the product stands on — a studio's half (`studioHalf`) — when it is not the
 * whole room: its outline in place of the room's; the room's doors, windows and walls as they are.
 *
 * `asBuilt`: every piece is the floor it takes once generation has built round it (`builtFloor`) —
 * a shower its tray and glass, a WC on a wall the box of its cistern behind it — both what is in the
 * product's way and the product tested; false, each its own box and nothing kept round a piece —
 * the matcher's test as it was, its last resort (a WC that fits only into a shower's tray stands
 * there rather than not at all) and a calculator pick's test (`fitPick`).
 */
export function placeFitting(
  item: PlacedItem,
  preferred: CatalogProduct,
  ranked: CatalogProduct[],
  room: PlanRoom,
  others: PlacedItem[],
  slots: ReadonlyMap<string, PlacedItem>,
  settled: PlacedItem[] = [],
  keepClear: readonly KeepClear[] | null = null,
  asBuilt = true,
  within: PlanRoom = room
): { product: CatalogProduct; position: Vec2 } | null {
  if (!fitMatters(item)) {
    if (!liesWithinRoom(item)) return { product: preferred, position: item.position };
    // A door mat lies inside its room — its edge by the door, eased in like any piece — and a
    // hanging lamp hangs within it, where it was hung: the first product that does takes the slot.
    // With none that does, the one drawn, as before.
    for (const product of [preferred, ...ranked.filter((other) => other.id !== preferred.id)]) {
      const size = sizeFromProduct(product, item);
      const position = item.elevationM < 0.05 ? clampInsideRoom(room, settledPosition(item, size, room, settled), size, item.rotation) : item.position;
      if (footprintInRoom(footprintOf(position, size, item.rotation), room.polygon)) return { product, position };
    }
    return { product: preferred, position: item.position };
  }
  const clear = keepClear && [...keepClear, ...(isKitchenFurniture(item) ? [] : others.filter((other) => other.roomId === room.id && other.slot === 'kitchen_run').map(workingFloor))];
  // Pieces still to be matched that are placed off this one (the nightstands off the bed) move to
  // it once it is matched: they do not stand in its way.
  // The chairs round a table are seated again round the table as matched (`seatsAtTable`): the
  // ones still to come are in neither the table's way nor one another's.
  const followers = (other: PlacedItem) => !settled.includes(other) && (seatedTogether(item, other) || followsWhenMatched(other, item.slot));
  // A basin the engine laid on the floor and this matcher lifted to washing height (`settledElevation`)
  // still takes its floor — its vanity is built under it (`fitBathrooms`): a shower cabin matched
  // after it stood under it, and the vanity could not be built.
  const lifted = others.filter((other) => other.roomId === room.id && other.id !== item.id && other.elevationM >= 0.05 && (slots.get(other.id)?.elevationM ?? 1) < 0.05 && !getArchetype(other.kind)?.ghost);
  const blockers = [...blockingItems(others, room.id, item.id), ...lifted].filter((other) => !followers(other)).map((other) => ({
    other,
    box: asBuilt ? builtFloor(other, room) : footprintOf(other.position, other.size, other.rotation),
    round: clear && asBuilt ? keptRound(other) : null,
    chair: tuckedChair(item, other, slots),
  }));
  const fits = (position: Vec2, size: PlacedItem['size']): boolean => {
    const footprint = footprintOf(position, size, item.rotation);
    if (!footprintInRoom(footprint, within.polygon)) return false;
    // A product taller than the slot's piece stands across no window (a wardrobe for a dresser).
    if (blocksWindow({ ...item, position, size }, room)) return false;
    const floor = asBuilt ? builtFloor({ ...item, position, size }, room) : footprint;
    for (const { other, box, chair } of blockers) {
      // Pieces may touch; a chair the engine tucked under its table may stand under it by up
      // to half its depth besides — its seat under the top, its back clear of it.
      const depth = chair === item ? size.depth : chair === other ? other.size.depth : 0;
      if (footprintsOverlap(floor, box, Math.max(PIECE_TOUCH_M, depth / 2))) return false;
    }
    const own = floor.minX === footprint.minX && floor.maxX === footprint.maxX && floor.minZ === footprint.minZ && floor.maxZ === footprint.maxZ;
    if (clear && (inDoorway({ ...(own ? { position, rotation: item.rotation, size } : boxPose(floor)), elevationM: item.elevationM }, room) || clear.some((box) => !clearsUnder(box, size.height) && footprintsOverlap(floor, box)))) return false;
    if (clear && asBuilt) {
      const round = keptRound({ ...item, position, size });
      if (round && (!footprintInRoom(round, within.polygon) || blockers.some(({ box }) => footprintsOverlap(round, box, 0)))) return false;
      if (blockers.some(({ round }) => round && footprintsOverlap(floor, round, 0))) return false;
    }
    return true;
  };
  const tryProduct = (product: CatalogProduct): Vec2 | null => {
    const size = sizeFromProduct(product, item);
    // Where the real product belongs (its back on the wall the slot's back was on, a nightstand
    // beside the real bed), then where the slot was — each kept inside the room.
    for (const spot of [settledPosition(item, size, room, settled), item.position]) {
      const position = clampInsideRoom(within, spot, size, item.rotation);
      if (fits(position, size)) return position;
    }
    return null;
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
 * The floor a piece takes once generation has built round it, as a box where it stands: a shower
 * its tray and glass (`floorFootprint`, `floorTaken`); a WC with its back on a wall the box its
 * concealed cistern is built into behind it as well (`wcBoxes`, `WC_BOX_DEPTH_M` deep), which stands
 * the WC that much further out (`clearOfDecor`) — a WC matched flush to the wall beside a shower
 * was pushed out by its box into the shower's tray; anything else its own box.
 */
function builtFloor(item: PlacedItem, room: PlanRoom): Footprint {
  if (item.slot !== 'toilet' || item.elevationM >= 0.05 || !pieceWall(item, room)) return floorFootprint(item);
  const { forward } = axes(item.rotation);
  const ahead = WC_BOX_DEPTH_M / 2;
  return footprintOf({ x: item.position.x + forward.x * ahead, z: item.position.z + forward.z * ahead }, { width: item.size.width, depth: item.size.depth + WC_BOX_DEPTH_M }, item.rotation);
}

/**
 * A compact table's slot — a balcony's, a kitchen's two-seat one (`COMPACT_TABLE_SIDES_M`), well under
 * a table for four's 1.2 m: `slotPool` holds it to a table no larger than the slot
 * (`COMPACT_TABLE_SLACK_M`), and a step none of whose products is one offers none.
 */
function compactTable(item: PlacedItem, room: PlanRoom | undefined): boolean {
  return item.slot === 'dining_table' && (room?.type === 'balcony' || Math.max(item.size.width, item.size.depth) <= Math.max(...COMPACT_TABLE_SIDES_M) + COMPACT_TABLE_SLACK_M);
}

/**
 * The half of a studio a piece stands in as the layout laid it (`partRoom`): the half whose program
 * laid it (its id, `partOfId`), else the half it stands in. Null for any other room.
 */
function studioHalf(room: PlanRoom, item: PlacedItem): PlanRoom | null {
  const parts = isStudio(room) ? studioParts(room) : null;
  return parts ? partRoom(room, parts[partOfId(room.id, item.id) ?? partAt(room, item.position)]) : null;
}

/**
 * What the layout keeps clear round a piece, as a box where it stands (`stand` in `autoLayout`):
 * a WC 40 cm either side of its centre (`WC_SIDE_M`), as deep as the WC — the layout's box, not the
 * cistern's box the WC is stood out by besides (measured that deep, it re-chose basins the app's
 * own check, `wc_side_tight`, never faulted); an island 1.2 m all round (`ISLAND_CLEAR_M`). Null for
 * anything else.
 */
function keptRound(item: PlacedItem): Footprint | null {
  if (item.elevationM >= 0.05) return null;
  if (item.slot === 'toilet') return footprintOf(item.position, { ...item.size, width: Math.max(item.size.width, 2 * WC_SIDE_M) }, item.rotation);
  if (item.slot !== 'kitchen_island') return null;
  const box = footprintOf(item.position, item.size, item.rotation);
  return { minX: box.minX - ISLAND_CLEAR_M, maxX: box.maxX + ISLAND_CLEAR_M, minZ: box.minZ - ISLAND_CLEAR_M, maxZ: box.maxZ + ISLAND_CLEAR_M };
}

/** An axis box as a piece standing square on it: what the tests of a piece (`inDoorway`) take. */
function boxPose(box: Footprint): Pick<PlacedItem, 'position' | 'rotation' | 'size'> {
  return { position: { x: (box.minX + box.maxX) / 2, z: (box.minZ + box.maxZ) / 2 }, rotation: 0, size: { width: box.maxX - box.minX, depth: box.maxZ - box.minZ, height: 0 } };
}

/**
 * The chair of a chair and the top the layout engine tucked it under (`tucksUnder`) — their
 * slots, as laid out, overlapping: `placeSeatAroundTable` pushes a seat in when the room is
 * tight, and a desk chair stands with its seat under the desk (`gapM` below zero) — or null for
 * any other pair, a chair the engine left clear of its top included.
 *
 * Only the engine's tucks, and only up to half the chair, where the studio lets a person put
 * any chair under any table: here a product of another size takes the engine's slot, and with
 * the pair free, table products bigger than their slots came to stand over the chairs round
 * them — some all but wholly — in rooms where the engine had tucked no chair at all.
 */
function tuckedChair(a: PlacedItem, b: PlacedItem, slots: ReadonlyMap<string, PlacedItem>): PlacedItem | null {
  if (!tucksUnder(a, b)) return null;
  const chair = isTuckingChair(a.kind) ? a : b;
  // A chair seated round the table as matched (`seatsAtTable`) is tucked in by its seat ring.
  const seated = slots.get(chair.id);
  if (seated && (seated.position.x !== chair.position.x || seated.position.z !== chair.position.z)) return chair;
  const p = slots.get(a.id);
  const q = slots.get(b.id);
  if (!p || !q || !footprintsOverlap(footprintOf(p.position, p.size, p.rotation), footprintOf(q.position, q.size, q.rotation), 0)) return null;
  return chair;
}

/**
 * Where a seat is round its table: the side it is on — read off the way it faces, a quarter turn a
 * side — and how far along that side, from −1 at one end of the table to 1 at the other.
 */
function seatPlace(seat: Pick<PlacedItem, 'position' | 'rotation'>, table: Pick<PlacedItem, 'position' | 'rotation' | 'size'>): { side: number; along: number } {
  const { right } = axes(table.rotation);
  const turn = seat.rotation - table.rotation;
  const side = ((Math.round(Math.atan2(Math.sin(turn), Math.cos(turn)) / (Math.PI / 2)) % 4) + 4) % 4;
  const across = (seat.position.x - table.position.x) * right.x + (seat.position.z - table.position.z) * right.z;
  return { side, along: across / (table.size.width / 2) };
}

/** A matched table's seats (`seatSlots` with its real size), which is which chair's own, and which are taken. */
interface Seating {
  seats: Array<{ position: Vec2; rotation: number }>;
  /** A chair's id → its own seat's index; a chair the table has no seat for on its side has none. */
  own: Map<string, number>;
  taken: Set<number>;
}

/**
 * Which seat of the table as matched answers to the seat the engine gave each chair of its room
 * round the table as laid (`slots`): on the same side of the table, the nearest along it that is
 * no earlier chair's (of two as near, the one nearer the middle).
 */
function seatingAt(table: PlacedItem, chairDepth: number, items: PlacedItem[], slots: ReadonlyMap<string, PlacedItem>): Seating {
  const laid = slots.get(table.id) ?? table;
  const seats = seatSlots(table, chairDepth);
  const places = seats.map((seat) => seatPlace(seat, table));
  const own = new Map<string, number>();
  const held = new Set<number>();
  for (const chair of items) {
    if (chair.roomId !== table.roomId || chair.slot !== 'dining_chair' || (chair.pinned && chair.product)) continue;
    const given = seatPlace(chair, laid);
    let best = -1;
    let bestOff = Infinity;
    for (const [index, place] of places.entries()) {
      if (held.has(index) || place.side !== given.side) continue;
      const off = Math.abs(place.along - given.along);
      if (off < bestOff - 1e-6 || (off < bestOff + 1e-6 && Math.abs(place.along) < Math.abs(places[best].along))) {
        best = index;
        bestOff = off;
      }
    }
    if (best < 0) continue;
    own.set(chair.id, best);
    held.add(best);
  }
  return { seats, own, taken: new Set() };
}

/**
 * The seats a dining chair may take round the table as matched, in the order it tries them: its
 * own — the one that answers to the seat the engine gave it (`seatingAt`) — then the seats that
 * are no chair's, in the table's order. The engine seats no chair where a wall or a piece is
 * behind the seat, and the n-th chair used to take the n-th seat whatever the engine had skipped:
 * a table against a wall sent every other chair to the wall's side, where it did not fit, and the
 * room lost it. A chair whose own seat is not there (a real table with no seat at its ends, or
 * fewer along a side) or does not fit sits at a seat that is free where it fits. No seat to try:
 * the table seats fewer. Null when there is no matched table to sit at (the slot stays as laid out).
 */
function seatsAtTable(
  item: PlacedItem,
  items: PlacedItem[],
  settled: PlacedItem[],
  slots: ReadonlyMap<string, PlacedItem>,
  seatings: Map<string, Seating>
): { seats: Array<{ index: number; position: Vec2; rotation: number }>; taken: Set<number> } | null {
  if (item.slot !== 'dining_chair') return null;
  const table = [...settled].reverse().find((p) => p.roomId === item.roomId && p.slot === 'dining_table' && p.product);
  if (!table) return null;
  const seating = seatings.get(table.id) ?? seatingAt(table, item.size.depth, items, slots);
  seatings.set(table.id, seating);
  const own = seating.own.get(item.id);
  const someones = new Set(seating.own.values());
  const order = [...(own != null ? [own] : []), ...seating.seats.map((_, index) => index).filter((index) => !someones.has(index))];
  return { seats: order.filter((index) => !seating.taken.has(index)).map((index) => ({ index, ...seating.seats[index] })), taken: seating.taken };
}

/** The lowest a hanging lamp may come: 1.45 m over a table or an island, else 1.9 m. */
function lowestPendant(item: PlacedItem, settled: PlacedItem[]): number {
  const overTable = settled.some((p) => p.roomId === item.roomId && (p.slot === 'dining_table' || p.slot === 'kitchen_island') && Math.hypot(p.position.x - item.position.x, p.position.z - item.position.z) < 0.4);
  return overTable ? PENDANT_OVER_TABLE_BOTTOM_M : PENDANT_BOTTOM_M;
}

/**
 * Products a slot can hold as the engine laid it out (`slotPool` is applied before the draw).
 * `around`: every piece of the flat as it stands, settled or still a slot — what a pendant lights is
 * read off it (a living room's dining table is laid out, and matched, after its pendant).
 */
export function slotPool(item: PlacedItem, candidates: CatalogProduct[], room: PlanRoom | undefined, settled: PlacedItem[] = [], styleId?: StyleId, level?: BudgetLevel, around: readonly PlacedItem[] = settled): CatalogProduct[] {
  const wetRoom = room?.type === 'bathroom' || room?.type === 'toilet';
  if (item.slot === 'sink') {
    // A bathroom's basin sits on a vanity made to measure in every style but Vintage (the rulebook,
    // BA-7: `lib/design/bathroom`), so it is a countertop or vessel basin; Vintage's — and any room
    // with no countertop basin to offer — stands on the floor (pedestal or a vanity product).
    const standing = candidates.filter((p) => (p.heightCm ?? 0) >= 60);
    if (wetRoom && styleId && styleId !== 'vintage') {
      const counter = candidates.filter((p) => (p.heightCm ?? 0) > 5 && (p.heightCm ?? 0) < 45 && (p.widthCm ?? 0) >= 30 && (p.widthCm ?? 0) / 100 <= item.size.width + 0.3);
      if (counter.length > 0) return counter;
    }
    return standing;
  }
  // A WC's slot takes a WC, not a bidet the library filed beside them — a small bathroom's shorter
  // WC (`WC_COMPACT_DEPTH_M`) drew the shortest of the two.
  if (item.slot === 'toilet') {
    const wcs = candidates.filter((p) => !isBidet(p));
    return wcs.length > 0 ? wcs : candidates;
  }
  // The bath by style (BA-16, BA-18): Modern a freestanding one; Vintage a rectangular one standing
  // in its tiled enclosure; Scandinavian and Industrial a built-in one, boxed and tiled.
  if (item.slot === 'bathtub' && styleId) {
    const builtIn = candidates.filter((p) => isBuiltInBath(p));
    const free = candidates.filter((p) => !isBuiltInBath(p));
    const wanted = styleId === 'modern' ? free : styleId === 'vintage' ? free.filter((p) => isRectangularBath(p)) : builtIn;
    if (wanted.length > 0) return wanted;
    return styleId === 'vintage' && free.length > 0 ? free : candidates;
  }
  // Showers are built — a column or panel in a glass enclosure the studio draws — never a shower-door product (BA-24).
  if (item.slot === 'shower') {
    // Nor a bath's mixer the library filed under showers.
    const columns = candidates.filter((p) => !isShowerDoor(p) && !/\bbath\b[^|]*\b(mixer|tap|spout)\b/i.test(`${p.nameEn ?? ''} ${p.nameKa}`));
    return columns.length > 0 ? columns : candidates;
  }
  // An island is a worktop to stand round: not one with its own hob, oven or sink beside a run that
  // has them (the rulebook, K-8 — a second hob and oven in the kitchen).
  if (item.slot === 'kitchen_island') {
    const runHere = settled.some((p) => p.roomId === item.roomId && p.slot === 'kitchen_run');
    if (runHere) return candidates.filter((p) => !/\b(hob|oven|cooker|range|sink|burner)\b/i.test(`${p.nameEn ?? ''} ${p.nameKa}`));
  }
  // A balcony's table is a compact one, and its chairs café chairs (Nini, decision 3.6): not a table
  // for six, a lounge chair, a bench or a bar stool. So is a kitchen's two-seat table (decision 3.5).
  if (compactTable(item, room)) {
    const most = Math.min(Math.max(item.size.width, item.size.depth), Math.max(...COMPACT_TABLE_SIDES_M)) + COMPACT_TABLE_SLACK_M;
    return candidates.filter((p) => Math.max(p.widthCm ?? 0, p.depthCm ?? 0) / 100 <= most + 1e-6);
  }
  if (room?.type === 'balcony' && item.slot === 'dining_chair') {
    const fits = candidates.filter((p) => (p.widthCm ?? 0) / 100 <= BALCONY_CHAIR_MAX_M.width && (p.depthCm ?? 0) / 100 <= BALCONY_CHAIR_MAX_M.depth && (p.heightCm ?? 0) / 100 <= BALCONY_CHAIR_MAX_M.height);
    return fits.length > 0 ? fits : candidates;
  }
  // A towel shelf only at the highest budget; else the towels hang on the heated rail (BA-19).
  if (item.slot === 'towel_rack' && level && level !== 'premium') return [];
  // A TV no wider than its slot — the layout slid or shrank it off a window beside the unit — and
  // one on its stand only where it fits on the unit's top; a flat one on the wall over any.
  // Over a unit standing free in the room there is no wall to hang one on: a TV on a stand only.
  if (item.slot === 'tv') {
    const unit = tvUnitUnder(item, settled);
    const walled = room ? backOnWall(item, room, 0.15) : true;
    const fitsUnit = (p: CatalogProduct) => unit != null && (p.widthCm ?? 0) / 100 <= unit.size.width && (p.depthCm ?? 0) / 100 <= unit.size.depth + 0.02;
    return candidates.filter((p) => (p.widthCm ?? 0) / 100 <= item.size.width + 0.02 && (onStand(p) ? fitsUnit(p) : walled));
  }
  // A pendant short enough to hang from the ceiling and clear a head (or the table under it) —
  // and, where any does, clear of what stands under it by the gap a hung piece keeps over a piece
  // (`MATCHED_ABOVE_GAP_M`): a lamp hung into a canopy bed or a tall bookcase. It hangs from where
  // the slot's top is (`settledElevation`), so a shorter lamp hangs higher and never through the
  // ceiling; with none that clears, the shortest of the lamps that hang.
  if (getArchetype(item.kind)?.placement.type === 'ceiling') {
    const top = item.elevationM + item.size.height;
    const drop = top - lowestPendant(item, settled);
    const hanging = candidates.filter((p) => (p.heightCm ?? 0) > 0 && (p.heightCm ?? 0) / 100 <= drop);
    const clear = hanging.filter((p) => {
      const size = sizeFromProduct(p, item);
      return standingBelow(item, size, settled).every((piece) => top - size.height >= piece.size.height + MATCHED_ABOVE_GAP_M);
    });
    // With none that clears, the shortest that hang: the least into what stands under the lamp.
    if (clear.length === 0) {
      const shortest = Math.min(...hanging.map((p) => p.heightCm ?? 0));
      return hanging.filter((p) => (p.heightCm ?? 0) <= shortest + 5);
    }
    // Of those that clear, a large lamp where one hangs over what the slot lights, small ones where
    // two or three will (Nini, decision 10b: `pendantSizing`, by the surface under the slot among
    // `around`) — where the offer has any. Where none clears (a four-poster under the middle of a
    // small room), no large lamp is pressed into it.
    const sized = pendantSizing(clear, room, item, around);
    return sized.length > 0 ? sized : clear;
  }
  // A hall's mirror is full height (the rulebook, E-8) on a wall free from the floor up: a tall flat
  // one when there is any. Over the console, or anything else standing under the slot, one that
  // hangs clear of it and under the ceiling (`settledElevation`) — a hung piece never runs into
  // what stands below it; the hall pass hangs the full-height one across from the wardrobe it
  // builds (`fitHall`). With none that fits over the piece, the mirror it would have had.
  if (item.slot === 'mirror' && room?.type === 'hallway') {
    const below = standingBelow(item, item.size, settled);
    if (below.length > 0) {
      const over = candidates.filter((p) => {
        const size = sizeFromProduct(p, item);
        const bottom = settledElevation(item, size, p, settled);
        return below.every((piece) => bottom >= piece.size.height) && bottom + size.height <= room.heightM;
      });
      if (over.length > 0) return over;
    }
    const tall = candidates.filter(isFullHeightMirror);
    if (tall.length > 0) return tall;
  }
  if (item.slot === 'mirror' && (room?.type === 'bathroom' || room?.type === 'toilet')) {
    return candidates.filter((p) => (p.heightCm ?? 0) > 0 && (p.heightCm ?? 0) <= 120 && (p.depthCm ?? 0) <= 12);
  }
  return candidates;
}

/**
 * A TV's screen, inches of diagonal: as its name says (`55"`, `65″`), else from its width
 * (`TV_WIDTH_PER_INCH_M`) — a retro TV 60 cm wide is a 27″.
 */
export function tvInches(product: Pick<CatalogProduct, 'nameEn' | 'nameKa' | 'widthCm'>): number {
  const named = /(\d{2,3}(?:\.\d)?)\s*(?:"|″|''|-?inch)/i.exec(`${product.nameEn ?? ''} ${product.nameKa}`);
  if (named) return Number(named[1]);
  return Math.round((product.widthCm ?? 0) / 100 / TV_WIDTH_PER_INCH_M);
}

/**
 * The TVs of the size the sofa's distance asks for (Nini, decision 1 — `tvInchesFor`: about 55″ at
 * 2.5 m, 65″ at 3 m, 75″ at 3.5 m, the largest from 4.2 m): the smallest size at least as large as it
 * asks, where the slot takes one; else the largest it takes. The distance from the sofa's middle to
 * the TV's; with no sofa in the room, every TV the slot takes.
 */
function tvsForDistance(products: CatalogProduct[], item: PlacedItem, settled: PlacedItem[]): CatalogProduct[] {
  const sofa = settled.find((p) => p.roomId === item.roomId && p.slot === 'sofa');
  if (!sofa || products.length === 0) return products;
  const wanted = tvInchesFor(Math.hypot(item.position.x - sofa.position.x, item.position.z - sofa.position.z));
  const sized = products.map((product) => ({ product, inches: tvInches(product) }));
  const large = sized.filter((s) => s.inches >= wanted - 1);
  const size = large.length > 0 ? Math.min(...large.map((s) => s.inches)) : Math.max(...sized.map((s) => s.inches));
  return sized.filter((s) => Math.abs(s.inches - size) < 0.5).map((s) => s.product);
}

/** Forward and right unit vectors of a piece turned `rotation` (0 faces +Z). */
function axes(rotation: number): { forward: Vec2; right: Vec2 } {
  const forward = { x: Math.sin(rotation), z: Math.cos(rotation) };
  return { forward, right: { x: forward.z, z: -forward.x } };
}

/** Whether a piece's back stands on a wall of the room (within `slack` metres either side of its line, within 2 % of its length past an end), facing into it as the wall does. */
function backOnWall(item: PlacedItem, room: PlanRoom, slack: number): boolean {
  return wallBehind(item, roomEdges(room.polygon), { facing: Math.cos(0.05), by: 'gap', min: -slack, max: slack, past: { share: 0.02 } }) != null;
}

/**
 * Where a product of `size` stands in a slot laid out for the archetype's size: a piece placed
 * off another is re-measured from that piece as it was matched (a nightstand beside the real
 * bed, its back on the bed's wall; the coffee table 42 cm off the real sofa; the fridge against
 * the end of the run); a piece with its
 * back on a wall keeps it there (a deeper wardrobe does not poke into the wall, a shallower one
 * does not stand off it); anything else stays centred where the slot was.
 */
export function settledPosition(item: PlacedItem, size: PlacedItem['size'], room: PlanRoom, settled: PlacedItem[]): Vec2 {
  const rule: Archetype['placement'] | undefined = getArchetype(item.kind)?.placement;
  const measured = measuredRule(item.kind);
  if (measured) {
    const anchors = settled.filter((p) => p.roomId === item.roomId && p.slot === measured.to);
    const anchor = anchors.sort((a, b) => Math.hypot(a.position.x - item.position.x, a.position.z - item.position.z) - Math.hypot(b.position.x - item.position.x, b.position.z - item.position.z))[0];
    if (anchor) {
      const { forward, right } = axes(anchor.rotation);
      const off = { x: item.position.x - anchor.position.x, z: item.position.z - anchor.position.z };
      const across = off.x * right.x + off.z * right.z;
      const ahead = measured.beside != null ? -anchor.size.depth / 2 + size.depth / 2 : anchor.size.depth / 2 + measured.gapM! + size.depth / 2;
      const lateral = measured.beside != null ? Math.sign(across || 1) * (anchor.size.width / 2 + size.width / 2 + measured.beside) : across;
      return { x: anchor.position.x + forward.x * ahead + right.x * lateral, z: anchor.position.z + forward.z * ahead + right.z * lateral };
    }
  }
  // A piece the engine stood hard against an end of another (the fridge at the end of the run)
  // stays against that end at its real width, its back in line with the other's.
  if (rule?.type === 'wall' && rule.beside) {
    const piece = settled.find((p) => p.roomId === item.roomId && p.slot === rule.beside && Math.abs(Math.atan2(Math.sin(p.rotation - item.rotation), Math.cos(p.rotation - item.rotation))) < 0.05);
    if (piece) {
      const { forward, right } = axes(piece.rotation);
      const across = (item.position.x - piece.position.x) * right.x + (item.position.z - piece.position.z) * right.z;
      const ahead = (item.position.x - piece.position.x) * forward.x + (item.position.z - piece.position.z) * forward.z;
      const gap = Math.abs(across) - piece.size.width / 2 - item.size.width / 2;
      const inLine = Math.abs(ahead - (item.size.depth - piece.size.depth) / 2) < 0.1;
      if (inLine && gap > -0.05 && gap < 0.15) {
        const lateral = Math.sign(across) * (piece.size.width / 2 + 0.02 + size.width / 2);
        const depthOff = (size.depth - piece.size.depth) / 2;
        return { x: piece.position.x + right.x * lateral + forward.x * depthOff, z: piece.position.z + right.z * lateral + forward.z * depthOff };
      }
    }
  }
  // A corner piece turned its back to the nearer wall when it stood within 30 cm of it.
  if (backOnWall(item, room, rule?.type === 'corner' ? 0.35 : 0.06)) {
    const { forward } = axes(item.rotation);
    const back = rule?.type === 'corner' ? backGap(item, room) : 0;
    const shift = (size.depth - item.size.depth) / 2 - back;
    return { x: item.position.x + forward.x * shift, z: item.position.z + forward.z * shift };
  }
  return item.position;
}

/** How far a piece's back stands off the wall behind it — the nearest it faces as, anywhere along its line (0 when on it). */
function backGap(item: PlacedItem, room: PlanRoom): number {
  const wall = wallBehind(item, roomEdges(room.polygon), { facing: Math.cos(0.05), by: 'gap', min: -0.01, max: Infinity });
  return wall ? Math.max(0, wall.gap) : 0;
}

/**
 * A piece on a wall keeps its back on the wall at the product's depth (a print flat on it, a
 * floor mirror on its stand standing out from it); null for anything else.
 */
function hungPosition(item: PlacedItem, size: PlacedItem['size'], elevationM: number, settled: PlacedItem[] = []): Vec2 | null {
  const rule = getArchetype(item.kind)?.placement;
  if (rule?.type !== 'wall-mounted' || rule.stretch || item.elevationM < 0.05) return null;
  const { forward } = axes(item.rotation);
  // A TV on its stand stands in the middle of the unit's top, front to back; a flat one hangs
  // with its back where the unit's back is, on the wall — measured from the unit, so a flat TV
  // swapped in for one standing on it goes back onto the wall.
  const unit = tvUnitUnder(item, settled);
  if (unit) {
    const ahead = (unit.position.x - item.position.x) * forward.x + (unit.position.z - item.position.z) * forward.z;
    const off = Math.abs(elevationM - unit.size.height) < 0.01 ? ahead : ahead - unit.size.depth / 2 + size.depth / 2 - 0.01;
    return { x: item.position.x + forward.x * off, z: item.position.z + forward.z * off };
  }
  const shift = (size.depth - item.size.depth) / 2 + (elevationM === 0 ? 0.01 : 0);
  return { x: item.position.x + forward.x * shift, z: item.position.z + forward.z * shift };
}

export { MATCHED_ABOVE_GAP_M } from './rules';

/**
 * The height a matched piece stands or hangs at. Floor pieces stay on the floor — a basin too
 * short to stand (countertop, wall-hung) is lifted to wash at, its top at `BASIN_TOP_M`. A piece on a
 * wall keeps its middle where the slot's was, and clear of anything standing below it by 12 cm
 * (a print over the bed's headboard); a mirror as tall as a person and deep enough to stand
 * (a floor mirror on its stand) stands on the floor, a flat one hangs 30 cm off it.
 */
export function settledElevation(item: PlacedItem, size: PlacedItem['size'], product: CatalogProduct, settled: PlacedItem[]): number {
  if (item.slot === 'sink' && size.height < 0.45) return round2(BASIN_TOP_M - size.height);
  const rule = getArchetype(item.kind)?.placement;
  // A hanging lamp hangs from the ceiling by its own length, not through it: its top where the
  // slot's was, its bottom no lower than 1.9 m (1.45 m over a table).
  if (rule?.type === 'ceiling' && item.elevationM >= 0.05) return round2(Math.max(lowestPendant(item, settled), item.elevationM + item.size.height - size.height));
  if (rule?.type !== 'wall-mounted' || rule.stretch) return item.elevationM;
  // From the product and the rule, never from the piece it replaces: a wall mirror swapped in for
  // a floor mirror stood on the floor with it.
  if (item.slot === 'mirror' && size.height >= 1.4) return (product.depthCm ?? 0) >= 12 ? 0 : 0.3;
  // A TV on its stand stands on the TV unit under it; a flat one hangs on the wall over it.
  const unit = onStand(product) ? tvUnitUnder(item, settled) : undefined;
  if (unit) return round2(unit.size.height);
  const below = standingBelow(item, size, settled);
  const middle = item.slot === 'mirror' ? 1.5 : below.length > 0 ? (rule.aboveHeightM ?? rule.heightM) : rule.heightM;
  let elevation = middle - size.height / 2;
  for (const piece of below) elevation = Math.max(elevation, piece.size.height + (rule.aboveGapM ?? MATCHED_ABOVE_GAP_M));
  return round2(Math.max(0.05, elevation));
}

/**
 * A piece hung on a wall raised clear of what already hangs under it on that wall — a TV on its
 * stand on the unit's top, under the print laid over it (`settledElevation` reads only what stands on
 * the floor, and hung the print 25 cm over the unit, inside the TV) — by the gap the piece keeps
 * over what is under it. "Under": what hangs there with its middle below the slot's, as laid. Never
 * lowered, and left where it is when clearing it would take it through the ceiling. Pure.
 */
function hungClearOfHung(item: PlacedItem, size: PlacedItem['size'], elevationM: number, settled: readonly PlacedItem[], room: PlanRoom | undefined): number {
  const rule = getArchetype(item.kind)?.placement;
  if (rule?.type !== 'wall-mounted' || rule.stretch || elevationM < 0.05) return elevationM;
  const box = footprintOf(item.position, { ...size, depth: Math.max(size.depth, 0.05) }, item.rotation);
  const middle = item.elevationM + item.size.height / 2;
  const under = settled.filter((p) => p.roomId === item.roomId && p.id !== item.id && p.elevationM >= 0.05 && p.elevationM + p.size.height / 2 < middle && footprintsOverlap(box, footprintOf(p.position, { ...p.size, depth: Math.max(p.size.depth, 0.05) }, p.rotation), 0));
  const clashing = under.filter((p) => p.elevationM + p.size.height > elevationM + 0.02 && p.elevationM < elevationM + size.height - 0.02);
  if (clashing.length === 0) return elevationM;
  const bottom = round2(Math.max(...clashing.map((p) => p.elevationM + p.size.height)) + (rule.aboveGapM ?? MATCHED_ABOVE_GAP_M));
  return room && bottom + size.height > room.heightM ? elevationM : Math.max(elevationM, bottom);
}

/** What stands on the floor under a piece hung on a wall, at the size it would have there. */
function standingBelow(item: PlacedItem, size: PlacedItem['size'], settled: PlacedItem[]): PlacedItem[] {
  const box = footprintOf(item.position, { ...size, depth: Math.max(size.depth, 0.05) }, item.rotation);
  return settled.filter((p) => p.roomId === item.roomId && p.elevationM < 0.05 && p.id !== item.id && !getArchetype(p.kind)?.ghost && footprintsOverlap(box, footprintOf(p.position, p.size, p.rotation), 0));
}

/** A mirror as tall as a person, flat on the wall and no wider than a door: the hall's full-height mirror (E-8). */
export function isFullHeightMirror(product: Pick<CatalogProduct, 'widthCm' | 'depthCm' | 'heightCm'>): boolean {
  return (product.heightCm ?? 0) >= 140 && (product.depthCm ?? 0) <= 12 && (product.widthCm ?? 0) <= 90;
}

/** A TV on its own stand (deeper than 12 cm), made to stand on furniture rather than hang. */
export function onStand(product: Pick<CatalogProduct, 'depthCm'>): boolean {
  return (product.depthCm ?? 0) >= 12;
}

/** The TV unit a TV slot hangs over — standing on the floor under it, in its room. */
function tvUnitUnder(item: PlacedItem, settled: PlacedItem[]): PlacedItem | undefined {
  if (item.slot !== 'tv') return undefined;
  const box = footprintOf(item.position, { ...item.size, depth: Math.max(item.size.depth, 0.05) }, item.rotation);
  return settled.find((p) => p.roomId === item.roomId && p.slot === 'tv_unit' && p.elevationM < 0.05 && footprintsOverlap(box, footprintOf(p.position, p.size, p.rotation), 0));
}

/**
 * A piece hung on a wall, hung or stood again for the product it now has (`settledElevation`,
 * `hungPosition`) — the studio's swap of a TV: one on its stand onto the unit's top, a flat one
 * onto the wall over it.
 */
export function rehung(original: PlacedItem, swapped: PlacedItem, product: CatalogProduct, settled: PlacedItem[]): PlacedItem {
  const elevationM = settledElevation(original, swapped.size, product, settled);
  return { ...swapped, elevationM, position: hungPosition(original, swapped.size, elevationM, settled) ?? swapped.position };
}

/**
 * `rehung` as the matcher hangs a piece when it generates: clear, too, of what already hangs under
 * it on its wall (`hungClearOfHung` — a print swapped in over a TV on its unit). The AI check's
 * swap; the studio's own swap keeps `rehung`.
 */
export function rehungClear(original: PlacedItem, swapped: PlacedItem, product: CatalogProduct, settled: PlacedItem[], room: PlanRoom | undefined): PlacedItem {
  const elevationM = hungClearOfHung(original, swapped.size, settledElevation(original, swapped.size, product, settled), settled, room);
  return { ...swapped, elevationM, position: hungPosition(original, swapped.size, elevationM, settled) ?? swapped.position };
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
  if (slot && product.widthCm && !SIZED_BY_LAYOUT.has(slot.slot)) {
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
/** The budget level a flat is matched at (`inferLevel`), for passes after the matcher (the bathroom's dryer). */
export function budgetLevel(items: PlacedItem[], catalog: CatalogProduct[], options: MatchOptions): BudgetLevel {
  return options.level ?? inferLevel(items, catalog, options);
}

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
  // A roller blind is made to its window: one a window.
  if (item.slot === 'curtain') {
    return item.kind === 'blind' ? 1 : round2(Math.max(1, item.size.width / 2));
  }
  return 1;
}

export function sizeFromProduct(product: CatalogProduct, item: PlacedItem): PlacedItem['size'] {
  // Rugs and curtains are sized to the room by the layout engine, not by the SKU, and so is a
  // kitchen made to measure (its product a kitchen maker's material). A shop's kitchen unit is its own size.
  if (LAID_TO_ANOTHER.has(item.slot) || (isCustomKitchenSlot(item.slot) && isKitchenMaterial(product))) {
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
