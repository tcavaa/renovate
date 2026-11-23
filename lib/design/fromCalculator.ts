/**
 * Carrying the calculator's choices into the 3D studio.
 *
 * The calculator and the studio are one journey: rooms entered (or a plan uploaded) in the
 * calculator, products picked from its catalogue and furniture lists, and then the flat in
 * 3D — furnished with what the user already chose, and with the style filling the rest.
 * Everything the user picked is marked `origin: 'calculator'` so the hover card can say so.
 *
 * Pure functions; the store calls them.
 */

import type { SelectedProduct } from '@/lib/calculator/types';
import { categorySlugFromKey, surfaceOfPick } from '@/lib/calculator/quantities';
import { calculatorSurfaceFinishes, type LaidFinish } from '@/lib/calculator/roomFinishes';
import { placeAdditional } from './autoLayout';
import { getArchetype, isKitchenMaterial } from './catalog';
import type { CatalogProduct } from './matcher';
import { builtFloor, placeFitting, quantityFor, rehung, sizeFromProduct, toSceneProduct } from './matcher';
import { floorFootprint, footprintInRoom, footprintOf, footprintsOverlap, PIECE_TOUCH_M, type Footprint } from './manipulate';
import { asPlacedKitchen } from './kitchen';
import { finishFromProduct, isSurfaceProduct, isWetRoomType, surfaceSpecs } from './surfaces';
import { dressBoard, pickTarget } from './boardPicks';
import { hasTrims, trimFromProduct } from './trims';
import { decorFootprint } from './decor/joinery';
import { LIES_FLAT } from './kinds';
import { polygonCentroid } from './planGeometry';
import { tucksUnder } from './relations';
import { pickPoses, yieldsToPick, type PickOutcome, type PickPose, type PickStep } from './pickFit';
import type { DecorPiece, ElectricalPoint, FloorPlan, PlacedItem, PlanRoom, SurfaceFinish } from './types';

export interface CalculatorPicks {
  /** Furniture chosen per room on /calculator/furniture. */
  furniture: Array<{ roomId: string; productId: number }>;
  /** Materials chosen for the whole flat on the catalogue step (a finish there is from before every room took its own). */
  productIds: number[];
  /**
   * Each room's floor and walls from the catalogue step (`lib/calculator/roomFinishes`): the
   * product and the surface it was chosen for, with its share of a floor two products share or
   * the walls it was chosen for one by one. A pick from before it carried its surface goes on
   * every surface its product suits.
   */
  roomProducts?: Array<{ roomId: string; productId: number; surface?: 'floor' | 'wall'; share?: number; walls?: number[] }>;
}

export function picksFromCalculator(
  selectedProducts: Record<string, SelectedProduct>,
  selectedFurniture: Record<string, SelectedProduct[]>
): CalculatorPicks {
  const entries = Object.entries(selectedProducts);
  return {
    // As many as were picked: four chairs sold by the piece are four chairs; a rug sold by the m² is one rug.
    furniture: Object.entries(selectedFurniture).flatMap(([roomId, list]) =>
      list.flatMap((p) => Array.from({ length: p.unit === 'piece' ? Math.max(1, Math.round(p.qty)) : 1 }, () => ({ roomId, productId: p.productId })))
    ),
    productIds: entries.filter(([, p]) => !p.roomId).map(([, p]) => p.productId),
    roomProducts: entries
      .filter(([, p]) => !!p.roomId)
      .map(([key, p]) => {
        const surface = surfaceOfPick({ surface: p.surface, categorySlug: p.categorySlug ?? categorySlugFromKey(key) });
        return { roomId: p.roomId!, productId: p.productId, ...(surface ? { surface } : {}), ...(p.share != null ? { share: p.share } : {}), ...(p.walls ? { walls: p.walls } : {}) };
      }),
  };
}

/** How a calculation's furniture picks are put into a flat (`placeFurniturePicks`). */
export interface PickOptions {
  /** The floor the layout kept clear, per room: kept, with a door's way, in the careful pass. */
  keepClear?: Record<string, Footprint[]>;
  /** The joinery and boxes built (a wall of wardrobe, a vanity, a bath's box): no pick stands in them. */
  built?: readonly DecorPiece[];
  /**
   * Nini's second step — the room's own pieces moved, made smaller or taken out for a pick that fits
   * nowhere else in its room (`yieldsToPick`). On at generation; off in the studio, where the flat
   * laid out is the person's and only what was arranged off the piece a pick replaced moves.
   */
  rearrange?: boolean;
}

/** The pieces with the picks in them, as `placeFurniturePicks` lays them. */
export function applyFurniturePicks(items: PlacedItem[], plan: FloorPlan, picks: CalculatorPicks, catalog: CatalogProduct[], keepClear: Record<string, Footprint[]> = {}): PlacedItem[] {
  return placeFurniturePicks(items, plan, picks, catalog, { keepClear }).items;
}

