/**
 * What the 2D editor needs to feel like a drawing tool: snapping and hit-testing.
 *
 * Snapping is what makes a wall land *on* the wall it was aimed at. In order of authority:
 * a junction within reach wins outright (it closes loops exactly), then a point on an
 * existing wall (a T-junction), then the axis lock — a wall being drawn nearly horizontal or
 * vertical is made exactly so — then alignment with any junction's x or z (the guide lines
 * CAD users expect), and finally the grid. Every snap reports the guides it used so the
 * editor can draw them.
 *
 * Pure: no DOM, no React. The editor converts pointer positions to metres and calls in.
 */

import type { Beam, Column, ElectricalPoint, TechnicalPoint, Vec2, Wall } from './types';
import { closestOnSegment, nearestWallTo, wallNodes, wallNormal, NODE_TOL_M, WALL_CLEARANCE_M } from './walls';
import { clipPolygon } from './zones';
import { polygonAreaM2, pointInPolygon } from './planGeometry';

export type SnapKind = 'node' | 'wall' | 'axis' | 'align' | 'grid';

export interface SnapGuide {
  kind: SnapKind;
  /** A point (node) or a line from `a` to `b`. */
  a: Vec2;
  b?: Vec2;
}

export interface SnapResult {
  point: Vec2;
  snappedTo: SnapKind | null;
  guides: SnapGuide[];
}

export interface SnapOptions {
  walls: Wall[];
  /** The first point of the wall being drawn: turns on the axis lock and length hints. */
  anchor?: Vec2 | null;
  /** How close (metres) something has to be to snap to it. */
  tolM: number;
  /** Grid the point falls to when nothing else claims it. */
  gridM?: number;
  /** A wall the pointer should not snap to (the one being moved). */
  ignoreWallId?: string | null;
  /** Skip the axis lock (shift held, for a wall at an angle). */
  free?: boolean;
}

const AXIS_LOCK_RAD = (7 * Math.PI) / 180;

/** The point the pointer means, after snapping. */
export function snapPoint(raw: Vec2, options: SnapOptions): SnapResult {
  const { tolM } = options;
  const walls = options.ignoreWallId ? options.walls.filter((w) => w.id !== options.ignoreWallId) : options.walls;
  const guides: SnapGuide[] = [];
  let point = { ...raw };

  // 1. A junction within reach.
  const nodes = wallNodes(walls);
  let bestNode: { node: Vec2; distance: number } | null = null;
  for (const node of nodes) {
    const distance = Math.hypot(node.x - raw.x, node.z - raw.z);
    if (distance <= tolM && (!bestNode || distance < bestNode.distance)) bestNode = { node, distance };
  }
  if (bestNode) {
    return { point: bestNode.node, snappedTo: 'node', guides: [{ kind: 'node', a: bestNode.node }] };
  }

  // 2. Axis lock from the anchor — applied before the wall snap so a T-junction still
  //    lands on the axis when both apply.
  let axis: 'x' | 'z' | null = null;
  if (options.anchor && !options.free) {
    const dx = raw.x - options.anchor.x;
    const dz = raw.z - options.anchor.z;
    const angle = Math.atan2(Math.abs(dz), Math.abs(dx));
    if (Math.hypot(dx, dz) > 0.05) {
      if (angle < AXIS_LOCK_RAD) axis = 'x';
      else if (Math.PI / 2 - angle < AXIS_LOCK_RAD) axis = 'z';
    }
    if (axis === 'x') point = { x: raw.x, z: options.anchor.z };
    if (axis === 'z') point = { x: options.anchor.x, z: raw.z };
  }

  // 3. A point on an existing wall.
  const onWall = nearestWallTo(walls, point, tolM);
  if (onWall) {
    let landed = onWall.point;
    if (axis && options.anchor) {
      // Keep the axis: where the locked line meets the wall, if it does.
      const dir = axis === 'x' ? { x: 1, z: 0 } : { x: 0, z: 1 };
      const wd = { x: onWall.wall.b.x - onWall.wall.a.x, z: onWall.wall.b.z - onWall.wall.a.z };
      const denominator = dir.x * wd.z - dir.z * wd.x;
      if (Math.abs(denominator) > 1e-9) {
        const t = ((onWall.wall.a.x - options.anchor.x) * wd.z - (onWall.wall.a.z - options.anchor.z) * wd.x) / denominator;
        const meet = { x: options.anchor.x + dir.x * t, z: options.anchor.z + dir.z * t };
        if (closestOnSegment(meet, onWall.wall.a, onWall.wall.b).distance <= NODE_TOL_M * 2) landed = meet;
      }
    }
    guides.push({ kind: 'wall', a: onWall.wall.a, b: onWall.wall.b });
    if (axis && options.anchor) guides.push({ kind: 'axis', a: options.anchor, b: landed });
    return { point: landed, snappedTo: 'wall', guides };
  }

  if (axis && options.anchor) guides.push({ kind: 'axis', a: options.anchor, b: point });

  // 4. Alignment with a junction on the free axis.
  let aligned = false;
  if (axis !== 'z') {
    const same = nodes.filter((n) => Math.abs(n.x - point.x) <= tolM).sort((p, q) => Math.abs(p.x - point.x) - Math.abs(q.x - point.x))[0];
    if (same) {
      point = { ...point, x: same.x };
      guides.push({ kind: 'align', a: same, b: point });
      aligned = true;
    }
  }
  if (axis !== 'x') {
    const same = nodes.filter((n) => Math.abs(n.z - point.z) <= tolM).sort((p, q) => Math.abs(p.z - point.z) - Math.abs(q.z - point.z))[0];
    if (same) {
      point = { ...point, z: same.z };
      guides.push({ kind: 'align', a: same, b: point });
      aligned = true;
    }
  }
  if (aligned) return { point: roundCm(point), snappedTo: 'align', guides };

  // 5. The grid.
  const grid = options.gridM ?? 0.05;
  const gridded = { x: Math.round(point.x / grid) * grid, z: Math.round(point.z / grid) * grid };
  if (axis === 'x' && options.anchor) gridded.z = options.anchor.z;
  if (axis === 'z' && options.anchor) gridded.x = options.anchor.x;
  return { point: roundCm(gridded), snappedTo: axis ? 'axis' : 'grid', guides };
}

