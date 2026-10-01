/**
 * Direct manipulation: the rules that apply when a *person* drags a piece of furniture,
 * rather than when the layout engine places one.
 *
 * The layout engine searches for a good spot and gives up if it can't find one. Dragging is
 * the opposite problem — the user has already decided roughly where the thing goes, and the
 * job here is to make that decision land cleanly: snap it flush to the wall they pushed it
 * against, square it up, keep it inside the room, and tell them when it won't fit.
 *
 * Pure geometry — no THREE, no React. The viewer calls this on every pointer move.
 */

import {
  boxInPolygon,
  floorWalls,
  isPassage,
  openFloor,
  pointInPolygon,
  polygonBounds,
  roomEdges,
  wallEdges,
  wallsEnterBox,
  type PlanEdge,
} from './planGeometry';
import { getArchetype } from './catalog';
import { footprintMaskFor } from './footprintMasks';
import type { PlacedItem, PlanRoom, Vec2 } from './types';

/** Axis-aligned box in the ground plane. */
export interface Footprint {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Placement {
  position: Vec2;
  rotation: number;
  /** For a piece hung on a wall: the height of its base. Absent when a move leaves the height alone. */
  elevationM?: number;
}

export interface SnapResult extends Placement {
  /** False when the item overlaps something or hangs outside the room. */
  valid: boolean;
  /** Set when the item snapped flush against a wall. */
  snappedToWall: boolean;
}

/** Distance at which an item jumps flush against a wall. */
const WALL_SNAP_M = 0.35;
/** Rotation is squared up to a right angle within this many radians. */
const ANGLE_SNAP_RAD = (14 * Math.PI) / 180;
/** Dragged positions land on a 5 cm grid, which is how furniture is actually measured. */
const GRID_M = 0.05;
/** A rotation's cosine or sine this small is a right angle's floating-point noise, not a turn. */
const RIGHT_ANGLE_EPS = 1e-9;
/** How far past its room's outline a piece may reach and still be in it: floating-point noise, not a wall. */
const OUTLINE_NOISE_M = 1e-9;

// ---------------------------------------------------------------------------
// Footprints and collision
// ---------------------------------------------------------------------------

/**
 * The cosine and sine of a rotation, exact at the right angles furniture stands at.
 * `Math.cos(-Math.PI / 2)` is 6e-17, not 0: a bed the layout engine had pushed flush into a
 * corner at −π/2 got a box reaching 1e-16 m past the wall, and `boxInPolygon`'s exact corner
 * test called it outside the room. The engine's own box (`boxFor`) squares the rotation and
 * never had the error.
 */
function trigOf(rotation: number): { cos: number; sin: number } {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  if (Math.abs(cos) < RIGHT_ANGLE_EPS) return { cos: 0, sin: Math.sign(sin) };
  if (Math.abs(sin) < RIGHT_ANGLE_EPS) return { cos: Math.sign(cos), sin: 0 };
  return { cos, sin };
}

/**
 * World-space footprint of an item.
 *
 * Rooms are rectilinear and everything ends up square to a wall, so an axis-aligned box is
 * exact for the usual case — to the last bit, as the layout engine's is (`trigOf`). At an odd
 * angle it is the bounding box of the rotated rectangle, which is conservative — it will
 * refuse a placement slightly before things actually touch.
 */
export function footprintOf(
  position: Vec2,
  size: { width: number; depth: number },
  rotation: number
): Footprint {
  const trig = trigOf(rotation);
  const cos = Math.abs(trig.cos);
  const sin = Math.abs(trig.sin);
  const halfX = (size.width * cos + size.depth * sin) / 2;
  const halfZ = (size.width * sin + size.depth * cos) / 2;
  return {
    minX: position.x - halfX,
    maxX: position.x + halfX,
    minZ: position.z - halfZ,
    maxZ: position.z + halfZ,
  };
}

/** How far two pieces may reach into each other and still only touch. */
export const PIECE_TOUCH_M = 0.02;

export function footprintsOverlap(a: Footprint, b: Footprint, tolerance = PIECE_TOUCH_M): boolean {
  return (
    a.minX < b.maxX - tolerance &&
    a.maxX > b.minX + tolerance &&
    a.minZ < b.maxZ - tolerance &&
    a.maxZ > b.minZ + tolerance
  );
}

/**
 * Inside the room: every corner of the footprint in it, not just its centre, and no wall of it
 * running through — the end of a partial wall can stand inside a box whose corners are all on
 * the floor (`boxInPolygon`) — judged a nanometre in from the box's sides (`OUTLINE_NOISE_M`).
 * What a piece a person moves or hangs is judged by, and a product the matcher fits to a slot.
 *
 * The corner test is exact, and its ray cast counts a point on an east or south wall (the larger
 * x or z) as outside the room and one on a west or north wall as inside. A piece clamped flush
 * against a wall (`clampInside`, the matcher's `clampInsideRoom`) stands exactly on it, so on
 * two sides of every room it was out: a sofa pushed edge-on into the east wall was outlined red
 * where the same push into the west wall was fine, a clock at the east or south end of a wall
 * was refused, and the matcher gave a product flush against those walls a next-best — a smaller
 * plant in the corner, another wardrobe. The nanometre also takes up a clamp's rounding
 * (`wall + half − half` need not be the wall). The layout engine keeps the exact test
 * (`boxInPolygon`): its spots are chosen by it, and slack there moves them.
 */
export function footprintInRoom(footprint: Footprint, polygon: Vec2[]): boolean {
  const e = OUTLINE_NOISE_M;
  return boxInPolygon({ minX: footprint.minX + e, maxX: footprint.maxX - e, minZ: footprint.minZ + e, maxZ: footprint.maxZ - e }, polygon);
}

/**
 * The floor a piece in `room` may stand on: the room, and — given the plan's rooms — every room
 * joined to it across room separators (`openFloor`). A separator is a line on the floor, not a
 * wall: a sofa may stand over the line between a living room and the kitchen it opens onto.
 */
function floorOf(room: PlanRoom, rooms?: readonly PlanRoom[]): PlanRoom[] {
  return rooms ? openFloor(room, rooms) : [room];
}

/** The box around a floor's rooms: how far a dragged piece may go before the walls judge it. */
function floorBounds(floor: readonly PlanRoom[]): Footprint {
  const boxes = floor.map((room) => polygonBounds(room.polygon));
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    minZ: Math.min(...boxes.map((b) => b.minZ)),
    maxZ: Math.max(...boxes.map((b) => b.maxZ)),
  };
}