/**
 * Puts the user's furniture into the laid-out flat, in the order Nini gave for a pick that does not
 * fit where it was picked for (decision 13, `lib/design/pickFit`).
 *
 * For each pick, the slot of that kind in that room takes the product and is pinned — the way the
 * matcher gives a slot a product (`placeFitting`): stood where the real product belongs (its back on
 * the slot's wall, a nightstand beside the real bed), kept inside the room and tested against the
 * other pieces as built (a shower's tray, a WC's box), the joinery, the windows, a door's way and
 * the floor the layout kept clear (`keepClear`). What the engine placed off the piece (the
 * nightstands off the bed, the coffee table off the sofa) is measured again off the product. When
 * the slot cannot take it, or the room has no such slot, a free spot is looked for with the
 * product's own size (`placeAdditional`). Slot and spot are tried keeping a door's way and the
 * kept-clear floor clear first, and only then by the room and the pieces alone. Where neither does:
 *
 * 1. every other place in the room — each stretch of each wall, its back or its side to it, the
 *    free floor (`pickPoses`) — keeping a door's way clear, then
 * 2. (with `rearrange`) the room's secondary pieces moved, given a smaller product or taken out for
 *    it, the fewest and least important first (`yieldsToPick`); then both again by the room and the
 *    pieces alone;
 * 3. another room of the same type, the largest first, all of it again there — the piece marked
 *    with the room it was picked for (`pickedFor`), so the studio can say so;
 * 4. nowhere: left out of the 3D (`outcomes`: `unplaced`), its slot keeping the style's piece. It
 *    stays in the calculation's list and summary, where picks are priced and ordered from.
 *
 * A pick is the person's choice: never replaced by another product, never resized, never out of the
 * room or in another piece. A shop's kitchen unit is tested at its own size like any floor piece,
 * and takes down the wall cabinets over the run it took (`cabinetsOver`).
 */
