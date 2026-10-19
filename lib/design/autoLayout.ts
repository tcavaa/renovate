/**
 * Rule-based furniture layout.
 *
 * Given a room polygon, its doors and windows, and the room program from `catalog.ts`, this
 * decides where every piece goes. It is deliberately not an optimiser and not a model: it is
 * the handful of rules an interior designer actually applies — the bed goes on the wall you
 * see when you walk in, the sofa goes on the longest wall, the coffee table sits a metre in
 * front of it, nothing blocks a door — plus a collision pass to keep it honest.
 *
 * Deterministic unless given an `rng` (`LayoutOptions.rng`): generating a design passes a freshly
 * seeded one, so the same plan generated twice is laid out differently — a piece goes to another
 * of the walls or spots that score close to the best, the optional decor comes and goes. Without
 * one (adding a piece, the tests) the same plan always gives the same room, so a person who swaps
 * one product does not have the rest of the furniture jump around.
 *
 * Pure: no THREE, no React, no randomness but the `rng` handed in.
 */

import { studioParts } from './studio';
import type { RoomType } from '@/lib/calculator/types';
import {
  ARCHETYPES,
  ROOM_PROGRAMS,
  getArchetype,
  resolveVariant,
  type Archetype,
  type ProgramEntry,
  type Size3,
} from './catalog';
import {
  boxInPolygon,
  isOpenEdge,
  isPassage,
  pointOnEdge,
  polygonBounds,
  polygonCentroid,
  roomEdges,
  type PlanEdge,
} from './planGeometry';
import type { Opening, PlacedItem, PlanRoom, Vec2 } from './types';
import { anchorsFor, type TechnicalAnchor } from './technical';
import { pickNearBest, weightedOrder, type Rng } from './random';

/** Axis-aligned box in the ground plane. */
interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface Pose {
  position: Vec2;
  rotation: number;
  size: Size3;
  elevationM: number;
}

export interface LayoutOptions {
  /** Leave the space in front of doors clear. */
  respectDoorSwing?: boolean;
  /** Skip decorative items (rugs, art, plants) — useful for a cheap first render. */
  skipDecor?: boolean;
  /** Per room, the technical points fixtures want to be near (the sewer for the toilet). */
  anchors?: Record<string, TechnicalAnchor[]>;
  /** Per room, floor boxes nothing may stand on — the columns. */
  obstacles?: Record<string, Box[]>;
  /** Seeded randomness (`lib/design/random`): another good spot, optional decor or not. None: the same room every time. */
  rng?: Rng;
}

/** Decor a generated room may go without, and how likely each is to be laid out when it fits. */
const OPTIONAL_DECOR: Record<string, number> = {
  artwork: 0.8,
  plant: 0.7,
  floor_lamp: 0.7,
  armchair: 0.75,
  bookshelf: 0.75,
  dresser: 0.8,
  rug: 0.85,
  rug_bed: 0.8,
  curtain: 0.9,
};

/** How far below the best spot's score a spot may be and still be drawn (`pickNearBest`). */
const SPOT_SPREAD = 10;

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

export function layoutPlan(rooms: PlanRoom[], options: LayoutOptions = {}): PlacedItem[] {
  return rooms.flatMap((room) => layoutRoom(room, options));
}

export function layoutRoom(room: PlanRoom, options: LayoutOptions = {}): PlacedItem[] {
  // A studio is furnished part by part: the kitchen's program in the kitchen half, the living
  // room's in the other, each half a room of its own for the engine. The doors belong to the
  // whole room, so their clear approach is kept free in both halves; the line between them is
  // not a wall, but furniture standing along it (a sofa's back to the kitchen) is what an open
  // plan looks like anyway.
  const parts = studioParts(room);
  if (parts) {
    const keepouts = options.respectDoorSwing === false ? [] : doorKeepouts(room, roomEdges(room.polygon));
    const obstacles = [...(options.obstacles?.[room.id] ?? []), ...keepouts];
    return parts.flatMap((part) =>
      layoutArea(
        { ...room, type: part.type, polygon: part.polygon, areaM2: part.areaM2, openings: [], split: undefined },
        { ...options, respectDoorSwing: false, obstacles: { ...options.obstacles, [room.id]: obstacles } },
        `p${part.index}-`
      )
    );
  }
  return layoutArea(room, options, '');
}

function layoutArea(room: PlanRoom, options: LayoutOptions, idPrefix: string): PlacedItem[] {
  const program = ROOM_PROGRAMS[room.type] ?? [];
  const edges = roomEdges(room.polygon);
  if (edges.length === 0) return [];

  const placed: PlacedItem[] = [];
  const occupied: Box[] = [];

  // Doors need a clear approach, so their swing area is occupied before anything is placed;
  // a column is simply in the way.
  if (options.respectDoorSwing !== false) {
    for (const box of doorKeepouts(room, edges)) occupied.push(box);
  }
  for (const box of options.obstacles?.[room.id] ?? []) occupied.push(box);
  const anchors = options.anchors?.[room.id];

  let counter = 0;
  const nextId = (kind: string) => `${room.id}-${idPrefix}${kind}-${counter++}`;

  for (const entry of program) {
    const kind = resolveVariant(entry, room.areaM2);
    const archetype = getArchetype(kind);
    if (!archetype) continue;

    if (options.skipDecor && archetype.ghost && archetype.slot !== 'rug') continue;

    const gate = entry.minAreaM2 ?? archetype.minRoomAreaM2 ?? 0;
    if (room.areaM2 < gate) continue;
    // A generated room varies its decor: a plant here, a print there, not every piece every time.
    if (options.rng && kind in OPTIONAL_DECOR && options.rng() > OPTIONAL_DECOR[kind]) continue;

    const count =
      entry.count === 'fill' ? seatCountFor(archetype, placed) : entry.count;

    for (let i = 0; i < count; i++) {
      const pose = resolvePose(archetype, i, room, edges, placed, occupied, { anchors: anchorsFor(kind, anchors), rng: options.rng });
      // A ring of seats keeps going past a slot that hits a wall; anything else stops at the
      // first failure, because its second copy has no better chance than its first.
      if (!pose && entry.count === 'fill') continue;
      if (!pose) break;

      placed.push({
        id: nextId(kind),
        roomId: room.id,
        slot: archetype.slot,
        kind,
        position: pose.position,
        rotation: pose.rotation,
        elevationM: pose.elevationM,
        size: pose.size,
        product: null,
      });

      if (!archetype.ghost) occupied.push(boxFor(pose));
    }
  }

  return placed;
}

