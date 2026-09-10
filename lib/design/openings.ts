/**
 * Editing doors and windows after the plan is laid out.
 *
 * Openings live on a room's polygon edge as (wallIndex, t). A wall between two rooms exists
 * twice — each room extrudes its own — so an interior door is *two* openings, one per room,
 * that must stay on the same spot in the world. Every move here keeps the pair together:
 * the twin is found by the plan's naming convention (`${roomA}-${roomB}-d` ↔
 * `${roomB}-${roomA}-d`) or, for doors added later, by projecting the door's world point
 * onto the neighbour's edge.
 *
 * Pure functions over `PlanRoom[]`; the store wraps them.
 */
import { roomEdges, pointOnEdge, type PlanEdge } from './planGeometry';
import type { Opening, OpeningKind, PlanRoom, Vec2 } from './types';

export const OPENING_DEFAULTS: Record<OpeningKind, { widthM: number; heightM: number; sillM: number }> = {
  door: { widthM: 0.9, heightM: 2.05, sillM: 0 },
  window: { widthM: 1.4, heightM: 1.4, sillM: 0.9 },
  archway: { widthM: 1.6, heightM: 2.2, sillM: 0 },
};

/** Smallest gap kept between an opening's edge and the wall's corner, metres. */
const CORNER_MARGIN_M = 0.15;

export function edgeOf(room: PlanRoom, wallIndex: number): PlanEdge | null {
  return roomEdges(room.polygon).find((e) => e.index === wallIndex) ?? null;
}

/** A spot on a wall: which room, which of its edges, and how far along it. */
export interface WallTarget {
  roomId: string;
  wallIndex: number;
  t: number;
}

export function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
}

/**
 * The wall nearest to `point` across every room, within `maxDistance` metres. A shared wall
 * exists twice (once per room); when both copies are equally close, `preferRoomId` wins, so
 * a door dragged along its own room's wall stays that room's door.
 */
export function nearestWall(rooms: PlanRoom[], point: Vec2, maxDistance: number, preferRoomId?: string | null): { room: PlanRoom; edge: PlanEdge; distance: number } | null {
  let best: { room: PlanRoom; edge: PlanEdge; distance: number } | null = null;
  for (const room of rooms) {
    for (const edge of roomEdges(room.polygon)) {
      const distance = distanceToSegment(point, edge.a, edge.b);
      if (distance > maxDistance) continue;
      const closer = !best || distance < best.distance - 1e-6;
      const tie = !!best && Math.abs(distance - best.distance) <= 1e-6 && room.id === preferRoomId && best.room.id !== preferRoomId;
      if (closer || tie) best = { room, edge, distance };
    }
  }
  return best;
}

/** Where the opening's centre sits in the flat. */
export function openingWorldPoint(room: PlanRoom, opening: Opening): Vec2 | null {
  const edge = edgeOf(room, opening.wallIndex);
  return edge ? pointOnEdge(edge, opening.t) : null;
}

/** The `t` along `edge` nearest to `point`, kept far enough from both corners for `widthM`. */
export function projectToEdge(edge: PlanEdge, point: Vec2, widthM: number): number {
  const raw = ((point.x - edge.a.x) * edge.dir.x + (point.z - edge.a.z) * edge.dir.z) / edge.length;
  const margin = (widthM / 2 + CORNER_MARGIN_M) / edge.length;
  if (margin >= 0.5) return 0.5;
  return Math.min(1 - margin, Math.max(margin, raw));
}

/** Edge of `room` that runs along the same line as `edge` (a shared wall), if any. */
function twinEdge(room: PlanRoom, edge: PlanEdge, point: Vec2, tolerance: number): PlanEdge | null {
  for (const candidate of roomEdges(room.polygon)) {
    // Parallel — same axis — and within a wall's thickness of the line.
    if (candidate.axis !== edge.axis) continue;
    const across = edge.axis === 'x' ? Math.abs(candidate.a.z - edge.a.z) : Math.abs(candidate.a.x - edge.a.x);
    if (across > tolerance) continue;
    // And the point lies within the candidate's span.
    const along = ((point.x - candidate.a.x) * candidate.dir.x + (point.z - candidate.a.z) * candidate.dir.z) / candidate.length;
    if (along >= -0.02 && along <= 1.02) return candidate;
  }
  return null;
}

export function twinOf(rooms: PlanRoom[], opening: Opening): { room: PlanRoom; opening: Opening } | null {
  if (!opening.connectsToRoomId) return null;
  const room = rooms.find((r) => r.id === opening.connectsToRoomId);
  if (!room) return null;
  const twinId = `${room.id}-${opening.roomId}-d`;
  const twin = room.openings.find((o) => o.id === twinId || (o.connectsToRoomId === opening.roomId && o.kind === opening.kind && Math.abs(o.widthM - opening.widthM) < 0.01));
  return twin ? { room, opening: twin } : null;
}