/**
 * Whether a footprint stands on a floor: in its one room (`footprintInRoom`), or — across room
 * separators — on the floor with no wall of it running through (`floorWalls`): over the
 * separator's line, never through a wall, the partial wall a separator carries on from included.
 */
export function footprintOnFloor(footprint: Footprint, floor: readonly PlanRoom[], walls: PlanEdge[] = floorWalls(floor)): boolean {
  if (floor.length === 1) return footprintInRoom(footprint, floor[0].polygon);
  const centre = { x: (footprint.minX + footprint.maxX) / 2, z: (footprint.minZ + footprint.maxZ) / 2 };
  // A centre exactly on a separator's line is in neither room by the polygon test; a millimetre
  // either way it is in one of them.
  const onFloor = [centre, { x: centre.x + 0.001, z: centre.z }, { x: centre.x - 0.001, z: centre.z }, { x: centre.x, z: centre.z + 0.001 }, { x: centre.x, z: centre.z - 0.001 }].some((p) =>
    floor.some((room) => pointInPolygon(p, room.polygon))
  );
  return onFloor && !wallsEnterBox(walls, footprint);
}

/**
 * Items that a dragged piece has to avoid — in its room, or in any of the rooms given (a floor
 * that runs on across room separators).
 *
 * Rugs, pendants, artwork and curtains are excluded: a rug is *meant* to sit under the coffee
 * table, and a ceiling light shares its floor space with everything below it.
 */
export function blockingItems(items: PlacedItem[], roomId: string | readonly string[], ignoreId: string) {
  const inRoom = (id: string) => (typeof roomId === 'string' ? id === roomId : roomId.includes(id));
  return items.filter(
    (item) =>
      inRoom(item.roomId) &&
      item.id !== ignoreId &&
      !getArchetype(item.kind)?.ghost &&
      item.elevationM < 0.05
  );
}

