/**
 * Room separators (ოთახის გამყოფი), and the partial walls the app draws them on from.
 *
 * A room separator is a line drawn with the wall tool, and edited like a wall, that divides an
 * open space into rooms without being a wall (`Wall.separator`) — an architect's room
 * separation line. It bounds rooms in the wall graph like any wall, so each side of it is a
 * room of its own, with its own type, name, floor and walls; but nothing stands along it: the
 * edges it gives a room are open (`PlanRoom.open`) — no wall area, finish, skirting, door or
 * socket goes on them — and it is never built, priced or drawn in 3D.
 *
 * A partial wall — one that runs into a room from its side and stops short, the stub of a
 * partition that leaves the way through open — closes no room of its own (the wall graph prunes
 * it as a dead end), so the room it stands in stays one room. In a living room or a kitchen that
 * is two places, so the app draws a separator on from the wall's free end straight across to
 * the far side (`withPartialWallSeparators`): the room becomes two, the new one a kitchen beside
 * the living room (`withSplitRoomTypes`). The app's own separators are `origin: 'generated'` and
 * follow their wall — drawn again from wherever its free end is, gone when the wall goes or
 * closes into a full partition; one the person drags becomes theirs. Deleting a separator keeps
 * the room it divided whole (`PlanRoom.keepWhole`) for as long as the partial wall stands, and
 * the room's card offers to divide it along the wall again (`divideAlongPartialWall`).
 *
 * Pure; tested in `tests/unit/design/separators.test.ts`.
 */

import type { RoomType } from '@/lib/calculator/types';
import { pointInPolygon, roomEdges } from './planGeometry';
import { nextRoomName } from './roomNames';
import { clampT, dividerSegments, tAtCoordinate } from './studio';
import { addWalls, closestOnSegment, NODE_TOL_M, orphanWallSegments, rebuildRooms, splitAtJunctions, wallsBoundingRoom } from './walls';
import type { FloorPlan, PlanRoom, Vec2, Wall } from './types';

/** A partial wall shorter than this is a pilaster or a return, not a division. */
export const MIN_PARTIAL_WALL_M = 0.5;

/** The rooms a partial wall divides without being asked: the open-plan ones. */
export const DIVIDED_BY_PARTIAL_WALL: readonly RoomType[] = ['living_room', 'kitchen', 'studio'];

/** One of the app's own separators, drawn on from a partial wall. */
export const isAppSeparator = (wall: Wall): boolean => !!wall.separator && wall.origin === 'generated';

/** A partial wall standing in a room. */
export interface PartialWall {
  wall: Wall;
  /** The piece of it inside the room: `attached` against the room's side, `free` its open end. */
  attached: Vec2;
  free: Vec2;
  lengthM: number;
  /** Where its line, carried on from the free end, reaches the far side of the room. */
  far: Vec2;
}

type Piece = { wall: Wall; a: Vec2; b: Vec2 };

function distanceToOutline(p: Vec2, polygon: Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < polygon.length; i++) best = Math.min(best, closestOnSegment(p, polygon[i], polygon[(i + 1) % polygon.length]).distance);
  return best;
}

/**
 * The partial wall standing in a room — the longest, when there are several — or null. It must
 * run square to the plan, be at least `MIN_PARTIAL_WALL_M` long, stand against the room's side
 * at one end and stop short in the room at the other, and the line it runs on must cross the
 * room once, on past its free end, leaving neither side too small to be a room.
 */
