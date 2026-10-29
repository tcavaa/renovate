/**
 * Partitions the app adds when it lays a flat out (the owner's notes of 29 Oct 2026, "partitions
 * added at generation, automatically"):
 *
 * - **The entrance out of the living room's sight.** A front door that opens straight into a
 *   living room (or a studio) gets a screen in front of it: a partition parallel to the entrance
 *   wall, `ENTRY_DEPTH_M` into the room, across the door and 30 cm past it each side. Coming in,
 *   one faces the screen and turns into the room round its open end.
 * - **An en-suite's entrance enclosed.** A bathroom whose doors all open into one bedroom gets a
 *   small lobby in the bedroom in front of its door the same way, `ENSUITE_DEPTH_M` deep — room for
 *   a wardrobe against the screen's far side, beside the lobby.
 *
 * **To the corner.** A screen's end that would stop short of a wall by less than a way through
 * (`PASSAGE_M`) — the 10–20 cm leftover the owner does not want — runs on to the wall and joins it;
 * the other end stays open with at least a way through. A door with no way past on either side
 * gets no screen. A screen only ever joins one wall, so it stays a partial wall: the room is still
 * one room (`PlanRoom.keepWhole`, so no separator is drawn on from it — `lib/design/separators`).
 * The floor behind a screen is kept free of furniture (`PartitionResult.keepouts`).
 *
 * Pure: no React, no DOM.
 */

import { pointInPolygon, roomEdges, type PlanEdge } from './planGeometry';
import { addWalls, rebuildRooms, splitAtJunctions } from './walls';
import type { FloorPlan, Opening, PlanRoom, Vec2, Wall } from './types';

/** How far into the living room the entrance screen stands, and into the bedroom an en-suite's. */
export const ENTRY_DEPTH_M = 1.3;
export const ENSUITE_DEPTH_M = 1.1;
/** How far past each side of the door a screen runs. */
export const SCREEN_PAST_DOOR_M = 0.3;
/** A way through: less than this between a screen's end and a wall is closed by running the screen on to the wall. */
export const PASSAGE_M = 0.9;
/** A partition's thickness: a plasterboard stud wall. */
export const PARTITION_THICKNESS_M = 0.1;
/** A room this much deeper than the screen at least, or it gets none: the room beyond must stay a room. */
const ROOM_BEYOND_M = 1.8;
/** An en-suite's bedroom from this size: a smaller one has no room for a lobby. */
const ENSUITE_BEDROOM_MIN_M2 = 12;

type Box = { minX: number; maxX: number; minZ: number; maxZ: number };

export interface PartitionResult {
  plan: FloorPlan;
  /** Per room, the floor behind each screen, where no furniture stands. */
  keepouts: Record<string, Box[]>;
  /** The walls added. */
  added: Wall[];
}

const at = (edge: PlanEdge, along: number, inward: number): Vec2 => ({ x: edge.a.x + edge.dir.x * along + edge.inward.x * inward, z: edge.a.z + edge.dir.z * along + edge.inward.z * inward });
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** How far the room's floor runs straight in from a point on the edge (to the first other edge crossed). */
function depthInto(room: PlanRoom, edge: PlanEdge, along: number): number {
  const from = at(edge, along, 0.001);
  let best = Infinity;
  for (const other of roomEdges(room.polygon)) {
    if (other.index === edge.index) continue;
    // The ray from `from` along the inward normal against the other edge.
    const ex = other.b.x - other.a.x;
    const ez = other.b.z - other.a.z;
    const denom = edge.inward.x * ez - edge.inward.z * ex;
    if (Math.abs(denom) < 1e-9) continue;
    const t = ((other.a.x - from.x) * ez - (other.a.z - from.z) * ex) / denom;
    const u = ((other.a.x - from.x) * edge.inward.z - (other.a.z - from.z) * edge.inward.x) / denom;
    if (t > 0 && u >= -1e-6 && u <= 1 + 1e-6) best = Math.min(best, t);
  }
  return best;
}

/** How far along a line parallel to the edge, `inward` in, the floor runs from `along` towards `sign` before it meets a wall. */
function runTo(room: PlanRoom, edge: PlanEdge, along: number, inward: number, sign: 1 | -1): number {
  const from = at(edge, along, inward);
  const dir = { x: edge.dir.x * sign, z: edge.dir.z * sign };
  let best = Infinity;
  for (const other of roomEdges(room.polygon)) {
    const ex = other.b.x - other.a.x;
    const ez = other.b.z - other.a.z;
    const denom = dir.x * ez - dir.z * ex;
    if (Math.abs(denom) < 1e-9) continue;
    const t = ((other.a.x - from.x) * ez - (other.a.z - from.z) * ex) / denom;
    const u = ((other.a.x - from.x) * dir.z - (other.a.z - from.z) * dir.x) / denom;
    if (t > 1e-6 && u >= -1e-6 && u <= 1 + 1e-6) best = Math.min(best, t);
  }
  return best;
}

