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
import { closestOnSegment, nearestWallTo, wallNodes, NODE_TOL_M } from './walls';

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
    /** True for a wall that runs alongside, not one that just touches at a corner. */
    beside: boolean;
  }
  const better = (p: Candidate, q: Candidate | null): boolean => {
    if (!q) return true;
    if (p.beside !== q.beside) return p.beside;
    if (p.beside && Math.abs(p.overlap - q.overlap) > 1e-6) return p.overlap > q.overlap;
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
      if (overlap < -tolM) continue;
      const delta = at - line;
      const beside = overlap >= Math.min(MIN_BESIDE_M, (to - from) * 0.5);
      // Within the pointer's reach — or, for a wall alongside, close enough that the two
      // walls' bodies would overlap.
      const reach = beside ? Math.max(tolM, (thicknessM + wall.thicknessM) / 2) : tolM;
      if (Math.abs(delta) > reach) continue;
      const candidate = { delta, wall, overlap, beside };
      if (better(candidate, best)) best = candidate;
    }
    return best;
  };
  /** Start and size along one axis after snapping its two sides. */
  const snapAxis = (candidates: Wall[], axis: 'x' | 'z', start: number, size: number, from: number, to: number): { start: number; size: number } => {
    const low = bestFor(candidates, axis, start - h, from, to);
    const high = bestFor(candidates, axis, start + size + h, from, to);
    if (low && high && low.wall.id !== high.wall.id) {
      const snappedStart = start + low.delta;
      const snappedSize = start + size + high.delta - snappedStart;
      if (snappedSize >= MIN_SNAPPED_SIZE_M) {
        guides.push({ kind: 'wall', a: low.wall.a, b: low.wall.b }, { kind: 'wall', a: high.wall.a, b: high.wall.b });
        return { start: snappedStart, size: snappedSize };
      }
    }
    const one = low && high ? (better(low, high) ? low : high) : (low ?? high);
    if (!one) return { start, size };
    guides.push({ kind: 'wall', a: one.wall.a, b: one.wall.b });
    return { start: start + one.delta, size };
  };

  const x = snapAxis(vertical, 'x', rect.x, rect.width, rect.z, rect.z + rect.depth);
  const z = snapAxis(horizontal, 'z', rect.z, rect.depth, x.start, x.start + x.size);
  // To the millimetre, like the walls themselves: a 15 cm wall puts the face 7.5 cm off its line.
  return { rect: { x: round3(x.start), z: round3(z.start), width: round3(x.size), depth: round3(z.size) }, guides };
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