/**
 * Finds room for one more item of `kind` among what is already placed — the user's own bed
 * for a room whose program had no bed. Same rules, same keepouts; null when it will not fit.
 */
export function placeAdditional(room: PlanRoom, kind: string, existing: PlacedItem[], size?: PlacedItem['size'], obstacles: Box[] = []): PlacedItem | null {
  const registered = getArchetype(kind);
  if (!registered) return null;
  // The spot is found for the real product when its size is known, not for the archetype's
  // typical one: a 1.9 m cabinet dropped where a 1 m one fits overlapped its neighbours and
  // came up red the moment it landed. Runs and rugs keep being sized to the room.
  const exact = !!size && registered.placement.type !== 'wall-run' && registered.slot !== 'rug' && registered.slot !== 'curtain';
  const archetype = exact ? { ...registered, size: size! } : registered;
  const edges = roomEdges(room.polygon);
  if (edges.length === 0) return null;

  const placed = existing.filter((i) => i.roomId === room.id);
  const occupied: Box[] = [
    ...doorKeepouts(room, edges),
    ...obstacles,
    ...placed
      .filter((i) => !ARCHETYPES[i.kind]?.ghost)
      .map((i) => boxFor({ position: i.position, rotation: i.rotation, size: i.size, elevationM: i.elevationM })),
  ];
  const index = placed.filter((i) => i.kind === kind).length;
  const pose = resolvePose(archetype, index, room, edges, placed, occupied, { exact }) ?? placeAnywhere(archetype, room, edges, occupied);
  if (!pose) return null;
  return {
    id: `${room.id}-${kind}-extra-${index}`,
    roomId: room.id,
    slot: archetype.slot,
    kind,
    position: pose.position,
    rotation: pose.rotation,
    elevationM: pose.elevationM,
    size: pose.size,
    product: null,
  };
}

// ---------------------------------------------------------------------------
// Placement resolution
// ---------------------------------------------------------------------------

function resolvePose(
  archetype: Archetype,
  index: number,
  room: PlanRoom,
  edges: PlanEdge[],
  placed: PlacedItem[],
  occupied: Box[],
  options: { exact?: boolean; anchors?: TechnicalAnchor[]; rng?: Rng } = {}
): Pose | null {
  const rule = archetype.placement;
  const rng = options.rng;
  // A room separator is no wall: nothing stands against it, runs along it or hangs on it.
  const walled = edges.filter((e) => !isOpenEdge(room, e.index));

  switch (rule.type) {
    case 'wall':
      return placeAgainstWall(archetype, room, walled, occupied, rule.prefer, rule.clearanceM, options.exact ?? false, options.anchors ?? [], rng);
    case 'wall-run':
      return placeWallRun(archetype, room, walled, occupied, rule.prefer, rule.clearanceM, options.anchors ?? [], rng);
    case 'center':
      return placeCentre(archetype, room, occupied);
    case 'relative':
      return placeRelative(archetype, index, room, placed, occupied);
    case 'corner':
      return placeInCorner(archetype, room, edges, occupied, rule.clearanceM, rng);
    case 'ceiling':
      return placeOnCeiling(archetype, room, placed);
    case 'wall-mounted':
      // Over its piece when the room has one (the wall cabinets over the run, the mirror over the
      // basin, a print over the bed), else on a wall.
      return (rule.above ? placeAbove(archetype, room, walled, placed, rule) : null) ?? placeOnWall(archetype, index, room, walled, rule.heightM, placed, rng);
    case 'under':
      return placeUnder(archetype, room, placed);
    case 'window':
      return placeAtWindow(archetype, index, room, edges);
    default:
      return null;
  }
}

/** Stands the item flat against the best available wall. */
function placeAgainstWall(
  archetype: Archetype,
  room: PlanRoom,
  edges: PlanEdge[],
  occupied: Box[],
  prefer: 'longest' | 'opposite-door' | 'beside-window' | 'shortest' | 'any',
  clearanceM: number,
  exact = false,
  anchors: TechnicalAnchor[] = [],
  rng?: Rng
): Pose | null {
  const doorPoints = openingPoints(room, edges, isPassage);
  const windowPoints = openingPoints(room, edges, (o) => o.kind === 'window');

  // A wardrobe comes in many widths; a bed does not. When the standard width finds no wall,
  // storage tries narrower slots before giving up — the matcher then prefers a product that
  // fits the slot it was given. Not when the size is a real product's (`exact`): a 1.9 m
  // cabinet handed a 1.2 m slot lands on its neighbours.
  const widths = !exact && NARROWABLE.has(archetype.kind)
    ? [1, 0.8, 0.65].map((f) => archetype.size.width * f)
    : [archetype.size.width];

  for (const width of widths) {
    const found = bestAlongWalls(archetype, { ...archetype.size, width }, room, edges, occupied, prefer, clearanceM, doorPoints, windowPoints, anchors, rng);
    if (found) return found;
  }
  return null;
}

const NARROWABLE = new Set([
  'wardrobe', 'bookshelf', 'storage_shelf', 'dresser', 'tv_unit', 'console_table', 'shoe_cabinet', 'desk', 'sofa_3seat',
]);