/**
 * What *this* piece has to avoid. The rule above cuts both ways: a rug gets in nothing's
 * way, and nothing gets in a rug's. It only ran one way — the layout engine laid the rug
 * under the sofa, and the moment a person picked that rug up there was no floor in the room
 * it could be put down on again, because every spot worth a rug has furniture standing on it.
 *
 * A dining chair and a dining table are not in each other's way either (`tucksUnder`): the
 * layout engine seats chairs part-way under their table when the room is tight, testing a seat
 * against everything but the table (`placeSeatAroundTable`), and the studio outlined the chair
 * and the table it had tucked it under red — nor could a person push a chair in themselves.
 */
function blockersFor(item: PlacedItem, others: PlacedItem[], floor: readonly PlanRoom[]): PlacedItem[] {
  if (getArchetype(item.kind)?.ghost) return [];
  return blockingItems(others, floor.map((room) => room.id), item.id).filter((other) => !tucksUnder(item, other));
}

/**
 * A dining chair and a dining table, either way round: the chair's seat slides under the table's
 * top. The studio lets such a pair overlap freely; the matcher, which puts real products of other
 * sizes into the engine's slots, only for a chair the engine tucked under its table, and only up
 * to half the chair (`placeFitting`).
 */
export function tucksUnder(a: Pick<PlacedItem, 'kind'>, b: Pick<PlacedItem, 'kind'>): boolean {
  const slots = [getArchetype(a.kind)?.slot, getArchetype(b.kind)?.slot];
  return slots.includes('dining_chair') && slots.includes('dining_table');
}

/**
 * The floor an item really covers: its bounding box, or — when its model is known to leave
 * part of that box empty (`footprintMasks`: a corner sofa, an L-shaped desk) — the parts it
 * does cover. Each part is turned with the item and boxed on the axes, which is exact at the
 * right angles furniture stands at and conservative in between, like `footprintOf`.
 */
export function itemFootprints(item: Pick<PlacedItem, 'position' | 'size' | 'rotation' | 'mirrored' | 'product'>, pose?: Placement): Footprint[] {
  const position = pose?.position ?? item.position;
  const rotation = pose?.rotation ?? item.rotation;
  const mask = footprintMaskFor(item.product?.model3dUrl);
  if (!mask) return [footprintOf(position, item.size, rotation)];
  const { cos, sin } = trigOf(rotation);
  return mask.map((rect) => {
    // A mirrored piece is the same model flipped across its facing axis.
    const x0 = item.mirrored ? 1 - rect.x1 : rect.x0;
    const x1 = item.mirrored ? 1 - rect.x0 : rect.x1;
    const box: Footprint = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (const fx of [x0, x1]) {
      for (const fz of [rect.z0, rect.z1]) {
        const lx = (fx - 0.5) * item.size.width;
        const lz = (fz - 0.5) * item.size.depth;
        // The wrapper's yaw, as three.js turns it: x' = x·cos + z·sin, z' = −x·sin + z·cos.
        const x = position.x + lx * cos + lz * sin;
        const z = position.z - lx * sin + lz * cos;
        box.minX = Math.min(box.minX, x);
        box.maxX = Math.max(box.maxX, x);
        box.minZ = Math.min(box.minZ, z);
        box.maxZ = Math.max(box.maxZ, z);
      }
    }
    return box;
  });
}

/** Do any of the floor these two pieces cover coincide? */
function coverOverlaps(a: Footprint[], b: Footprint[]): boolean {
  return a.some((p) => b.some((q) => footprintsOverlap(p, q)));
}

// ---------------------------------------------------------------------------
// Snapping
// ---------------------------------------------------------------------------

/**
 * Cleans up a dragged placement.
 *
 * Order matters: square the rotation first, because whether an item can sit flush against a
 * wall depends on which way it is facing.
 *
 * Given the plan's `rooms`, the piece may go over a room separator into the rooms across it
 * (`floorOf`), and the pieces there are in its way as much as those in its own room. It squares
 * up to and snaps against the walls of the room it is in (`room`, the one under the pointer) —
 * never the separator's line, which is no wall, and never the far face of a partial wall: near
 * the end of one, both faces are within reach, and snapping to the other side was a jump
 * through the wall.
 */