export function placeFurniturePicks(items: PlacedItem[], plan: FloorPlan, picks: CalculatorPicks, catalog: CatalogProduct[], options: PickOptions = {}): { items: PlacedItem[]; outcomes: PickOutcome[] } {
  const keepClear = options.keepClear ?? {};
  const rearrange = options.rearrange ?? true;
  const built = options.built ?? [];
  const byId = new Map(catalog.map((p) => [p.id, p]));
  let next = [...items];
  const taken = new Set<string>();
  // The wall cabinets a shop's kitchen unit took the run from (`cabinetsOver`).
  const dropped = new Set<string>();
  const outcomes: PickOutcome[] = [];
  // What each room already has of each product. Picks are put into a design more than once —
  // every "see it in 3D" from the calculator's summary brings them again — and a pick the room
  // already holds (placed last time, or chosen in the studio) is satisfied, not placed twice. A pick
  // moved to another room counts for the room it was picked for.
  const holds = new Map<string, number>();
  for (const item of items) {
    if (!item.product) continue;
    const key = `${item.pickedFor ?? item.roomId}:${item.product.productId}`;
    holds.set(key, (holds.get(key) ?? 0) + 1);
  }

  /** A pick put down where it was found to fit: into the slot it took, or as a piece of its own; what it brings comes with it. */
  const commit = (found: FoundPlace, product: CatalogProduct, pickedFor: string | null) => {
    const placed: PlacedItem = { ...asPick(found.laid, product), ...(pickedFor ? { pickedFor } : {}) };
    if (found.index >= 0) next[found.index] = placed;
    else next.push(placed);
    taken.add(placed.id);
    cabinetsOver(next, placed, found.slotItem).forEach((id) => dropped.add(id));
    reseatPlacedOff(next, placed, found.room, byId, keepClear[found.room.id] ?? []);
    rehangOver(next, placed, found.slotItem, byId);
    // Step 2's pieces, and what was placed off the piece the pick replaced that does not stand beside
    // it: moved, made smaller or taken out.
    const way = makeWay(next, placed, found.room, found.blockers, catalog, byId, keepClear[found.room.id] ?? [], solidIn(built, found.room, null), rearrange);
    next = way.items;
    return { placed, moved: way.moved, swapped: way.swapped, removed: way.removed };
  };

  for (const pick of picks.furniture) {
    const holdKey = `${pick.roomId}:${pick.productId}`;
    const held = holds.get(holdKey) ?? 0;
    if (held > 0) {
      holds.set(holdKey, held - 1);
      outcomes.push({ roomId: pick.roomId, productId: pick.productId, step: 'held', itemId: null, placedIn: null });
      continue;
    }
    const product = byId.get(pick.productId);
    const kind = product?.model3dKind;
    const room = plan.rooms.find((r) => r.id === pick.roomId);
    if (!product || !kind || !product.model3dUrl || !getArchetype(kind) || !room) {
      // Nothing to draw it with (or no room left to put it in): it stays in the calculation's list.
      outcomes.push({ roomId: pick.roomId, productId: pick.productId, step: 'unplaced', itemId: null, placedIn: null });
      continue;
    }
    const context: PlaceContext = { items: next, taken, keepClear, built, rearrange };
    // Steps 0–2 in its own room, then step 3 in each other room of its type, the largest first —
    // keeping a door's way and the kept-clear floor clear; only then all of it again by the room and
    // the pieces alone: a door's way is part of where a piece can go (the doors, the circulation).
    const sameType = plan.rooms.filter((r) => r.id !== room.id && r.type === room.type).sort((a, b) => b.areaM2 - a.areaM2);
    let found: FoundPlace | null = null;
    let pickedFor: string | null = null;
    for (const careful of [true, false]) {
      found = findPlace(room, kind, product, context, careful);
      if (found) break;
      for (const other of sameType) {
        found = findPlace(other, kind, product, context, careful);
        if (found) break;
      }
      if (found) {
        pickedFor = room.id;
        break;
      }
    }
    if (!found) {
      outcomes.push({ roomId: pick.roomId, productId: pick.productId, step: 'unplaced', itemId: null, placedIn: null });
      continue;
    }
    const done = commit(found, product, pickedFor);
    outcomes.push({
      roomId: pick.roomId,
      productId: pick.productId,
      step: pickedFor ? 'other_room' : found.step,
      itemId: done.placed.id,
      placedIn: pickedFor ? found.room.id : null,
      ...(done.moved.length ? { moved: done.moved } : {}),
      ...(done.swapped.length ? { swapped: done.swapped } : {}),
      ...(done.removed.length ? { removed: done.removed } : {}),
    });
  }

  // Fixtures picked from the materials catalogue — a toilet, a pendant — have no room of their own,
  // so they go into every slot of that kind the flat has: each stood in its slot as a room's pick is,
  // else elsewhere in that room (steps 1 and 2). Where a room has no place for it, its slot keeps the
  // style's piece; a pick no slot in the flat could take is left out, as a room's pick is.
  for (const id of picks.productIds) {
    const product = byId.get(id);
    const kind = product?.model3dKind;
    if (!product || !kind || !product.model3dUrl) continue;
    const slots = next.filter((item) => item.kind === kind && !taken.has(item.id) && item.origin !== 'calculator' && item.origin !== 'studio').map((item) => item.id);
    if (slots.length === 0) continue;
    let anywhere = false;
    for (const slotId of slots) {
      const slot = next.find((item) => item.id === slotId);
      const room = slot ? plan.rooms.find((r) => r.id === slot.roomId) : undefined;
      if (!room) continue;
      const context: PlaceContext = { items: next, taken, keepClear, built, rearrange, slotId };
      const found = findPlace(room, kind, product, context, true) ?? findPlace(room, kind, product, context, false);
      if (!found) continue;
      commit(found, product, null);
      anywhere = true;
    }
    outcomes.push({ roomId: null, productId: id, step: anywhere ? 'slot' : 'unplaced', itemId: null, placedIn: null });
  }
  // A person's own pick of wall cabinets stays wherever it hangs.
  return { items: dropped.size > 0 ? next.filter((item) => !dropped.has(item.id) || taken.has(item.id)) : next, outcomes };
}

/** What `findPlace` reads: the pieces as they stand now, those picks have taken, the floor kept clear and the joinery. */
interface PlaceContext {
  items: PlacedItem[];
  taken: ReadonlySet<string>;
  keepClear: Record<string, Footprint[]>;
  built: readonly DecorPiece[];
  rearrange: boolean;
  /** This slot and no other (a whole-flat pick goes into each slot of its kind in turn). */
  slotId?: string;
}

/** Where a pick was found to fit in a room, and how: the piece laid, the slot it takes (index −1: none) and what must make way for it. */
interface FoundPlace {
  room: PlanRoom;
  laid: PlacedItem;
  index: number;
  slotItem: PlacedItem | null;
  step: Exclude<PickStep, 'held' | 'other_room' | 'unplaced'>;
  /** Step 2: the room's pieces in its way, to be moved, made smaller or taken out. */
  blockers: PlacedItem[];
}

/**
 * Steps 0 to 2 for one pick in one room, nothing changed yet: its slot, the spot its kind's rule
 * gives it, every other place in the room (`pickPoses`), then (`rearrange`) a place the room's
 * secondary pieces would make way for — `careful`, keeping a door's way and the kept-clear floor
 * clear, else by the room and the pieces alone. Null where it has no place in this room.
 */