function bestAlongWalls(
  archetype: Archetype,
  size: Size3,
  room: PlanRoom,
  edges: PlanEdge[],
  occupied: Box[],
  prefer: 'longest' | 'opposite-door' | 'beside-window' | 'shortest' | 'any',
  clearanceM: number,
  doorPoints: Vec2[],
  windowPoints: Vec2[],
  anchors: TechnicalAnchor[] = [],
  rng?: Rng
): Pose | null {
  const { width, depth, height } = size;
  const anchorPoints = anchors.map((a) => a.point);
  const spots: Array<{ value: Pose; score: number }> = [];

  for (const edge of edges) {
    if (edge.length < width + 0.25) continue;

    // Don't stand a wardrobe in a doorway or across a window.
    const blocked = room.openings.filter((o) => o.wallIndex === edge.index);

    for (const t of sampleAlong(edge, width)) {
      const anchor = pointOnEdge(edge, t);
      const centre = {
        x: anchor.x + edge.inward.x * (depth / 2 + 0.02),
        z: anchor.z + edge.inward.z * (depth / 2 + 0.02),
      };

      const pose: Pose = {
        position: centre,
        rotation: edge.facing,
        size,
        elevationM: 0,
      };

      if (!fitsInRoom(pose, room.polygon)) continue;
      if (overlapsAny(boxFor(pose), occupied)) continue;
      if (coversOpening(edge, t, width, height, blocked)) continue;

      let score = 0;
      if (prefer === 'longest') score += edge.length * 3;
      if (prefer === 'shortest') score += 30 - edge.length * 3;
      // The wall furthest from the door, not that wall's far corner: a bed pushed into the corner
      // left room for one nightstand.
      if (prefer === 'opposite-door') score += minDistance(pointOnEdge(edge, 0.5), doorPoints) * 6;
      if (prefer === 'beside-window') score += 24 - minDistance(centre, windowPoints) * 5;
      if (prefer === 'any') score += edge.length;

      // Centred on the wall looks deliberate; jammed in a corner looks accidental.
      score += (1 - Math.abs(t - 0.5) * 2) * 3;
      // A double bed wants a nightstand each side: room for both on this wall, the bed in the middle.
      if (archetype.kind === 'bed_double') {
        const reach = (width / 2 + 0.5) / edge.length;
        if (t - reach >= 0 && t + reach <= 1 && !coversOpening(edge, t, width + 1, 0.6, blocked)) score += 14;
        score += (1 - Math.abs(t - 0.5) * 2) * 6;
      }

      // Reward keeping the walking space in front of the item genuinely clear.
      const approach = clearanceBox(pose, clearanceM);
      if (fitsInRoom({ ...pose, position: boxCentre(approach), size: boxSize(approach, height) }, room.polygon)) {
        score += 8;
      }
      if (!overlapsAny(approach, occupied)) score += 12;

      // A fixture wants its pipe: the toilet by the sewer, the sink by the water. Strong
      // enough to outweigh the wall preferences, which are about looks, not plumbing.
      if (anchorPoints.length > 0) score += Math.max(0, 40 - minDistance(centre, anchorPoints) * 12);

      spots.push({ value: pose, score });
    }
  }

  // The best spot; generating, any spot close to it — another wall of similar merit, another
  // stretch of the same wall. A fixture by its pipe keeps it: the anchor's pull is far above the spread.
  return pickNearBest(spots, SPOT_SPREAD, rng);
}

/** Kitchen counters: stretch along the wall rather than sitting at a fixed width. */
function placeWallRun(
  archetype: Archetype,
  room: PlanRoom,
  edges: PlanEdge[],
  occupied: Box[],
  prefer: 'longest' | 'shortest',
  clearanceM: number,
  anchors: TechnicalAnchor[] = [],
  rng?: Rng
): Pose | null {
  const { depth, height } = archetype.size;
  // The kitchen run goes on the wall the water comes to, when the plan says where that is.
  const anchorPoints = anchors.map((a) => a.point);
  const nearAnchor = (edge: PlanEdge) => (anchorPoints.length === 0 ? 0 : minDistance(pointOnEdge(edge, 0.5), anchorPoints));
  const sorted = [...edges].sort((a, b) => {
    if (anchorPoints.length > 0) {
      const byAnchor = nearAnchor(a) - nearAnchor(b);
      if (Math.abs(byAnchor) > 0.5) return byAnchor;
    }
    return prefer === 'longest' ? b.length - a.length : a.length - b.length;
  });
  // Generating with no water point to follow, the run may take any long enough wall, the longer the likelier.
  const order = rng && anchorPoints.length === 0 ? weightedOrder(sorted, (e) => (prefer === 'longest' ? e.length : 1 / Math.max(e.length, 0.5)), rng) : sorted;

  for (const edge of order) {
    const blocked = room.openings.filter((o) => o.wallIndex === edge.index);

    // Try the full wall first, then progressively shorter runs — a counter that has to stop
    // short of a doorway is still a counter.
    for (const target of [edge.length - 0.3, edge.length * 0.7, edge.length * 0.5, 1.8]) {
      const runLength = Math.min(target, archetype.size.width * 1.6);
      if (runLength < 1.2) continue;

      for (const t of sampleAlong(edge, runLength)) {
        if (coversOpening(edge, t, runLength, height, blocked)) continue;

        const anchor = pointOnEdge(edge, t);
        const pose: Pose = {
          position: {
            x: anchor.x + edge.inward.x * (depth / 2 + 0.02),
            z: anchor.z + edge.inward.z * (depth / 2 + 0.02),
          },
          rotation: edge.facing,
          size: { width: runLength, depth, height },
          elevationM: 0,
        };

        if (!fitsInRoom(pose, room.polygon)) continue;
        if (overlapsAny(boxFor(pose), occupied)) continue;
        if (overlapsAny(clearanceBox(pose, clearanceM * 0.4), occupied)) continue;

        return pose;
      }
    }
  }

  return null;
}

