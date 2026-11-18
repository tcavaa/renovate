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
import { placeFitting, quantityFor, rehung, sizeFromProduct, toSceneProduct } from './matcher';
import { footprintOf, footprintsOverlap, type Footprint } from './manipulate';
import { asPlacedKitchen } from './kitchen';
import { finishFromProduct, isSurfaceProduct, isWetRoomType, surfaceSpecs } from './surfaces';
import { dressBoard, pickTarget } from './boardPicks';
import { hasTrims, trimFromProduct } from './trims';
import type { ElectricalPoint, FloorPlan, PlacedItem, PlanRoom, SurfaceFinish } from './types';

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

/**
 * Puts the user's furniture into the laid-out flat.
 *
 * For each pick, the slot of that kind in that room takes the product and is pinned — the way
 * the matcher gives a slot a product (`placeFitting`): stood where the real product belongs (its
 * back on the slot's wall, a nightstand beside the real bed), kept inside the room and tested
 * against the other pieces, the windows, a door's way and the floor the layout kept clear
 * (`keepClear`). What the engine placed off the piece (the nightstands off the bed, the coffee
 * table off the sofa) is measured again off the product. When the slot cannot take it, or the room
 * has no such slot — a bed for the living room — a free spot is looked for with the product's own
 * size. Slot and spot are tried keeping a door's way and the kept-clear floor clear first, and only
 * then by the room and the pieces alone, as the matcher tries its careful pass first. A shop's
 * kitchen unit is tested at its own size like any floor piece, and takes down the wall cabinets
 * over the run it took (`cabinetsOver`). A pick is the person's choice: it is never replaced by
 * another product. Where it fits nowhere it goes where it always did — into its slot at its size (a
 * shop's kitchen unit into the run at the run's size), or into a spot found for the kind's typical
 * size — and a pick with no slot and no spot at all is dropped: the summary still prices it.
 */