export function snapPlacement(
  room: PlanRoom,
  item: PlacedItem,
  desired: Placement,
  others: PlacedItem[],
  rooms?: readonly PlanRoom[]
): SnapResult {
  const floor = floorOf(room, rooms);
  const walls = floorWalls(floor);
  const edges = floorWalls(floor, [room]);
  const rotation = snapAngle(desired.rotation, edges);

  let position = { x: snapToGrid(desired.position.x), z: snapToGrid(desired.position.z) };
  let snappedToWall = false;

  // Wall-mounted things (mirrors, art) always live on a wall, so they snap to the nearest one
  // regardless of distance; free-standing things only snap when pushed close.
  const archetype = getArchetype(item.kind);
  const alwaysOnWall = archetype?.placement.type === 'wall-mounted';

  const flush = flushAgainstWall(edges, position, rotation, item.size, alwaysOnWall);
  if (flush) {
    position = flush.position;
    snappedToWall = true;
  }

  position = clampInside(floorBounds(floor), position, item.size, flush?.rotation ?? rotation);
  const finalRotation = flush?.rotation ?? rotation;

  // The walls are tested against the whole box — the outside of an L is the outside of its
  // box — and the other pieces against the floor each really covers.
  const footprint = footprintOf(position, item.size, finalRotation);
  const cover = itemFootprints(item, { position, rotation: finalRotation });
  const valid = footprintOnFloor(footprint, floor, walls) && !blockersFor(item, others, floor).some((other) => coverOverlaps(cover, itemFootprints(other)));

  return { position, rotation: finalRotation, valid, snappedToWall };
}

/** How far a hung piece's centre stood from the pointer when it was grabbed: along its wall and up it, metres. */
export interface HangGrab {
  along: number;
  up: number;
}

/** A piece that hangs on a wall — a mirror, a picture, a clock — rather than standing on the floor. */
export function isWallHung(item: Pick<PlacedItem, 'kind'>): boolean {
  return getArchetype(item.kind)?.placement.type === 'wall-mounted';
}

/**
 * Hangs a wall-hung piece on one wall of a room where the pointer touched it: flat against
 * that wall, centred under the pointer along it and kept off the wall's ends, at the height
 * the pointer met the face — between the floor and the top of the room.
 *
 * The wall is *named*, never guessed. `snapPlacement` finds the nearest wall to a point on
 * the floor, and in 3D the pointer on a wall face has no point on the floor: the ray met the
 * plane of the piece's height behind the wall when the pointer was above that height and
 * short of it when below, so a clock pushed up a wall jumped to the wall opposite. The
 * pointer is on a face; the face says which wall.
 */
export function hangOnWall(room: PlanRoom, item: PlacedItem, wallIndex: number, at: Vec2, y: number, others: PlacedItem[], grab?: HangGrab): SnapResult | null {
  const edge = roomEdges(room.polygon).find((e) => e.index === wallIndex);
  if (!edge) return null;
  const half = item.size.width / 2;
  // Grabbed off its centre, the piece keeps that offset from the pointer along the wall and up it.
  const raw = (at.x - edge.a.x) * edge.dir.x + (at.z - edge.a.z) * edge.dir.z + (grab?.along ?? 0);
  y += grab?.up ?? 0;
  // A piece wider than its wall is centred on it.
  const along = edge.length <= item.size.width ? edge.length / 2 : clamp(snapToGrid(raw), half, edge.length - half);
  const back = item.size.depth / 2 + 0.01;
  const position = { x: edge.a.x + edge.dir.x * along + edge.inward.x * back, z: edge.a.z + edge.dir.z * along + edge.inward.z * back };
  const rotation = edge.facing;
  const elevationM = clamp(Math.round((y - item.size.height / 2) * 100) / 100, 0, Math.max(0, room.heightM - item.size.height));
  const footprint = footprintOf(position, item.size, rotation);
  const cover = itemFootprints(item, { position, rotation });
  const valid = footprintInRoom(footprint, room.polygon) && !blockersFor(item, others, [room]).some((other) => coverOverlaps(cover, itemFootprints(other)));
  return { position, rotation, elevationM, valid, snappedToWall: true };
}

/**
 * The wall a hung piece hangs on: the one whose face its back is nearest, of those it stands
 * alongside. Read from where it is rather than from which way it faces, so a piece turned off
 * its wall before turns were taken round the walls still finds the wall it was on.
 */