/** Free-standing in the middle, nudged outward until it stops colliding. */
function placeCentre(archetype: Archetype, room: PlanRoom, occupied: Box[]): Pose | null {
  const centroid = polygonCentroid(room.polygon);
  const bounds = polygonBounds(room.polygon);

  // Lay the long axis of the item along the long axis of the room.
  const rotation = bounds.width >= bounds.depth ? 0 : Math.PI / 2;

  // A dining table in a tight kitchen is better small than absent, so the search tries a
  // couple of smaller sizes and a tighter walking gap before giving up.
  for (const [shrink, gap] of [
    [1, 0.45],
    [1, 0.32],
    [0.85, 0.32],
    [0.72, 0.26],
  ] as const) {
    const size: Size3 = {
      width: archetype.size.width * shrink,
      depth: archetype.size.depth * shrink,
      height: archetype.size.height,
    };

    for (const offset of spiralOffsets(1.8, 0.3)) {
      for (const rot of [rotation, rotation + Math.PI / 2]) {
        const pose: Pose = {
          position: { x: centroid.x + offset.x, z: centroid.z + offset.z },
          rotation: rot,
          size,
          elevationM: 0,
        };
        if (!fitsInRoom(pose, room.polygon)) continue;
        // Free-standing items need space all round, not just their own footprint.
        if (overlapsAny(inflate(boxFor(pose), gap), occupied)) continue;
        return pose;
      }
    }
  }

  return null;
}

/** Positioned off an already-placed anchor (coffee table off the sofa, chairs off the table). */
function placeRelative(
  archetype: Archetype,
  index: number,
  room: PlanRoom,
  placed: PlacedItem[],
  occupied: Box[]
): Pose | null {
  const rule = archetype.placement;
  if (rule.type !== 'relative') return null;

  const anchor = [...placed].reverse().find((p) => p.slot === rule.to);
  if (!anchor) return null;

  // Dining chairs are the one case that wants a ring rather than a single offset.
  if (archetype.slot === 'dining_chair') {
    return placeSeatAroundTable(archetype, index, anchor, room, occupied);
  }

  const forward = { x: Math.sin(anchor.rotation), z: Math.cos(anchor.rotation) };
  const right = { x: forward.z, z: -forward.x };

  // Paired items (two nightstands) mirror across the anchor; a single item will take
  // whichever side is free.
  const preferredSide = index % 2 === 0 ? 1 : -1;

  let rotation = anchor.rotation;
  if (rule.align === 'facing') rotation = anchor.rotation + Math.PI;
  if (rule.align === 'sideways') rotation = anchor.rotation + Math.PI / 2;

  const tries = relativeSpots(archetype, rule, anchor, room, preferredSide);
  for (const { forward: ahead, lateral } of tries) {
    const position = {
      x: anchor.position.x + forward.x * ahead + right.x * lateral,
      z: anchor.position.z + forward.z * ahead + right.z * lateral,
    };
    const pose: Pose = { position, rotation, size: archetype.size, elevationM: 0 };
    if (!fitsInRoom(pose, room.polygon)) continue;
    if (overlapsAny(boxFor(pose), occupied)) continue;
    return pose;
  }

  return null;
}

/**
 * Where a piece placed off another may stand, best first, as (metres ahead of the anchor's
 * centre, metres to its right). Measured from both pieces' sizes where the rule says so
 * (`gapM`, `beside`, `toWall`), so the pair still looks arranged when products of other sizes
 * fill them: the matcher re-measures with the real sizes (`relativeOffset`).
 */
function relativeSpots(
  archetype: Archetype,
  rule: Extract<Archetype['placement'], { type: 'relative' }>,
  anchor: PlacedItem,
  room: PlanRoom,
  preferredSide: number
): Array<{ forward: number; lateral: number }> {
  const out: Array<{ forward: number; lateral: number }> = [];
  const size = archetype.size;
  if (rule.beside != null) {
    // A nightstand: its back in line with the bed's back (the wall), just off the bed's side.
    const ahead = -anchor.size.depth / 2 + size.depth / 2;
    for (const extra of [0, 0.1]) {
      const lateral = anchor.size.width / 2 + size.width / 2 + rule.beside + extra;
      out.push({ forward: ahead, lateral: lateral * preferredSide }, { forward: ahead, lateral: -lateral * preferredSide });
    }
    return out;
  }
  const laterals =
    rule.lateral === 0
      ? [0, 0.45, -0.45, 0.9, -0.9]
      : [rule.lateral * preferredSide, -rule.lateral * preferredSide];
  if (rule.toWall) {
    // The TV unit: back to the wall the sofa faces, when that wall is a sensible way off.
    const forward = { x: Math.sin(anchor.rotation), z: Math.cos(anchor.rotation) };
    const reach = rayToOutline(anchor.position, forward, room.polygon);
    if (reach != null) {
      const ahead = reach - size.depth / 2 - 0.02;
      const clear = ahead - size.depth / 2 - anchor.size.depth / 2;
      if (clear >= 1.5 && clear <= 4.2) for (const lateral of laterals) out.push({ forward: ahead, lateral });
    }
  }
  if (rule.gapM != null) {
    // The coffee table this far off the sofa's front (a little nearer or further when it must).
    const base = anchor.size.depth / 2 + rule.gapM + size.depth / 2;
    for (const ahead of [base, base - 0.08, base + 0.12, base + 0.25]) for (const lateral of laterals) out.push({ forward: ahead, lateral });
    return out;
  }
  // If the ideal spot is taken, pull the item in towards the anchor before giving up.
  // A centred item (lateral 0) is instead nudged sideways in growing steps — a television
  // a little off the sofa's axis beats no television, and it is usually a door that sits
  // exactly on that axis.
  for (const shrink of [1, 0.82, 0.66, 0.5, 0.38]) for (const lateral of laterals) out.push({ forward: rule.forward * shrink, lateral });
  return out;
}

/** How far from `from`, along the unit direction `dir`, the ray first meets the outline; null if never. */
function rayToOutline(from: Vec2, dir: Vec2, polygon: Vec2[]): number | null {
  let best: number | null = null;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const denom = dir.x * ez - dir.z * ex;
    if (Math.abs(denom) < 1e-9) continue;
    const t = ((a.x - from.x) * ez - (a.z - from.z) * ex) / denom;
    const u = ((a.x - from.x) * dir.z - (a.z - from.z) * dir.x) / denom;
    if (t > 1e-6 && u >= -1e-6 && u <= 1 + 1e-6 && (best == null || t < best)) best = t;
  }
  return best;
}