function roundCm(p: Vec2): Vec2 {
  return { x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 };
}

export interface Rect {
  x: number;
  z: number;
  width: number;
  depth: number;
}

/**
 * Snaps a rectangle being drawn so that its walls land on existing walls: each of its four
 * wall centrelines (the drawn face pushed out by half the thickness) is pulled onto a
 * parallel wall within reach, one per axis, and the rectangle moves with it.
 *
 * Which wall wins matters. A wall that runs *alongside* the rectangle's side — the
 * neighbour it is being drawn against — always beats a wall that merely ends at the
 * rectangle's corner: the jog between a room's wall and the wall of the room above it is
 * a few centimetres, and snapping onto the wrong one left two walls a hand apart. Among
 * neighbours the longer overlap wins; a wall that only continues the rectangle's side end
 * to end still snaps when nothing runs alongside, so a room drawn next to the flat lines
 * up with it.
 *
 * The two sides of an axis snap on their own. A room drawn *between* two others has a
 * neighbour on either hand, and sliding the rectangle onto one of them left the other side
 * exactly a wall's thickness off its neighbour — the pointer had snapped both corners onto
 * the neighbours' centrelines, the rectangle is the room's inner face — which doubled that
 * wall. When both sides find a wall the rectangle is resized to meet both; when one does,
 * it slides and keeps the size that was drawn. A wall whose body the new wall would overlap
 * is always within reach, however far the view is zoomed in: two walls can share a line,
 * never half of one.
 */