const replaceIn = (rooms: PlanRoom[], roomId: string, fn: (room: PlanRoom) => PlanRoom) => rooms.map((r) => (r.id === roomId ? fn(r) : r));
const patchOpening = (room: PlanRoom, id: string, patch: Partial<Opening>): PlanRoom => ({ ...room, openings: room.openings.map((o) => (o.id === id ? { ...o, ...patch } : o)) });

/** Slides an opening along its wall; a paired interior door drags its twin with it. */
export function moveOpening(rooms: PlanRoom[], roomId: string, openingId: string, t: number): PlanRoom[] {
  const room = rooms.find((r) => r.id === roomId);
  const opening = room?.openings.find((o) => o.id === openingId);
  if (!room || !opening) return rooms;
  const edge = edgeOf(room, opening.wallIndex);
  if (!edge) return rooms;
  const clamped = projectToEdge(edge, pointOnEdge(edge, t), opening.widthM);
  let next = replaceIn(rooms, roomId, (r) => patchOpening(r, openingId, { t: clamped }));

  const twin = twinOf(rooms, opening);
  if (twin) {
    const twinEdgeRef = edgeOf(twin.room, twin.opening.wallIndex);
    if (twinEdgeRef) {
      const point = pointOnEdge(edge, clamped);
      next = replaceIn(next, twin.room.id, (r) => patchOpening(r, twin.opening.id, { t: projectToEdge(twinEdgeRef, point, twin.opening.widthM) }));
    }
  }
  return next;
}

/** Changes width, height, sill or kind; the twin follows for width and kind. */
export function updateOpening(rooms: PlanRoom[], roomId: string, openingId: string, patch: Partial<Pick<Opening, 'widthM' | 'heightM' | 'sillM' | 'kind'>>): PlanRoom[] {
  const room = rooms.find((r) => r.id === roomId);
  const opening = room?.openings.find((o) => o.id === openingId);
  if (!room || !opening) return rooms;
  const edge = edgeOf(room, opening.wallIndex);
  const widthM = patch.widthM != null ? Math.max(0.5, Math.min(patch.widthM, (edge?.length ?? 10) - CORNER_MARGIN_M * 2)) : opening.widthM;
  const clean: Partial<Opening> = { ...patch, widthM };
  if (patch.kind && patch.kind !== opening.kind) {
    // A door becomes a window: it needs a sill and a window's height, and vice versa.
    const d = OPENING_DEFAULTS[patch.kind];
    clean.heightM = patch.heightM ?? d.heightM;
    clean.sillM = patch.sillM ?? d.sillM;
    if (patch.widthM == null) clean.widthM = Math.min(d.widthM, (edge?.length ?? 10) - CORNER_MARGIN_M * 2);
  }
  let next = replaceIn(rooms, roomId, (r) => patchOpening(r, openingId, clean));
  // Re-clamp the position for the new width.
  if (edge) next = moveOpening(next, roomId, openingId, opening.t);
  const twin = twinOf(rooms, opening);
  if (twin) next = replaceIn(next, twin.room.id, (r) => patchOpening(r, twin.opening.id, { widthM: clean.widthM, heightM: clean.heightM ?? twin.opening.heightM, sillM: clean.sillM ?? twin.opening.sillM, kind: clean.kind ?? twin.opening.kind }));
  return next;
}

/** Removes an opening and its twin. */
export function removeOpening(rooms: PlanRoom[], roomId: string, openingId: string): PlanRoom[] {
  const room = rooms.find((r) => r.id === roomId);
  const opening = room?.openings.find((o) => o.id === openingId);
  if (!room || !opening) return rooms;
  const twin = twinOf(rooms, opening);
  let next = replaceIn(rooms, roomId, (r) => ({ ...r, openings: r.openings.filter((o) => o.id !== openingId) }));
  if (twin) next = replaceIn(next, twin.room.id, (r) => ({ ...r, openings: r.openings.filter((o) => o.id !== twin.opening.id) }));
  return next;
}

export interface AddOpeningOptions {
  /** Where along the wall (0..1) to put it; otherwise a free spot is found. */
  t?: number;
  /** Size to keep — a moved opening brings its own; otherwise the kind's defaults. */
  widthM?: number;
  heightM?: number;
  sillM?: number;
}

/**
 * Adds an opening to a wall — the given one, or the longest wall with nothing on it. A door
 * on a wall another room shares gets its twin cut in that room too, so it opens into a room
 * rather than into the back of a wall; a window on a shared wall is refused (returns the
 * rooms unchanged), because a window into the neighbour's bedroom is never what was meant.
 */