/** Seats spaced around a table, each turned to face it. */
function placeSeatAroundTable(
  archetype: Archetype,
  index: number,
  table: PlacedItem,
  room: PlanRoom,
  occupied: Box[]
): Pose | null {
  const seats = seatSlots(table, archetype.size.depth);
  if (index >= seats.length) return null;

  const slot = seats[index];
  const tableBox = boxFor({ position: table.position, rotation: table.rotation, size: table.size, elevationM: 0 });
  // Chairs tuck under the table, so only test against everything else.
  const others = occupied.filter((b) => !overlaps(b, tableBox));

  // Every chair stands a little under the table already (`seatSlots`); it is pushed in further
  // each time the room turns out to be tight — a chair half under the table is what a tight
  // kitchen looks like anyway.
  const toTable = normalise({ x: table.position.x - slot.position.x, z: table.position.z - slot.position.z });
  for (const tuck of [0, 0.1, 0.18]) {
    const pose: Pose = {
      position: { x: slot.position.x + toTable.x * tuck, z: slot.position.z + toTable.z * tuck },
      rotation: slot.rotation,
      size: archetype.size,
      elevationM: 0,
    };
    if (!fitsInRoom(pose, room.polygon)) continue;
    if (overlapsAny(boxFor(pose), others)) continue;
    return pose;
  }
  return null;
}

/**
 * How far a dining chair's seat stands under its table's edge, as the table is laid: pushed
 * in, the way chairs are left at a table — a chair standing clear of the edge looked set out
 * for a photograph rather than lived with.
 */
export const DINING_CHAIR_TUCK_M = 0.12;

/**
 * Seat positions around a rectangular table: along both long sides first, then the ends, each
 * chair (`chairDepth` deep) with its seat `DINING_CHAIR_TUCK_M` under the edge. The gap per
 * seat (0.56 m) is the usual elbow-room allowance.
 */
export function seatSlots(table: Pick<PlacedItem, 'position' | 'rotation' | 'size'>, chairDepth = 0.5): Array<{ position: Vec2; rotation: number }> {
  const forward = { x: Math.sin(table.rotation), z: Math.cos(table.rotation) };
  const right = { x: forward.z, z: -forward.x };

  const perSide = Math.max(1, Math.min(4, Math.floor(table.size.width / 0.56)));
  const out = chairDepth / 2 - DINING_CHAIR_TUCK_M;
  const sideOffset = table.size.depth / 2 + out;
  const endOffset = table.size.width / 2 + out;

  const slots: Array<{ position: Vec2; rotation: number }> = [];

  for (let side = 0; side < 2; side++) {
    const sign = side === 0 ? 1 : -1;
    for (let i = 0; i < perSide; i++) {
      const spread = (i - (perSide - 1) / 2) * (table.size.width / perSide);
      slots.push({
        position: {
          x: table.position.x + right.x * spread + forward.x * sideOffset * sign,
          z: table.position.z + right.z * spread + forward.z * sideOffset * sign,
        },
        rotation: table.rotation + (sign === 1 ? Math.PI : 0),
      });
    }
  }

  if (table.size.depth >= 0.82) {
    for (const sign of [1, -1]) {
      slots.push({
        position: {
          x: table.position.x + right.x * endOffset * sign,
          z: table.position.z + right.z * endOffset * sign,
        },
        rotation: table.rotation + (sign === 1 ? -Math.PI / 2 : Math.PI / 2),
      });
    }
  }

  // Interleave the two long sides so a table that only fits four seats still looks balanced.
  const ordered: typeof slots = [];
  for (let i = 0; i < perSide; i++) {
    ordered.push(slots[i]);
    if (slots[perSide + i]) ordered.push(slots[perSide + i]);
  }
  ordered.push(...slots.slice(perSide * 2));
  return ordered;
}

function seatCountFor(archetype: Archetype, placed: PlacedItem[]): number {
  const table = [...placed].reverse().find((p) => p.slot === 'dining_table');
  if (!table) return 0;
  return seatSlots(table).length;
}

/** Tucks the item into whichever corner has the most room left. */
function placeInCorner(
  archetype: Archetype,
  room: PlanRoom,
  edges: PlanEdge[],
  occupied: Box[],
  clearanceM: number,
  rng?: Rng
): Pose | null {
  const { width, depth } = archetype.size;
  const inset = Math.max(width, depth) / 2 + clearanceM * 0.4;

  const spots: Array<{ value: Pose; score: number }> = [];

  for (let i = 0; i < room.polygon.length; i++) {
    const corner = room.polygon[i];
    const prev = edges[(i - 1 + edges.length) % edges.length];
    const next = edges[i % edges.length];
    if (!prev || !next) continue;

    // Step diagonally inward, away from both walls meeting at this corner.
    const inward = normalise({
      x: prev.inward.x + next.inward.x,
      z: prev.inward.z + next.inward.z,
    });

    const pose: Pose = {
      position: { x: corner.x + inward.x * inset, z: corner.z + inward.z * inset },
      rotation: next.facing,
      size: archetype.size,
      elevationM: 0,
    };

    if (!fitsInRoom(pose, room.polygon)) continue;
    if (overlapsAny(inflate(boxFor(pose), 0.1), occupied)) continue;

    // Prefer the emptiest corner.
    const crowding = occupied.reduce(
      (sum, box) => sum + 1 / (1 + distanceToBox(pose.position, box)),
      0
    );
    spots.push({ value: pose, score: -crowding });
  }

  // The emptiest corner; generating, any corner nearly as empty.
  return pickNearBest(spots, 1, rng);
}

