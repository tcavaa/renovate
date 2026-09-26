/**
 * A floor and a wall for every room: the calculator's finishes (September 2026).
 *
 * The catalogue step lists the rooms, and each takes one floor product and one wall product,
 * under the room's own selection key (`<slug>_room:<roomId>`, `selectionKey`) with the
 * surface on the pick. What it comes to is worked out from the room itself — its floor or
 * its walls in the product's units, with the cutting waste (`roomFinishQuantity`) — so
 * nothing is laid by hand: the placement step that used to follow the catalogue is gone,
 * and the drawing board wears the rooms' picks by itself (`boardFinishesFromPicks`, for the
 * PDF and the saved board). The 3D design takes the same picks room by room
 * (`picksFromCalculator` → `roomProducts`, applied to the pick's own surface).
 *
 * Pure functions; the store, the pages, the loader and the save call them.
 */

import type { Category } from '@/lib/db/schema';
import type { CatalogProduct } from '@/lib/design/matcher';
import { finishFromProduct } from '@/lib/design/surfaces';
import { isBaseFinish } from '@/lib/design/zones';
import type { FloorPlan, SurfaceFinish } from '@/lib/design/types';
import { BATH_ROOM_TYPES, TILED_FLOOR_ROOM_TYPES } from './constants';
import { categorySlugFromKey, isCartKey, roomFinishQuantity, roomIdFromKey, selectionKey, surfaceOfPick, type FinishSurface } from './quantities';
import type { Room, RoomType, SelectedProduct } from './types';

export type { FinishSurface } from './quantities';

type Picks = Record<string, SelectedProduct>;

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Which surface a category's products go on, or null for one that is not a finish (a socket, a door). */
export function surfaceOfCategory(category: Pick<Category, 'calculationType'> | null | undefined): FinishSurface | null {
  if (category?.calculationType === 'per_m2_floor') return 'floor';
  if (category?.calculationType === 'per_m2_wall') return 'wall';
  return null;
}

/** A pick with the category its key names, for the picks saved before they carried it. */
const withSlug = (key: string, pick: SelectedProduct): SelectedProduct => (pick.categorySlug ? pick : { ...pick, categorySlug: categorySlugFromKey(key) });

/** The pick a room has for its floor or its walls, with its key; null when it has none. */
export function roomFinishEntry(picks: Picks, roomId: string, surface: FinishSurface): [string, SelectedProduct] | null {
  for (const [key, pick] of Object.entries(picks)) {
    if (roomIdFromKey(key) === roomId && surfaceOfPick(withSlug(key, pick)) === surface) return [key, pick];
  }
  return null;
}

/**
 * How a room's surface is finished in the renovation — the engine's own grouping of the
 * works: the bathroom's and toilet's floors and walls are tiled (phases 8–9), the kitchen's
 * and balcony's floors tiled (phase 10), every other floor laid (11) and every other wall
 * painted (6). A room's picks are offered from its group first, and "the same in the rooms
 * like it" means the rooms of the same group.
 */
export type FinishGroup = 'tiled-floor' | 'laid-floor' | 'tiled-wall' | 'painted-wall';

export function finishGroup(type: RoomType, surface: FinishSurface): FinishGroup {
  if (surface === 'floor') return BATH_ROOM_TYPES.includes(type) || TILED_FLOOR_ROOM_TYPES.includes(type) ? 'tiled-floor' : 'laid-floor';
  return BATH_ROOM_TYPES.includes(type) ? 'tiled-wall' : 'painted-wall';
}

/** The category a room's surface is usually finished from: what the catalogue step opens on. */
export function usualFinishCategory(type: RoomType, surface: FinishSurface): string {
  const group = finishGroup(type, surface);
  return group === 'tiled-floor' ? 'floor-tiles' : group === 'laid-floor' ? 'laminate' : group === 'tiled-wall' ? 'wall-tiles' : 'paint';
}

/** The other rooms whose surface is finished the same way — the "the same in the rooms like it" shortcut. */
export function roomsLike(rooms: Room[], room: Room, surface: FinishSurface): Room[] {
  const group = finishGroup(room.type, surface);
  return rooms.filter((r) => r.id !== room.id && finishGroup(r.type, surface) === group);
}

/**
 * The picks with `product` as the floor or the walls of each of `roomIds` — whatever each of
 * them had for that surface goes, whatever category it was from — or with that surface of
 * theirs cleared when `product` is null. Each is counted from its own room. `product` must
 * carry its `categorySlug`: the key is made of it.
 */
export function withRoomFinish(picks: Picks, rooms: Room[], roomIds: string[], surface: FinishSurface, product: SelectedProduct | null): Picks {
  const targets = new Set(roomIds);
  const next: Picks = {};
  for (const [key, pick] of Object.entries(picks)) {
    const roomId = roomIdFromKey(key);
    if (roomId && targets.has(roomId) && surfaceOfPick(withSlug(key, pick)) === surface) continue;
    next[key] = pick;
  }
  if (product?.categorySlug) {
    for (const room of rooms) {
      if (!targets.has(room.id)) continue;
      const qty = roomFinishQuantity(product, surface, room);
      next[selectionKey(product.categorySlug, room.id)] = { ...product, roomId: room.id, surface, qty, totalPrice: round2(qty * product.pricePerUnit) };
    }
  }
  return next;
}