export function addOpening(rooms: PlanRoom[], roomId: string, kind: OpeningKind, wallIndex: number | null, wallThicknessM: number, options: AddOpeningOptions = {}): { rooms: PlanRoom[]; openingId: string | null } {
  const room = rooms.find((r) => r.id === roomId);
  if (!room) return { rooms, openingId: null };
  const edges = roomEdges(room.polygon);
  const defaults = OPENING_DEFAULTS[kind];
  const minLength = defaults.widthM + CORNER_MARGIN_M * 2;
  const chosen =
    (wallIndex != null ? edges.find((e) => e.index === wallIndex) : null) ??
    edges
      .filter((e) => e.length >= minLength)
      .sort((a, b) => {
        const usedA = room.openings.filter((o) => o.wallIndex === a.index).length;
        const usedB = room.openings.filter((o) => o.wallIndex === b.index).length;
        return usedA - usedB || b.length - a.length;
      })[0];
  if (!chosen || chosen.length < minLength) return { rooms, openingId: null };

  const width = Math.min(options.widthM ?? defaults.widthM, chosen.length - CORNER_MARGIN_M * 2);
  let t = options.t ?? 0.5;
  if (options.t == null) {
    // A free spot along the wall: the centre, or beside what is already there.
    const taken = room.openings.filter((o) => o.wallIndex === chosen.index).map((o) => o.t);
    for (const candidate of [0.5, 0.25, 0.75, 0.15, 0.85]) {
      if (!taken.some((x) => Math.abs(x - candidate) * chosen.length < width + 0.2)) {
        t = candidate;
        break;
      }
    }
  }
  t = projectToEdge(chosen, pointOnEdge(chosen, t), width);
  const point = pointOnEdge(chosen, t);
  const tolerance = Math.max(wallThicknessM * 2.5, 0.25);
  const neighbour = rooms.map((r) => (r.id === roomId ? null : { room: r, edge: twinEdge(r, chosen, point, tolerance) })).find((n) => n?.edge) ?? null;

  if (kind === 'window' && neighbour) return { rooms, openingId: null };

  const stamp = Date.now().toString(36);
  const id = `${roomId}-${kind}-${stamp}`;
  const opening: Opening = {
    id,
    kind,
    wallIndex: chosen.index,
    t,
    widthM: width,
    heightM: options.heightM ?? defaults.heightM,
    sillM: options.sillM ?? defaults.sillM,
    roomId,
    connectsToRoomId: neighbour ? neighbour.room.id : null,
    exterior: !neighbour,
  };
  let next = replaceIn(rooms, roomId, (r) => ({ ...r, openings: [...r.openings, opening] }));
  if (neighbour && neighbour.edge) {
    const twin: Opening = {
      ...opening,
      id: `${neighbour.room.id}-${roomId}-d-${stamp}`,
      wallIndex: neighbour.edge.index,
      t: projectToEdge(neighbour.edge, point, width),
      roomId: neighbour.room.id,
      connectsToRoomId: roomId,
    };
    next = replaceIn(next, neighbour.room.id, (r) => ({ ...r, openings: [...r.openings, twin] }));
  }
  return { rooms: next, openingId: id };
}

/**
 * Puts an opening down on any wall of any room, at `target.t`, keeping its size and kind.
 * Along its own wall (or the neighbour's copy of that shared wall) this is a plain slide;
 * anywhere else the opening — and its twin — is cut out and cut in again, so it gets a
 * new id, which is returned. A window dropped on a shared wall is refused: `openingId` is
 * null and the rooms come back unchanged.
 */
export function moveOpeningToWall(rooms: PlanRoom[], roomId: string, openingId: string, target: WallTarget, wallThicknessM: number): { rooms: PlanRoom[]; openingId: string | null } {
  const room = rooms.find((r) => r.id === roomId);
  const opening = room?.openings.find((o) => o.id === openingId);
  if (!room || !opening) return { rooms, openingId: null };
  if (target.roomId === roomId && target.wallIndex === opening.wallIndex) {
    return { rooms: moveOpening(rooms, roomId, openingId, target.t), openingId };
  }
  const twin = twinOf(rooms, opening);
  if (twin && target.roomId === twin.room.id && target.wallIndex === twin.opening.wallIndex) {
    return { rooms: moveOpening(rooms, twin.room.id, twin.opening.id, target.t), openingId };
  }
  const removed = removeOpening(rooms, roomId, openingId);
  const added = addOpening(removed, target.roomId, opening.kind, target.wallIndex, wallThicknessM, {
    t: target.t,
    widthM: opening.widthM,
    heightM: opening.heightM,
    sillM: opening.sillM,
  });
  if (!added.openingId) return { rooms, openingId: null };
  return added;
}

/** Moves an opening to a different wall of the same room, centred on it. */
export function setOpeningWall(rooms: PlanRoom[], roomId: string, openingId: string, wallIndex: number, wallThicknessM: number): PlanRoom[] {
  const room = rooms.find((r) => r.id === roomId);
  const opening = room?.openings.find((o) => o.id === openingId);
  if (!room || !opening || opening.wallIndex === wallIndex) return rooms;
  const removed = removeOpening(rooms, roomId, openingId);
  const added = addOpening(removed, roomId, opening.kind, wallIndex, wallThicknessM);
  if (!added.openingId) return rooms;
  // Keep the size the user had set.
  return updateOpening(added.rooms, roomId, added.openingId, { widthM: opening.widthM, heightM: opening.heightM, sillM: opening.sillM });
}
