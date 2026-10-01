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
import { categorySlugFromKey, isCartKey, surfaceOfPick } from '@/lib/calculator/quantities';
import { calculatorSurfaceFinishes, type LaidFinish } from '@/lib/calculator/roomFinishes';
import { placeAdditional } from './autoLayout';
import { getArchetype } from './catalog';
import type { CatalogProduct } from './matcher';
import { quantityFor, toSceneProduct } from './matcher';
import { finishFromProduct, isSurfaceProduct, isWetRoom, surfaceSpecs } from './surfaces';
import { dressBoard, pickTarget } from './boardPicks';
import { hasTrims, trimFromProduct } from './trims';
import type { ElectricalPoint, FloorPlan, PlacedItem, SurfaceFinish } from './types';

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
    furniture: Object.entries(selectedFurniture).flatMap(([roomId, list]) =>
      list.map((p) => ({ roomId, productId: p.productId }))
    ),
    productIds: entries.filter(([key, p]) => !p.roomId && !isCartKey(key)).map(([, p]) => p.productId),
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
 * For each pick, the slot of that kind in that room takes the product and is pinned; when
 * the room has no such slot — a bed for the living room — the layout engine finds a spot for
 * one more item. Anything it cannot place is dropped silently: the summary still prices it,
 * and an item nailed through a wall would help nobody.
 */
export function applyFurniturePicks(
  items: PlacedItem[],
  plan: FloorPlan,
  picks: CalculatorPicks,
  catalog: CatalogProduct[]
): PlacedItem[] {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const next = [...items];
  const taken = new Set<string>();
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
    if (index < 0) {
      const extra = placeAdditional(room, kind, next);
      if (!extra) continue;
      next.push(extra);
      index = next.length - 1;
    }
    const item = next[index];
    next[index] = {
      ...item,
      kind,
      product: toSceneProduct(product, quantityFor(item)),
      size: sizeOf(product, item),
      pinned: true,
      origin: 'calculator',
    };
    taken.add(item.id);
  }

  // Fixtures picked from the materials catalogue — a toilet, a pendant — have no room of
  // their own, so they go wherever the flat has a slot of that kind.
  for (const id of picks.productIds) {
    const product = byId.get(id);
    const kind = product?.model3dKind;
    if (!product || !kind || !product.model3dUrl) continue;
    for (let i = 0; i < next.length; i++) {
      const item = next[i];
      if (item.kind !== kind || taken.has(item.id) || item.origin === 'calculator' || item.origin === 'studio') continue;
      next[i] = {
        ...item,
        product: toSceneProduct(product, quantityFor(item)),
        size: sizeOf(product, item),
        pinned: true,
        origin: 'calculator',
      };
      taken.add(item.id);
    }
  }
  return next;
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
        if (isWetRoom(room.type) !== wet) continue;
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

function sizeOf(product: CatalogProduct, item: PlacedItem): PlacedItem['size'] {
  if (item.slot === 'kitchen_run' || item.slot === 'rug' || item.slot === 'curtain') return item.size;
  if (!product.widthCm || !product.depthCm || !product.heightCm) return item.size;
  return { width: product.widthCm / 100, depth: product.depthCm / 100, height: product.heightCm / 100 };
}