function findPlace(room: PlanRoom, kind: string, product: CatalogProduct, context: PlaceContext, careful: boolean): FoundPlace | null {
  const { items, taken } = context;
  const archetype = getArchetype(kind);
  if (!archetype) return null;
  // The room's slot for this *kind of thing* — a bunk bed picked for a bedroom takes the bed's
  // place, whatever bed the style had put there; a corner sofa takes the sofa's.
  const free = (i: PlacedItem) => i.roomId === room.id && !taken.has(i.id) && i.origin !== 'calculator' && i.origin !== 'studio';
  let index = context.slotId ? items.findIndex((i) => i.id === context.slotId) : items.findIndex((i) => free(i) && i.kind === kind);
  if (index < 0 && !context.slotId) index = items.findIndex((i) => free(i) && i.slot === archetype.slot);
  const slotItem = index >= 0 ? { ...items[index], kind } : null;
  const others = index >= 0 ? items.filter((_, i) => i !== index) : items;
  const clear = careful ? (context.keepClear[room.id] ?? []) : null;
  // The joinery in the room, but what was built for the piece the pick replaces (its vanity, its column).
  const solid = solidIn(context.built, room, slotItem);
  const fit = (piece: PlacedItem, among: PlacedItem[], careful: readonly Footprint[] | null) => {
    const laid = fitPick(piece, product, room, among, careful);
    return laid && clearOfSolid(laid, solid, room) ? laid : null;
  };
  const found = (laid: PlacedItem, step: FoundPlace['step'], blockers: PlacedItem[] = []): FoundPlace => ({ room, laid, index, slotItem, step, blockers });
  const size = slotItem ? sizeFromProduct(product, slotItem) : ownSize(product);

  // Only a piece on the floor has anywhere else to go: one that hangs or lies flat takes its slot or its spot, or has none.
  const base: PlacedItem = slotItem ?? {
    id: `${room.id}-${kind}-extra-${items.filter((i) => i.roomId === room.id && i.kind === kind).length}`,
    roomId: room.id,
    slot: archetype.slot,
    kind,
    position: polygonCentroid(room.polygon),
    rotation: 0,
    elevationM: 0,
    size: size ?? archetype.size,
    product: null,
  };
  const floor = standsOnFloor(base);
  const poses = floor ? pickPoses(room, base.slot, sizeFromProduct(product, base), slotItem?.position ?? polygonCentroid(room.polygon)) : [];
  const at = (pose: PickPose): PlacedItem => ({ ...base, position: pose.position, rotation: pose.rotation, elevationM: 0 });
  // At its slot, else at the spot its kind's rule gives it, at its own size.
  const atSlot = slotItem ? fit(slotItem, others, clear) : null;
  if (atSlot) return found(atSlot, 'slot');
  const spot = placeAdditional(room, kind, others, size, clear ?? []);
  const atSpot = spot ? fit(slotItem ? { ...slotItem, position: spot.position, rotation: spot.rotation, elevationM: spot.elevationM } : spot, others, clear) : null;
  if (atSpot) return found(atSpot, 'spot');
  if (!floor) return null;
  // Step 1: anywhere else in the room, turned to its wall or across it.
  for (const pose of poses) {
    const laid = fit(at(pose), others, clear);
    if (laid) return found(laid, 'turned');
  }
  // Step 2: where the room's secondary pieces would make way — the fewest and least important.
  if (!context.rearrange) return null;
  const yielding = others.filter((o) => yieldsToPick(o, room, items));
  if (yielding.length === 0) return null;
  const without = others.filter((o) => !yielding.includes(o));
  let best: { laid: PlacedItem; blockers: PlacedItem[]; cost: number } | null = null;
  for (const piece of [...(slotItem ? [slotItem] : []), ...poses.map(at)]) {
    const laid = fit(piece, without, clear);
    if (!laid) continue;
    const cost = makeWayCost(yielding, laid);
    if (best && cost >= best.cost) continue;
    // With only those out of the way, it stands.
    const blockers = inTheWayOf(yielding, laid);
    const verified = fit(piece, others.filter((o) => !blockers.includes(o)), clear);
    if (!verified) continue;
    best = { laid: verified, blockers: inTheWayOf(yielding, verified), cost: makeWayCost(yielding, verified) };
  }
  return best ? found(best.laid, 'rearranged', best.blockers) : null;
}

/** The pieces among `pieces` whose floor a laid pick stands on. */
function inTheWayOf(pieces: readonly PlacedItem[], laid: PlacedItem): PlacedItem[] {
  const box = floorFootprint(laid);
  return pieces.filter((o) => footprintsOverlap(floorFootprint(o), box, PIECE_TOUCH_M));
}