/** Where a line from `from` along `dir` first crosses a wall's centreline, within `reach` metres. */
function wallCentreAhead(walls: Wall[], from: Vec2, dir: Vec2, reach: number): number | null {
  let best: number | null = null;
  for (const wall of walls) {
    if (wall.separator) continue;
    const ex = wall.b.x - wall.a.x;
    const ez = wall.b.z - wall.a.z;
    const denom = dir.x * ez - dir.z * ex;
    if (Math.abs(denom) < 1e-9) continue;
    const t = ((wall.a.x - from.x) * ez - (wall.a.z - from.z) * ex) / denom;
    const u = ((wall.a.x - from.x) * dir.z - (wall.a.z - from.z) * dir.x) / denom;
    if (t >= -1e-6 && t <= reach && u >= -1e-6 && u <= 1 + 1e-6 && (best == null || t < best)) best = t;
  }
  return best;
}

/**
 * The screen in front of a door: parallel to the door's wall `depth` into the room, across the door
 * and past it, run on to a wall on the side where the gap would be no way through. Null when the
 * room is too shallow, or there is no way past on either side.
 */
export function doorScreen(plan: FloorPlan, room: PlanRoom, door: Opening, depth: number, id: string): { wall: Wall; keepout: Box } | null {
  const edge = roomEdges(room.polygon).find((e) => e.index === door.wallIndex);
  if (!edge) return null;
  const centre = door.t * edge.length;
  const inward = depth + PARTITION_THICKNESS_M / 2;
  if (depthInto(room, edge, centre) < inward + ROOM_BEYOND_M) return null;
  let from = centre - door.widthM / 2 - SCREEN_PAST_DOOR_M;
  let to = centre + door.widthM / 2 + SCREEN_PAST_DOOR_M;
  // The floor the screen's line has either side of the door before a wall.
  const left = centre - runTo(room, edge, centre, inward, -1);
  const right = centre + runTo(room, edge, centre, inward, 1);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  from = Math.max(from, left);
  to = Math.min(to, right);
  const gapLeft = from - left;
  const gapRight = right - to;
  // One side runs on to its wall when it would leave no way through; the other must leave one.
  let joins: -1 | 1 | 0 = 0;
  if (gapLeft < PASSAGE_M && gapRight < PASSAGE_M) return null;
  if (gapLeft < PASSAGE_M) joins = -1;
  else if (gapRight < PASSAGE_M) joins = 1;
  const walls = (plan.walls ?? []).filter((w) => !w.separator);
  let a = at(edge, from, inward);
  let b = at(edge, to, inward);
  if (joins === -1) {
    // Into the side wall to its centreline, so the screen joins it.
    const wallStart = at(edge, left, inward);
    const back = { x: -edge.dir.x, z: -edge.dir.z };
    const into = wallCentreAhead(walls, wallStart, back, 0.4);
    a = into == null ? wallStart : { x: wallStart.x + back.x * into, z: wallStart.z + back.z * into };
  } else if (joins === 1) {
    const wallEnd = at(edge, right, inward);
    const into = wallCentreAhead(walls, wallEnd, edge.dir, 0.4);
    b = into == null ? wallEnd : { x: wallEnd.x + edge.dir.x * into, z: wallEnd.z + edge.dir.z * into };
  }
  // The screen stands in the room: its middle on the floor.
  if (!pointInPolygon({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }, room.polygon)) return null;
  const corners = [at(edge, joins === -1 ? left : from, 0), at(edge, joins === 1 ? right : to, 0), at(edge, joins === 1 ? right : to, inward + PARTITION_THICKNESS_M / 2), at(edge, joins === -1 ? left : from, inward + PARTITION_THICKNESS_M / 2)];
  const keepout = { minX: Math.min(...corners.map((c) => c.x)), maxX: Math.max(...corners.map((c) => c.x)), minZ: Math.min(...corners.map((c) => c.z)), maxZ: Math.max(...corners.map((c) => c.z)) };
  const wall: Wall = { id, a: { x: round3(a.x), z: round3(a.z) }, b: { x: round3(b.x), z: round3(b.z) }, thicknessM: PARTITION_THICKNESS_M, material: 'drywall', origin: 'generated' };
  return { wall, keepout };
}