export function hungWall(room: PlanRoom, item: Pick<PlacedItem, 'position' | 'size'>): PlanEdge | null {
  let best: { edge: PlanEdge; gap: number } | null = null;
  for (const edge of wallEdges(room)) {
    const toItem = { x: item.position.x - edge.a.x, z: item.position.z - edge.a.z };
    const distance = toItem.x * edge.inward.x + toItem.z * edge.inward.z;
    const along = toItem.x * edge.dir.x + toItem.z * edge.dir.z;
    if (distance < -0.05 || along < -0.3 || along > edge.length + 0.3) continue;
    const gap = Math.abs(distance - item.size.depth / 2);
    if (!best || gap < best.gap) best = { edge, gap };
  }
  return best?.edge ?? null;
}

/**
 * Turns a wall-hung piece. A mirror or a clock faces out of its wall or it is not hung at all —
 * turned like a chair, 45° at a time in place, it stood off the wall on one corner. So a turn
 * takes it round to the next wall in that direction (a quarter turn in a square room; a slanted
 * wall is a wall of its own): flat against it, at the height it hung at, as near as that wall
 * comes to where it was. With no other wall to go to it is squared back onto its own.
 */
export function turnOnWall(room: PlanRoom, item: PlacedItem, steps: number, others: PlacedItem[]): SnapResult {
  const current = hungWall(room, item);
  const from = current?.facing ?? item.rotation;
  const sign = steps < 0 ? -1 : 1;
  const full = Math.PI * 2;
  let best: { edge: PlanEdge; turn: number; distance: number } | null = null;
  for (const edge of wallEdges(room)) {
    // How far round, the way of the turn; a wall facing the way this one does is no turn at all.
    const turn = (((sign * (edge.facing - from)) % full) + full) % full;
    if (turn < 0.1 || turn > full - 0.1) continue;
    const distance = distanceToEdge(item.position, edge);
    if (!best || turn < best.turn - 1e-6 || (Math.abs(turn - best.turn) <= 1e-6 && distance < best.distance)) best = { edge, turn, distance };
  }
  const target = best?.edge ?? current;
  const centreHeight = (item.elevationM ?? 0) + item.size.height / 2;
  const hung = target ? hangOnWall(room, item, target.index, nearestOnEdge(item.position, target), centreHeight, others) : null;
  return hung ?? { position: item.position, rotation: item.rotation, elevationM: item.elevationM, valid: false, snappedToWall: false };
}

function nearestOnEdge(point: Vec2, edge: PlanEdge): Vec2 {
  const along = clamp((point.x - edge.a.x) * edge.dir.x + (point.z - edge.a.z) * edge.dir.z, 0, edge.length);
  return { x: edge.a.x + edge.dir.x * along, z: edge.a.z + edge.dir.z * along };
}

function distanceToEdge(point: Vec2, edge: PlanEdge): number {
  const on = nearestOnEdge(point, edge);
  return Math.hypot(point.x - on.x, point.z - on.z);
}

/** Squares a rotation up to the nearest wall direction when it is already close to one. */
function snapAngle(rotation: number, edges: PlanEdge[]): number {
  let best = rotation;
  let bestDelta = ANGLE_SNAP_RAD;

  for (const edge of edges) {
    const delta = angleDifference(rotation, edge.facing);
    if (Math.abs(delta) < bestDelta) {
      bestDelta = Math.abs(delta);
      best = edge.facing;
    }
  }
  return best;
}

/**
 * Pushes an item flush against the wall it is nearest to.
 *
 * Only walls the item is already roughly facing away from count — dragging a sofa across the
 * room should not spin it round to meet a wall it happens to pass.
 */