export function applyFurniturePicks(
  items: PlacedItem[],
  plan: FloorPlan,
  picks: CalculatorPicks,
  catalog: CatalogProduct[],
  keepClear: Record<string, Footprint[]> = {}
): PlacedItem[] {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const next = [...items];
  const taken = new Set<string>();
  // The wall cabinets a shop's kitchen unit took the run from (`cabinetsOver`).
  const dropped = new Set<string>();
  // What each room already has of each product. Picks are put into a design more than once —
  // every "see it in 3D" from the calculator's summary brings them again — and a pick the room
  // already holds (placed last time, or chosen in the studio) is satisfied, not placed twice.
  const holds = new Map<string, number>();
  for (const item of items) {
    if (!item.product) continue;
    const key = `${item.roomId}:${item.product.productId}`;
    holds.set(key, (holds.get(key) ?? 0) + 1);
  }

  for (const pick of picks.furniture) {
    const held = holds.get(`${pick.roomId}:${pick.productId}`) ?? 0;
    if (held > 0) {
      holds.set(`${pick.roomId}:${pick.productId}`, held - 1);
      continue;
    }
    const product = byId.get(pick.productId);
    const kind = product?.model3dKind;
    if (!product || !kind || !product.model3dUrl) continue;
    const room = plan.rooms.find((r) => r.id === pick.roomId);
    if (!room) continue;

    // The room's slot for this *kind of thing* — a bunk bed picked for a bedroom takes the
    // bed's place, whatever bed the style had put there; a corner sofa takes the sofa's.
    const slot = getArchetype(kind)?.slot;
    const free = (i: PlacedItem) =>
      i.roomId === room.id && !taken.has(i.id) && i.origin !== 'calculator' && i.origin !== 'studio';
    let index = next.findIndex((i) => free(i) && i.kind === kind);
    if (index < 0 && slot) index = next.findIndex((i) => free(i) && i.slot === slot);
    const clear = keepClear[room.id] ?? [];
    const slotItem = index >= 0 ? { ...next[index], kind } : null;
    const others = index >= 0 ? next.filter((_, i) => i !== index) : next;
    // At its slot, else at a free spot found for its own size — first keeping a door's way and the
    // kept-clear floor clear, then by the room and the pieces alone, as the matcher's careful pass
    // comes before its careless one; else as it always was.
    let laid: PlacedItem | null = null;
    for (const careful of [clear, null]) {
      laid = slotItem ? fitPick(slotItem, product, room, others, careful) : null;
      if (laid) break;
      const spot = placeAdditional(room, kind, others, slotItem ? sizeFromProduct(product, slotItem) : ownSize(product), careful ?? []);
      laid = spot ? fitPick(slotItem ? { ...slotItem, position: spot.position, rotation: spot.rotation, elevationM: spot.elevationM } : spot, product, room, others, careful) : null;
      if (laid) break;
    }
    if (!laid && !slotItem) {
      const extra = placeAdditional(room, kind, next);
      if (!extra) continue;
      laid = { ...extra, size: sizeFromProduct(product, extra) };
    }
    // Fitting nowhere, it takes its slot as it always did — a shop's kitchen unit the run as it was.
    const placed = laid ? asPick(laid, product) : asBefore(slotItem!, product);
    if (index >= 0) next[index] = placed;
    else next.push(placed);
    taken.add(placed.id);
    if (laid) cabinetsOver(next, placed, slotItem).forEach((id) => dropped.add(id));
    reseatPlacedOff(next, placed, room, byId, clear);
    rehangOver(next, placed, slotItem, byId);
  }

  // Fixtures picked from the materials catalogue — a toilet, a pendant — have no room of
  // their own, so they go wherever the flat has a slot of that kind: each stood in its slot as a
  // room's pick is (`fitPick`), and where it does not fit there, in the slot at its size as before.
  for (const id of picks.productIds) {
    const product = byId.get(id);
    const kind = product?.model3dKind;
    if (!product || !kind || !product.model3dUrl) continue;
    for (let i = 0; i < next.length; i++) {
      const item = next[i];
      if (item.kind !== kind || taken.has(item.id) || item.origin === 'calculator' || item.origin === 'studio') continue;
      const room = plan.rooms.find((r) => r.id === item.roomId);
      const others = next.filter((_, j) => j !== i);
      const laid = room ? (fitPick(item, product, room, others, keepClear[room.id] ?? []) ?? fitPick(item, product, room, others, null)) : null;
      next[i] = laid ? asPick(laid, product) : asBefore(item, product);
      if (laid) cabinetsOver(next, next[i], item).forEach((cabinet) => dropped.add(cabinet));
      taken.add(item.id);
      if (room) {
        reseatPlacedOff(next, next[i], room, byId, keepClear[room.id] ?? []);
        rehangOver(next, next[i], item, byId);
      }
    }
  }
  // A person's own pick of wall cabinets stays wherever it hangs.
  return dropped.size > 0 ? next.filter((item) => !dropped.has(item.id) || taken.has(item.id)) : next;
}

/** A pick laid where it fits, as the product makes it: a kitchen maker's material the piece made to measure in it, a shop's unit a unit (`asPlacedKitchen`). */
function asPick(laid: PlacedItem, product: CatalogProduct): PlacedItem {
  return asPlacedKitchen({ ...laid, product: toSceneProduct(product, quantityFor(laid)), pinned: true, origin: 'calculator' }, product);
}

/**
 * A pick that fits nowhere, as picks were always placed: in its slot at the product's size — a
 * kitchen run at the run's own, the run left as it was laid.
 */
function asBefore(slot: PlacedItem, product: CatalogProduct): PlacedItem {
  const size = slot.slot === 'kitchen_run' ? slot.size : sizeFromProduct(product, slot);
  return { ...slot, size, product: toSceneProduct(product, quantityFor(slot)), pinned: true, origin: 'calculator' };
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
  const settled = others.filter((other) => !placedOff(other, piece));
  const tested: PlacedItem = piece.slot === 'kitchen_run' && !isKitchenMaterial(product) ? { ...piece, slot: 'fridge' } : piece;
  const slots = new Map([...others, tested].map((item) => [item.id, item]));
  const fit = placeFitting(tested, product, [], room, others, slots, settled, keepClear);
  return fit ? rehung(piece, { ...piece, position: fit.position, size: sizeFromProduct(product, piece) }, product, settled) : null;
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