/** The flat's front door when it opens into a living room or a studio, with that room. */
function frontDoorIntoLiving(plan: FloorPlan): { room: PlanRoom; door: Opening } | null {
  for (const room of plan.rooms) {
    if (room.type !== 'living_room' && room.type !== 'studio') continue;
    const door = room.openings.find((o) => o.kind === 'door' && o.exterior);
    if (door) return { room, door };
  }
  return null;
}

/** Each en-suite's door on its bedroom's side: a bathroom whose every door opens into one bedroom. */
function ensuiteDoors(plan: FloorPlan): Array<{ room: PlanRoom; door: Opening }> {
  const out: Array<{ room: PlanRoom; door: Opening }> = [];
  for (const bath of plan.rooms) {
    if (bath.type !== 'bathroom') continue;
    const doors = bath.openings.filter((o) => o.kind === 'door');
    const bedroomId = doors[0]?.connectsToRoomId;
    if (!bedroomId || doors.some((d) => d.connectsToRoomId !== bedroomId || d.exterior)) continue;
    const bedroom = plan.rooms.find((r) => r.id === bedroomId);
    if (!bedroom || bedroom.type !== 'bedroom' || bedroom.areaM2 < ENSUITE_BEDROOM_MIN_M2) continue;
    // The same door seen from the bedroom: its half there, linked back to the bathroom.
    const door = bedroom.openings.find((o) => o.kind === 'door' && o.connectsToRoomId === bath.id);
    if (door) out.push({ room: bedroom, door });
  }
  return out;
}

/**
 * The plan with the app's partitions added, the rooms they stand in kept whole, and the floor
 * behind each kept free. A plan whose walls are not drawn (no `walls`), or with nothing to add,
 * comes back as it was. Run again on a plan that has them, it adds nothing more.
 */
export function withGeneratedPartitions(plan: FloorPlan): PartitionResult {
  const none: PartitionResult = { plan, keepouts: {}, added: [] };
  if (!plan.walls?.length) return none;
  const wanted: Array<{ room: PlanRoom; door: Opening; depth: number; id: string }> = [];
  const entrance = frontDoorIntoLiving(plan);
  if (entrance) wanted.push({ ...entrance, depth: ENTRY_DEPTH_M, id: `partition-entry-${entrance.room.id}` });
  for (const ensuite of ensuiteDoors(plan)) wanted.push({ ...ensuite, depth: ENSUITE_DEPTH_M, id: `partition-ensuite-${ensuite.room.id}-${ensuite.door.id}` });
  const added: Wall[] = [];
  const keepouts: Record<string, Box[]> = {};
  const keep = new Set<string>();
  for (const want of wanted) {
    // Laid out again: the screen stands already (cut at a junction its pieces are `<id>j<n>`).
    if (plan.walls.some((w) => w.id === want.id || w.id.startsWith(`${want.id}j`))) continue;
    const screen = doorScreen(plan, want.room, want.door, want.depth, want.id);
    if (!screen) continue;
    added.push(screen.wall);
    (keepouts[want.room.id] ??= []).push(screen.keepout);
    keep.add(want.room.id);
  }
  if (added.length === 0) return none;
  const rebuilt = rebuildRooms(plan, splitAtJunctions(addWalls(plan.walls, added)));
  // The rooms are the same rooms (a screen joins one wall at most): matched back by where they stand.
  const rooms = rebuilt.rooms.map((room) => {
    const before = plan.rooms.find((r) => keep.has(r.id) && pointInPolygon(centroidOf(room.polygon), r.polygon));
    return before ? { ...room, keepWhole: true } : room;
  });
  const roomIdFor = (id: string) => rooms.find((r) => plan.rooms.find((p) => p.id === id && pointInPolygon(centroidOf(r.polygon), p.polygon)))?.id ?? id;
  const keyed = Object.fromEntries(Object.entries(keepouts).map(([id, boxes]) => [roomIdFor(id), boxes]));
  return { plan: { ...rebuilt, rooms }, keepouts: keyed, added };
}

function centroidOf(polygon: Vec2[]): Vec2 {
  const n = polygon.length || 1;
  return { x: polygon.reduce((s, p) => s + p.x, 0) / n, z: polygon.reduce((s, p) => s + p.z, 0) / n };
}