/**
 * Any free floor at all, for a piece the wall rules could not seat. A grid over the room in
 * both orientations; the spot nearest a wall wins and turns to face into the room, the middle
 * of the floor is the last resort. Explicit adds only — the initial layout has taste, this
 * has patience — and it never returns a spot that overlaps anything, so an add that does land
 * is a valid placement, not a red one.
 */
function placeAnywhere(archetype: Archetype, room: PlanRoom, edges: PlanEdge[], occupied: Box[]): Pose | null {
  const { width, depth } = archetype.size;
  const bounds = polygonBounds(room.polygon);
  const step = 0.1;
  const margin = 0.02;
  let best: { pose: Pose; score: number } | null = null;

  for (const rotation of [0, Math.PI / 2]) {
    const sideways = rotation !== 0;
    const halfX = (sideways ? depth : width) / 2;
    const halfZ = (sideways ? width : depth) / 2;
    for (let x = bounds.minX + halfX + margin; x <= bounds.maxX - halfX - margin + 1e-9; x += step) {
      for (let z = bounds.minZ + halfZ + margin; z <= bounds.maxZ - halfZ - margin + 1e-9; z += step) {
        const pose: Pose = { position: { x, z }, rotation, size: archetype.size, elevationM: 0 };
        if (!fitsInRoom(pose, room.polygon)) continue;
        if (overlapsAny(boxFor(pose), occupied)) continue;

        // Distance from the item's back to the nearest wall it is parallel to.
        let nearest: { edge: PlanEdge; gap: number } | null = null;
        for (const edge of edges) {
          const parallel = Math.abs(Math.abs(Math.sin(edge.facing)) - Math.abs(Math.sin(rotation))) < 1e-6;
          if (!parallel) continue;
          const toItem = { x: pose.position.x - edge.a.x, z: pose.position.z - edge.a.z };
          const gap = toItem.x * edge.inward.x + toItem.z * edge.inward.z - depth / 2;
          if (gap < -1e-6) continue;
          if (!nearest || gap < nearest.gap) nearest = { edge, gap };
        }
        const score = -(nearest?.gap ?? 100);
        if (!best || score > best.score) {
          // Against a wall the piece turns its back to it, like everything the layout places.
          const facing = nearest && nearest.gap < 0.3 ? nearest.edge.facing : rotation;
          best = { pose: { ...pose, rotation: facing }, score };
        }
      }
    }
  }

  return best?.pose ?? null;
}

function placeOnCeiling(
  archetype: Archetype,
  room: PlanRoom,
  placed: PlacedItem[]
): Pose | null {
  // Hang it over the table if there is one, otherwise over the middle of the room.
  const table = placed.find((p) => p.slot === 'dining_table' || p.slot === 'kitchen_island');
  const position = table ? table.position : polygonCentroid(room.polygon);

  return {
    position,
    rotation: 0,
    size: archetype.size,
    elevationM: room.heightM - archetype.size.height,
  };
}

function placeOnWall(
  archetype: Archetype,
  index: number,
  room: PlanRoom,
  edges: PlanEdge[],
  heightM: number,
  placed: PlacedItem[] = [],
  rng?: Rng
): Pose | null {
  const { width, depth, height } = archetype.size;
  const longestFirst = edges.filter((e) => e.length >= width + 0.3).sort((a, b) => b.length - a.length);
  // Generating, a print or a mirror may hang on any wall wide enough, the longer the likelier.
  const candidates = rng ? weightedOrder(longestFirst, (e) => e.length, rng) : longestFirst;

  // A small bathroom has an opening on nearly every wall, so look for a clear stretch of
  // wall rather than a wall with nothing on it at all.
  let skipped = 0;
  for (const edge of candidates) {
    const blocked = room.openings.filter((o) => o.wallIndex === edge.index);
    for (const t of sampleAlong(edge, width)) {
      if (coversOpening(edge, t, width, heightM + height / 2, blocked)) continue;

      const anchor = pointOnEdge(edge, t);
      const pose: Pose = {
        position: {
          x: anchor.x + edge.inward.x * (depth / 2 + 0.01),
          z: anchor.z + edge.inward.z * (depth / 2 + 0.01),
        },
        rotation: edge.facing,
        size: archetype.size,
        elevationM: heightM - height / 2,
      };
      // Not into what stands below it: a mirror hung over the washing machine, a print behind the wardrobe.
      if (hangsIntoFloorPiece(pose, placed)) continue;
      if (skipped++ < index) continue;
      return pose;
    }
  }

  return null;
}

/**
 * Hung over a piece standing against a wall — the wall cabinets over the kitchen run, the mirror
 * over the basin, a print over the bed: on the same wall and centred over it, its middle at
 * `aboveHeightM` (or `heightM`) and at least 15 cm over the piece's top. The cabinets are as long
 * as the run (`stretch`), shortened and slid along it where the full length would cross a window
 * or a door; anything else keeps its own width, no wider than the piece. Null when the room has
 * none of those pieces, or no stretch over it is clear.
 */