/** What making way costs: each piece in the way, the more important (the archetype's priority) the dearer. */
function makeWayCost(pieces: readonly PlacedItem[], laid: PlacedItem): number {
  return inTheWayOf(pieces, laid).reduce((sum, piece) => sum + 100 + (getArchetype(piece.kind)?.priority ?? 50), 0);
}

/** Whether a piece stands on the floor and takes it: what has anywhere else in a room to be tried (`pickPoses`). */
function standsOnFloor(item: PlacedItem): boolean {
  const archetype = getArchetype(item.kind);
  const rule = archetype?.placement.type;
  return item.elevationM < 0.05 && !LIES_FLAT.has(item.slot) && !archetype?.ghost && rule !== 'wall-mounted' && rule !== 'ceiling' && rule !== 'window' && rule !== 'wall-run';
}

/** The floor the joinery and boxes built in a room stand on (`decorFootprint`), but what was built for `except`. */
function solidIn(built: readonly DecorPiece[], room: PlanRoom, except: PlacedItem | null): Footprint[] {
  const boxes: Footprint[] = [];
  for (const piece of built) {
    if (piece.roomId !== room.id) continue;
    if (except && (piece.itemId === except.id || (piece.params.sections ?? []).some((s) => s.itemId === except.id))) continue;
    const corners = decorFootprint(piece, room);
    if (!corners) continue;
    boxes.push({ minX: Math.min(...corners.map((c) => c.x)), maxX: Math.max(...corners.map((c) => c.x)), minZ: Math.min(...corners.map((c) => c.z)), maxZ: Math.max(...corners.map((c) => c.z)) });
  }
  return boxes;
}

/** A piece on the floor clear of the joinery (pieces may touch it); a hung one is not measured against it here. */
function clearOfSolid(item: PlacedItem, solid: readonly Footprint[], room: PlanRoom): boolean {
  if (solid.length === 0 || item.elevationM >= 0.05 || LIES_FLAT.has(item.slot) || getArchetype(item.kind)?.ghost) return true;
  // As built: a WC stood out from its wall by the box of its cistern (`builtFloor`).
  const box = builtFloor(item, room);
  return !solid.some((s) => footprintsOverlap(box, s, PIECE_TOUCH_M));
}

/** How many smaller products of a piece's kind are tried before it is taken out (step 2). */
const SMALLER_TRIED = 8;

/**
 * Nini's second step, done: each generated piece in a pick's way — those step 2 chose, and any piece
 * the engine placed off the piece the pick replaced that could not be seated again beside it — is
 * moved to a free spot in the room (`placeAdditional`, the kind's own rule first), else given a
 * smaller product of its kind that stands at its place or a free spot ("resize" is a smaller
 * product, never a model stretched), else taken out. Kept clear of a door's way and the kept-clear
 * floor; nothing a person chose is touched. Without `rearrange` (the studio, where the flat laid out
 * is the person's and a save that swaps or removes their pieces is refused on a plan without the
 * catalogue — `sceneGuard`) a piece is only moved, as it always was, never swapped or taken out.
 */