export function snapRectangle(rect: Rect, walls: Wall[], thicknessM: number, tolM: number): { rect: Rect; guides: SnapGuide[] } {
  const h = thicknessM / 2;
  const guides: SnapGuide[] = [];
  const vertical = walls.filter((w) => Math.abs(w.a.x - w.b.x) < 1e-6);
  const horizontal = walls.filter((w) => Math.abs(w.a.z - w.b.z) < 1e-6);

  interface Candidate {
    delta: number;
    wall: Wall;
    /** Length the wall runs alongside the rectangle's side; negative when it only comes near. */
    overlap: number;
    /** 0 alongside, 1 end to end, 2 merely in line across the sheet. */
    rank: 0 | 1 | 2;
  }
  const better = (p: Candidate, q: Candidate | null): boolean => {
    if (!q) return true;
    if (p.rank !== q.rank) return p.rank < q.rank;
    if (p.rank === 0 && Math.abs(p.overlap - q.overlap) > 1e-6) return p.overlap > q.overlap;
    return Math.abs(p.delta) < Math.abs(q.delta);
  };
  /** The best wall for one side of the rectangle: `line` is that side's wall centreline, `from`–`to` its extent. */
  const bestFor = (candidates: Wall[], axis: 'x' | 'z', line: number, from: number, to: number): Candidate | null => {
    let best: Candidate | null = null;
    for (const wall of candidates) {
      const at = axis === 'x' ? wall.a.x : wall.a.z;
      const lo = axis === 'x' ? Math.min(wall.a.z, wall.b.z) : Math.min(wall.a.x, wall.b.x);
      const hi = axis === 'x' ? Math.max(wall.a.z, wall.b.z) : Math.max(wall.a.x, wall.b.x);
      const overlap = Math.min(hi, to) - Math.max(lo, from);
      const delta = at - line;
      // A wall alongside, one continuing the side end to end, or one merely on the same
      // line somewhere else on the sheet — the last is how two rooms get walls on one line
      // and the same width, and the board draws the line they share right across the sheet.
      const rank: 0 | 1 | 2 = overlap >= Math.min(MIN_BESIDE_M, (to - from) * 0.5) ? 0 : overlap >= -tolM ? 1 : 2;
      // Within the pointer's reach — or, for a wall alongside, close enough that the two
      // walls' bodies would overlap.
      const reach = rank === 0 ? Math.max(tolM, (thicknessM + wall.thicknessM) / 2) : tolM;
      if (Math.abs(delta) > reach) continue;
      const candidate: Candidate = { delta, wall, overlap, rank };
      if (better(candidate, best)) best = candidate;
    }
    return best;
  };
  /** The guides for a side that snapped: the wall itself when it is there beside or in line, and the line the two share, right across the sheet. */
  const guidesFor = (hit: Candidate, axis: 'x' | 'z', from: number, to: number): void => {
    if (hit.rank <= 1) guides.push({ kind: 'wall', a: hit.wall.a, b: hit.wall.b });
    const at = axis === 'x' ? hit.wall.a.x : hit.wall.a.z;
    const mid = (from + to) / 2;
    const a = axis === 'x' ? { x: at, z: mid } : { x: mid, z: at };
    guides.push({ kind: 'align', a, b: axis === 'x' ? { x: at, z: mid + 1 } : { x: mid + 1, z: at } });
  };
  /** Start and size along one axis after snapping its two sides. */
  const snapAxis = (candidates: Wall[], axis: 'x' | 'z', start: number, size: number, from: number, to: number): { start: number; size: number } => {
    const low = bestFor(candidates, axis, start - h, from, to);
    const high = bestFor(candidates, axis, start + size + h, from, to);
    if (low && high && low.wall.id !== high.wall.id) {
      const snappedStart = start + low.delta;
      const snappedSize = start + size + high.delta - snappedStart;
      if (snappedSize >= MIN_SNAPPED_SIZE_M) {
        guidesFor(low, axis, from, to);
        guidesFor(high, axis, from, to);
        return { start: snappedStart, size: snappedSize };
      }
    }
    const one = low && high ? (better(low, high) ? low : high) : (low ?? high);
    if (!one) return { start, size };
    guidesFor(one, axis, from, to);
    return { start: start + one.delta, size };
  };

  const x = snapAxis(vertical, 'x', rect.x, rect.width, rect.z, rect.z + rect.depth);
  const z = snapAxis(horizontal, 'z', rect.z, rect.depth, x.start, x.start + x.size);
  // To the millimetre, like the walls themselves: a 15 cm wall puts the face 7.5 cm off its line.
  return { rect: { x: round3(x.start), z: round3(z.start), width: round3(x.size), depth: round3(z.size) }, guides };
}

/**
 * Where rooms being dragged should land: the pointer's travel, pulled onto the walls nearby.
 *
 * Each axis looks for a wall of the travellers and a parallel wall staying behind whose
 * centrelines the move would bring close, and closes the distance exactly — a room pushed up
 * against its neighbour ends with one wall between them, not two a hand apart, which is what
 * every broken outline on this board used to start from. Three kinds of neighbour, in order
 * of authority, the nearest within a kind:
 *
 *   1. a wall that would run *alongside* the traveller's — the room it is being pushed
 *      against. Within reach for as long as the two bodies would overlap, however far the
 *      view is zoomed in, because two walls may share a line but never half of one;
 *   2. a wall that continues the traveller's end to end — the flat it is being lined up with;
 *   3. a wall anywhere else on the sheet that it would line up with — the guide CAD users
 *      expect, so two rooms across a courtyard can still be squared with each other.
 *
 * An axis nothing claims falls to the grid. Every snap reports a guide: the full-sheet line
 * the two walls now share, and for a neighbour alongside, the neighbour's wall itself.
 */