function placeAbove(
  archetype: Archetype,
  room: PlanRoom,
  edges: PlanEdge[],
  placed: PlacedItem[],
  rule: Extract<Archetype['placement'], { type: 'wall-mounted' }>
): Pose | null {
  const slots = Array.isArray(rule.above) ? rule.above : rule.above ? [rule.above] : [];
  const under = slots.map((slot) => placed.find((p) => p.slot === slot)).find(Boolean);
  if (!under) return null;
  const { depth, height } = archetype.size;
  const middle = Math.max(rule.aboveHeightM ?? rule.heightM, rule.stretch ? 0 : under.size.height + 0.15 + height / 2);
  const forward = { x: Math.sin(under.rotation), z: Math.cos(under.rotation) };
  const back = { x: under.position.x - forward.x * (under.size.depth / 2), z: under.position.z - forward.z * (under.size.depth / 2) };
  // The wall it stands against: one that faces as it does, the nearest to its back.
  let wall: { edge: PlanEdge; t: number; distance: number } | null = null;
  for (const edge of edges) {
    const turn = edge.facing - under.rotation;
    if (Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) > 0.1) continue;
    const dx = edge.b.x - edge.a.x;
    const dz = edge.b.z - edge.a.z;
    const t = ((back.x - edge.a.x) * dx + (back.z - edge.a.z) * dz) / (edge.length * edge.length);
    const at = pointOnEdge(edge, Math.min(1, Math.max(0, t)));
    const distance = Math.hypot(back.x - at.x, back.z - at.z);
    if (!wall || distance < wall.distance) wall = { edge, t, distance };
  }
  if (!wall || wall.distance > 0.3) return null;
  const { edge, t: centre } = wall;
  const blocked = room.openings.filter((o) => o.wallIndex === edge.index);
  const widths = rule.stretch
    ? [1, 0.75, 0.5].map((f) => under.size.width * f).filter((w) => w >= 0.6)
    : [Math.min(archetype.size.width, Math.max(under.size.width, 0.4))];
  for (const width of widths) {
    const slack = rule.stretch ? (under.size.width - width) / 2 : 0;
    for (const offset of [0, -slack, slack, -slack / 2, slack / 2]) {
      const t = centre + offset / edge.length;
      if (t - width / 2 / edge.length < 0 || t + width / 2 / edge.length > 1) continue;
      if (coversOpening(edge, t, width, middle + height / 2, blocked)) continue;
      const anchor = pointOnEdge(edge, t);
      const pose: Pose = {
        position: { x: anchor.x + edge.inward.x * (depth / 2 + 0.01), z: anchor.z + edge.inward.z * (depth / 2 + 0.01) },
        rotation: edge.facing,
        size: { ...archetype.size, width },
        elevationM: middle - height / 2,
      };
      if (hangsIntoFloorPiece(pose, placed.filter((p) => p !== under))) continue;
      return pose;
    }
  }
  return null;
}

/** Whether a piece hung on a wall would cut into something standing on the floor below it. */
function hangsIntoFloorPiece(pose: Pose, placed: PlacedItem[]): boolean {
  const box = boxFor(pose);
  return placed.some((p) => {
    if (ARCHETYPES[p.kind]?.ghost || p.elevationM > 0.05) return false;
    if (p.size.height <= pose.elevationM - 0.02) return false;
    return overlaps(box, boxFor({ position: p.position, rotation: p.rotation, size: p.size, elevationM: 0 }));
  });
}

/** Rugs: sized to the item they sit under, clamped so they stay inside the room. */
function placeUnder(
  archetype: Archetype,
  room: PlanRoom,
  placed: PlacedItem[]
): Pose | null {
  const rule = archetype.placement;
  if (rule.type !== 'under') return null;

  // Fall back to the room's main piece: an office has no coffee table, but a rug under the
  // desk is still the right idea.
  const anchor =
    [...placed].reverse().find((p) => p.slot === rule.to) ??
    [...placed].find((p) => !ARCHETYPES[p.kind]?.ghost);
  if (!anchor) return null;

  const bounds = polygonBounds(room.polygon);
  const size: Size3 = {
    width: Math.min(anchor.size.width + rule.padM * 2, bounds.width - 0.5),
    depth: Math.min(anchor.size.depth + rule.padM * 2, bounds.depth - 0.5),
    height: archetype.size.height,
  };

  // A rug centred on a bed would run halfway into the wall behind it, so the rug is allowed
  // to slide out into the room until it sits fully on the floor.
  const forward = { x: Math.sin(anchor.rotation), z: Math.cos(anchor.rotation) };

  for (const shrink of [1, 0.85, 0.7]) {
    for (const slide of [0, 0.3, 0.6, 0.9, 1.2]) {
      const pose: Pose = {
        position: {
          x: anchor.position.x + forward.x * slide,
          z: anchor.position.z + forward.z * slide,
        },
        rotation: anchor.rotation,
        size: { ...size, width: size.width * shrink, depth: size.depth * shrink },
        elevationM: 0,
      };
      if (fitsInRoom(pose, room.polygon)) return pose;
    }
  }

  return null;
}