function makeWay(items: PlacedItem[], pick: PlacedItem, room: PlanRoom, blockers: readonly PlacedItem[], catalog: CatalogProduct[], byId: ReadonlyMap<number, CatalogProduct>, keepClear: Footprint[], solid: Footprint[], rearrange: boolean): { items: PlacedItem[]; moved: string[]; swapped: string[]; removed: string[] } {
  const moved: string[] = [];
  const swapped: string[] = [];
  const removed: string[] = [];
  if (!standsOnFloor(pick)) return { items, moved, swapped, removed };
  const pickBox = floorFootprint(pick);
  const chosen = new Set(blockers.map((b) => b.id));
  const inWay = items.filter(
    (o) =>
      o.id !== pick.id &&
      o.roomId === room.id &&
      (chosen.has(o.id) || (o.origin !== 'calculator' && o.origin !== 'studio' && !o.locked && standsOnFloor(o) && !tucksUnder(pick, o) && footprintsOverlap(floorFootprint(o), pickBox, PIECE_TOUCH_M)))
  );
  let next = items;
  for (const piece of inWay) {
    const rest = next.filter((o) => o.id !== piece.id);
    const current = piece.product ? byId.get(piece.product.productId) : undefined;
    const settle = (candidate: PlacedItem, product: CatalogProduct): PlacedItem | null => {
      const laid = fitPick(candidate, product, room, rest, keepClear);
      return laid && clearOfSolid(laid, solid, room) ? laid : null;
    };
    const spotFor = (product: CatalogProduct, size: PlacedItem['size']): PlacedItem | null => {
      const spot = placeAdditional(room, piece.kind, rest, size, keepClear);
      return spot ? settle({ ...piece, position: spot.position, rotation: spot.rotation, elevationM: spot.elevationM, size }, product) : null;
    };
    const replace = (laid: PlacedItem) => (next = next.map((o) => (o.id === piece.id ? laid : o)));
    // Moved, as it is.
    const there = current ? spotFor(current, piece.size) : null;
    if (there) {
      replace({ ...piece, position: there.position, rotation: there.rotation, elevationM: there.elevationM });
      moved.push(piece.id);
      continue;
    }
    if (!rearrange) continue;
    // A smaller product of its kind, the nearest in look and the largest first.
    const area = piece.size.width * piece.size.depth;
    const smaller = catalog
      .filter((p) => p.model3dKind === piece.kind && p.model3dUrl && !p.own && !p.pending && p.id !== current?.id && p.widthCm && p.depthCm && p.heightCm && (p.widthCm * p.depthCm) / 10000 < area * 0.95)
      .sort((a, b) => sharedStyles(b, current) - sharedStyles(a, current) || b.widthCm! * b.depthCm! - a.widthCm! * a.depthCm!)
      .slice(0, SMALLER_TRIED);
    let swappedTo: PlacedItem | null = null;
    for (const product of smaller) {
      const size = sizeFromProduct(product, piece);
      const laid = settle({ ...piece, size }, product) ?? spotFor(product, size);
      if (!laid) continue;
      swappedTo = { ...piece, position: laid.position, rotation: laid.rotation, elevationM: laid.elevationM, size, product: toSceneProduct(product, quantityFor(piece)) };
      break;
    }
    if (swappedTo) {
      replace(swappedTo);
      swapped.push(piece.id);
      continue;
    }
    next = rest;
    removed.push(piece.id);
  }
  return { items: next, moved, swapped, removed };
}

/** How many style tags two products share: a smaller piece in the same look comes first. */
function sharedStyles(a: CatalogProduct, b: CatalogProduct | undefined): number {
  const tags = (p: CatalogProduct | undefined): unknown[] => (p && Array.isArray(p.styleTags) ? (p.styleTags as unknown[]) : []);
  const own = new Set(tags(b));
  return tags(a).filter((t) => own.has(t)).length;
}

/** A pick laid where it fits, as the product makes it: a kitchen maker's material the piece made to measure in it, a shop's unit a unit (`asPlacedKitchen`). */
function asPick(laid: PlacedItem, product: CatalogProduct): PlacedItem {
  return asPlacedKitchen({ ...laid, product: toSceneProduct(product, quantityFor(laid)), pinned: true, origin: 'calculator' }, product);
}

/**
 * The wall cabinets over a run a shop's kitchen unit has just taken — over the run
 * as it was or the unit where it stands: the matcher hangs none over a shop's unit (the shop's run
 * is its own design), and a tall unit stood through them. Nothing a person chose is taken down.
 */
function cabinetsOver(items: PlacedItem[], unit: PlacedItem, before: PlacedItem | null): string[] {
  if (unit.slot !== 'kitchen_run' || unit.custom !== false) return [];
  const under = [unit, ...(before ? [before] : [])].map((piece) => footprintOf(piece.position, piece.size, piece.rotation));
  return items
    .filter((item) => item.slot === 'kitchen_wall' && item.roomId === unit.roomId && item.origin !== 'studio' && item.origin !== 'calculator' && !item.locked)
    .filter((item) => under.some((footprint) => footprintsOverlap(footprintOf(item.position, item.size, item.rotation), footprint, 0)))
    .map((item) => item.id);
}

/**
 * Finishes from the calculator's material picks: a laminate goes on every dry floor, a floor
 * tile on the wet ones, a paint on the dry walls, a wall tile on the wet walls. A pick that
 * is not a finish (a door, a socket) is simply not a finish.
 */
