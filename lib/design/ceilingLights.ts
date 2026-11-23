/**
 * The ceiling's lighting laid out as one (Nini, 23 Nov 2026, decision 10b): a pendant hangs centred
 * over what it lights — the dining table, the kitchen island, the coffee table, the bed's middle —
 * as one large lamp, or as two or three small ones in a line down a long table or island; and the
 * spots round it are moved clear of it, laid again symmetrically round it, never dropped for it.
 *
 * What hangs where is decided here, once, for the layout (`hangPendantSlots`: the program's one
 * pendant over its surface), the matcher (`pendantSizing`: a large lamp or small ones, by the surface
 * under the slot) and generation (`hangPendants`: the lamps as matched, counted and spaced over the
 * surface as it stands); the wiring moves its spots off them (`relayRow`, `shiftRow`, `ringAround`,
 * `scaleRing` in `lib/design/electrical`). Pure and isomorphic.
 */

import { pointInPolygon, polygonBounds, polygonCentroid } from './planGeometry';
import {
  MATCHED_ABOVE_GAP_M,
  PENDANT_BOTTOM_M,
  PENDANT_LARGE_M,
  PENDANT_PAIR_FROM_M,
  PENDANT_ROUND_RATIO,
  PENDANT_SMALL_M,
  PENDANT_TRIO_FROM_M,
  SPOT_MIN_SPACING_M,
  SPOT_PENDANT_GAP_M,
  SPOT_WALL_GAP_M,
} from './rules';
import { partAt, partOfId, studioParts } from './studio';
import type { PlacedItem, PlanRoom, SlotKind, Vec2 } from './types';

type RoomType = PlanRoom['type'];

/** What a pendant lights, by the type of the room (or the studio's half) it hangs in, in order: the first of these the room has. */
const LIT_BY_PENDANT: Partial<Record<RoomType, readonly SlotKind[]>> = {
  kitchen: ['dining_table', 'kitchen_island'],
  living_room: ['dining_table', 'coffee_table'],
  bedroom: ['bed'],
};

/** The surfaces a pendant is the table's own light over, a layer of its own beside the room's main light (the owner's three layers). */
export const TABLE_SURFACES: ReadonlySet<SlotKind> = new Set<SlotKind>(['dining_table', 'kitchen_island']);

/** The studio's half a piece is in — the half that laid it (its id), else the one it stands in — or null for any other room. */
function halfOf(room: PlanRoom, item: Pick<PlacedItem, 'id' | 'position'>): 0 | 1 | null {
  if (!studioParts(room)) return null;
  return partOfId(room.id, item.id) ?? partAt(room, item.position);
}

/** The type of room a piece is furnished as: its room's, or its studio half's. */
export function areaTypeOf(room: PlanRoom, item: Pick<PlacedItem, 'id' | 'position'>): RoomType {
  const parts = studioParts(room);
  return parts ? parts[halfOf(room, item) ?? 0].type : room.type;
}

/** The floor of the room, or of the studio's half, a piece is in: where a pendant with nothing under it hangs in the middle of. */
export function areaPolygonOf(room: PlanRoom, item: Pick<PlacedItem, 'id' | 'position'>): Vec2[] {
  const parts = studioParts(room);
  return parts ? parts[halfOf(room, item) ?? 0].polygon : room.polygon;
}

/**
 * What a pendant lights: of the pieces standing in its room (in its studio half), the first kind its
 * room takes a pendant over (`LIT_BY_PENDANT`) — the nearest of them where there are several. Null
 * where the room has none (an office, a hall, a kitchen with no table): the pendant hangs in the
 * middle of the room.
 */