function flushAgainstWall(
  edges: PlanEdge[],
  position: Vec2,
  rotation: number,
  size: { width: number; depth: number },
  force: boolean
): { position: Vec2; rotation: number } | null {
  let best: { position: Vec2; rotation: number; distance: number } | null = null;

  for (const edge of edges) {
    // Perpendicular distance from the item's centre to the wall line.
    const toItem = { x: position.x - edge.a.x, z: position.z - edge.a.z };
    const distance = toItem.x * edge.inward.x + toItem.z * edge.inward.z;
    if (distance < 0) continue; // behind the wall

    // The item also has to be alongside this wall, not past either end of it.
    const along = toItem.x * edge.dir.x + toItem.z * edge.dir.z;
    if (along < -0.3 || along > edge.length + 0.3) continue;

    const backOffset = size.depth / 2 + 0.02;
    const gap = distance - backOffset;
    if (!force && gap > WALL_SNAP_M) continue;
    if (gap < -size.depth) continue; // hopelessly through the wall

    const aligned = Math.abs(angleDifference(rotation, edge.facing)) < Math.PI / 3;
    if (!force && !aligned) continue;

    if (!best || distance < best.distance) {
      best = {
        position: {
          x: edge.a.x + edge.dir.x * clamp(along, backOffset, edge.length - backOffset) + edge.inward.x * backOffset,
          z: edge.a.z + edge.dir.z * clamp(along, backOffset, edge.length - backOffset) + edge.inward.z * backOffset,
        },
        rotation: edge.facing,
        distance,
      };
    }
  }

  return best ? { position: best.position, rotation: best.rotation } : null;
}

/** Keeps the footprint inside the room's bounding box, so an item can't be dragged into a wall. */
export function clampInsideRoom(
  room: PlanRoom,
  position: Vec2,
  size: { width: number; depth: number },
  rotation: number
): Vec2 {
  return clampInside(polygonBounds(room.polygon), position, size, rotation);
}

/** Keeps the footprint inside a box — a room's, or a floor's that runs on across separators. */
function clampInside(
  bounds: Footprint,
  position: Vec2,
  size: { width: number; depth: number },
  rotation: number
): Vec2 {
  const footprint = footprintOf(position, size, rotation);
  const halfX = (footprint.maxX - footprint.minX) / 2;
  const halfZ = (footprint.maxZ - footprint.minZ) / 2;

  return {
    x: clamp(position.x, bounds.minX + halfX, bounds.maxX - halfX),
    z: clamp(position.z, bounds.minZ + halfZ, bounds.maxZ - halfZ),
  };
}

