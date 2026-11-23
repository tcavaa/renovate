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
 * **Where that end meets an opening or an open line** (Nini, 23 Nov 2026, decision 11). A screen is
 * never run on into a window, a door or an archway of the wall it would join; in this order:
 * a shorter screen, stopping `SCREEN_OPENING_CLEAR_M` clear of the window — of a door or an
 * archway, out of its swing and its way too (`DOOR_WAY_M`), which leaves a way through there; then
 * a shallower lobby, the screen nearer the entrance door, never shallower than a way through nor
 * than the door's leaf (`DEPTH_STEP_M` at a time); then the screen turned, square to the entrance
 * wall beside the door, the lobby a corridor along the wall it could not join (`-turned`); then
 * none. A screen whose short end meets a room separator's open line stops short of it, leaving a
 * way through of 90 cm, 80 where 90 would no longer cover the door (`OPEN_LINE_WAY_M`). A screen
 * is still only where it helps: none in an Industrial flat or a studio under 30 m², none in a room
 * too shallow for it and a room beyond, and none that no longer covers the door. `ScreenHow` says
 * which way each was built.
 *
 * Pure: no React, no DOM.
 */

import { isOpenEdge, isPassage, ONTO_WINDOW_M, pointInPolygon, roomEdges, type PlanEdge } from './planGeometry';
import { addWalls, rebuildRooms, splitAtJunctions } from './walls';
import type { FloorPlan, Opening, PlanRoom, Vec2, Wall, StyleId } from './types';

/** How far into the living room the entrance screen stands, and into the bedroom an en-suite's. */
export const ENTRY_DEPTH_M = 1.3;
export const ENSUITE_DEPTH_M = 1.1;
/** How far past each side of the door a screen runs. */
export const SCREEN_PAST_DOOR_M = 0.3;
/** A way through: less than this between a screen's end and a wall is closed by running the screen on to the wall. */
export const PASSAGE_M = 0.9;
/** A partition's thickness: a plasterboard stud wall. */
export const PARTITION_THICKNESS_M = 0.1;
/** How far clear of a window (or of a door's or an archway's way) a screen that cannot join its wall stops. */
export const SCREEN_OPENING_CLEAR_M = 0.2;
/** A door's or an archway's way into the room, its leaf's swing within it: 90 cm (`inDoorway`). */
const DOOR_WAY_M = 0.9;
/** The way through a screen leaves at a room separator's open line: 90 cm where it still covers its door, else 80. */
export const OPEN_LINE_WAY_M = 0.9;
export const OPEN_LINE_WAY_MIN_M = 0.8;
/** How much shallower a lobby is tried at a time. */
const DEPTH_STEP_M = 0.05;
/** A room this much deeper than the screen at least, or it gets none: the room beyond must stay a room. */
const ROOM_BEYOND_M = 1.8;
/** An en-suite's bedroom from this size: a smaller one has no room for a lobby. */
const ENSUITE_BEDROOM_MIN_M2 = 12;

type Box = { minX: number; maxX: number; minZ: number; maxZ: number };

/** How a screen was built (decision 11's order): as drawn, shorter, in a shallower lobby, or turned square to the entrance wall. */
export type ScreenHow = 'full' | 'shortened' | 'shallower' | 'turned';