export function pendantSurface(room: PlanRoom, items: readonly PlacedItem[], pendant: Pick<PlacedItem, 'id' | 'position'>): PlacedItem | null {
  const kinds = LIT_BY_PENDANT[areaTypeOf(room, pendant)];
  if (!kinds) return null;
  const half = halfOf(room, pendant);
  const here = items.filter((i) => i.roomId === room.id && (half == null || halfOf(room, i) === half));
  for (const kind of kinds) {
    const found = here.filter((i) => i.slot === kind);
    if (found.length === 0) continue;
    const nearest = found.sort((a, b) => distance(a.position, pendant.position) - distance(b.position, pendant.position))[0];
    // No lamp over a bed taller than a lamp may come down to (a four-poster): the middle of the room.
    if (kind === 'bed' && nearest.elevationM + nearest.size.height + MATCHED_ABOVE_GAP_M > PENDANT_BOTTOM_M + 1e-6) return null;
    return nearest;
  }
  return null;
}

/** Where the layout hangs a pendant: over the middle of what it lights, else in the middle of its room (its studio half). */
export function pendantSpot(room: PlanRoom, items: readonly PlacedItem[], pendant: Pick<PlacedItem, 'id' | 'position'>): Vec2 {
  const surface = pendantSurface(room, items, pendant);
  return surface ? { ...surface.position } : polygonCentroid(areaPolygonOf(room, pendant));
}

/**
 * Where a pendant hangs once what stands under it is bought: over the middle of what it lights; over
 * nothing, where it was hung — unless that is over a bed it may not hang over (the four-poster the
 * bed's slot became), then in the middle of the room.
 */
export function pendantRehung(room: PlanRoom, items: readonly PlacedItem[], pendant: Pick<PlacedItem, 'id' | 'position'>): Vec2 {
  const surface = pendantSurface(room, items, pendant);
  if (surface) return { ...surface.position };
  const overBed = items.some((i) => i.roomId === room.id && i.slot === 'bed' && within(pendant.position, i));
  return overBed ? polygonCentroid(areaPolygonOf(room, pendant)) : { ...pendant.position };
}

/** Whether a point on the plan is over a piece's footprint. */
function within(point: Vec2, piece: Pick<PlacedItem, 'position' | 'rotation' | 'size'>): boolean {
  const dx = point.x - piece.position.x;
  const dz = point.z - piece.position.z;
  const across = dx * Math.cos(piece.rotation) - dz * Math.sin(piece.rotation);
  const along = dx * Math.sin(piece.rotation) + dz * Math.cos(piece.rotation);
  return Math.abs(across) <= piece.size.width / 2 + 1e-6 && Math.abs(along) <= piece.size.depth / 2 + 1e-6;
}

/** A surface's length: its longer side. */
export function surfaceLength(surface: Pick<PlacedItem, 'size'>): number {
  return Math.max(surface.size.width, surface.size.depth);
}

/**
 * How many pendants hang over a surface: two small ones over a dining table or an island from
 * `PENDANT_PAIR_FROM_M` long, three from `PENDANT_TRIO_FROM_M`; one (a large one) over anything
 * shorter, over a coffee table or a bed, and where there is no surface.
 */
export function pendantCount(surface: Pick<PlacedItem, 'slot' | 'size'> | null): 1 | 2 | 3 {
  if (!surface || !TABLE_SURFACES.has(surface.slot)) return 1;
  const length = surfaceLength(surface);
  if (length >= PENDANT_TRIO_FROM_M - 1e-6) return 3;
  if (length >= PENDANT_PAIR_FROM_M - 1e-6) return 2;
  return 1;
}

/** A pendant's size class by its shade, metres across: a large round one, a small round one, or neither (a linear chandelier, a cluster, a lamp a few centimetres across). */
export function pendantClass(size: { width: number; depth: number }): 'large' | 'small' | null {
  const across = Math.max(size.width, size.depth);
  const narrow = Math.min(size.width, size.depth);
  if (narrow <= 0 || across / narrow > PENDANT_ROUND_RATIO) return null;
  if (across >= PENDANT_LARGE_M.min - 1e-6 && across <= PENDANT_LARGE_M.max + 1e-6) return 'large';
  if (across >= PENDANT_SMALL_M.min - 1e-6 && across <= PENDANT_SMALL_M.max + 1e-6) return 'small';
  return null;
}