/** Which room contains this point, if any. */
export function roomAtPoint(rooms: PlanRoom[], point: Vec2): PlanRoom | null {
  for (const room of rooms) {
    if (pointInPolygon(point, room.polygon)) return room;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Walking around inside
// ---------------------------------------------------------------------------

/**
 * Where a person can stand.
 *
 * Room polygons describe *open space*, and adjacent rooms are separated by the thickness of
 * the wall between them — so testing "is this point in a room" alone would leave someone
 * unable to walk through their own doorways. Each door and archway therefore contributes a
 * short portal box that bridges the two polygons it joins.
 */
export function buildWalkable(plan: { rooms: PlanRoom[]; wallThicknessM: number }): {
  rooms: PlanRoom[];
  portals: Footprint[];
} {
  const portals: Footprint[] = [];
  const reach = plan.wallThicknessM / 2 + 0.45;

  for (const room of plan.rooms) {
    const edges = roomEdges(room.polygon);
    for (const opening of room.openings) {
      // Only doors and archways lead anywhere: a railing is a balcony's edge, not a way out.
      if (!isPassage(opening)) continue;
      const edge = edges.find((e) => e.index === opening.wallIndex);
      if (!edge) continue;

      const centre = {
        x: edge.a.x + (edge.b.x - edge.a.x) * opening.t,
        z: edge.a.z + (edge.b.z - edge.a.z) * opening.t,
      };
      const halfAlong = opening.widthM / 2;
      const sideways = Math.abs(edge.dir.x) > 0.5;

      portals.push({
        minX: centre.x - (sideways ? halfAlong : reach),
        maxX: centre.x + (sideways ? halfAlong : reach),
        minZ: centre.z - (sideways ? reach : halfAlong),
        maxZ: centre.z + (sideways ? reach : halfAlong),
      });
    }
  }

  return { rooms: plan.rooms, portals };
}

/**
 * Can someone of the given shoulder radius stand here?
 *
 * Sampling the centre plus four offsets keeps a walker off the walls without needing real
 * collision geometry — at 0.25 m that is roughly a person's footprint.
 */
export function canStandAt(
  walkable: { rooms: PlanRoom[]; portals: Footprint[] },
  point: Vec2,
  radius = 0.25
): boolean {
  const samples: Vec2[] = [
    point,
    { x: point.x + radius, z: point.z },
    { x: point.x - radius, z: point.z },
    { x: point.x, z: point.z + radius },
    { x: point.x, z: point.z - radius },
  ];

  return samples.every(
    (sample) =>
      walkable.rooms.some((room) => pointInPolygon(sample, room.polygon)) ||
      walkable.portals.some(
        (portal) =>
          sample.x >= portal.minX &&
          sample.x <= portal.maxX &&
          sample.z >= portal.minZ &&
          sample.z <= portal.maxZ
      )
  );
}

/**
 * Somewhere sensible to stand when the walk-through starts.
 *
 * The centre of a room is usually occupied — that is where the coffee table or the dining
 * table lives — so dropping the camera there means opening walk mode with your nose against a
 * cupboard. Candidates run from the centroid outwards towards the corners, and the first one
 * that is both standable and clear of furniture wins. The view faces back towards the middle
 * of the room, which is where the furniture is.
 */
export function findStandingSpot(
  room: PlanRoom,
  items: PlacedItem[],
  walkable: { rooms: PlanRoom[]; portals: Footprint[] },
  clearanceM = 0.55
): { position: Vec2; lookAt: Vec2 } {
  const centre = polygonCentre(room.polygon);
  const occupied = items
    .filter((item) => item.roomId === room.id && item.elevationM < 1.2)
    .filter((item) => !getArchetype(item.kind)?.ghost)
    .map((item) => footprintOf(item.position, item.size, item.rotation));

  const clear = (point: Vec2) =>
    canStandAt(walkable, point, 0.3) &&
    !occupied.some(
      (box) =>
        point.x > box.minX - clearanceM &&
        point.x < box.maxX + clearanceM &&
        point.z > box.minZ - clearanceM &&
        point.z < box.maxZ + clearanceM
    );

  const candidates: Vec2[] = [centre];
  // Work outwards towards each corner, which is where the free floor usually is.
  for (const fraction of [0.45, 0.65, 0.8]) {
    for (const corner of room.polygon) {
      candidates.push({
        x: centre.x + (corner.x - centre.x) * fraction,
        z: centre.z + (corner.z - centre.z) * fraction,
      });
    }
  }

  for (const candidate of candidates) {
    if (clear(candidate)) return { position: candidate, lookAt: centre };
  }

  // Everything is crowded — stand in the middle anyway rather than refuse to enter.
  return { position: centre, lookAt: centre };
}

function polygonCentre(polygon: Vec2[]): Vec2 {
  return {
    x: polygon.reduce((sum, p) => sum + p.x, 0) / polygon.length,
    z: polygon.reduce((sum, p) => sum + p.z, 0) / polygon.length,
  };
}

// ---------------------------------------------------------------------------
// Rotation
// ---------------------------------------------------------------------------

export const ROTATE_STEP_RAD = Math.PI / 4; // 45°

/**
 * Turns an item in place.
 *
 * Explicitly *not* routed through `snapPlacement`: that would re-align the rotation to the
 * nearest wall, which for anything already sitting flush means every rotation is instantly
 * undone. When someone presses rotate they mean the angle they asked for.
 *
 * The item is kept inside the room, and if the new angle collides it is nudged towards the
 * middle of the room first — turning a sofa a quarter turn usually needs a few centimetres
 * of room to do it in. When nothing fits it still turns, and comes back `valid: false`: the
 * studio shows the collision and the person drags the piece somewhere it fits. Refusing the
 * turn made a sofa impossible to rotate in any room without spare floor.
 *
 * A piece that hangs on a wall goes round to the next wall instead (`turnOnWall`), and says the
 * height it hangs at.
 */
export function rotateItem(
  room: PlanRoom,
  item: PlacedItem,
  steps: number,
  others: PlacedItem[],
  rooms?: readonly PlanRoom[]
): SnapResult {
  if (isWallHung(item)) return turnOnWall(room, item, steps, others);
  const rotation = item.rotation + steps * ROTATE_STEP_RAD;
  const floor = floorOf(room, rooms);
  const walls = floorWalls(floor);
  const blockers = blockersFor(item, others, floor).map((other) => itemFootprints(other));
  const bounds = floorBounds(floor);
  // Nudged towards the middle of its own room, not of a floor that runs on across separators.
  const own = polygonBounds(room.polygon);
  const centre = { x: (own.minX + own.maxX) / 2, z: (own.minZ + own.maxZ) / 2 };

  const toCentre = normalise({ x: centre.x - item.position.x, z: centre.z - item.position.z });

  for (const nudge of [0, 0.1, 0.2, 0.35, 0.5, 0.7]) {
    const candidate = clampInside(
      bounds,
      { x: item.position.x + toCentre.x * nudge, z: item.position.z + toCentre.z * nudge },
      item.size,
      rotation
    );
    const footprint = footprintOf(candidate, item.size, rotation);
    const cover = itemFootprints(item, { position: candidate, rotation });

    const fits = footprintOnFloor(footprint, floor, walls) && !blockers.some((other) => coverOverlaps(cover, other));

    if (fits) return { position: candidate, rotation, valid: true, snappedToWall: false };
  }

  const turned = clampInside(bounds, item.position, item.size, rotation);
  return { position: turned, rotation, valid: false, snappedToWall: false };
}

/**
 * Does the item, as it stands, fit — inside its room and clear of everything else? What the
 * selection outline turns red on, and what a drop is judged by. Given the plan's `rooms`, the
 * rooms across its room's separators are floor it may stand on too (`floorOf`).
 */
export function isPlacementValid(room: PlanRoom, item: PlacedItem, others: PlacedItem[], rooms?: readonly PlanRoom[]): boolean {
  const floor = floorOf(room, rooms);
  const footprint = footprintOf(item.position, item.size, item.rotation);
  if (!footprintOnFloor(footprint, floor)) return false;
  const cover = itemFootprints(item);
  return !blockersFor(item, others, floor).some((other) => coverOverlaps(cover, itemFootprints(other)));
}

/**
 * Where a piece stands once its product has been swapped for one of another size — or null
 * when it fits nowhere near where the old one stood.
 *
 * A piece against a wall keeps its *back* on the wall, not its centre where it was: a deeper
 * sofa with the same centre has its back through the plaster, a shallower one stands a hand
 * away from it. Anything else stays where it is when it fits there, and is otherwise eased
 * back inside the room. What this never does is go looking across the room for a free spot:
 * the person chose where the sofa goes, and a sofa that no longer fits there is theirs to
 * put somewhere else (the studio hands it to the pointer).
 */
export function fitSwapped(room: PlanRoom, swapped: PlacedItem, others: PlacedItem[], rooms?: readonly PlanRoom[]): PlacedItem | null {
  const snapped = snapPlacement(room, swapped, { position: swapped.position, rotation: swapped.rotation }, others, rooms);
  const eased = { ...swapped, position: snapped.position, rotation: snapped.rotation };
  if (snapped.valid && snapped.snappedToWall) {
    // Only the step towards or away from the wall is wanted. The snap also rounds the place
    // along the wall to the grid, and a sofa that shifts two centimetres sideways whenever
    // its product changes is no longer in front of its coffee table.
    const n = { x: Math.sin(snapped.rotation), z: Math.cos(snapped.rotation) };
    const step = (snapped.position.x - swapped.position.x) * n.x + (snapped.position.z - swapped.position.z) * n.z;
    const straight = { ...eased, position: { x: swapped.position.x + n.x * step, z: swapped.position.z + n.z * step } };
    return isPlacementValid(room, straight, others, rooms) ? straight : eased;
  }
  if (isPlacementValid(room, swapped, others, rooms)) return swapped;
  return snapped.valid ? eased : null;
}

function normalise(v: Vec2): Vec2 {
  const length = Math.hypot(v.x, v.z);
  return length < 1e-6 ? { x: 0, z: 0 } : { x: v.x / length, z: v.z / length };
}

// ---------------------------------------------------------------------------

function snapToGrid(value: number): number {
  return Math.round(value / GRID_M) * GRID_M;
}

function clamp(value: number, lo: number, hi: number): number {
  if (hi < lo) return (lo + hi) / 2;
  return Math.max(lo, Math.min(hi, value));
}

/** Signed difference between two angles, wrapped to (-π, π]. */
function angleDifference(a: number, b: number): number {
  let delta = a - b;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta <= -Math.PI) delta += Math.PI * 2;
  return delta;
}