export function applyFinishPicks(
  finishes: SurfaceFinish[],
  plan: FloorPlan,
  picks: CalculatorPicks,
  catalog: CatalogProduct[]
): SurfaceFinish[] {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  let next = [...finishes];
  const perRoom = new Set<string>();
  const lay = (room: FloorPlan['rooms'][number], surface: 'floor' | 'wall', laid: SurfaceFinish[]) => {
    // A tile picked in the studio outranks the calculator's — it was chosen later, by eye.
    if (next.some((f) => f.roomId === room.id && f.surface === surface && f.origin === 'studio')) return;
    next = next.filter((f) => !(f.roomId === room.id && f.surface === surface));
    next.push(...laid);
  };
  const apply = (room: FloorPlan['rooms'][number], surface: 'floor' | 'wall', product: CatalogProduct) => lay(room, surface, [finishFromProduct(room, surface, product, 'calculator')]);

  // Finishes chosen for one room go on that room, whatever kind of room it is: the person
  // picked this tile for this bathroom and that paint for that bedroom on purpose — on the
  // surface it was picked for, not on every one the product would suit (a wall tile that
  // could be laid on a floor stays on the walls) — and on the walls it was chosen for, or
  // over its share of the floor (`calculatorSurfaceFinishes`).
  const chosen = new Map<string, { room: FloorPlan['rooms'][number]; surface: 'floor' | 'wall'; laid: LaidFinish[] }>();
  for (const pick of picks.roomProducts ?? []) {
    const product = byId.get(pick.productId);
    const room = plan.rooms.find((r) => r.id === pick.roomId);
    if (!product || !room) continue;
    for (const surface of pick.surface ? [pick.surface] : (['floor', 'wall'] as const)) {
      // Chosen for this surface of this room, it goes there — the calculator priced it there —
      // with or without a texture to show it by; a pick from before, on whatever it suits.
      if (!pick.surface && !isSurfaceProduct(product, surface)) continue;
      const key = `${room.id}:${surface}`;
      const entry = chosen.get(key) ?? { room, surface, laid: [] };
      entry.laid.push({ product, share: pick.share, walls: pick.walls });
      chosen.set(key, entry);
      perRoom.add(key);
    }
  }
  for (const { room, surface, laid } of chosen.values()) lay(room, surface, calculatorSurfaceFinishes(room, surface, laid));
  // A skirting board or a cornice picked for the whole flat goes round every room — as the
  // calculator priced it — unless the studio chose one there.
  for (const id of picks.productIds) {
    const product = byId.get(id);
    const kind = product?.categorySlug === 'skirting' || product?.categorySlug === 'cornice' ? product.categorySlug : null;
    if (!product || !kind) continue;
    for (const room of plan.rooms.filter(hasTrims)) {
      if (next.some((f) => f.roomId === room.id && f.surface === kind && f.origin === 'studio')) continue;
      next = next.filter((f) => !(f.roomId === room.id && f.surface === kind));
      next.push(trimFromProduct(room, kind, product, 'calculator'));
    }
  }
  // Whole-flat picks fill in the rest by wetness, skipping surfaces a room already chose.
  for (const id of picks.productIds) {
    const product = byId.get(id);
    if (!product) continue;
    for (const surface of ['floor', 'wall'] as const) {
      if (!isSurfaceProduct(product, surface)) continue;
      const wet = !!surfaceSpecs(product).wet;
      for (const room of plan.rooms) {
        if (isWetRoomType(room.type) !== wet) continue;
        if (perRoom.has(`${room.id}:${surface}`)) continue;
        apply(room, surface, product);
      }
    }
  }
  return next;
}

/**
 * The calculation's picks for the whole flat on the design: a door on every interior door, a
 * window on every window, a radiator on every radiator, a socket, switch or light on every
 * fitting of its kind — the standard ones and the ones the furniture brought — as the
 * calculator priced them on its board (`boardWithPicks`; one rule, `dressBoard`). Put on as the
 * catalogue's products, so each carries its shop: the board handed over from the calculation
 * knows the product but not who sells it, and a door with no shop was ordered from nobody and
 * made its shop's basket — and its delivery — smaller than the calculation's. The mouldings go
 * in with the finishes (`applyFinishPicks`).
 */
export function applyBoardPicks(plan: FloorPlan, electrical: ElectricalPoint[], picks: CalculatorPicks, catalog: CatalogProduct[]): { plan: FloorPlan; electrical: ElectricalPoint[] } {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const products = picks.productIds.flatMap((id) => {
    const product = byId.get(id);
    const target = product ? pickTarget(product) : null;
    return product && target && target !== 'skirting' && target !== 'cornice' ? [{ key: String(id), product }] : [];
  });
  if (products.length === 0) return { plan, electrical };
  const dressed = dressBoard(plan, electrical, products);
  return { plan: dressed.plan, electrical: dressed.electrical };
}

/**
 * A pick in its piece's place, as the matcher gives a slot a product (`placeFitting`): where the real
 * product belongs, inside the room, clear of the other pieces and the windows — and, given
 * `keepClear`, of a door's way and the floor kept clear — and hung or stood at its own height
 * (`rehung`). No other product is tried: null when this one does not fit. What the engine placed
 * off the piece is in its way only once it has been measured again off it.
 *
 * A shop's kitchen unit is tested as the kitchen's other floor-standing piece of its own size, the
 * fridge, is: the matcher leaves the run out of the test because the layout sizes a run made to
 * measure to fit, and a shop's unit is the size it is.
 */