/** A catalogue product's size class (`pendantClass`), from its centimetres. */
export function productPendantClass(product: { widthCm?: number | null; depthCm?: number | null }): 'large' | 'small' | null {
  return pendantClass({ width: (product.widthCm ?? 0) / 100, depth: (product.depthCm ?? 0) / 100 });
}

/**
 * The products a pendant's slot prefers (Nini: one pendant is a large one, several are small): the
 * large ones where one pendant hangs over the surface under the slot (or none), the small ones where
 * two or three will. Empty where the offer has none of the class: the slot takes what it would have.
 */
export function pendantSizing<P extends { widthCm?: number | null; depthCm?: number | null }>(candidates: readonly P[], room: PlanRoom | undefined, slot: Pick<PlacedItem, 'id' | 'position'>, around: readonly PlacedItem[]): P[] {
  const wanted = room && pendantCount(pendantSurface(room, around, slot)) > 1 ? 'small' : 'large';
  return candidates.filter((p) => productPendantClass(p) === wanted);
}

/** The surface's long axis as a direction on the floor, and the rotation that turns a piece's width along it. */
function longAxis(surface: Pick<PlacedItem, 'rotation' | 'size'>): { dir: Vec2; rotation: number } {
  // A piece's width runs along its right: (cos r, −sin r) for a piece facing (sin r, cos r).
  const rotation = surface.size.width >= surface.size.depth ? surface.rotation : surface.rotation + Math.PI / 2;
  return { dir: { x: Math.cos(rotation), z: -Math.sin(rotation) }, rotation };
}

/** Where `count` pendants hang over a surface: in a line down its length, evenly — each end one half a gap in from the end. */
export function pendantPositions(surface: Pick<PlacedItem, 'position' | 'rotation' | 'size'>, count: number): Vec2[] {
  const { dir } = longAxis(surface);
  const length = surfaceLength(surface);
  return Array.from({ length: count }, (_, i) => {
    const off = ((i + 0.5) / count - 0.5) * length;
    return { x: surface.position.x + dir.x * off, z: surface.position.z + dir.z * off };
  });
}

/** Whether a lamp hung at this height clears what stands under it by the gap a hung piece keeps (a canopy bed it would hang into). */
export function clearsSurface(pendant: Pick<PlacedItem, 'elevationM'>, surface: Pick<PlacedItem, 'elevationM' | 'size'>): boolean {
  return pendant.elevationM >= surface.elevationM + surface.size.height + MATCHED_ABOVE_GAP_M - 1e-6;
}

/** A clone's id: the first pendant's, with its place in the line (`-g2`, `-g3`) — so a studio's half is still read off it (`partOfId`). */
const cloneId = (id: string, k: number) => `${id}-g${k + 1}`;
const CLONE = /-g\d+$/;

/** Whether a lamp is one hung beside the first of its line (`-g2`, `-g3`), not a slot of its own. */
export function isLampClone(id: string): boolean {
  return CLONE.test(id);
}

/** The line a lamp hangs in: its first lamp's id. */
export function lampLine(id: string): string {
  return id.replace(CLONE, '');
}

/**
 * The layout's pendant over what it lights: each pendant of the room (a studio's half is laid as a
 * room of its own) moved to the middle of its surface (`pendantSurface`), the rest as they were.
 * Pieces laid after it in the program (a living room's dining table) are in `placed` by now. With
 * nothing to light, the middle of the room (`pendantSpot`).
 */
export function hangPendantSlots(room: PlanRoom, placed: PlacedItem[]): PlacedItem[] {
  if (!placed.some((i) => i.slot === 'pendant')) return placed;
  return placed.map((item) => (item.slot === 'pendant' ? { ...item, position: pendantSpot(room, placed, item) } : item));
}