export function snapRoomMove(moving: Wall[], staying: Wall[], raw: Vec2, options: { tolM: number; gridM: number }): { delta: Vec2; guides: SnapGuide[] } {
  const { tolM, gridM } = options;
  const vertical = (w: Wall) => Math.abs(w.a.x - w.b.x) < 1e-6;
  const horizontal = (w: Wall) => Math.abs(w.a.z - w.b.z) < 1e-6;

  interface Candidate {
    delta: number;
    mover: Wall;
    wall: Wall;
    /** 0 alongside, 1 end to end, 2 merely in line. */
    rank: 0 | 1 | 2;
    overlap: number;
  }
  const better = (p: Candidate, q: Candidate | null): boolean => {
    if (!q) return true;
    if (p.rank !== q.rank) return p.rank < q.rank;
    if (Math.abs(Math.abs(p.delta) - Math.abs(q.delta)) > 1e-6) return Math.abs(p.delta) < Math.abs(q.delta);
    return p.overlap > q.overlap;
  };
  /** The best pair on one axis; `other` is the travel already decided (or guessed) on the other axis. */
  const bestFor = (axis: 'x' | 'z', travel: number, other: number): Candidate | null => {
    const pick = axis === 'x' ? vertical : horizontal;
    const line = (w: Wall) => (axis === 'x' ? w.a.x : w.a.z);
    const span = (w: Wall): [number, number] => (axis === 'x' ? [Math.min(w.a.z, w.b.z), Math.max(w.a.z, w.b.z)] : [Math.min(w.a.x, w.b.x), Math.max(w.a.x, w.b.x)]);
    const theirs = staying.filter(pick);
    let best: Candidate | null = null;
    for (const mover of moving.filter(pick)) {
      const [from, to] = span(mover).map((v) => v + other) as [number, number];
      for (const wall of theirs) {
        const [lo, hi] = span(wall);
        const overlap = Math.min(hi, to) - Math.max(lo, from);
        const rank = overlap >= Math.min(MIN_BESIDE_M, (to - from) * 0.5) ? 0 : overlap >= -tolM ? 1 : 2;
        const reach = rank === 0 ? Math.max(tolM * BESIDE_REACH, (mover.thicknessM + wall.thicknessM) / 2 + WALL_CLEARANCE_M) : tolM;
        const delta = line(wall) - (line(mover) + travel);
        if (Math.abs(delta) > reach) continue;
        const candidate: Candidate = { delta, mover, wall, rank, overlap };
        if (better(candidate, best)) best = candidate;
      }
    }
    return best;
  };
  const grid = (v: number) => Math.round(v / gridM) * gridM;

  const x = bestFor('x', raw.x, raw.z);
  const dx = x ? raw.x + x.delta : grid(raw.x);
  const z = bestFor('z', raw.z, dx);
  const dz = z ? raw.z + z.delta : grid(raw.z);
  const delta = { x: round3(dx), z: round3(dz) };

  const guides: SnapGuide[] = [];
  for (const hit of [x, z]) {
    if (!hit) continue;
    const moved = { x: (hit.mover.a.x + hit.mover.b.x) / 2 + delta.x, z: (hit.mover.a.z + hit.mover.b.z) / 2 + delta.z };
    const at = closestOnSegment(moved, hit.wall.a, hit.wall.b).point;
    // The line the two walls share, right across the sheet; `drawGuides` takes its direction
    // from the two points, which lie along it — so they must not coincide.
    const along = hit === x ? { x: at.x, z: at.z + 1 } : { x: at.x + 1, z: at.z };
    guides.push({ kind: 'align', a: at, b: Math.hypot(moved.x - at.x, moved.z - at.z) > 0.05 ? moved : along });
    if (hit.rank === 0) guides.push({ kind: 'wall', a: hit.wall.a, b: hit.wall.b });
  }
  return { delta, guides };
}

/** A wall alongside is worth reaching further for than a line to square up with. */
const BESIDE_REACH = 1.6;

/**
 * Where a wall dragged sideways should land: its travel along its normal, pulled onto the
 * line of a parallel wall it comes close to — one continuing it end to end, or one merely in
 * line somewhere else on the sheet — so two rooms end up with their walls on one line, and
 * the board draws that line right across the sheet while the wall is in hand. A wall that
 * runs *alongside* is left alone: landing on its line would put one wall inside another,
 * and the drop is what says no to that.
 */