function fitPick(piece: PlacedItem, product: CatalogProduct, room: PlanRoom, others: PlacedItem[], keepClear: readonly Footprint[] | null): PlacedItem | null {
  // What the engine placed off the piece moves to it afterwards (`reseatPlacedOff`); somebody's own
  // choice placed off it — a picked nightstand beside the bed a later pick replaces — stays in its way.
  const settled = others.filter((other) => !placedOff(other, piece) || other.origin === 'calculator' || other.origin === 'studio');
  const tested: PlacedItem = piece.slot === 'kitchen_run' && !isKitchenMaterial(product) ? { ...piece, slot: 'fridge' } : piece;
  const slots = new Map([...others, tested].map((item) => [item.id, item]));
  // Every piece the floor it takes once built (`placeFitting`'s `asBuilt`): a pick stands in no
  // shower's tray and clear of a WC's box — and, in the careful pass, of what is kept round a WC or an
  // island (decision 13: never in another object).
  const fit = placeFitting(tested, product, [], room, others, slots, settled, keepClear, true);
  if (!fit) return null;
  // A door mat or a hanging lamp is in no piece's way, but lies or hangs within its room: the matcher
  // keeps the one drawn where none does; a pick that does not is not stood out of the room.
  const size = sizeFromProduct(product, piece);
  const within = piece.slot === 'door_mat' || getArchetype(piece.kind)?.placement.type === 'ceiling';
  if (within && !footprintInRoom(footprintOf(fit.position, size, piece.rotation), room.polygon)) return null;
  return rehung(piece, { ...piece, position: fit.position, size }, product, settled);
}

/** Whether the engine placed `other` off `piece` (`placement.type === 'relative'`): a nightstand off the bed, the coffee table off the sofa. */
function placedOff(other: PlacedItem, piece: PlacedItem): boolean {
  const rule = getArchetype(other.kind)?.placement;
  return other.roomId === piece.roomId && other.id !== piece.id && rule?.type === 'relative' && rule.to === piece.slot;
}

/**
 * What the engine placed off a piece a pick has just taken, measured again off the product (the
 * nightstands beside the real bed) where it fits there; where it does not, it stays where it was.
 * Nothing a person placed in the studio is moved.
 */
function reseatPlacedOff(items: PlacedItem[], anchor: PlacedItem, room: PlanRoom, byId: ReadonlyMap<number, CatalogProduct>, keepClear: Footprint[]): void {
  for (let i = 0; i < items.length; i++) {
    const piece = items[i];
    if (!placedOff(piece, anchor) || !piece.product || piece.origin === 'studio' || piece.locked) continue;
    const product = byId.get(piece.product.productId);
    if (!product) continue;
    const others = items.filter((_, j) => j !== i);
    const fit = fitPick(piece, product, room, others, keepClear) ?? fitPick(piece, product, room, others, null);
    if (fit) items[i] = { ...piece, position: fit.position, elevationM: fit.elevationM };
  }
}

/**
 * What hangs over a piece a pick has just taken (`placement.above`: the TV over its unit, the mirror
 * over the basin, a print over the bed), stood or hung again for the piece it is over now
 * (`rehung`): a TV on its stand onto the new unit's top. Nothing a person placed in the studio is moved.
 */
function rehangOver(items: PlacedItem[], anchor: PlacedItem, before: PlacedItem | null, byId: ReadonlyMap<number, CatalogProduct>): void {
  const under = [anchor, ...(before ? [before] : [])].map((piece) => footprintOf(piece.position, piece.size, piece.rotation));
  for (let i = 0; i < items.length; i++) {
    const piece = items[i];
    const rule = getArchetype(piece.kind)?.placement;
    if (piece.id === anchor.id || piece.roomId !== anchor.roomId || !piece.product || piece.origin === 'studio' || piece.locked) continue;
    if (rule?.type !== 'wall-mounted' || rule.stretch || piece.elevationM < 0.05 || ![rule.above ?? []].flat().includes(anchor.slot)) continue;
    const box = footprintOf(piece.position, { ...piece.size, depth: Math.max(piece.size.depth, 0.05) }, piece.rotation);
    if (!under.some((footprint) => footprintsOverlap(box, footprint, 0))) continue;
    const product = byId.get(piece.product.productId);
    if (product) items[i] = rehung(piece, piece, product, items.filter((_, j) => j !== i));
  }
}

/** A product's own size, where the catalogue gives all three. */
function ownSize(product: CatalogProduct): PlacedItem['size'] | undefined {
  return product.widthCm && product.depthCm && product.heightCm ? { width: product.widthCm / 100, depth: product.depthCm / 100, height: product.heightCm / 100 } : undefined;
}