/**
 * Every room's finish counted again from its room, and the finishes of rooms that are gone
 * dropped. The same object when nothing changed. A flat with no rooms at all is left alone:
 * that is a flat not read yet, not one whose rooms were all taken away.
 */
export function withRoomFinishQuantities(picks: Picks, rooms: Room[]): Picks {
  if (rooms.length === 0) return picks;
  const byId = new Map(rooms.map((r) => [r.id, r]));
  let changed = false;
  const next: Picks = {};
  for (const [key, raw] of Object.entries(picks)) {
    const roomId = roomIdFromKey(key);
    if (!roomId) {
      next[key] = raw;
      continue;
    }
    const room = byId.get(roomId);
    if (!room) {
      changed = true;
      continue;
    }
    const pick = withSlug(key, raw);
    const surface = surfaceOfPick(pick);
    if (!surface) {
      next[key] = raw;
      continue;
    }
    const qty = roomFinishQuantity(pick, surface, room);
    const totalPrice = round2(qty * pick.pricePerUnit);
    if (pick === raw && qty === raw.qty && totalPrice === raw.totalPrice && raw.surface === surface && raw.roomId === roomId) {
      next[key] = raw;
      continue;
    }
    changed = true;
    next[key] = { ...pick, roomId, surface, qty, totalPrice };
  }
  return changed ? next : picks;
}

/**
 * Picks from before every room took its own floor and walls, moved onto the rooms once:
 *
 *  - a material from the cart that was laid on the board by hand (`<slug>_item:<productId>`)
 *    goes to the rooms whose floor or walls the board had in it (a whole-room finish; a tile
 *    or a strip of it says nothing about the room), and is dropped if it was laid nowhere;
 *  - a finish chosen for the whole flat (`<slug>_global` of a finish category — the first
 *    catalogue, and projects designed first) goes to every room its kind of work suits
 *    (`finishGroup`: floor tiles on the bathroom, toilet, kitchen and balcony floors, laminate
 *    on the rest, wall tiles on the bathroom and toilet walls, paint on the rest).
 *
 * Never over a room that has a pick of its own for that surface. Counted by
 * `withRoomFinishQuantities` afterwards. The same object when there is nothing to move.
 */
export function migrateFinishPicks(picks: Picks, rooms: Room[], boardFinishes: SurfaceFinish[]): Picks {
  const old = Object.entries(picks).filter(([key, pick]) => isCartKey(key) || (roomIdFromKey(key) == null && surfaceOfPick(withSlug(key, pick)) != null));
  if (old.length === 0 || rooms.length === 0) return picks;
  const oldKeys = new Set(old.map(([key]) => key));
  let next: Picks = Object.fromEntries(Object.entries(picks).filter(([key]) => !oldKeys.has(key)));
  for (const [key, raw] of old) {
    const pick = withSlug(key, raw);
    const surface = surfaceOfPick(pick);
    if (!surface) continue;
    const suited = isCartKey(key)
      ? rooms.filter((room) => boardFinishes.some((f) => f.roomId === room.id && f.surface === surface && isBaseFinish(f) && f.product?.productId === pick.productId))
      : rooms.filter((room) => usualFinishCategory(room.type, surface) === pick.categorySlug);
    const free = suited.filter((room) => !roomFinishEntry(next, room.id, surface)).map((room) => room.id);
    if (free.length > 0) next = withRoomFinish(next, rooms, free, surface, pick);
  }
  return next;
}

/**
 * The drawing board as the rooms' picks finish it: each room's floor and walls in its chosen
 * product, and nothing where nothing was chosen (the board's paper). What the summary's PDF
 * draws and what is saved as the board's finishes.
 */
export function boardFinishesFromPicks(plan: FloorPlan | null, picks: Picks): SurfaceFinish[] {
  if (!plan) return [];
  const finishes: SurfaceFinish[] = [];
  for (const room of plan.rooms) {
    for (const surface of ['floor', 'wall'] as const) {
      const entry = roomFinishEntry(picks, room.id, surface);
      if (entry) finishes.push(finishFromProduct(room, surface, catalogProductFromPick(withSlug(entry[0], entry[1])), 'calculator'));
    }
  }
  return finishes;
}

/**
 * A pick as the catalogue product the board's finish actions take. The pick carries what the
 * board needs (texture, colour, coverage, specs) from the catalogue row it was made from, so
 * no catalogue has to be fetched to draw it.
 */
export function catalogProductFromPick(pick: SelectedProduct): CatalogProduct {
  return {
    id: pick.productId,
    nameKa: pick.nameKa,
    nameEn: pick.nameEn ?? null,
    nameRu: pick.nameRu ?? null,
    slug: pick.slug ?? '',
    brand: null,
    categorySlug: pick.categorySlug ?? '',
    pricePerUnit: pick.pricePerUnit,
    unit: pick.unit,
    imageUrl: pick.imageUrl,
    colorHex: pick.colorHex ?? null,
    textureUrl: pick.textureUrl ?? null,
    model3dKind: null,
    model3dUrl: null,
    widthCm: null,
    depthCm: null,
    heightCm: null,
    styleTags: [],
    tags: [],
    isFeatured: false,
    specs: pick.specs ?? null,
    coveragePerUnit: pick.coveragePerUnit ?? null,
    store: null,
  };
}