export function snapWallOffset(wall: Wall, others: Wall[], distance: number, tolM: number): { distance: number; guides: SnapGuide[] } {
  const isVertical = (w: Pick<Wall, 'a' | 'b'>) => Math.abs(w.a.x - w.b.x) < 1e-6;
  const isHorizontal = (w: Pick<Wall, 'a' | 'b'>) => Math.abs(w.a.z - w.b.z) < 1e-6;
  if (!isVertical(wall) && !isHorizontal(wall)) return { distance, guides: [] };
  const axis: 'x' | 'z' = isVertical(wall) ? 'x' : 'z';
  const n = wallNormal(wall);
  const sign = axis === 'x' ? n.x : n.z;
  const line = (w: Wall) => (axis === 'x' ? w.a.x : w.a.z);
  const span = (w: Wall): [number, number] => (axis === 'x' ? [Math.min(w.a.z, w.b.z), Math.max(w.a.z, w.b.z)] : [Math.min(w.a.x, w.b.x), Math.max(w.a.x, w.b.x)]);
  const [from, to] = span(wall);
  const moved = line(wall) + sign * distance;
  let best: { delta: number; wall: Wall; rank: 1 | 2; overlap: number } | null = null;
  for (const other of others) {
    if (other.id === wall.id || !(axis === 'x' ? isVertical(other) : isHorizontal(other))) continue;
    const [lo, hi] = span(other);
    const overlap = Math.min(hi, to) - Math.max(lo, from);
    if (overlap >= Math.min(MIN_BESIDE_M, (to - from) * 0.5)) continue;
    const rank: 1 | 2 = overlap >= -tolM ? 1 : 2;
    const delta = line(other) - moved;
    if (Math.abs(delta) > tolM) continue;
    if (!best || rank < best.rank || (rank === best.rank && (Math.abs(delta) < Math.abs(best.delta) - 1e-6 || (Math.abs(Math.abs(delta) - Math.abs(best.delta)) <= 1e-6 && overlap > best.overlap)))) best = { delta, wall: other, rank, overlap };
  }
  if (!best) return { distance, guides: [] };
  const at = line(best.wall);
  const mid = (from + to) / 2;
  const guides: SnapGuide[] = [];
  if (best.rank === 1) guides.push({ kind: 'wall', a: best.wall.a, b: best.wall.b });
  guides.push({ kind: 'align', a: axis === 'x' ? { x: at, z: mid } : { x: mid, z: at }, b: axis === 'x' ? { x: at, z: mid + 1 } : { x: mid + 1, z: at } });
  return { distance: round3(distance + sign * best.delta), guides };
}

/**
 * How much of an existing room a new rectangle may cover before it is refused. A rectangle
 * snapped onto its neighbour's wall shares that wall's line, and rounding can leave a sliver
 * of overlap; a real overlap is a room drawn on top of another.
 */
const MAX_OVERLAP_M2 = 0.1;

/**
 * Do these two outlines share any floor?
 *
 * Rooms are not always convex — an L-shaped living room is ordinary — so this is the plain
 * test rather than a clip: they overlap when an edge of one crosses an edge of the other, or
 * when one lies wholly inside the other. Touching along a shared wall is not overlapping,
 * which is why the outlines are pulled in by a hair first: two rooms either side of one wall
 * have their inner faces a thickness apart, but rounding can put a vertex a millimetre over.
 */
export function polygonsOverlap(a: Vec2[], b: Vec2[]): boolean {
  if (a.length < 3 || b.length < 3) return false;
  const shrunk = shrinkToCentroid(a, TOUCH_TOL_M);
  const other = shrinkToCentroid(b, TOUCH_TOL_M);
  for (let i = 0; i < shrunk.length; i++) {
    const p1 = shrunk[i];
    const p2 = shrunk[(i + 1) % shrunk.length];
    for (let j = 0; j < other.length; j++) {
      if (segmentsCross(p1, p2, other[j], other[(j + 1) % other.length])) return true;
    }
  }
  return pointInPolygon(shrunk[0], other) || pointInPolygon(other[0], shrunk);
}

/** A hair's breadth: two rooms that merely share a wall must not read as overlapping. */
const TOUCH_TOL_M = 0.02;

