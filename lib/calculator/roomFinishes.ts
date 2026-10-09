/**
 * Each room's floor and walls: the calculator's finishes (September 2026).
 *
 * The catalogue step lists the rooms, and each takes its floor and its walls under the room's
 * own selection keys (`<slug>_room:<roomId>`, `selectionKey`) with the surface on the pick.
 * What a pick comes to is worked out from the room itself — its floor or its walls in the
 * product's units, with the cutting waste (`roomFinishQuantity`) — so nothing is laid by hand:
 * the placement step that used to follow the catalogue is gone, and the drawing board wears
 * the rooms' picks by itself (`boardFinishesFromPicks`, for the PDF and the saved board). The
 * 3D design takes the same picks room by room (`picksFromCalculator` → `roomProducts`, applied
 * to the pick's own surface, and a wall chosen on its own to that wall).
 *
 * How a room's surface can be finished:
 *  - **the floor** in one product, or in two that share it — each carries its `share` of the
 *    floor, the two making the whole; the second is keyed `…/floor2`;
 *  - **the walls** in one product (the whole room), or **wall by wall**: one pick per product,
 *    carrying the walls it was chosen for (`walls`, by the room's wall index — `Room.walls`),
 *    keyed `…/walls<productId>`, so a paint on three walls is one line of paint, bought once.
 * Every change goes through a function here, and the result is put in that shape again
 * (`normalizeRoomFinishes`) — by the store after each edit and by the server on each save, so
 * the two count the same thing.
 *
 * Pure functions; the store, the pages, the loader and the save call them.
 */

import type { Category } from '@/lib/db/schema';
import type { CatalogProduct } from '@/lib/design/matcher';
import { finishFromProduct } from '@/lib/design/surfaces';
import { wallEdgeAreaM2 } from '@/lib/design/zones';
import type { FloorPlan, ItemOrigin, PlanRoom, SurfaceFinish } from '@/lib/design/types';
import { BATH_ROOM_TYPES, TILED_FLOOR_ROOM_TYPES } from './constants';
import { categorySlugFromKey, partFromKey, roomFinishQuantity, roomIdFromKey, roomWallAreasM2, roomWalls, selectionKey, surfaceOfPick, type FinishSurface } from './quantities';
import type { Room, RoomType, SelectedProduct } from './types';

export type { FinishSurface } from './quantities';

type Picks = Record<string, SelectedProduct>;

/** A pick with its selection key. */
export type FinishEntry = [key: string, pick: SelectedProduct];

const round2 = (value: number) => Math.round(value * 100) / 100;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** The key part of a floor's second product. */
const SECOND_FLOOR = 'floor2';
/** The key part of one product over the walls it was chosen for one by one. */
const wallsPart = (productId: number) => `walls${productId}`;

/** Which surface a category's products go on, or null for one that is not a finish (a socket, a door). */
export function surfaceOfCategory(category: Pick<Category, 'calculationType'> | null | undefined): FinishSurface | null {
  if (category?.calculationType === 'per_m2_floor') return 'floor';
  if (category?.calculationType === 'per_m2_wall') return 'wall';
  return null;
}

/** A pick with the category its key names, for the picks saved before they carried it. */
const withSlug = (key: string, pick: SelectedProduct): SelectedProduct => (pick.categorySlug ? pick : { ...pick, categorySlug: categorySlugFromKey(key) });

/** Every pick a room has for its floor or its walls, with its key, in the order they are kept. */
export function roomFinishEntries(picks: Picks, roomId: string, surface: FinishSurface): FinishEntry[] {
  const out: FinishEntry[] = [];
  for (const [key, raw] of Object.entries(picks)) {
    if (roomIdFromKey(key) !== roomId) continue;
    const pick = withSlug(key, raw);
    if (surfaceOfPick(pick) === surface) out.push([key, pick]);
  }
  return out;
}

