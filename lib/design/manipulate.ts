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
  pointInPolygon,
  polygonBounds,
  roomEdges,
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

// ---------------------------------------------------------------------------
// Footprints and collision
// ---------------------------------------------------------------------------

/**
 * World-space footprint of an item.
 *
 * Rooms are rectilinear and everything ends up square to a wall, so an axis-aligned box is
 * exact for the usual case. At an odd angle it is the bounding box of the rotated rectangle,
 * which is conservative — it will refuse a placement slightly before things actually touch.
 */
export function footprintOf(
  position: Vec2,
  size: { width: number; depth: number },
  rotation: number
): Footprint {
  const cos = Math.abs(Math.cos(rotation));
  const sin = Math.abs(Math.sin(rotation));
  const halfX = (size.width * cos + size.depth * sin) / 2;
  const halfZ = (size.width * sin + size.depth * cos) / 2;
  return {
    minX: position.x - halfX,
    maxX: position.x + halfX,
    minZ: position.z - halfZ,
    maxZ: position.z + halfZ,
  };
}

export function footprintsOverlap(a: Footprint, b: Footprint, tolerance = 0.02): boolean {
  return (
    a.minX < b.maxX - tolerance &&
    a.maxX > b.minX + tolerance &&
    a.minZ < b.maxZ - tolerance &&
    a.maxZ > b.minZ + tolerance
  );
}

/** Every corner of the footprint has to be inside the room, not just its centre. */
export function footprintInRoom(footprint: Footprint, polygon: Vec2[]): boolean {
  const corners: Vec2[] = [
    { x: footprint.minX, z: footprint.minZ },
    { x: footprint.maxX, z: footprint.minZ },
    { x: footprint.maxX, z: footprint.maxZ },
    { x: footprint.minX, z: footprint.maxZ },
  ];
  return corners.every((corner) => pointInPolygon(corner, polygon));
}

/**
 * Items that a dragged piece has to avoid.
 *
 * Rugs, pendants, artwork and curtains are excluded: a rug is *meant* to sit under the coffee
 * table, and a ceiling light shares its floor space with everything below it.
 */
export function blockingItems(items: PlacedItem[], roomId: string, ignoreId: string) {
  return items.filter(
    (item) =>
      item.roomId === roomId &&
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
 */
function blockersFor(item: PlacedItem, others: PlacedItem[], roomId: string): PlacedItem[] {
  return getArchetype(item.kind)?.ghost ? [] : blockingItems(others, roomId, item.id);
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
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
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
 */
export function snapPlacement(
  room: PlanRoom,
  item: PlacedItem,
  desired: Placement,
  others: PlacedItem[]
): SnapResult {
  const edges = roomEdges(room.polygon);
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

  position = clampInsideRoom(room, position, item.size, flush?.rotation ?? rotation);
  const finalRotation = flush?.rotation ?? rotation;

  // The walls are tested against the whole box — the outside of an L is the outside of its
  // box — and the other pieces against the floor each really covers.
  const footprint = footprintOf(position, item.size, finalRotation);
  const cover = itemFootprints(item, { position, rotation: finalRotation });
  const valid = footprintInRoom(footprint, room.polygon) && !blockersFor(item, others, room.id).some((other) => coverOverlaps(cover, itemFootprints(other)));

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
  const valid = footprintInRoom(footprint, room.polygon) && !blockersFor(item, others, room.id).some((other) => coverOverlaps(cover, itemFootprints(other)));
  return { position, rotation, elevationM, valid, snappedToWall: true };
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
  const bounds = polygonBounds(room.polygon);
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
      if (opening.kind === 'window') continue;
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
 */
export function rotateItem(
  room: PlanRoom,
  item: PlacedItem,
  steps: number,
  others: PlacedItem[]
): SnapResult {
  const rotation = item.rotation + steps * ROTATE_STEP_RAD;
  const blockers = blockersFor(item, others, room.id).map((other) => itemFootprints(other));
  const bounds = polygonBounds(room.polygon);
  const centre = { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 };

  const toCentre = normalise({ x: centre.x - item.position.x, z: centre.z - item.position.z });

  for (const nudge of [0, 0.1, 0.2, 0.35, 0.5, 0.7]) {
    const candidate = clampInsideRoom(
      room,
      { x: item.position.x + toCentre.x * nudge, z: item.position.z + toCentre.z * nudge },
      item.size,
      rotation
    );
    const footprint = footprintOf(candidate, item.size, rotation);
    const cover = itemFootprints(item, { position: candidate, rotation });

    const fits = footprintInRoom(footprint, room.polygon) && !blockers.some((other) => coverOverlaps(cover, other));

    if (fits) return { position: candidate, rotation, valid: true, snappedToWall: false };
  }

  const turned = clampInsideRoom(room, item.position, item.size, rotation);
  return { position: turned, rotation, valid: false, snappedToWall: false };
}

/**
 * Does the item, as it stands, fit — inside its room and clear of everything else? What the
 * selection outline turns red on, and what a drop is judged by.
 */
export function isPlacementValid(room: PlanRoom, item: PlacedItem, others: PlacedItem[]): boolean {
  const footprint = footprintOf(item.position, item.size, item.rotation);
  if (!footprintInRoom(footprint, room.polygon)) return false;
  const cover = itemFootprints(item);
  return !blockersFor(item, others, room.id).some((other) => coverOverlaps(cover, itemFootprints(other)));
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
export function fitSwapped(room: PlanRoom, swapped: PlacedItem, others: PlacedItem[]): PlacedItem | null {
  const snapped = snapPlacement(room, swapped, { position: swapped.position, rotation: swapped.rotation }, others);
  const eased = { ...swapped, position: snapped.position, rotation: snapped.rotation };
  if (snapped.valid && snapped.snappedToWall) {
    // Only the step towards or away from the wall is wanted. The snap also rounds the place
    // along the wall to the grid, and a sofa that shifts two centimetres sideways whenever
    // its product changes is no longer in front of its coffee table.
    const n = { x: Math.sin(snapped.rotation), z: Math.cos(snapped.rotation) };
    const step = (snapped.position.x - swapped.position.x) * n.x + (snapped.position.z - swapped.position.z) * n.z;
    const straight = { ...eased, position: { x: swapped.position.x + n.x * step, z: swapped.position.z + n.z * step } };
    return isPlacementValid(room, straight, others) ? straight : eased;
  }
  if (isPlacementValid(room, swapped, others)) return swapped;
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