/** The outline pulled `by` metres towards its own centre, so touching edges come apart. */
function shrinkToCentroid(polygon: Vec2[], by: number): Vec2[] {
  const cx = polygon.reduce((s, p) => s + p.x, 0) / polygon.length;
  const cz = polygon.reduce((s, p) => s + p.z, 0) / polygon.length;
  return polygon.map((p) => {
    const dx = p.x - cx;
    const dz = p.z - cz;
    const d = Math.hypot(dx, dz) || 1;
    return { x: p.x - (dx / d) * by, z: p.z - (dz / d) * by };
  });
}

/** True when the two segments properly cross (a shared endpoint does not count). */
function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const side = (p: Vec2, q: Vec2, r: Vec2) => Math.sign((q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x));
  const d1 = side(a, b, c);
  const d2 = side(a, b, d);
  const d3 = side(c, d, a);
  const d4 = side(c, d, b);
  return d1 !== d2 && d3 !== d4 && d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0;
}

/**
 * The room a rectangle would be drawn on top of, if any.
 *
 * Overlapping rooms are not a flat: the wall graph traces the crossings as faces, so a room
 * dropped over its neighbour comes back as three or four slivers with walls running through
 * the middle of them, and there is no way to pull the mistake apart again. The board refuses
 * the rectangle instead, which is a message the person can act on.
 */
export function roomUnderRect(rect: Rect, rooms: Array<{ id: string; polygon: Vec2[] }>): string | null {
  const corners: Vec2[] = [
    { x: rect.x, z: rect.z },
    { x: rect.x + rect.width, z: rect.z },
    { x: rect.x + rect.width, z: rect.z + rect.depth },
    { x: rect.x, z: rect.z + rect.depth },
  ];
  for (const room of rooms) {
    const shared = clipPolygon(room.polygon, corners);
    if (shared.length >= 3 && polygonAreaM2(shared) > MAX_OVERLAP_M2) return room.id;
  }
  return null;
}

/** A wall has to run at least this far alongside a rectangle's side to count as its neighbour. */
const MIN_BESIDE_M = 0.3;
/** Snapping both sides never squeezes a rectangle below this. */
const MIN_SNAPPED_SIZE_M = 0.3;

// ---------------------------------------------------------------------------
// Hit tests
// ---------------------------------------------------------------------------

/** The wall under a point: within half its thickness plus `slackM` of its centreline. */
export function wallAt(walls: Wall[], point: Vec2, slackM: number): { wall: Wall; t: number; distance: number } | null {
  let best: { wall: Wall; t: number; distance: number } | null = null;
  for (const wall of walls) {
    const hit = closestOnSegment(point, wall.a, wall.b);
    if (hit.distance <= wall.thicknessM / 2 + slackM && (!best || hit.distance < best.distance)) best = { wall, t: hit.t, distance: hit.distance };
  }
  return best;
}

/** A junction under the point, if any. */
export function nodeAt(walls: Wall[], point: Vec2, tolM: number): Vec2 | null {
  let best: { node: Vec2; distance: number } | null = null;
  for (const node of wallNodes(walls)) {
    const distance = Math.hypot(node.x - point.x, node.z - point.z);
    if (distance <= tolM && (!best || distance < best.distance)) best = { node, distance };
  }
  return best?.node ?? null;
}

export function columnAt(columns: Column[], point: Vec2, slackM: number): Column | null {
  return (
    columns.find(
      (c) => Math.abs(point.x - c.position.x) <= c.widthM / 2 + slackM && Math.abs(point.z - c.position.z) <= c.depthM / 2 + slackM
    ) ?? null
  );
}

export function beamAt(beams: Beam[], point: Vec2, slackM: number): Beam | null {
  let best: { beam: Beam; distance: number } | null = null;
  for (const beam of beams) {
    const { distance } = closestOnSegment(point, beam.a, beam.b);
    if (distance <= beam.widthM / 2 + slackM && (!best || distance < best.distance)) best = { beam, distance };
  }
  return best?.beam ?? null;
}

/** The nearest point-like element (technical or electrical) within `radiusM`. */
export function pointElementAt<T extends TechnicalPoint | ElectricalPoint>(elements: T[], point: Vec2, radiusM: number): T | null {
  let best: { element: T; distance: number } | null = null;
  for (const element of elements) {
    const distance = Math.hypot(element.position.x - point.x, element.position.z - point.z);
    if (distance <= radiusM && (!best || distance < best.distance)) best = { element, distance };
  }
  return best?.element ?? null;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