export function partialWallIn(plan: FloorPlan, room: PlanRoom, pieces: Piece[] = orphanWallSegments(plan)): PartialWall | null {
  let best: PartialWall | null = null;
  for (const { wall, a, b } of pieces) {
    if (wall.separator) continue;
    const lengthM = Math.hypot(b.x - a.x, b.z - a.z);
    if (lengthM < MIN_PARTIAL_WALL_M) continue;
    const alongX = Math.abs(b.z - a.z) <= 0.01;
    const alongZ = Math.abs(b.x - a.x) <= 0.01;
    if (alongX === alongZ) continue;
    if (!pointInPolygon({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }, room.polygon)) continue;
    // Against the room's side at one end (its face is half a thickness from the centreline), open at the other.
    const reach = wall.thicknessM / 2 + 0.05;
    const touchA = distanceToOutline(a, room.polygon) <= reach;
    const touchB = distanceToOutline(b, room.polygon) <= reach;
    if (touchA === touchB) continue;
    const [attached, free] = touchA ? [a, b] : [b, a];
    const far = farSide(room, alongX ? 'z' : 'x', alongX ? (a.z + b.z) / 2 : (a.x + b.x) / 2, attached, free);
    if (!far) continue;
    if (!best || lengthM > best.lengthM) best = { wall, attached, free, lengthM, far };
  }
  return best;
}

/**
 * Where the line a partial wall runs on — `axis` `z` for a wall running along x — reaches the
 * room's far side past the free end; null when it does not cross the room once, or leaves one
 * side too small (the same rule as a studio's parts, `clampT`).
 */