export interface PartitionResult {
  plan: FloorPlan;
  /** Per room, the floor behind each screen, where no furniture stands. */
  keepouts: Record<string, Box[]>;
  /** The walls added. */
  added: Wall[];
  /** How each wall added was built, by its id. */
  screens: Array<{ id: string; how: ScreenHow }>;
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

/**
 * How far along a line parallel to the edge, `inward` in, the floor runs from `along` towards
 * `sign` before it meets the room's outline — and the edge it meets there, with how far along that
 * edge (where a screen run on to it would join it). Null when it meets none.
 */
function runTo(room: PlanRoom, edge: PlanEdge, along: number, inward: number, sign: 1 | -1): { distance: number; edge: PlanEdge; along: number } | null {
  const from = at(edge, along, inward);
  const dir = { x: edge.dir.x * sign, z: edge.dir.z * sign };
  let best: { distance: number; edge: PlanEdge; along: number } | null = null;
  for (const other of roomEdges(room.polygon)) {
    const ex = other.b.x - other.a.x;
    const ez = other.b.z - other.a.z;
    const denom = dir.x * ez - dir.z * ex;
    if (Math.abs(denom) < 1e-9) continue;
    const t = ((other.a.x - from.x) * ez - (other.a.z - from.z) * ex) / denom;
    const u = ((other.a.x - from.x) * dir.z - (other.a.z - from.z) * dir.x) / denom;
    if (t > 1e-6 && u >= -1e-6 && u <= 1 + 1e-6 && (!best || t < best.distance)) best = { distance: t, edge: other, along: u * other.length };
  }
  return best;
}

/**
 * The opening a screen run on to the edge it meets would be built into, at that spot: its end — its
 * thickness across that edge — in a door's or an archway's width at all, or onto a window further
 * than a piece may stand onto one (`ONTO_WINDOW_M`, `blocksWindow`'s and the joinery's margin). A
 * wall cannot be built into a window, and a doorway walled across is no way through. Null where the
 * screen may join it.
 */
function openingAt(room: PlanRoom, meets: { edge: PlanEdge; along: number }): Opening | null {
  const from = meets.along - PARTITION_THICKNESS_M / 2;
  const to = meets.along + PARTITION_THICKNESS_M / 2;
  return (
    room.openings.find((o) => {
      if (o.wallIndex !== meets.edge.index) return false;
      const middle = o.t * meets.edge.length;
      const overlap = Math.min(to, middle + o.widthM / 2) - Math.max(from, middle - o.widthM / 2);
      return overlap > (isPassage(o) ? 1e-6 : ONTO_WINDOW_M);
    }) ?? null
  );
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

/** The axis-aligned box round some points. */
function boxOf(corners: Vec2[]): Box {
  return { minX: Math.min(...corners.map((c) => c.x)), maxX: Math.max(...corners.map((c) => c.x)), minZ: Math.min(...corners.map((c) => c.z)), maxZ: Math.max(...corners.map((c) => c.z)) };
}

const partition = (id: string, a: Vec2, b: Vec2): Wall => ({ id, a: { x: round3(a.x), z: round3(a.z) }, b: { x: round3(b.x), z: round3(b.z) }, thicknessM: PARTITION_THICKNESS_M, material: 'drywall', origin: 'generated' });

/**
 * The screen in front of a door (decision 11's order): parallel to the door's wall `depth` into the
 * room — shorter where an end cannot join its wall (`acrossDoor`), then in a shallower lobby — else
 * turned square to the door's wall beside it (`besideDoor`). Null when the room is too shallow for
 * it and a room beyond, or no way of building one leaves a way past and covers the door.
 */
export function doorScreen(plan: FloorPlan, room: PlanRoom, door: Opening, depth: number, id: string): { wall: Wall; keepout: Box; how: ScreenHow } | null {
  const edge = roomEdges(room.polygon).find((e) => e.index === door.wallIndex);
  if (!edge) return null;
  const centre = door.t * edge.length;
  if (depthInto(room, edge, centre) < depth + PARTITION_THICKNESS_M / 2 + ROOM_BEYOND_M) return null;
  // Never shallower than a way through behind the screen, nor than the door's leaf swings.
  const least = Math.max(PASSAGE_M, door.widthM);
  const steps = Math.floor((depth - least) / DEPTH_STEP_M + 1e-6);
  for (let i = 0; i <= Math.max(0, steps); i++) {
    const d = round3(depth - i * DEPTH_STEP_M);
    const screen = acrossDoor(plan, room, edge, door, d, id);
    if (screen) return { wall: screen.wall, keepout: screen.keepout, how: i > 0 ? 'shallower' : screen.shortened ? 'shortened' : 'full' };
  }
  const turned = besideDoor(plan, room, edge, door, depth, `${id}${TURNED}`);
  return turned ? { ...turned, how: 'turned' } : null;
}

/** One end of a screen across a door: where it stops along the door's wall, whether it joins the wall there, whether it leaves a way through, and whether it was cut short. */
type ScreenEnd = { at: number; joins: boolean; way: boolean; shortened: boolean };

/**
 * A screen parallel to the door's wall `depth` into the room, across the door and past it: each end
 * free where it leaves a way through (`PASSAGE_M`), else run on to its wall — but short of an open
 * line (a way through of 90 cm, else 80) and short of an opening there (`SCREEN_OPENING_CLEAR_M`
 * clear of a window, a door's or an archway's way kept). Null where neither end leaves a way
 * through, an end shortened no longer covers the door, or the screen would not stand in the room.
 */
function acrossDoor(plan: FloorPlan, room: PlanRoom, edge: PlanEdge, door: Opening, depth: number, id: string): { wall: Wall; keepout: Box; shortened: boolean } | null {
  const centre = door.t * edge.length;
  const inward = depth + PARTITION_THICKNESS_M / 2;
  const doorLo = centre - door.widthM / 2;
  const doorHi = centre + door.widthM / 2;
  // The floor the screen's line has either side of the door before a wall.
  const leftMeets = runTo(room, edge, centre, inward, -1);
  const rightMeets = runTo(room, edge, centre, inward, 1);
  const end = (sign: -1 | 1): ScreenEnd | null => {
    const m = sign < 0 ? leftMeets : rightMeets;
    if (!m) return null;
    const wallAt = centre + sign * m.distance;
    const reach = sign < 0 ? Math.max(doorLo - SCREEN_PAST_DOOR_M, wallAt) : Math.min(doorHi + SCREEN_PAST_DOOR_M, wallAt);
    if (Math.abs(reach - wallAt) >= PASSAGE_M) return { at: reach, joins: false, way: true, shortened: false };
    // Stopped `gap` short of its wall, if it still covers the door.
    const short = (gap: number, way: boolean): ScreenEnd | null => {
      const stop = wallAt - sign * gap;
      return (sign < 0 ? stop <= doorLo + 1e-6 : stop >= doorHi - 1e-6) ? { at: stop, joins: false, way, shortened: true } : null;
    };
    // A room separator's open line: no wall to join — a way through beside it.
    if (isOpenEdge(room, m.edge.index)) return short(OPEN_LINE_WAY_M, true) ?? short(OPEN_LINE_WAY_MIN_M, true);
    const opening = openingAt(room, m);
    if (!opening) return { at: wallAt, joins: true, way: false, shortened: false };
    // An opening where it would join: clear of a window; of a door or an archway, out of its way too.
    const clear = isPassage(opening) ? DOOR_WAY_M + SCREEN_OPENING_CLEAR_M : SCREEN_OPENING_CLEAR_M;
    return short(clear, clear >= PASSAGE_M);
  };
  const left = end(-1);
  const right = end(1);
  if (!left || !right || (!left.way && !right.way)) return null;
  const walls = (plan.walls ?? []).filter((w) => !w.separator);
  // A joined end runs into its wall to the wall's centreline, so the screen joins it.
  const point = (e: ScreenEnd, sign: -1 | 1): Vec2 => {
    const p = at(edge, e.at, inward);
    if (!e.joins) return p;
    const dir = { x: edge.dir.x * sign, z: edge.dir.z * sign };
    const into = wallCentreAhead(walls, p, dir, 0.4);
    return into == null ? p : { x: p.x + dir.x * into, z: p.z + dir.z * into };
  };
  const a = point(left, -1);
  const b = point(right, 1);
  // The screen stands in the room: its middle on the floor.
  if (!pointInPolygon({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }, room.polygon)) return null;
  const far = inward + PARTITION_THICKNESS_M / 2;
  const keepout = boxOf([at(edge, left.at, 0), at(edge, right.at, 0), at(edge, right.at, far), at(edge, left.at, far)]);
  return { wall: partition(id, a, b), keepout, shortened: left.shortened || right.shortened };
}

/** The id's mark of a screen turned square to its door's wall. */
const TURNED = '-turned';

/**
 * The screen turned (decision 11, after a shallower lobby): square to the door's wall, joined to it
 * `SCREEN_OPENING_CLEAR_M` past the door's edge on the side away from the wall the screen across it
 * could not join, `depth` into the room, its far end free — coming in, one walks along a corridor
 * between that wall and the screen, the room beyond the screen out of sight. Only where the
 * corridor is a way through, the screen joins the wall clear of its openings and stands in the room,
 * and the room runs on past it far enough for it to hide something (`ROOM_BEYOND_M`).
 */
function besideDoor(plan: FloorPlan, room: PlanRoom, edge: PlanEdge, door: Opening, depth: number, id: string): { wall: Wall; keepout: Box } | null {
  const centre = door.t * edge.length;
  const mid = depth / 2;
  const toLeft = runTo(room, edge, centre, mid, -1);
  const toRight = runTo(room, edge, centre, mid, 1);
  if (!toLeft || !toRight) return null;
  // The corridor along the nearer wall; the screen on the door's other side.
  const sign: -1 | 1 = toLeft.distance <= toRight.distance ? 1 : -1;
  const along = centre + sign * (door.widthM / 2 + SCREEN_OPENING_CLEAR_M);
  const corridor = sign > 0 ? along - (centre - toLeft.distance) : centre + toRight.distance - along;
  const beyond = sign > 0 ? centre + toRight.distance - along : along - (centre - toLeft.distance);
  if (corridor < PASSAGE_M || beyond < ROOM_BEYOND_M) return null;
  if (openingAt(room, { edge, along })) return null;
  const end = at(edge, along, depth);
  if (!pointInPolygon(at(edge, along, mid), room.polygon) || !pointInPolygon(end, room.polygon)) return null;
  // Into the door's wall to its centreline, so the screen joins it.
  const foot = at(edge, along, 0);
  const back = { x: -edge.inward.x, z: -edge.inward.z };
  const into = wallCentreAhead((plan.walls ?? []).filter((w) => !w.separator), foot, back, 0.4);
  const a = into == null ? foot : { x: foot.x + back.x * into, z: foot.z + back.z * into };
  return { wall: partition(id, a, end), keepout: corridorBox(room, edge, along, -sign as -1 | 1, depth) };
}

/** The corridor a turned screen at `along` on `edge` makes: from the screen's far face to the wall towards `sign`, from the door's wall to `depth` in. */
function corridorBox(room: PlanRoom, edge: PlanEdge, along: number, sign: -1 | 1, depth: number): Box {
  const wall = runTo(room, edge, along, depth / 2, sign);
  const to = wall ? along + sign * wall.distance : along;
  const from = along - sign * (PARTITION_THICKNESS_M / 2);
  return boxOf([at(edge, from, 0), at(edge, to, 0), at(edge, to, depth), at(edge, from, depth)]);
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

/** The walls this module adds: an entrance screen's id, an en-suite's (a turned one marked `-turned`) — and the pieces one is cut into at a junction (`<id>j<n>`, `splitAtJunctions`). */
const ENTRY_ID = 'partition-entry-';
const ENSUITE_ID = 'partition-ensuite-';
const SCREEN_ID = /^(partition-(?:entry|ensuite)-.+?)(?:j\d+)?$/;

/** The screens an earlier generation added and the plan still has, each whole from end to end, with the depth it was built at. */
function standingScreens(walls: readonly Wall[]): Array<{ id: string; a: Vec2; b: Vec2; depth: number }> {
  const pieces = new Map<string, Wall[]>();
  for (const wall of walls) {
    const id = SCREEN_ID.exec(wall.id)?.[1];
    if (id) pieces.set(id, [...(pieces.get(id) ?? []), wall]);
  }
  return [...pieces].map(([id, parts]) => {
    // Its pieces lie on one line: the screen runs between the two ends furthest apart.
    const ends = parts.flatMap((w) => [w.a, w.b]);
    let span = { a: ends[0], b: ends[1], length: 0 };
    for (const a of ends) for (const b of ends) if (Math.hypot(b.x - a.x, b.z - a.z) > span.length) span = { a, b, length: Math.hypot(b.x - a.x, b.z - a.z) };
    return { id, a: span.a, b: span.b, depth: id.startsWith(ENTRY_ID) ? ENTRY_DEPTH_M : ENSUITE_DEPTH_M };
  });
}

/**
 * The floor behind a screen that stands: between it and the wall whose door it was built in front
 * of — the room's edge parallel to it, no further behind it than a screen is built, with a door
 * within the screen's length; for a turned screen, the corridor between it and the wall beside its
 * door (`corridorBox`). What `doorScreen` hands back for a new one, read off the wall as it is.
 * Null for a screen whose door is gone: it is a wall like any other then.
 */
function floorBehind(plan: FloorPlan, screen: { id: string; a: Vec2; b: Vec2; depth: number }): { roomId: string; box: Box } | null {
  if (screen.id.endsWith(TURNED)) return corridorBehind(plan, screen);
  const middle = { x: (screen.a.x + screen.b.x) / 2, z: (screen.a.z + screen.b.z) / 2 };
  let best: { roomId: string; edge: PlanEdge; from: number; to: number; off: number } | null = null;
  for (const room of plan.rooms) {
    for (const edge of roomEdges(room.polygon)) {
      const alongOf = (p: Vec2) => (p.x - edge.a.x) * edge.dir.x + (p.z - edge.a.z) * edge.dir.z;
      const offOf = (p: Vec2) => (p.x - edge.a.x) * edge.inward.x + (p.z - edge.a.z) * edge.inward.z;
      if (Math.abs(offOf(screen.a) - offOf(screen.b)) > 0.01) continue;
      const off = offOf(middle);
      if (off <= PARTITION_THICKNESS_M || off > screen.depth + PARTITION_THICKNESS_M) continue;
      const from = Math.min(alongOf(screen.a), alongOf(screen.b));
      const to = Math.max(alongOf(screen.a), alongOf(screen.b));
      const door = room.openings.some((o) => o.kind === 'door' && o.wallIndex === edge.index && o.t * edge.length > from && o.t * edge.length < to);
      if (door && (!best || off < best.off)) best = { roomId: room.id, edge, from, to, off };
    }
  }
  if (!best) return null;
  const far = best.off + PARTITION_THICKNESS_M / 2;
  return { roomId: best.roomId, box: boxOf([at(best.edge, best.from, 0), at(best.edge, best.to, 0), at(best.edge, best.to, far), at(best.edge, best.from, far)]) };
}

/** The corridor behind a turned screen that stands: the room's edge it is square to and joins, a door beside its foot on that edge. */
function corridorBehind(plan: FloorPlan, screen: { a: Vec2; b: Vec2 }): { roomId: string; box: Box } | null {
  for (const room of plan.rooms) {
    for (const edge of roomEdges(room.polygon)) {
      const alongOf = (p: Vec2) => (p.x - edge.a.x) * edge.dir.x + (p.z - edge.a.z) * edge.dir.z;
      const offOf = (p: Vec2) => (p.x - edge.a.x) * edge.inward.x + (p.z - edge.a.z) * edge.inward.z;
      if (Math.abs(alongOf(screen.a) - alongOf(screen.b)) > 0.01) continue;
      const [foot, end] = offOf(screen.a) <= offOf(screen.b) ? [screen.a, screen.b] : [screen.b, screen.a];
      const along = alongOf(foot);
      if (offOf(foot) > 0.01 || offOf(foot) < -0.4 || along < 0 || along > edge.length || !pointInPolygon(end, room.polygon)) continue;
      const door = room.openings.find((o) => o.kind === 'door' && o.wallIndex === edge.index && Math.abs(Math.abs(o.t * edge.length - along) - (o.widthM / 2 + SCREEN_OPENING_CLEAR_M)) < 0.02);
      if (!door) continue;
      const sign: -1 | 1 = door.t * edge.length < along ? -1 : 1;
      return { roomId: room.id, box: corridorBox(room, edge, along, sign, offOf(end)) };
    }
  }
  return null;
}

/** A studio smaller than this has no room for an entrance screen (L-13). */
export const SMALL_STUDIO_M2 = 30;

/**
 * The plan with the app's partitions added, the rooms they stand in kept whole, and the floor
 * behind each kept free. A plan whose walls are not drawn (no `walls`) comes back as it was. Run
 * again on a plan that has them, it adds nothing more — and the floor behind every screen that
 * stands is kept free again, whether or not today's rules would build that screen (another style,
 * a rule that came later): furniture is not laid out through a wall that is there.
 */
export function withGeneratedPartitions(plan: FloorPlan, styleId?: StyleId | null): PartitionResult {
  const none: PartitionResult = { plan, keepouts: {}, added: [], screens: [] };
  if (!plan.walls?.length) return none;
  const wanted: Array<{ room: PlanRoom; door: Opening; depth: number; id: string }> = [];
  const entrance = frontDoorIntoLiving(plan);
  // No entrance screen in an Industrial flat (its open plan is the point), nor in a studio short of
  // room (the rulebook, L-13).
  const screenEntrance = entrance && styleId !== 'industrial' && !(entrance.room.type === 'studio' && entrance.room.areaM2 < SMALL_STUDIO_M2);
  if (entrance && screenEntrance) wanted.push({ ...entrance, depth: ENTRY_DEPTH_M, id: `${ENTRY_ID}${entrance.room.id}` });
  for (const ensuite of ensuiteDoors(plan)) wanted.push({ ...ensuite, depth: ENSUITE_DEPTH_M, id: `${ENSUITE_ID}${ensuite.room.id}-${ensuite.door.id}` });
  const added: Wall[] = [];
  const screens: PartitionResult['screens'] = [];
  const keepouts: Record<string, Box[]> = {};
  const keep = new Set<string>();
  // The screens that stand already keep their floor first.
  const standing = standingScreens(plan.walls);
  for (const screen of standing) {
    const behind = floorBehind(plan, screen);
    if (behind) (keepouts[behind.roomId] ??= []).push(behind.box);
  }
  for (const want of wanted) {
    // Laid out again: the screen stands already (cut at a junction its later pieces are `<id>j<n>`; turned, `<id>-turned`).
    if (plan.walls.some((w) => w.id === want.id || w.id.startsWith(`${want.id}j`) || w.id.startsWith(`${want.id}${TURNED}`))) continue;
    const screen = doorScreen(plan, want.room, want.door, want.depth, want.id);
    if (!screen) continue;
    added.push(screen.wall);
    screens.push({ id: screen.wall.id, how: screen.how });
    (keepouts[want.room.id] ??= []).push(screen.keepout);
    keep.add(want.room.id);
  }
  if (added.length === 0) return { plan, keepouts, added, screens };
  const rebuilt = rebuildRooms(plan, splitAtJunctions(addWalls(plan.walls, added)));
  // The rooms are the same rooms (a screen joins one wall at most): matched back by where they stand.
  const rooms = rebuilt.rooms.map((room) => {
    const before = plan.rooms.find((r) => keep.has(r.id) && pointInPolygon(centroidOf(room.polygon), r.polygon));
    return before ? { ...room, keepWhole: true } : room;
  });
  const roomIdFor = (id: string) => rooms.find((r) => plan.rooms.find((p) => p.id === id && pointInPolygon(centroidOf(r.polygon), p.polygon)))?.id ?? id;
  const keyed = Object.fromEntries(Object.entries(keepouts).map(([id, boxes]) => [roomIdFor(id), boxes]));
  return { plan: { ...rebuilt, rooms }, keepouts: keyed, added, screens };
}

function centroidOf(polygon: Vec2[]): Vec2 {
  const n = polygon.length || 1;
  return { x: polygon.reduce((s, p) => s + p.x, 0) / n, z: polygon.reduce((s, p) => s + p.z, 0) / n };
}
