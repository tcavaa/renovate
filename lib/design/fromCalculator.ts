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
import { placeAdditional } from './autoLayout';
import { getArchetype } from './catalog';
import type { CatalogProduct } from './matcher';
import { quantityFor, toSceneProduct } from './matcher';
import { finishFromProduct, isSurfaceProduct, isWetRoom, surfaceSpecs } from './surfaces';
import type { FloorPlan, PlacedItem, SurfaceFinish } from './types';

export interface CalculatorPicks {
  /** Furniture chosen per room on /calculator/furniture. */
  furniture: Array<{ roomId: string; productId: number }>;
  /** Materials chosen for the whole flat on /calculator/catalog — the ones with a texture become finishes. */
  productIds: number[];
  /** Finishes chosen for one room each on /calculator/catalog. */
  roomProducts?: Array<{ roomId: string; productId: number }>;
}

export function picksFromCalculator(
  selectedProducts: Record<string, SelectedProduct>,
  selectedFurniture: Record<string, SelectedProduct[]>
): CalculatorPicks {
  const products = Object.values(selectedProducts);
  return {
    furniture: Object.entries(selectedFurniture).flatMap(([roomId, list]) =>
      list.map((p) => ({ roomId, productId: p.productId }))
    ),
    productIds: products.filter((p) => !p.roomId).map((p) => p.productId),
    roomProducts: products.filter((p) => !!p.roomId).map((p) => ({ roomId: p.roomId!, productId: p.productId })),
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

  for (const pick of picks.furniture) {
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
  const apply = (room: FloorPlan['rooms'][number], surface: 'floor' | 'wall', product: CatalogProduct) => {
    // A tile picked in the studio outranks the calculator's — it was chosen later, by eye.
    if (next.some((f) => f.roomId === room.id && f.surface === surface && f.origin === 'studio')) return;
    next = next.filter((f) => !(f.roomId === room.id && f.surface === surface));
    next.push(finishFromProduct(room, surface, product, 'calculator'));
  };

  // Finishes chosen for one room go on that room, whatever kind of room it is: the person
  // picked this tile for this bathroom and that paint for that bedroom on purpose.
  for (const pick of picks.roomProducts ?? []) {
    const product = byId.get(pick.productId);
    const room = plan.rooms.find((r) => r.id === pick.roomId);
    if (!product || !room) continue;
    for (const surface of ['floor', 'wall'] as const) {
      if (!isSurfaceProduct(product, surface)) continue;
      apply(room, surface, product);
      perRoom.add(`${room.id}:${surface}`);
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

function sizeOf(product: CatalogProduct, item: PlacedItem): PlacedItem['size'] {
  if (item.slot === 'kitchen_run' || item.slot === 'rug' || item.slot === 'curtain') return item.size;
  if (!product.widthCm || !product.depthCm || !product.heightCm) return item.size;
  return { width: product.widthCm / 100, depth: product.depthCm / 100, height: product.heightCm / 100 };
}