function farSide(room: PlanRoom, axis: 'x' | 'z', coordinate: number, attached: Vec2, free: Vec2): Vec2 | null {
  const t = tAtCoordinate(room, axis, coordinate);
  if (!(t > 0 && t < 1)) return null;
  if (Math.abs(clampT(room, axis, t) - t) > 1e-3) return null;
  const segments = dividerSegments({ type: 'studio', polygon: room.polygon, split: { axis, t, parts: ['kitchen', 'living_room'] } });
  if (segments.length !== 1) return null;
  const along = (p: Vec2) => (axis === 'z' ? p.x : p.z);
  const [from, to] = segments[0];
  const lo = Math.min(along(from), along(to));
  const hi = Math.max(along(from), along(to));
  if (!(along(free) > lo + 0.05 && along(free) < hi - 0.05)) return null;
  // The end of the crossing on the free end's side.
  const onward = along(free) > along(attached);
  const end = onward ? hi : lo;
  return axis === 'z' ? { x: end, z: coordinate } : { x: coordinate, z: end };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * The separator a partial wall carries on into: from its free end straight across to the far
 * side, run on to the centreline of the wall there so the two meet at a junction.
 */
function separatorFor(plan: FloorPlan, room: PlanRoom, partial: PartialWall, origin: Wall['origin']): Wall {
  const dx = partial.free.x - partial.attached.x;
  const dz = partial.free.z - partial.attached.z;
  const l = Math.hypot(dx, dz) || 1;
  const dir = { x: dx / l, z: dz / l };
  const edge = roomEdges(room.polygon).reduce((best, e) => (closestOnSegment(partial.far, e.a, e.b).distance < closestOnSegment(partial.far, best.a, best.b).distance ? e : best));
  const behind = plan.walls?.find((w) => w.id === room.wallIds?.[edge.index]);
  const across = Math.max(0.2, Math.abs(dir.x * -edge.inward.x + dir.z * -edge.inward.z));
  const run = (behind ? behind.thicknessM : plan.wallThicknessM) / 2 / across;
  return {
    id: `${partial.wall.id}-sep`,
    a: { x: round3(partial.free.x), z: round3(partial.free.z) },
    b: { x: round3(partial.far.x + dir.x * run), z: round3(partial.far.z + dir.z * run) },
    thicknessM: 0,
    origin,
    separator: true,
  };
}

const near = (p: Vec2, q: Vec2) => Math.hypot(p.x - q.x, p.z - q.z) <= NODE_TOL_M;

/**
 * Whether one of the app's separators still carries a partial wall on: it starts where one wall
 * — and only one — ends, the wall's free end. Moved with that end (a junction dragged takes every
 * wall end on it, the separator's too), it still does; once the wall is deleted, or a partition
 * carries on from that point, or the separator has shrunk to nothing, it does not.
 */
function carriesWallOn(walls: Wall[], separator: Wall): boolean {
  if (Math.hypot(separator.b.x - separator.a.x, separator.b.z - separator.a.z) < NODE_TOL_M * 2) return false;
  const touching = walls.filter((w) => !w.separator && closestOnSegment(separator.a, w.a, w.b).distance <= NODE_TOL_M);
  return touching.length === 1 && (near(touching[0].a, separator.a) || near(touching[0].b, separator.a));
}

/** The same plan with `keepWhole` taken off these rooms. */
function releaseRooms(plan: FloorPlan, ids: Set<string>): FloorPlan {
  if (ids.size === 0) return plan;
  return {
    ...plan,
    rooms: plan.rooms.map((room) => {
      if (!ids.has(room.id) || !room.keepWhole) return room;
      const { keepWhole: _keepWhole, ...rest } = room;
      return rest;
    }),
  };
}

/**
 * The app's separators as the partial walls now stand. Each one drawn stays a line of the plan
 * like any other: moved with the end of the wall it starts from, whichever way that end goes
 * (a diagonal drag takes it along, as walls meeting at a junction are taken along). It is taken
 * away once it carries nothing on (`carriesWallOn`) — the wall deleted, a partition drawn on
 * from its end, the wall's end dragged onto the far side — and a partial wall standing in a
 * living room or a kitchen with nothing carrying it on gets one (not a room kept whole). A room
 * kept whole whose partial wall went is let go of. The same plan when nothing changes. Run
 * after every edit of the rooms (`reconcile`) and on a plan taken in (`setPlan`), not on a saved
 * plan opening — the calculator's rooms are read off its board only on its plan step.
 */
export function withPartialWallSeparators(plan: FloorPlan): FloorPlan {
  const walls = plan.walls ?? [];
  if (walls.length === 0 || plan.rooms.length === 0) return plan;
  const stale = new Set(walls.filter((w) => isAppSeparator(w) && !carriesWallOn(walls, w)).map((w) => w.id));
  const current = stale.size > 0 ? rebuildRooms(plan, walls.filter((w) => !stale.has(w.id))) : plan;
  const pieces = orphanWallSegments(current);
  const wanted: Wall[] = [];
  const release = new Set<string>();
  for (const room of current.rooms) {
    const partial = partialWallIn(current, room, pieces);
    if (room.keepWhole) {
      // Kept whole against a wall that is gone: nothing to keep it whole against any more.
      if (!partial) release.add(room.id);
      continue;
    }
    if (partial && DIVIDED_BY_PARTIAL_WALL.includes(room.type)) wanted.push(separatorFor(current, room, partial, 'generated'));
  }
  const next = wanted.length > 0 ? rebuildRooms(current, splitAtJunctions([...(current.walls ?? []), ...wanted])) : current;
  return releaseRooms(next, release);
}

/**
 * Rooms a separator has just cut off another take their type from it, the way an open plan
 * divides: off a living room (or a studio) a kitchen, off a kitchen a living room, off
 * anything else the same kind — and its height. A room is "cut off" when it is new in `plan`
 * and a room of `before` stands across one of its open edges. The same plan when none is.
 */
export function withSplitRoomTypes(before: PlanRoom[], plan: FloorPlan): FloorPlan {
  const old = new Map(before.map((r) => [r.id, r]));
  let changed = false;
  const rooms = plan.rooms.map((room) => {
    if (old.has(room.id) || !room.open?.length) return room;
    const parent = acrossOpenEdge(plan, room, (other) => old.get(other.id) ?? null);
    if (!parent) return room;
    const type: RoomType = parent.type === 'living_room' || parent.type === 'studio' ? 'kitchen' : parent.type === 'kitchen' ? 'living_room' : parent.type;
    changed = true;
    return { ...room, type, name: nextRoomName(plan.rooms, type, room.id), heightM: parent.heightM };
  });
  return changed ? { ...plan, rooms } : plan;
}

/** The first room across one of a room's open edges that `pick` accepts. */
function acrossOpenEdge(plan: FloorPlan, room: PlanRoom, pick: (other: PlanRoom) => PlanRoom | null): PlanRoom | null {
  for (const other of openNeighbours(plan, room.id)) {
    const picked = pick(other);
    if (picked) return picked;
  }
  return null;
}

/** The rooms a room opens onto across its room separators, each once, in the order of its edges. */
export function openNeighbours(plan: FloorPlan, roomId: string): PlanRoom[] {
  const room = plan.rooms.find((r) => r.id === roomId);
  if (!room?.open?.length) return [];
  const out: PlanRoom[] = [];
  for (const edge of roomEdges(room.polygon)) {
    if (!room.open.includes(edge.index)) continue;
    const mid = { x: (edge.a.x + edge.b.x) / 2 - edge.inward.x * 0.05, z: (edge.a.z + edge.b.z) / 2 - edge.inward.z * 0.05 };
    const other = plan.rooms.find((r) => r.id !== room.id && pointInPolygon(mid, r.polygon));
    if (other && !out.includes(other)) out.push(other);
  }
  return out;
}

/** The room a point lies in after the walls changed, told to stay whole when a partial wall stands in it. */
function keepWholeAt(plan: FloorPlan, point: Vec2): FloorPlan {
  const room = plan.rooms.find((r) => pointInPolygon(point, r.polygon));
  if (!room || room.keepWhole || !partialWallIn(plan, room)) return plan;
  return { ...plan, rooms: plan.rooms.map((r) => (r.id === room.id ? { ...r, keepWhole: true } : r)) };
}

/**
 * The plan without one wall, its rooms drawn again (the store's `removeWall`). A separator
 * taken away joins the rooms it divided, and the room that makes is kept whole against the
 * partial wall it was drawn on from — or the app would only draw it back.
 */
export function withoutWall(plan: FloorPlan, wallId: string): FloorPlan {
  const wall = plan.walls?.find((w) => w.id === wallId);
  if (!wall) return plan;
  const rebuilt = rebuildRooms(plan, (plan.walls ?? []).filter((w) => w.id !== wallId));
  return wall.separator ? keepWholeAt(rebuilt, { x: (wall.a.x + wall.b.x) / 2, z: (wall.a.z + wall.b.z) / 2 }) : rebuilt;
}

/**
 * The room joined with the rooms across its separators — "one room" on its card: every
 * separator along it taken away, the room that makes kept whole against a partial wall
 * standing in it. The same plan when the room has no separator.
 */
export function joinRoom(plan: FloorPlan, roomId: string): FloorPlan {
  const room = plan.rooms.find((r) => r.id === roomId);
  const walls = plan.walls ?? [];
  if (!room) return plan;
  const bounding = wallsBoundingRoom(walls, room);
  const gone = new Set(walls.filter((w) => w.separator && bounding.has(w.id)).map((w) => w.id));
  if (gone.size === 0) return plan;
  const inside = roomEdges(room.polygon)[0];
  const point = { x: (inside.a.x + inside.b.x) / 2 + inside.inward.x * 0.05, z: (inside.a.z + inside.b.z) / 2 + inside.inward.z * 0.05 };
  return keepWholeAt(rebuildRooms(plan, walls.filter((w) => !gone.has(w.id))), point);
}

/**
 * The room divided along the partial wall standing in it — "divide" on its card — whatever kind
 * of room it is: a separator of the person's own from the wall's free end across the room, the
 * room cut off typed from it (`withSplitRoomTypes`). The same plan when no partial wall stands in it.
 */
export function divideAlongPartialWall(plan: FloorPlan, roomId: string): FloorPlan {
  const room = plan.rooms.find((r) => r.id === roomId);
  const partial = room ? partialWallIn(plan, room) : null;
  if (!room || !partial) return plan;
  const released = releaseRooms(plan, new Set([roomId]));
  const separator = { ...separatorFor(plan, room, partial, 'user'), id: `${partial.wall.id}-div` };
  return withSplitRoomTypes(plan.rooms, rebuildRooms(released, addWalls(plan.walls ?? [], [separator])));
}