/**
 * The flat's pendants as matched, over what they light (Nini, decision 10b). In each room (each
 * studio half) the pendants are one group, the product of the first: hung centred over its surface
 * (`pendantSurface`) — two or three of the same small lamp in a line down a long dining table or
 * island (`pendantCount`, `pendantPositions`), one where the lamp is not a small one or the surface
 * is short (a large lamp, the matcher's preference: `pendantSizing`) — turned along the surface's
 * length. A lamp over a bed it would hang into hangs in the middle of the room instead; a lamp with
 * nothing to light hangs alone where it hung (`pendantRehung`). Run again on its own result it
 * changes nothing.
 */
export function hangPendants(items: PlacedItem[], rooms: readonly PlanRoom[]): PlacedItem[] {
  if (!items.some((i) => i.slot === 'pendant')) return items;
  const byRoom = new Map(rooms.map((r) => [r.id, r]));
  const groups = new Map<string, PlacedItem[]>();
  for (const item of items) {
    if (item.slot !== 'pendant') continue;
    const room = byRoom.get(item.roomId);
    const key = `${item.roomId}|${room ? (halfOf(room, item) ?? '') : ''}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const replaced = new Map<string, PlacedItem[]>();
  for (const group of groups.values()) {
    const first = group.find((p) => !CLONE.test(p.id)) ?? group[0];
    const room = byRoom.get(first.roomId);
    const surface = room ? pendantSurface(room, items, first) : null;
    let hung: PlacedItem[];
    if (!room) {
      hung = [first];
    } else if (!surface) {
      hung = [{ ...first, position: pendantRehung(room, items, first) }];
    } else if (surface.slot === 'bed' && !clearsSurface(first, surface)) {
      hung = [{ ...first, position: polygonCentroid(areaPolygonOf(room, first)) }];
    } else {
      const wanted = pendantCount(surface);
      const count = wanted > 1 && pendantClass(first.size) === 'small' ? wanted : 1;
      const { rotation } = longAxis(surface);
      hung = pendantPositions(surface, count).map((position, k) => ({ ...first, id: k === 0 ? first.id : cloneId(first.id, k), position, rotation }));
    }
    replaced.set(group[0].id, hung);
    for (const other of group.slice(1)) replaced.set(other.id, []);
  }
  return items.flatMap((item) => replaced.get(item.id) ?? [item]);
}

// ---------------------------------------------------------------------------
// Spots round the pendants
// ---------------------------------------------------------------------------

/** A pendant's shade on the plan: where it hangs and how far it reaches. */
export interface Shade {
  position: Vec2;
  radius: number;
}

/** The least a shade is counted across: a bare bulb or a lamp filed a few centimetres wide still glares at a spot beside it. */
const LEAST_SHADE_M = 0.2;

/** The shades of the pendants hanging in a room. */
export function shadesIn(roomId: string, items: readonly PlacedItem[]): Shade[] {
  return items.filter((i) => i.roomId === roomId && i.slot === 'pendant').map((i) => ({ position: i.position, radius: Math.max(LEAST_SHADE_M, i.size.width, i.size.depth) / 2 }));
}

/** Whether a spot shines into a shade: nearer its edge than `SPOT_PENDANT_GAP_M`. */
export function underShade(spot: Vec2, shades: readonly Shade[]): boolean {
  return shades.some((s) => distance(spot, s.position) < s.radius + SPOT_PENDANT_GAP_M - 1e-6);
}

/** Every spot inside the room and `SPOT_WALL_GAP_M` off its bounds' walls. */
function allInside(spots: readonly Vec2[], polygon: Vec2[]): boolean {
  const b = polygonBounds(polygon);
  return spots.every((p) => pointInPolygon(p, polygon) && p.x - b.minX >= SPOT_WALL_GAP_M - 1e-6 && b.maxX - p.x >= SPOT_WALL_GAP_M - 1e-6 && p.z - b.minZ >= SPOT_WALL_GAP_M - 1e-6 && b.maxZ - p.z >= SPOT_WALL_GAP_M - 1e-6);
}

/**
 * A row of spots (a kitchen's over its working floor) laid again round the pendants it runs under:
 * the stretch of the row the shades take out (each shade's reach plus `SPOT_PENDANT_GAP_M`, where it
 * crosses the row's line), and the spots evenly either side of it, mirrored about its middle — half
 * the row's spots each side, rounded up (an odd row gains one rather than lose one under a lamp),
 * fewer only where a side has no `SPOT_MIN_SPACING_M` for each (the wiring then moves the row whole
 * instead where it can, `shiftRow`), never none. Within the row's own length (its end spots' half a
 * gap past them). The row as it was where no spot is under a shade; null where either side has no
 * room for a spot, or one would fall outside the room.
 */
export function relayRow(spots: readonly Vec2[], shades: readonly Shade[], polygon: Vec2[]): Vec2[] | null {
  if (!spots.some((s) => underShade(s, shades))) return [...spots];
  if (spots.length < 2) return null;
  const first = spots[0];
  const last = spots[spots.length - 1];
  const length = distance(first, last);
  if (length < 1e-6) return null;
  const dir = { x: (last.x - first.x) / length, z: (last.z - first.z) / length };
  const along = (p: Vec2) => (p.x - first.x) * dir.x + (p.z - first.z) * dir.z;
  const across = (p: Vec2) => Math.abs((p.x - first.x) * dir.z - (p.z - first.z) * dir.x);
  let lo = Infinity;
  let hi = -Infinity;
  for (const shade of shades) {
    const reach = shade.radius + SPOT_PENDANT_GAP_M;
    const off = across(shade.position);
    if (off >= reach) continue;
    const half = Math.sqrt(reach * reach - off * off);
    lo = Math.min(lo, along(shade.position) - half);
    hi = Math.max(hi, along(shade.position) + half);
  }
  if (!Number.isFinite(lo)) return [...spots];
  const end = length / (spots.length - 1) / 2;
  const middle = (lo + hi) / 2;
  const reach = (hi - lo) / 2;
  // The row runs from half a gap before its first spot (−end) to half a gap past its last.
  const side = Math.min(middle - reach + end, length + end - (middle + reach));
  let perSide = Math.ceil(spots.length / 2);
  if (side / perSide < SPOT_MIN_SPACING_M) perSide = Math.floor(side / SPOT_MIN_SPACING_M);
  if (perSide < 1) return null;
  const at = (s: number): Vec2 => ({ x: first.x + dir.x * s, z: first.z + dir.z * s });
  const out: Vec2[] = [];
  for (let j = perSide - 1; j >= 0; j--) out.push(at(middle - reach - ((j + 0.5) * side) / perSide));
  for (let j = 0; j < perSide; j++) out.push(at(middle + reach + ((j + 0.5) * side) / perSide));
  return pointsInside(out, polygon) && !out.some((s) => underShade(s, shades)) ? out : null;
}

/** Every point inside the outline (the row was laid there: no wall margin is asked of it). */
function pointsInside(points: readonly Vec2[], polygon: Vec2[]): boolean {
  return points.every((p) => pointInPolygon(p, polygon));
}

/**
 * A row moved square to itself, whole, just clear of the shades — a track is one rail, and a row
 * that would lose spots laid again either side of the lamps keeps them so: the least move that
 * leaves every spot clear and inside the room, `prefer`'s way first at each distance (a kitchen's
 * row away from its worktop). The row as it was where no spot is under a shade; null where no move
 * up to `maxM` does.
 */
export function shiftRow(spots: readonly Vec2[], shades: readonly Shade[], polygon: Vec2[], maxM = 1.5, prefer?: Vec2): Vec2[] | null {
  if (!spots.some((s) => underShade(s, shades))) return [...spots];
  const first = spots[0];
  const last = spots[spots.length - 1];
  const length = distance(first, last);
  const normal = length > 1e-6 ? { x: -(last.z - first.z) / length, z: (last.x - first.x) / length } : { x: 0, z: 1 };
  const ways = prefer && normal.x * prefer.x + normal.z * prefer.z < 0 ? [-1, 1] : [1, -1];
  for (let step = 0.05; step <= maxM + 1e-6; step += 0.05) {
    for (const sign of ways) {
      const moved = spots.map((p) => ({ x: p.x + normal.x * step * sign, z: p.z + normal.z * step * sign }));
      if (!moved.some((s) => underShade(s, shades)) && pointsInside(moved, polygon)) return moved;
    }
  }
  return null;
}

/**
 * A ring of spots (the four round a room's one large light) laid round a new middle: at the room's
 * quarters from it, as `ringSpots` lays them round the room's own, drawn in where the nearer wall
 * is closer than that (`SPOT_WALL_GAP_M` off it) so the ring stays symmetric about the lamp. Null
 * where it would leave a spot outside the room or under a shade.
 */
export function ringAround(polygon: Vec2[], middle: Vec2, shades: readonly Shade[] = []): Vec2[] | null {
  const b = polygonBounds(polygon);
  const ax = Math.min(b.width / 4, middle.x - b.minX - SPOT_WALL_GAP_M, b.maxX - middle.x - SPOT_WALL_GAP_M);
  const az = Math.min(b.depth / 4, middle.z - b.minZ - SPOT_WALL_GAP_M, b.maxZ - middle.z - SPOT_WALL_GAP_M);
  if (ax < SPOT_MIN_SPACING_M / 2 || az < SPOT_MIN_SPACING_M / 2) return null;
  const ring = [
    { x: middle.x - ax, z: middle.z - az },
    { x: middle.x + ax, z: middle.z - az },
    { x: middle.x + ax, z: middle.z + az },
    { x: middle.x - ax, z: middle.z + az },
  ];
  return pointsInside(ring, polygon) && !ring.some((s) => underShade(s, shades)) ? ring : null;
}

/**
 * A ring of spots kept symmetric and moved clear of the shades: drawn out or in about its middle,
 * the least change first, so long as every spot stays in the room and off its walls. The ring as it
 * was where no spot is under a shade; null where no scale does.
 */
export function scaleRing(spots: readonly Vec2[], middle: Vec2, shades: readonly Shade[], polygon: Vec2[]): Vec2[] | null {
  if (!spots.some((s) => underShade(s, shades))) return [...spots];
  for (const scale of [1.15, 0.85, 1.3, 0.7, 1.45, 0.55, 1.6]) {
    const ring = spots.map((p) => ({ x: middle.x + (p.x - middle.x) * scale, z: middle.z + (p.z - middle.z) * scale }));
    if (!ring.some((s) => underShade(s, shades)) && allInside(ring, polygon)) return ring;
  }
  return null;
}

/** One spot pushed straight away from the shade it is under, just clear of it, where that is inside the room; else where it was. */
export function pushClear(spot: Vec2, shades: readonly Shade[], polygon: Vec2[]): Vec2 {
  let at = spot;
  for (const shade of shades) {
    const d = distance(at, shade.position);
    const reach = shade.radius + SPOT_PENDANT_GAP_M;
    if (d >= reach) continue;
    const dir = d > 1e-6 ? { x: (at.x - shade.position.x) / d, z: (at.z - shade.position.z) / d } : { x: 1, z: 0 };
    const moved = { x: shade.position.x + dir.x * (reach + 0.01), z: shade.position.z + dir.z * (reach + 0.01) };
    if (pointInPolygon(moved, polygon)) at = moved;
  }
  return at;
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