function placeAtWindow(
  archetype: Archetype,
  index: number,
  room: PlanRoom,
  edges: PlanEdge[]
): Pose | null {
  const windows = room.openings.filter((o) => o.kind === 'window');
  const opening = windows[index];
  if (!opening) return null;

  const edge = edges.find((e) => e.index === opening.wallIndex);
  if (!edge) return null;

  const anchor = pointOnEdge(edge, opening.t);
  return {
    position: {
      x: anchor.x + edge.inward.x * (archetype.size.depth / 2 + 0.03),
      z: anchor.z + edge.inward.z * (archetype.size.depth / 2 + 0.03),
    },
    rotation: edge.facing,
    size: {
      width: opening.widthM + 0.45,
      depth: archetype.size.depth,
      height: Math.min(room.heightM - 0.1, opening.sillM + opening.heightM + 0.35),
    },
    elevationM: 0,
  };
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/**
 * Sample positions along a wall, centre first so centred placements win ties.
 * The range runs corner to corner — pushing a wardrobe into the corner of a busy wall is a
 * perfectly good answer, and often the only one.
 */
function sampleAlong(edge: PlanEdge, itemWidth: number): number[] {
  const margin = itemWidth / 2 / edge.length;
  if (margin >= 0.5) return [0.5];

  const lo = margin;
  const hi = 1 - margin;
  const steps = 13;
  const out = [0.5];
  for (let i = 0; i < steps; i++) {
    const t = lo + ((hi - lo) * i) / (steps - 1);
    if (Math.abs(t - 0.5) > 0.015) out.push(t);
  }
  return out.filter((t) => t >= lo - 1e-9 && t <= hi + 1e-9);
}

function boxFor(pose: Pose): Box {
  const { width, depth } = pose.size;
  // Rooms are rectilinear, so every rotation is a right angle and an AABB is exact.
  const sideways = Math.abs(Math.sin(pose.rotation)) > 0.5;
  const halfX = (sideways ? depth : width) / 2;
  const halfZ = (sideways ? width : depth) / 2;
  return {
    minX: pose.position.x - halfX,
    maxX: pose.position.x + halfX,
    minZ: pose.position.z - halfZ,
    maxZ: pose.position.z + halfZ,
  };
}

/** The walking space an item needs in front of it. */
function clearanceBox(pose: Pose, clearanceM: number): Box {
  const forward = { x: Math.sin(pose.rotation), z: Math.cos(pose.rotation) };
  const own = boxFor(pose);
  const centre = {
    x: pose.position.x + forward.x * (pose.size.depth / 2 + clearanceM / 2),
    z: pose.position.z + forward.z * (pose.size.depth / 2 + clearanceM / 2),
  };
  const halfX = Math.abs(forward.x) > 0.5 ? clearanceM / 2 : (own.maxX - own.minX) / 2;
  const halfZ = Math.abs(forward.z) > 0.5 ? clearanceM / 2 : (own.maxZ - own.minZ) / 2;
  return {
    minX: centre.x - halfX,
    maxX: centre.x + halfX,
    minZ: centre.z - halfZ,
    maxZ: centre.z + halfZ,
  };
}

function boxCentre(box: Box): Vec2 {
  return { x: (box.minX + box.maxX) / 2, z: (box.minZ + box.maxZ) / 2 };
}

function boxSize(box: Box, height: number): Size3 {
  return { width: box.maxX - box.minX, depth: box.maxZ - box.minZ, height };
}

function inflate(box: Box, by: number): Box {
  return {
    minX: box.minX - by,
    maxX: box.maxX + by,
    minZ: box.minZ - by,
    maxZ: box.maxZ + by,
  };
}

function overlaps(a: Box, b: Box): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

function overlapsAny(box: Box, boxes: Box[]): boolean {
  return boxes.some((other) => overlaps(box, other));
}

/**
 * Every corner of the footprint inside the room, not just its centre, and no wall running
 * through it (`boxInPolygon`). The corners alone stood a TV unit on the tip of a diagonal
 * partial wall, and a rug under it: all four corners were on the floor.
 */
function fitsInRoom(pose: Pose, polygon: Vec2[]): boolean {
  return boxInPolygon(boxFor(pose), polygon);
}

/** Blocks the approach to every door so furniture never lands in a doorway. */
function doorKeepouts(room: PlanRoom, edges: PlanEdge[]): Box[] {
  const boxes: Box[] = [];

  for (const opening of room.openings) {
    if (!isPassage(opening)) continue;
    const edge = edges.find((e) => e.index === opening.wallIndex);
    if (!edge) continue;

    const anchor = pointOnEdge(edge, opening.t);
    const swingDepth = opening.kind === 'archway' ? 0.55 : 0.95;
    const centre = {
      x: anchor.x + edge.inward.x * (swingDepth / 2),
      z: anchor.z + edge.inward.z * (swingDepth / 2),
    };

    const halfAlong = (opening.widthM + 0.2) / 2;
    const sideways = Math.abs(edge.dir.x) > 0.5;
    boxes.push({
      minX: centre.x - (sideways ? halfAlong : swingDepth / 2),
      maxX: centre.x + (sideways ? halfAlong : swingDepth / 2),
      minZ: centre.z - (sideways ? swingDepth / 2 : halfAlong),
      maxZ: centre.z + (sideways ? swingDepth / 2 : halfAlong),
    });
  }

  return boxes;
}

/**
 * Would an item spanning `width` at position `t` block one of these openings?
 *
 * Doors always block. Windows only block something tall enough to reach them — a sofa under
 * a window is exactly where a sofa belongs, whereas a wardrobe there is not — and a railing
 * only something taller than it: an armchair against a balcony's railing is fine.
 */
function coversOpening(
  edge: PlanEdge,
  t: number,
  width: number,
  itemHeight: number,
  openings: Opening[]
): boolean {
  const half = width / 2 / edge.length;
  const lo = t - half;
  const hi = t + half;
  return openings.some((o) => {
    if (o.kind === 'window' && itemHeight <= o.sillM + 0.05) return false;
    if (o.kind === 'railing' && itemHeight <= o.heightM + 0.05) return false;
    const oHalf = o.widthM / 2 / edge.length;
    return lo < o.t + oHalf && hi > o.t - oHalf;
  });
}

function openingPoints(
  room: PlanRoom,
  edges: PlanEdge[],
  filter: (o: Opening) => boolean
): Vec2[] {
  return room.openings.filter(filter).flatMap((o) => {
    const edge = edges.find((e) => e.index === o.wallIndex);
    return edge ? [pointOnEdge(edge, o.t)] : [];
  });
}

function minDistance(point: Vec2, others: Vec2[]): number {
  if (others.length === 0) return 0;
  return Math.min(...others.map((o) => Math.hypot(o.x - point.x, o.z - point.z)));
}

function distanceToBox(point: Vec2, box: Box): number {
  const dx = Math.max(box.minX - point.x, 0, point.x - box.maxX);
  const dz = Math.max(box.minZ - point.z, 0, point.z - box.maxZ);
  return Math.hypot(dx, dz);
}

function normalise(v: Vec2): Vec2 {
  const len = Math.hypot(v.x, v.z) || 1;
  return { x: v.x / len, z: v.z / len };
}

/** Offsets spiralling out from the origin — used to nudge a blocked centre placement. */
function spiralOffsets(maxRadius: number, step: number): Vec2[] {
  const out: Vec2[] = [{ x: 0, z: 0 }];
  for (let r = step; r <= maxRadius; r += step) {
    const points = Math.max(4, Math.round((2 * Math.PI * r) / step / 2));
    for (let i = 0; i < points; i++) {
      const angle = (i / points) * Math.PI * 2;
      out.push({ x: Math.cos(angle) * r, z: Math.sin(angle) * r });
    }
  }
  return out;
}

/** Room types the studio knows how to furnish. */
export const FURNISHABLE_ROOM_TYPES = Object.keys(ROOM_PROGRAMS) as RoomType[];

export { ARCHETYPES };
export type { ProgramEntry };