/** A pick a room has for its floor or its walls, with its key — the first; null when it has none. */
export function roomFinishEntry(picks: Picks, roomId: string, surface: FinishSurface): FinishEntry | null {
  return roomFinishEntries(picks, roomId, surface)[0] ?? null;
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

// ---------------------------------------------------------------------------
// The shape a room's finishes are kept in
// ---------------------------------------------------------------------------

const sameList = (a: number[] | undefined, b: number[] | undefined) => (a ?? null) === (b ?? null) || (!!a && !!b && a.length === b.length && a.every((v, i) => v === b[i]));

/**
 * A pick as a room's finish is kept: on that room and surface, with exactly the share and the
 * walls given (none of either for the whole surface) — the same object when it already is.
 */
function shaped(pick: SelectedProduct, roomId: string, surface: FinishSurface, share?: number, walls?: number[]): SelectedProduct {
  if (pick.roomId === roomId && pick.surface === surface && pick.share === share && sameList(pick.walls, walls)) return pick;
  const { share: _share, walls: _walls, ...rest } = pick;
  return { ...rest, roomId, surface, ...(share != null ? { share } : {}), ...(walls ? { walls } : {}) };
}

/** The first product's share of a floor two products share: its own, else what the second leaves, else half. */
function shareOfFirst(first: SelectedProduct, second: SelectedProduct): number {
  if (first.share != null && Number.isFinite(first.share)) return round2(clamp01(first.share));
  if (second.share != null && Number.isFinite(second.share)) return round2(1 - clamp01(second.share));
  return 0.5;
}

/**
 * A room's floor as it is kept: its first product under the room's key, and a second sharing it
 * under `…/floor2`, the two shares making the whole; one product alone covers all of it. A
 * third, or the same product twice, is let go.
 */
function canonicalFloor(roomId: string, entries: FinishEntry[]): FinishEntry[] {
  const ordered = [...entries].sort((a, b) => Number(partFromKey(a[0]) != null) - Number(partFromKey(b[0]) != null));
  const kept: SelectedProduct[] = [];
  for (const [, pick] of ordered) {
    if (kept.length === 2) break;
    if (!kept.some((p) => p.productId === pick.productId)) kept.push(pick);
  }
  const [first, second] = kept;
  if (!first) return [];
  if (!second) return [[selectionKey(first.categorySlug ?? '', roomId), shaped(first, roomId, 'floor')]];
  const share = shareOfFirst(first, second);
  return [
    [selectionKey(first.categorySlug ?? '', roomId), shaped(first, roomId, 'floor', share)],
    [selectionKey(second.categorySlug ?? '', roomId, SECOND_FLOOR), shaped(second, roomId, 'floor', round2(1 - share))],
  ];
}

/**
 * What each of a room's walls is in, by index: the product chosen for it on its own, else the
 * room's walls product; null where nothing was chosen. A wall claimed twice is the first one's.
 */
function wallOwners(room: Room, entries: FinishEntry[]): (SelectedProduct | null)[] {
  const owners: (SelectedProduct | null)[] = roomWalls(room).map(() => null);
  for (const [, pick] of entries) {
    for (const i of pick.walls ?? []) if (Number.isInteger(i) && i >= 0 && i < owners.length && !owners[i]) owners[i] = pick;
  }
  const whole = entries.find(([, pick]) => !pick.walls);
  if (whole) for (let i = 0; i < owners.length; i++) owners[i] ??= whole[1];
  return owners;
}

/** One pick per product over the walls it is on, from what each wall is in. */
function byWallEntries(roomId: string, owners: (SelectedProduct | null)[]): FinishEntry[] {
  const groups = new Map<number, { pick: SelectedProduct; walls: number[] }>();
  owners.forEach((pick, i) => {
    if (!pick) return;
    const group = groups.get(pick.productId);
    if (group) group.walls.push(i);
    else groups.set(pick.productId, { pick, walls: [i] });
  });
  return [...groups.values()].map(({ pick, walls }) => [selectionKey(pick.categorySlug ?? '', roomId, wallsPart(pick.productId)), shaped(pick, roomId, 'wall', undefined, walls)]);
}

/**
 * A room's walls as they are kept: one product under the room's key, or — once any wall was
 * chosen on its own — one pick per product over its walls. A room's walls product found beside
 * walls chosen one by one (a design's feature wall, a copy from before) goes on the walls
 * nobody chose.
 */
function canonicalWalls(room: Room, entries: FinishEntry[]): FinishEntry[] {
  if (entries.some(([, pick]) => pick.walls)) return byWallEntries(room.id, wallOwners(room, entries));
  const whole = entries[0];
  return whole ? [[selectionKey(whole[1].categorySlug ?? '', room.id), shaped(whole[1], room.id, 'wall')]] : [];
}

const sameEntries = (a: Picks, b: Picks): boolean => {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  return ak.length === bk.length && ak.every((key, i) => key === bk[i] && a[key] === b[key]);
};

/**
 * Every room's finishes in the shape they are kept in (see the top of this file), the finishes
 * of rooms that are gone dropped, everything else as it was. The same object when nothing
 * changed; a flat with no rooms at all is left alone — that is a flat not read yet, not one
 * whose rooms were all taken away. Run by the store after every edit and by the server before
 * it counts a save.
 */
export function normalizeRoomFinishes(picks: Picks, rooms: Room[]): Picks {
  if (rooms.length === 0) return picks;
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const groups = new Map<string, { room: Room; surface: FinishSurface; entries: FinishEntry[] }>();
  const groupOf = new Map<string, string>();
  for (const [key, raw] of Object.entries(picks)) {
    const room = byId.get(roomIdFromKey(key) ?? '');
    if (!room) continue;
    const pick = withSlug(key, raw);
    const surface = surfaceOfPick(pick);
    if (!surface) continue;
    const id = `${room.id}\u0000${surface}`;
    const group = groups.get(id) ?? { room, surface, entries: [] };
    group.entries.push([key, pick]);
    groups.set(id, group);
    groupOf.set(key, id);
  }
  const next: Picks = {};
  const done = new Set<string>();
  for (const [key, raw] of Object.entries(picks)) {
    const roomId = roomIdFromKey(key);
    if (roomId && !byId.has(roomId)) continue;
    const id = groupOf.get(key);
    if (!id) {
      next[key] = raw;
      continue;
    }
    // A room's surface in its shape, where its first pick stood, so the list does not jump.
    if (done.has(id)) continue;
    done.add(id);
    const { room, surface, entries } = groups.get(id)!;
    for (const [k, pick] of surface === 'floor' ? canonicalFloor(room.id, entries) : canonicalWalls(room, entries)) next[k] = pick;
  }
  return sameEntries(picks, next) ? picks : next;
}

/**
 * Every room's finishes counted again from its room (and put in their shape, `normalizeRoomFinishes`),
 * the finishes of rooms that are gone dropped. The same object when nothing changed. A flat
 * with no rooms at all is left alone: that is a flat not read yet, not one whose rooms were
 * all taken away.
 */
export function withRoomFinishQuantities(picks: Picks, rooms: Room[]): Picks {
  if (rooms.length === 0) return picks;
  const shapedPicks = normalizeRoomFinishes(picks, rooms);
  const byId = new Map(rooms.map((r) => [r.id, r]));
  let changed = shapedPicks !== picks;
  const next: Picks = {};
  for (const [key, raw] of Object.entries(shapedPicks)) {
    const roomId = roomIdFromKey(key);
    const room = roomId ? byId.get(roomId) : null;
    const pick = withSlug(key, raw);
    const surface = room ? surfaceOfPick(pick) : null;
    if (!room || !surface) {
      next[key] = raw;
      continue;
    }
    const qty = roomFinishQuantity(pick, surface, room);
    const totalPrice = round2(qty * pick.pricePerUnit);
    if (pick === raw && qty === raw.qty && totalPrice === raw.totalPrice && raw.surface === surface && raw.roomId === room.id) {
      next[key] = raw;
      continue;
    }
    changed = true;
    next[key] = { ...pick, roomId: room.id, surface, qty, totalPrice };
  }
  return changed ? next : picks;
}

/** The picks with each named room's finishes of one surface replaced by its own entries; nothing is counted yet. */
function replaceSurface(picks: Picks, surface: FinishSurface, byRoom: Map<string, FinishEntry[]>): Picks {
  const next: Picks = {};
  const placed = new Set<string>();
  for (const [key, pick] of Object.entries(picks)) {
    const roomId = roomIdFromKey(key);
    if (roomId && byRoom.has(roomId) && surfaceOfPick(withSlug(key, pick)) === surface) {
      // The room's new picks stand where its old ones did, so the lists do not jump.
      if (!placed.has(roomId)) for (const [k, p] of byRoom.get(roomId)!) next[k] = p;
      placed.add(roomId);
      continue;
    }
    next[key] = pick;
  }
  for (const [roomId, entries] of byRoom) if (!placed.has(roomId)) for (const [k, p] of entries) next[k] = p;
  return next;
}

// ---------------------------------------------------------------------------
// Reading a room's finishes
// ---------------------------------------------------------------------------

export interface RoomFinishes {
  /** The floor's products: the first, and the second sharing it — each with its `share` — at most two. */
  floor: FinishEntry[];
  /** The walls in one product, the whole room… */
  walls: FinishEntry | null;
  /** …or chosen one by one: what each wall is in, by index, null where nothing was chosen. Null when they are not. */
  byWall: (SelectedProduct | null)[] | null;
}

/** How a room's floor and walls are finished, as the catalogue step shows them. */
export function roomFinishesOf(picks: Picks, room: Room): RoomFinishes {
  const walls = roomFinishEntries(picks, room.id, 'wall');
  const oneByOne = walls.some(([, pick]) => pick.walls);
  return {
    floor: canonicalFloor(room.id, roomFinishEntries(picks, room.id, 'floor')),
    walls: oneByOne ? null : (walls[0] ?? null),
    byWall: oneByOne ? wallOwners(room, walls) : null,
  };
}

// ---------------------------------------------------------------------------
// Changing a room's finishes
// ---------------------------------------------------------------------------

/**
 * The picks with `product` as the whole floor or all the walls of each of `roomIds` —
 * whatever each of them had for that surface goes, whatever category it was from, a second
 * floor product and walls chosen one by one included — or with that surface of theirs cleared
 * when `product` is null. Each is counted from its own room. `product` must carry its
 * `categorySlug`: the key is made of it.
 */
export function withRoomFinish(picks: Picks, rooms: Room[], roomIds: string[], surface: FinishSurface, product: SelectedProduct | null): Picks {
  if (product && !product.categorySlug) return picks;
  const known = new Set(rooms.map((r) => r.id));
  const byRoom = new Map<string, FinishEntry[]>();
  for (const roomId of roomIds) if (known.has(roomId)) byRoom.set(roomId, product ? [[selectionKey(product.categorySlug!, roomId), shaped(product, roomId, surface)]] : []);
  return withRoomFinishQuantities(replaceSurface(picks, surface, byRoom), rooms);
}

/**
 * A room's floor with its first product (`slot` 0) or its second (1) set to `product`, or
 * taken off with null — at most two products on a floor. A second product joining starts at
 * half the floor; changing either product keeps the split; the second is what is left when the
 * first is taken off; the same product in both is that product over the whole floor.
 */
export function withFloorProduct(picks: Picks, rooms: Room[], roomId: string, slot: 0 | 1, product: SelectedProduct | null): Picks {
  const room = rooms.find((r) => r.id === roomId);
  if (!room || (product && !product.categorySlug)) return picks;
  const [first, second] = roomFinishesOf(picks, room).floor.map(([, pick]) => pick);
  // The split stays when either product changes; a second product joining starts at half.
  const share = first && second ? (first.share ?? 0.5) : 0.5;
  let a: SelectedProduct | null = first ?? null;
  let b: SelectedProduct | null = second ?? null;
  if (slot === 0) a = product;
  else b = product;
  if (a && b && a.productId === b.productId) {
    if (slot === 0) b = null;
    else a = null;
  }
  if (!a) [a, b] = [b, null];
  const entries: FinishEntry[] = [];
  if (a && b) {
    entries.push([selectionKey(a.categorySlug!, roomId), shaped(a, roomId, 'floor', share)], [selectionKey(b.categorySlug!, roomId, SECOND_FLOOR), shaped(b, roomId, 'floor', round2(1 - share))]);
  } else if (a) entries.push([selectionKey(a.categorySlug!, roomId), shaped(a, roomId, 'floor')]);
  return withRoomFinishQuantities(replaceSurface(picks, 'floor', new Map([[roomId, entries]])), rooms);
}

/** How a floor laid in two products is split: the first product's share of it, 0–1, the second taking the rest. */
export function withFloorShare(picks: Picks, rooms: Room[], roomId: string, share: number): Picks {
  const room = rooms.find((r) => r.id === roomId);
  const floor = room ? roomFinishesOf(picks, room).floor : [];
  if (floor.length !== 2 || !Number.isFinite(share)) return picks;
  const first = round2(clamp01(share));
  const [[firstKey, a], [secondKey, b]] = floor;
  const entries: FinishEntry[] = [
    [firstKey, shaped(a, roomId, 'floor', first)],
    [secondKey, shaped(b, roomId, 'floor', round2(1 - first))],
  ];
  return withRoomFinishQuantities(replaceSurface(picks, 'floor', new Map([[roomId, entries]])), rooms);
}

/**
 * One of a room's walls (`wallIndex`, `roomWalls`) in `product`, or with nothing on it when
 * null. The room's walls are then chosen one by one: walls the room's product was on keep it.
 */
export function withWallProduct(picks: Picks, rooms: Room[], roomId: string, wallIndex: number, product: SelectedProduct | null): Picks {
  const room = rooms.find((r) => r.id === roomId);
  if (!room || (product && !product.categorySlug)) return picks;
  const owners = wallOwners(room, roomFinishEntries(picks, roomId, 'wall'));
  if (!Number.isInteger(wallIndex) || wallIndex < 0 || wallIndex >= owners.length) return picks;
  owners[wallIndex] = product;
  return withRoomFinishQuantities(replaceSurface(picks, 'wall', new Map([[roomId, byWallEntries(roomId, owners)]])), rooms);
}

/**
 * A room's walls chosen one by one (`true`) — each wall keeps what it is in — or as one product
 * for the whole room (`false`): the product that covers the most of them, the first wall's on a
 * tie. Nothing chosen, nothing changes.
 */
export function withWallsOneByOne(picks: Picks, rooms: Room[], roomId: string, oneByOne: boolean): Picks {
  const room = rooms.find((r) => r.id === roomId);
  const entries = room ? roomFinishEntries(picks, roomId, 'wall') : [];
  if (!room || entries.length === 0) return picks;
  const owners = wallOwners(room, entries);
  if (oneByOne) return withRoomFinishQuantities(replaceSurface(picks, 'wall', new Map([[roomId, byWallEntries(roomId, owners)]])), rooms);
  const areas = roomWallAreasM2(room);
  const cover = new Map<number, { pick: SelectedProduct; area: number }>();
  owners.forEach((pick, i) => {
    if (!pick) return;
    const covered = cover.get(pick.productId) ?? { pick, area: 0 };
    covered.area += areas[i] ?? 0;
    cover.set(pick.productId, covered);
  });
  const main = [...cover.values()].sort((a, b) => b.area - a.area)[0];
  return withRoomFinish(picks, rooms, [roomId], 'wall', main?.pick ?? null);
}

/**
 * The "same in the rooms like it" shortcut: a room's floor — both products and their split when
 * two share it — or its walls product, into each of `toRoomIds`, whatever they had for that
 * surface. Walls chosen one by one are that room's own and are not copied.
 */
export function withSameFinish(picks: Picks, rooms: Room[], fromRoomId: string, toRoomIds: string[], surface: FinishSurface): Picks {
  const from = rooms.find((r) => r.id === fromRoomId);
  if (!from) return picks;
  const finishes = roomFinishesOf(picks, from);
  const source: FinishEntry[] = surface === 'floor' ? finishes.floor : finishes.walls ? [finishes.walls] : [];
  if (source.length === 0) return picks;
  const known = new Set(rooms.map((r) => r.id));
  const byRoom = new Map<string, FinishEntry[]>();
  for (const roomId of toRoomIds) {
    if (roomId === fromRoomId || !known.has(roomId)) continue;
    byRoom.set(
      roomId,
      source.map(([key, pick]) => [selectionKey(pick.categorySlug ?? '', roomId, partFromKey(key)), shaped(pick, roomId, surface, pick.share)])
    );
  }
  return byRoom.size === 0 ? picks : withRoomFinishQuantities(replaceSurface(picks, surface, byRoom), rooms);
}

// ---------------------------------------------------------------------------
// On the board and in 3D
// ---------------------------------------------------------------------------

/** A product a room's surface is laid in from the calculator, with the part of the surface it was chosen for. */
export interface LaidFinish {
  product: CatalogProduct;
  share?: number;
  walls?: number[];
}

/** A finish priced by the area it covers rather than by its room's whole surface. */
function coveringArea(finish: SurfaceFinish, areaM2: number): SurfaceFinish {
  if (!finish.product) return finish;
  return { ...finish, product: { ...finish.product, qty: areaM2, totalPrice: round2(finish.product.pricePerUnit * areaM2) } };
}

/**
 * The finishes a room's surface is laid in from the calculator's picks of it: the walls in
 * their product, or wall by wall; the floor in its product — two sharing it as two floor
 * finishes, each with its `share` and bought for that part, the larger first: the picks say how
 * much of the floor each covers, not where, so the board and 3D draw the larger over the floor.
 */
export function calculatorSurfaceFinishes(room: PlanRoom, surface: FinishSurface, laid: LaidFinish[], origin: ItemOrigin = 'calculator'): SurfaceFinish[] {
  if (laid.length === 0) return [];
  if (surface === 'wall') {
    const byWall = laid.filter((l) => l.walls);
    if (byWall.length === 0) return [finishFromProduct(room, 'wall', laid[0].product, origin)];
    return byWall.flatMap((l) => l.walls!.filter((i) => i >= 0 && i < room.polygon.length).map((wallIndex) => coveringArea({ ...finishFromProduct(room, 'wall', l.product, origin), wallIndex }, wallEdgeAreaM2(room, wallIndex))));
  }
  const floors = [...laid].sort((a, b) => (b.share ?? 1) - (a.share ?? 1));
  if (floors.length > 1 && floors.every((l) => l.share != null)) {
    return floors.map((l) => coveringArea({ ...finishFromProduct(room, 'floor', l.product, origin), share: l.share }, round2(room.areaM2 * Math.min(1, Math.max(0, l.share ?? 0)))));
  }
  return [finishFromProduct(room, 'floor', floors[0].product, origin)];
}

/**
 * The drawing board as the rooms' picks finish it: each room's floor and walls in its chosen
 * products (`calculatorSurfaceFinishes`), and nothing where nothing was chosen (the board's
 * paper). What the summary's PDF draws and what is saved as the board's finishes.
 */
export function boardFinishesFromPicks(plan: FloorPlan | null, picks: Picks): SurfaceFinish[] {
  if (!plan) return [];
  const finishes: SurfaceFinish[] = [];
  for (const room of plan.rooms) {
    for (const surface of ['floor', 'wall'] as const) {
      const laid = roomFinishEntries(picks, room.id, surface).map(([, pick]) => ({ product: catalogProductFromPick(pick), share: pick.share, walls: pick.walls }));
      finishes.push(...calculatorSurfaceFinishes(room, surface, laid));
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
    model3dKind: pick.model3dKind ?? null,
    model3dUrl: pick.model3dUrl ?? null,
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
