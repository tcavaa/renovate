/**
 * The geometry of a piece in its room, written once (docs/design-studio/generation-audit.md, F:
 * D1, D2, D8, X5) for the layout engine, the matcher, the studio's drag test, the rule checks, the
 * AI check, the wiring and the decor alike: which wall a piece has its back to, the floor it covers
 * (an axis box, or the quad turned with it) and whether two of them overlap, a door's clear floor,
 * and the small measures under them. Each caller passes its own tolerances — they differ on
 * purpose, and choosing one set is the owner's (X5 lists the doors') — so this module holds the
 * geometry, never a number of the rules.
 *
 * Pure: no React, no three.js.
 */

import type { PlanEdge } from './planGeometry';
import type { PlacedItem, Vec2 } from './types';

// ---------------------------------------------------------------------------
// Small measures
// ---------------------------------------------------------------------------

/** Rounded to the centimetre. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** How far a point is from the segment `a`–`b`. */
export function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = dx * dx + dz * dz;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len));
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
}

/** The middle of a piece's back, on the floor. */
export function backMiddle(item: Pick<PlacedItem, 'position' | 'rotation' | 'size'>): Vec2 {
  const forward = { x: Math.sin(item.rotation), z: Math.cos(item.rotation) };
  return { x: item.position.x - forward.x * (item.size.depth / 2), z: item.position.z - forward.z * (item.size.depth / 2) };
}

// ---------------------------------------------------------------------------
// The floor a piece covers (D2)
// ---------------------------------------------------------------------------

/** An axis-aligned box on the floor. */
export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Four corners on the floor: a piece's footprint turned with it. */
export type Quad = [Vec2, Vec2, Vec2, Vec2];

/** A rotation's cosine or sine this small is a right angle's floating-point noise, not a turn. */
const RIGHT_ANGLE_EPS = 1e-9;

/**
 * The cosine and sine of a rotation, exact at the right angles furniture stands at.
 * `Math.cos(-Math.PI / 2)` is 6e-17, not 0: a bed pushed flush into a corner at −π/2 got a box
 * reaching 1e-16 m past the wall, and `boxInPolygon`'s exact corner test called it outside the room.
 */
export function rightAngleTrig(rotation: number): { cos: number; sin: number } {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  if (Math.abs(cos) < RIGHT_ANGLE_EPS) return { cos: 0, sin: Math.sign(sin) };
  if (Math.abs(sin) < RIGHT_ANGLE_EPS) return { cos: Math.sign(cos), sin: 0 };
  return { cos, sin };
}

/**
 * The axis box round a piece of `size` turned `rotation` at `position`: exact at right angles,
 * the bounding box of the turned rectangle in between (conservative). `squared`: a right angle's
 * floating-point noise taken out (`rightAngleTrig` — the studio's and the matcher's box,
 * `footprintOf`); false, the cosine and sine as they come (the layout engine's, `boxFor`).
 */
export function axisBox(position: Vec2, size: { width: number; depth: number }, rotation: number, squared: boolean): Box {
  const trig = squared ? rightAngleTrig(rotation) : { cos: Math.cos(rotation), sin: Math.sin(rotation) };
  const cos = Math.abs(trig.cos);
  const sin = Math.abs(trig.sin);
  const halfX = (size.width * cos + size.depth * sin) / 2;
  const halfZ = (size.width * sin + size.depth * cos) / 2;
  return { minX: position.x - halfX, maxX: position.x + halfX, minZ: position.z - halfZ, maxZ: position.z + halfZ };
}

/** Whether two axis boxes reach into each other by more than `tolerance` on both axes (0: any overlap; touching is none). */
export function boxesOverlap(a: Box, b: Box, tolerance: number): boolean {
  return a.minX < b.maxX - tolerance && a.maxX > b.minX + tolerance && a.minZ < b.maxZ - tolerance && a.maxZ > b.minZ + tolerance;
}

/** A piece's footprint on the floor, turned with it: back-left, back-right, front-right, front-left. */
export function turnedQuad(item: Pick<PlacedItem, 'position' | 'rotation' | 'size'>): Quad {
  const forward = { x: Math.sin(item.rotation), z: Math.cos(item.rotation) };
  const right = { x: forward.z, z: -forward.x };
  const w = item.size.width / 2;
  const d = item.size.depth / 2;
  const at = (r: number, f: number): Vec2 => ({ x: item.position.x + right.x * r + forward.x * f, z: item.position.z + right.z * r + forward.z * f });
  return [at(-w, -d), at(w, -d), at(w, d), at(-w, d)];
}

/** How far two of the rule checks' turned footprints may reach into each other and still only touch. */
export const QUAD_TOUCH_M = 0.01;

/** Whether two convex outlines overlap by more than `tolerance` (separating axes). */
export function quadsOverlap(a: Vec2[], b: Vec2[], tolerance: number): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const axis = { x: -(q.z - p.z), z: q.x - p.x };
      const len = Math.hypot(axis.x, axis.z) || 1;
      const project = (pts: Vec2[]) => pts.map((v) => (v.x * axis.x + v.z * axis.z) / len);
      const pa = project(a);
      const pb = project(b);
      if (Math.max(...pa) <= Math.min(...pb) + tolerance || Math.max(...pb) <= Math.min(...pa) + tolerance) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// A door's clear floor (X5)
// ---------------------------------------------------------------------------

/**
 * The floor in front of a door or an archway — what each caller keeps clear there, with its own
 * numbers (generation-audit X5 lists them for the owner): the opening's middle on its wall
 * (`anchor`), a point `d` metres into the room straight in front of it (`ahead`), and the
 * rectangle `widthAlong` wide across it from `from` to `to` metres in (`quad`, back-left first,
 * going round, each corner the point `ahead` and then along the wall; `box`, its axis box).
 */
export interface DoorFloor {
  anchor: Vec2;
  ahead: (d: number) => Vec2;
  quad: Quad;
  box: Box;
}

export function doorFloor(edge: Pick<PlanEdge, 'a' | 'b' | 'dir' | 'inward'>, t: number, widthAlong: number, from: number, to: number): DoorFloor {
  const anchor = { x: edge.a.x + (edge.b.x - edge.a.x) * t, z: edge.a.z + (edge.b.z - edge.a.z) * t };
  const ahead = (d: number): Vec2 => ({ x: anchor.x + edge.inward.x * d, z: anchor.z + edge.inward.z * d });
  const half = widthAlong / 2;
  const corner = (s: number, d: number): Vec2 => {
    const p = ahead(d);
    return { x: p.x + edge.dir.x * s, z: p.z + edge.dir.z * s };
  };
  const quad: Quad = [corner(-half, from), corner(half, from), corner(half, to), corner(-half, to)];
  const xs = quad.map((p) => p.x);
  const zs = quad.map((p) => p.z);
  return { anchor, ahead, quad, box: { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) } };
}

// ---------------------------------------------------------------------------
// The wall behind a piece (D1)
// ---------------------------------------------------------------------------

/** The wall a piece has its back to, and how its back stands to it. */
export interface WallBehind {
  edge: PlanEdge;
  /** Metres along the wall (from `edge.a`) of the middle of the piece's back. */
  along: number;
  /** How far the back stands out from the wall's line, metres (negative: behind it). */
  gap: number;
  /** How far the back's middle is from the wall itself — its ends included — metres. */
  distance: number;
}

/**
 * What counts as the wall behind a piece — every caller's own:
 * - `facing`: the least cosine between the way the piece looks and the way the wall faces into the
 *   room (1: square to it; `Math.cos(0.05)`: within 0.05 rad); null — any wall, whichever way.
 * - `by`: which wall is nearest — by `gap` (the back's distance out from the wall's line, the least
 *   first; a back behind a wall's line counts as on it, and of the walls it is behind the last in
 *   the room's order is taken) or by `distance` (from the wall itself, its ends included).
 * - `min`, `max`: the range of that measure a wall is taken within (inclusive).
 * - `past`: how far past either end of the wall the point `at` names may be — metres, or a share
 *   of the wall's length; null — anywhere along its line.
 * - `at`: the point of the piece `past` tests and `along` gives — its back's middle (the default)
 *   or its own middle (the builders': a vanity or a WC's box is laid along the wall from where the
 *   piece's middle is).
 * - `rank`: which of the walls that pass is taken when not by `by`'s own order — `abs` the least
 *   gap either side of the line (the first of equals), `signed` the least gap (the wall the back
 *   is furthest behind).
 */
export interface WallTest {
  facing: number | null;
  by: 'gap' | 'distance';
  min?: number;
  max: number;
  past?: number | { share: number } | null;
  at?: 'back' | 'middle';
  rank?: 'abs' | 'signed';
}

/** Of `edges`, the wall a piece has its back to by `test`, nearest first; null when none passes. */
export function wallBehind(item: Pick<PlacedItem, 'position' | 'rotation' | 'size'>, edges: readonly PlanEdge[], test: WallTest): WallBehind | null {
  const forward = { x: Math.sin(item.rotation), z: Math.cos(item.rotation) };
  const back = backMiddle(item);
  const point = test.at === 'middle' ? item.position : back;
  let best: (WallBehind & { key: number }) | null = null;
  for (const edge of edges) {
    if (test.facing != null && edge.inward.x * forward.x + edge.inward.z * forward.z < test.facing) continue;
    const along = (point.x - edge.a.x) * edge.dir.x + (point.z - edge.a.z) * edge.dir.z;
    if (test.past != null) {
      const past = typeof test.past === 'number' ? test.past : test.past.share * edge.length;
      if (along < -past || along > edge.length + past) continue;
    }
    const gap = (back.x - edge.a.x) * edge.inward.x + (back.z - edge.a.z) * edge.inward.z;
    const backAlong = point === back ? along : (back.x - edge.a.x) * edge.dir.x + (back.z - edge.a.z) * edge.dir.z;
    const s = Math.max(0, Math.min(edge.length, backAlong));
    const distance = Math.hypot(back.x - (edge.a.x + edge.dir.x * s), back.z - (edge.a.z + edge.dir.z * s));
    const value = test.by === 'gap' ? gap : distance;
    if (value < (test.min ?? -Infinity) || value > test.max) continue;
    if (test.rank) {
      const key = test.rank === 'abs' ? Math.abs(gap) : gap;
      if (!best || key < best.key) best = { edge, along, gap, distance, key };
    } else if (!best || value < best.key) best = { edge, along, gap, distance, key: test.by === 'gap' ? Math.max(0, gap) : distance };
  }
  return best && { edge: best.edge, along: best.along, gap: best.gap, distance: best.distance };
}
