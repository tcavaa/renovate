/**
 * Walls as lines, rooms as the loops they close.
 *
 * The person draws walls the way an architect does — a line from here to there with a
 * thickness — and the rooms fall out of the drawing: every closed loop of walls is a room,
 * whose floor is the loop offset inwards by half of each wall's thickness. That is the
 * opposite of the first version of the editor, where rooms were rectangles and the walls were
 * whatever gap was left between them; here the wall is the thing, and it is drawn once.
 *
 * Three jobs live here:
 *
 *   1. `roomsFromWalls` — the wall graph (split at every junction, dead ends pruned) is
 *      traversed face by face; the bounded faces become rooms, keeping the ids, names and
 *      doors of the rooms that stood there before, so moving one wall never loses a room's
 *      furniture.
 *   2. `wallsFromRooms` — the other direction, for plans that arrived as room polygons (the
 *      parser, the Claude reader, the calculator). Facing edges of neighbouring rooms are
 *      merged into one wall of the real thickness between them; exterior edges get a wall
 *      of the default thickness outside them. Vertices are moved onto the wall centrelines
 *      so the graph is watertight by construction.
 *   3. Edits — offset a wall, drag a junction, remove a wall, add walls that merge with
 *      collinear ones — all pure functions over `Wall[]`; the store re-derives the rooms after
 *      each.
 *
 * Pure geometry: no React, no THREE, no `window`. Tested in `tests/unit/design/walls.test.ts`.
 */

import { ROOM_TYPES } from '@/lib/calculator/constants';
import type { RoomType } from '@/lib/calculator/types';
import { pointInPolygon, polygonAreaM2, polygonCentroid, polygonPerimeterM, roomEdges, signedArea, type PlanEdge } from './planGeometry';
import { alignTwins, projectToEdge } from './openings';
import type { Column, ElementOrigin, FloorPlan, Opening, PlanRoom, Vec2, Wall } from './types';

/** The thicknesses the wall tool offers, metres — the usual block, brick and concrete walls. */
export const WALL_THICKNESS_OPTIONS_M = [0.1, 0.12, 0.15, 0.2, 0.25] as const;
export const DEFAULT_WALL_HEIGHT_M = 2.8;
/** Two wall ends closer than this are one junction. */
export const NODE_TOL_M = 0.02;
/** Edges of neighbouring rooms further apart than this are two walls, not one. */
export const MERGE_TOL_M = 0.36;
/** Bounded faces smaller than this are slivers left by near-coincident walls, not rooms. */
const MIN_ROOM_AREA_M2 = 0.6;
/** A free-standing piece of wall shorter than this is a corner sliver, not a wall. */
const MIN_ORPHAN_M = 0.3;
/** How far a door may be from its wall's new position and still be carried over without a wall id. */
const OPENING_FOLLOW_M = 0.75;
const EPS = 1e-9;

// ---------------------------------------------------------------------------
// Vector helpers
// ---------------------------------------------------------------------------

const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, z: a.z - b.z });
const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, z: a.z + b.z });
const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, z: a.z * k });
const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.z * b.z;
const cross = (a: Vec2, b: Vec2): number => a.x * b.z - a.z * b.x;
const len = (a: Vec2): number => Math.hypot(a.x, a.z);
const dist = (a: Vec2, b: Vec2): number => len(sub(a, b));
const unit = (a: Vec2): Vec2 => {
  const l = len(a);
  return l < EPS ? { x: 1, z: 0 } : { x: a.x / l, z: a.z / l };
};
/** Left-hand normal — the room's inside for a face traversed with positive area. */
const leftNormal = (dir: Vec2): Vec2 => ({ x: -dir.z, z: dir.x });

/** The direction `offsetWall` counts as positive: the wall's left-hand normal (a → b). */
export function wallNormal(wall: Pick<Wall, 'a' | 'b'>): Vec2 {
  return leftNormal(unit(sub(wall.b, wall.a)));
}
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const roundVec = (p: Vec2): Vec2 => ({ x: round3(p.x), z: round3(p.z) });

export function wallLength(wall: Pick<Wall, 'a' | 'b'>): number {
  return dist(wall.a, wall.b);
}

export function wallDirection(wall: Pick<Wall, 'a' | 'b'>): Vec2 {
  return unit(sub(wall.b, wall.a));
}

/** Nearest point on the segment ab to p, with its parameter along ab. */
export function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): { point: Vec2; t: number; distance: number } {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 < EPS ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  const point = add(a, scale(ab, t));
  return { point, t, distance: dist(p, point) };
}

/** Where the infinite lines through (p, dir) and (q, dir2) cross, or null when parallel. */
export function lineIntersection(p: Vec2, dir: Vec2, q: Vec2, dir2: Vec2): Vec2 | null {
  const denominator = cross(dir, dir2);
  if (Math.abs(denominator) < 1e-7) return null;
  const t = cross(sub(q, p), dir2) / denominator;
  return add(p, scale(dir, t));
}

// ---------------------------------------------------------------------------
// The wall graph
// ---------------------------------------------------------------------------

export interface WallGraph {
  nodes: Vec2[];
  /** Every piece of wall between two junctions. */
  edges: Array<{ a: number; b: number; wallId: string }>;
}

/**
 * Splits every wall at every junction — a crossing, a T, an end touching a middle, two
 * walls drawn over each other — and merges ends that land within `NODE_TOL_M`. What comes
 * out is a plain planar graph the face traversal can walk.
 */
export function buildWallGraph(walls: Wall[]): WallGraph {
  const cuts: number[][] = walls.map(() => [0, 1]);
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      for (const [ti, tj] of segmentCuts(walls[i], walls[j])) {
        cuts[i].push(ti);
        cuts[j].push(tj);
      }
    }
  }

  const nodes: Vec2[] = [];
  const nodeFor = (p: Vec2): number => {
    for (let i = 0; i < nodes.length; i++) if (dist(nodes[i], p) <= NODE_TOL_M) return i;
    nodes.push(p);
    return nodes.length - 1;
  };

  const edges: WallGraph['edges'] = [];
  const seen = new Set<string>();
  walls.forEach((wall, i) => {
    const length = wallLength(wall);
    if (length < NODE_TOL_M) return;
    const ts = [...new Set(cuts[i].map((t) => Math.max(0, Math.min(1, t))))].sort((a, b) => a - b);
    for (let k = 0; k + 1 < ts.length; k++) {
      if ((ts[k + 1] - ts[k]) * length < NODE_TOL_M) continue;
      const a = nodeFor(pointAt(wall, ts[k]));
      const b = nodeFor(pointAt(wall, ts[k + 1]));
      if (a === b) continue;
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ a, b, wallId: wall.id });
    }
  });
  return { nodes, edges };
}

function pointAt(wall: Pick<Wall, 'a' | 'b'>, t: number): Vec2 {
  return add(wall.a, scale(sub(wall.b, wall.a), t));
}

/** Parameters at which two walls meet: a crossing, a touch, or the ends of a collinear overlap. */
function segmentCuts(w1: Pick<Wall, 'a' | 'b'>, w2: Pick<Wall, 'a' | 'b'>): Array<[number, number]> {
  const d1 = sub(w1.b, w1.a);
  const d2 = sub(w2.b, w2.a);
  const l1 = len(d1);
  const l2 = len(d2);
  if (l1 < EPS || l2 < EPS) return [];
  const denominator = cross(d1, d2);
  const out: Array<[number, number]> = [];

  if (Math.abs(denominator) > 1e-7 * l1 * l2) {
    // Not parallel: one crossing of the infinite lines; count it when it lies on both
    // segments, a junction's tolerance either side of their ends.
    const t = cross(sub(w2.a, w1.a), d2) / denominator;
    const u = cross(sub(w2.a, w1.a), d1) / denominator;
    const slack1 = NODE_TOL_M / l1;
    const slack2 = NODE_TOL_M / l2;
    if (t >= -slack1 && t <= 1 + slack1 && u >= -slack2 && u <= 1 + slack2) out.push([t, u]);
    return out;
  }

  // Parallel: only an overlap of (nearly) the same line matters.
  const n = leftNormal(unit(d1));
  if (Math.abs(dot(sub(w2.a, w1.a), n)) > NODE_TOL_M) return out;
  const u1 = unit(d1);
  const project = (p: Vec2) => dot(sub(p, w1.a), u1) / l1;
  const s0 = project(w2.a);
  const s1 = project(w2.b);
  const lo = Math.max(0, Math.min(s0, s1));
  const hi = Math.min(1, Math.max(s0, s1));
  if (hi < lo - NODE_TOL_M / l1) return out;
  // Cut w1 at w2's ends that fall inside it, and w2 at w1's ends that fall inside it.
  const paramOn2 = (p: Vec2) => dot(sub(p, w2.a), unit(d2)) / l2;
  for (const s of [s0, s1]) if (s > 0 && s < 1) out.push([s, paramOn2(pointAt(w1, s))]);
  for (const s of [0, 1]) {
    const q = paramOn2(pointAt(w1, s));
    if (q > 0 && q < 1) out.push([s, q]);
  }
  return out;
}

/** Drops dead ends until every remaining node has at least two edges — only loops can be rooms. */
function prunedGraph(graph: WallGraph): WallGraph {
  const edges = [...graph.edges];
  for (;;) {
    const degree = new Map<number, number>();
    for (const e of edges) {
      degree.set(e.a, (degree.get(e.a) ?? 0) + 1);
      degree.set(e.b, (degree.get(e.b) ?? 0) + 1);
    }
    const kept = edges.filter((e) => (degree.get(e.a) ?? 0) >= 2 && (degree.get(e.b) ?? 0) >= 2);
    if (kept.length === edges.length) return { nodes: graph.nodes, edges: kept };
    edges.length = 0;
    edges.push(...kept);
  }
}

export interface WallFace {
  /** Node indices around the face, in the order that gives positive area. */
  nodes: number[];
  /** The wall each edge of the face lies on (`nodes[i]` → `nodes[i+1]`). */
  wallIds: string[];
}

/**
 * The bounded faces of the graph. Standing on a directed edge, the face on its left is
 * traced by always taking, at the next junction, the first edge clockwise from the one we
 * arrived along; faces that come back with positive area are the rooms, the one negative
 * face per component is the outside.
 */
export function wallFaces(graph: WallGraph): WallFace[] {
  const pruned = prunedGraph(graph);
  const { nodes, edges } = pruned;
  const around = new Map<number, Array<{ to: number; edge: number; angle: number }>>();
  edges.forEach((e, index) => {
    const angleAB = Math.atan2(nodes[e.b].z - nodes[e.a].z, nodes[e.b].x - nodes[e.a].x);
    (around.get(e.a) ?? around.set(e.a, []).get(e.a)!).push({ to: e.b, edge: index, angle: angleAB });
    (around.get(e.b) ?? around.set(e.b, []).get(e.b)!).push({ to: e.a, edge: index, angle: angleAB > 0 ? angleAB - Math.PI : angleAB + Math.PI });
  });
  for (const list of around.values()) list.sort((p, q) => p.angle - q.angle);

  const visited = new Set<string>();
  const faces: WallFace[] = [];
  for (const [start, outs] of around) {
    for (const first of outs) {
      const key = `${start}>${first.to}`;
      if (visited.has(key)) continue;
      const cycle: number[] = [];
      const wallIds: string[] = [];
      let from = start;
      let to = first.to;
      let guard = 0;
      while (guard++ < 10_000) {
        visited.add(`${from}>${to}`);
        cycle.push(from);
        wallIds.push(edges[first.edge].wallId);
        // At `to`, the edge back to `from` sits somewhere in the sorted fan; the next edge of
        // this face is the one just before it clockwise (the previous index, wrapping).
        const fan = around.get(to)!;
        const back = fan.findIndex((o) => o.to === from);
        const next = fan[(back - 1 + fan.length) % fan.length];
        wallIds[wallIds.length - 1] = edges[fan[back].edge].wallId;
        from = to;
        to = next.to;
        if (from === start && to === first.to) break;
      }
      const polygon = cycle.map((n) => nodes[n]);
      if (cycle.length >= 3 && signedArea(polygon) > MIN_ROOM_AREA_M2) faces.push({ nodes: cycle, wallIds });
    }
  }
  return faces;
}

// ---------------------------------------------------------------------------
// Faces → rooms
// ---------------------------------------------------------------------------

export interface RoomsFromWallsOptions {
  /** Rooms that stood there before: ids, names, types and doors are carried over by position. */
  previous?: PlanRoom[];
  defaultHeightM?: number;
  /** Rooms without a wall of their own take this thickness (only for legacy `wallIds` gaps). */
  defaultThicknessM?: number;
}

/**
 * The rooms the walls make. Each bounded face, offset inwards by half the thickness of each
 * of its walls, is a room; a room that overlaps a previous room takes over its identity.
 */
export function roomsFromWalls(walls: Wall[], options: RoomsFromWallsOptions = {}): PlanRoom[] {
  const graph = buildWallGraph(walls);
  const faces = wallFaces(graph);
  const byId = new Map(walls.map((w) => [w.id, w]));
  const defaultThickness = options.defaultThicknessM ?? 0.12;
  const previous = options.previous ?? [];
  const taken = new Set<string>();

  const rooms: PlanRoom[] = [];
  faces.forEach((face) => {
    const centre = face.nodes.map((n) => graph.nodes[n]);
    const thickness = face.wallIds.map((id) => byId.get(id)?.thicknessM ?? defaultThickness);
    const inner = innerPolygon(centre, thickness, face.wallIds);
    if (inner.polygon.length < 3 || polygonAreaM2(inner.polygon) < MIN_ROOM_AREA_M2) return;

    const match = matchPrevious(inner.polygon, previous, taken);
    if (match) taken.add(match.id);
    const areaM2 = round2(polygonAreaM2(inner.polygon));
    const type: RoomType = match?.type ?? guessType(areaM2);
    const heightM = match?.heightM ?? options.defaultHeightM ?? ROOM_TYPES[type].defaultHeight;
    const room: PlanRoom = {
      id: match?.id ?? `w${rooms.length + 1}-${shortHash(inner.polygon)}`,
      type,
      name: match?.name ?? `${ROOM_TYPES[type].labelKa} ${rooms.filter((r) => r.type === type).length + 1}`,
      polygon: inner.polygon,
      heightM,
      areaM2,
      perimeterM: round2(polygonPerimeterM(inner.polygon)),
      openings: [],
      wallIds: inner.wallIds,
      ...(match?.lowConfidence ? { lowConfidence: true } : {}),
      ...(match?.origin ? { origin: match.origin } : {}),
    };
    room.openings = match ? reprojectOpenings(match, room) : [];
    rooms.push(room);
  });

  // Rooms that vanished may have held doors into rooms that survived; those doors point at
  // nothing now and would draw a leaf into a wall.
  const ids = new Set(rooms.map((r) => r.id));
  for (const room of rooms) {
    room.openings = room.openings.filter((o) => !o.connectsToRoomId || ids.has(o.connectsToRoomId));
  }
  return rooms;
}

/** A stable-ish id for a new room, from where it is, so re-deriving twice gives the same id. */
function shortHash(polygon: Vec2[]): string {
  const c = polygonCentroid(polygon);
  return `${Math.round(c.x * 10)}x${Math.round(c.z * 10)}`;
}

function guessType(areaM2: number): RoomType {
  if (areaM2 < 4) return 'bathroom';
  return 'bedroom';
}

/**
 * The previous room this face replaces: the unused one whose centroid falls inside it, or
 * failing that the one it overlaps most.
 */
function matchPrevious(polygon: Vec2[], previous: PlanRoom[], taken: Set<string>): PlanRoom | null {
  const free = previous.filter((r) => !taken.has(r.id));
  const inside = free.filter((r) => pointInPolygon(polygonCentroid(r.polygon), polygon));
  if (inside.length === 1) return inside[0];
  let best: { room: PlanRoom; score: number } | null = null;
  const own = polygonAreaM2(polygon);
  for (const room of inside.length > 1 ? inside : free) {
    const overlap = boxOverlapArea(polygon, room.polygon);
    const score = overlap / Math.max(own, polygonAreaM2(room.polygon), 1e-6);
    if (score > 0.3 && (!best || score > best.score)) best = { room, score };
  }
  return best?.room ?? null;
}

function boxOverlapArea(a: Vec2[], b: Vec2[]): number {
  const box = (p: Vec2[]) => ({
    minX: Math.min(...p.map((q) => q.x)),
    maxX: Math.max(...p.map((q) => q.x)),
    minZ: Math.min(...p.map((q) => q.z)),
    maxZ: Math.max(...p.map((q) => q.z)),
  });
  const p = box(a);
  const q = box(b);
  const w = Math.min(p.maxX, q.maxX) - Math.max(p.minX, q.minX);
  const d = Math.min(p.maxZ, q.maxZ) - Math.max(p.minZ, q.minZ);
  return w > 0 && d > 0 ? w * d : 0;
}

/**
 * The floor a face encloses: each centreline edge pushed inwards by half its wall's
 * thickness, consecutive edges re-joined at the crossing of their offset lines. Two
 * different walls in line with each other (a 12 cm wall continuing as a 25 cm one) keep a
 * small jog where the thicknesses differ; two pieces of the *same* wall are merged first.
 */
export function innerPolygon(centre: Vec2[], thickness: number[], wallIds: string[]): { polygon: Vec2[]; wallIds: string[] } {
  // Merge consecutive stretches of wall that run on into one edge. What matters is the
  // thickness, not which wall object it is: since walls stopped being fused into each other
  // (`addWalls`), one side of a room is routinely two walls end to end — its neighbour's,
  // then its own — and treating that as two edges gave the room a phantom vertex, an extra
  // wall index and a finish that stopped halfway along a flat wall.
  const pts: Vec2[] = [];
  const ids: string[] = [];
  const ths: number[] = [];
  const n = centre.length;
  for (let i = 0; i < n; i++) {
    const prev = (i - 1 + n) % n;
    const dirPrev = unit(sub(centre[i], centre[prev]));
    const dirNext = unit(sub(centre[(i + 1) % n], centre[i]));
    const collinear = Math.abs(cross(dirPrev, dirNext)) < 1e-6 && dot(dirPrev, dirNext) > 0;
    if (collinear && Math.abs(thickness[prev] - thickness[i]) < 0.001) continue; // in the middle of a run
    pts.push(centre[i]);
    ids.push(wallIds[i]);
    ths.push(thickness[i]);
  }
  const m = pts.length;
  if (m < 3) return { polygon: [], wallIds: [] };

  // Offset each edge inwards, then join.
  const offsets = pts.map((p, i) => {
    const q = pts[(i + 1) % m];
    const dir = unit(sub(q, p));
    const inward = leftNormal(dir);
    const shift = scale(inward, ths[i] / 2);
    return { a: add(p, shift), b: add(q, shift), dir };
  });
  const polygon: Vec2[] = [];
  const outIds: string[] = [];
  for (let i = 0; i < m; i++) {
    const prev = offsets[(i - 1 + m) % m];
    const cur = offsets[i];
    const meet = lineIntersection(prev.a, prev.dir, cur.a, cur.dir);
    if (meet && dist(meet, cur.a) < 3) {
      polygon.push(roundVec(meet));
      outIds.push(ids[i]);
    } else {
      // Collinear neighbours of different thickness: a jog between the two offset lines.
      polygon.push(roundVec(prev.b));
      outIds.push(ids[i]);
      polygon.push(roundVec(cur.a));
      outIds.push(ids[i]);
    }
  }
  // Drop points that landed on top of each other.
  const cleanPolygon: Vec2[] = [];
  const cleanIds: string[] = [];
  polygon.forEach((p, i) => {
    const last = cleanPolygon[cleanPolygon.length - 1];
    if (last && dist(last, p) < 0.005) return;
    cleanPolygon.push(p);
    cleanIds.push(outIds[i]);
  });
  if (cleanPolygon.length > 1 && dist(cleanPolygon[0], cleanPolygon[cleanPolygon.length - 1]) < 0.005) {
    cleanPolygon.pop();
    cleanIds.pop();
  }
  return { polygon: cleanPolygon, wallIds: cleanIds };
}

/**
 * Carries a room's doors and windows onto its new outline: each opening keeps its place in
 * the world and lands on the nearest parallel edge of the new polygon; one whose wall is gone
 * is dropped.
 */
export function reprojectOpenings(previous: PlanRoom, next: PlanRoom): Opening[] {
  const oldEdges = roomEdges(previous.polygon);
  const newEdges = roomEdges(next.polygon);
  const out: Opening[] = [];
  for (const opening of previous.openings) {
    const oldEdge = oldEdges.find((e) => e.index === opening.wallIndex);
    if (!oldEdge) continue;
    const point = add(oldEdge.a, scale(sub(oldEdge.b, oldEdge.a), opening.t));
    let best: { edge: PlanEdge; distance: number } | null = null;
    // The same wall, however far it moved, when both outlines know their walls…
    const wallId = previous.wallIds?.[opening.wallIndex];
    if (wallId && next.wallIds) {
      for (const edge of newEdges) {
        if (next.wallIds[edge.index] !== wallId || Math.abs(dot(edge.dir, oldEdge.dir)) < 0.95) continue;
        const { distance } = closestOnSegment(point, edge.a, edge.b);
        if (!best || distance < best.distance) best = { edge, distance };
      }
    }
    // …otherwise the nearest parallel edge within reach.
    if (!best) {
      for (const edge of newEdges) {
        if (Math.abs(dot(edge.dir, oldEdge.dir)) < 0.95) continue;
        const { distance } = closestOnSegment(point, edge.a, edge.b);
        if (distance <= OPENING_FOLLOW_M && (!best || distance < best.distance)) best = { edge, distance };
      }
    }
    if (!best || best.edge.length < opening.widthM * 0.6) continue;
    const width = Math.min(opening.widthM, Math.max(0.5, best.edge.length - 0.3));
    out.push({ ...opening, roomId: next.id, wallIndex: best.edge.index, t: projectToEdge(best.edge, point, width), widthM: width });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rooms → walls (plans that arrived as polygons)
// ---------------------------------------------------------------------------

/**
 * Walls for a plan that came as room polygons. The polygons are the rooms' inner faces, so
 * a wall sits *outside* them: facing edges of two rooms become one wall as thick as the gap
 * between them, an edge with no neighbour gets a wall of the default thickness on its outer
 * side. Vertices are moved onto the crossings of the wall centrelines, so re-deriving the
 * rooms from these walls gives the same flat back.
 */
export function wallsFromRooms(rooms: PlanRoom[], defaultThicknessM: number, origin: ElementOrigin = 'existing'): Wall[] {
  interface Edge {
    room: number;
    index: number;
    a: Vec2;
    b: Vec2;
    dir: Vec2;
    /** Canonical normal of the line (the same for both sides of a wall). */
    n: Vec2;
    /** Offset of the face line along `n`. */
    c: number;
    /** +1 when the room lies on the +n side of its face, −1 otherwise. */
    side: 1 | -1;
    lo: number;
    hi: number;
  }
  const simplified = rooms.map((r) => simplifyPolygon(r.polygon));
  const edges: Edge[] = [];
  simplified.forEach((polygon, room) => {
    const m = polygon.length;
    for (let i = 0; i < m; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % m];
      const dir = unit(sub(b, a));
      let n = leftNormal(dir);
      let side: 1 | -1 = 1;
      if (n.x < -1e-6 || (Math.abs(n.x) <= 1e-6 && n.z < 0)) {
        n = scale(n, -1);
        side = -1;
      }
      const along = leftNormal(n); // a fixed direction along the line for the whole cluster
      edges.push({ room, index: i, a, b, dir, n, c: dot(a, n), side, lo: Math.min(dot(a, along), dot(b, along)), hi: Math.max(dot(a, along), dot(b, along)) });
    }
  });

  // Union-find over edges that lie on nearly the same line and overlap along it.
  const parent = edges.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const p = edges[i];
      const q = edges[j];
      if (dot(p.n, q.n) < Math.cos((2 * Math.PI) / 180)) continue;
      if (Math.abs(p.c - q.c) > MERGE_TOL_M) continue;
      if (p.room === q.room && Math.abs(p.c - q.c) > NODE_TOL_M) continue; // a room does not face itself
      if (Math.min(p.hi, q.hi) - Math.max(p.lo, q.lo) < -NODE_TOL_M) continue;
      parent[find(i)] = find(j);
    }
  }
  const clusters = new Map<number, Edge[]>();
  edges.forEach((e, i) => {
    const root = find(i);
    (clusters.get(root) ?? clusters.set(root, []).get(root)!).push(e);
  });

  // One centreline and thickness per cluster.
  const lineOf = new Map<Edge, { n: Vec2; c: number; thickness: number }>();
  for (const members of clusters.values()) {
    const n = members[0].n;
    const plus = members.filter((e) => e.side === 1).map((e) => e.c);
    const minus = members.filter((e) => e.side === -1).map((e) => e.c);
    const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    let c: number;
    let thickness: number;
    if (plus.length && minus.length) {
      // Rooms on both sides: the wall fills the gap between their faces.
      const cPlus = mean(plus);
      const cMinus = mean(minus);
      const gap = Math.abs(cPlus - cMinus);
      thickness = gap < 0.04 ? defaultThicknessM : Math.min(0.6, gap);
      c = (cPlus + cMinus) / 2;
    } else {
      const side = members[0].side;
      c = mean(members.map((e) => e.c)) - side * (defaultThicknessM / 2);
      thickness = defaultThicknessM;
    }
    for (const e of members) lineOf.set(e, { n, c, thickness });
  }

  // Move every vertex onto the crossing of its two edges' centrelines.
  const moved = simplified.map((polygon, room) => {
    const m = polygon.length;
    const own = edges.filter((e) => e.room === room);
    return polygon.map((v, i) => {
      const prev = lineOf.get(own[(i - 1 + m) % m])!;
      const cur = lineOf.get(own[i])!;
      const p1 = scale(prev.n, prev.c);
      const p2 = scale(cur.n, cur.c);
      const meet = lineIntersection(p1, leftNormal(prev.n), p2, leftNormal(cur.n));
      if (meet) return roundVec(meet);
      // Collinear neighbours: project the vertex onto the line.
      return roundVec(add(v, scale(cur.n, cur.c - dot(v, cur.n))));
    });
  });

  // Walls: the union of every member's extent, per cluster.
  const walls: Wall[] = [];
  let index = 0;
  for (const members of clusters.values()) {
    const line = lineOf.get(members[0])!;
    const along = leftNormal(line.n);
    const intervals = members
      .map((e) => {
        const m = moved[e.room].length;
        const a = moved[e.room][e.index];
        const b = moved[e.room][(e.index + 1) % m];
        return [Math.min(dot(a, along), dot(b, along)), Math.max(dot(a, along), dot(b, along))] as [number, number];
      })
      .sort((p, q) => p[0] - q[0]);
    const merged: Array<[number, number]> = [];
    for (const [lo, hi] of intervals) {
      const last = merged[merged.length - 1];
      if (last && lo <= last[1] + NODE_TOL_M) last[1] = Math.max(last[1], hi);
      else merged.push([lo, hi]);
    }
    for (const [lo, hi] of merged) {
      if (hi - lo < NODE_TOL_M) continue;
      const base = scale(line.n, line.c);
      walls.push({
        id: `w${++index}`,
        a: roundVec(add(base, scale(along, lo))),
        b: roundVec(add(base, scale(along, hi))),
        thicknessM: round3(line.thickness),
        origin,
      });
    }
  }
  // One wall per line of the flat would be one wall under four rooms; each junction ends it.
  return splitAtJunctions(walls);
}

/**
 * Cuts every wall where another wall meets it. A plan that arrived as polygons is built one
 * wall per line of the flat, so the partition between two rooms came out as one wall running
 * the length of the flat: selecting it selected all of it, dragging it moved four rooms, and
 * there was no such thing as *this room's* wall. Each junction now ends one wall and starts
 * the next, which is what the wall graph already does behind the scenes.
 */
export function splitAtJunctions(walls: Wall[]): Wall[] {
  const ends = walls.flatMap((w) => [w.a, w.b]);
  const out: Wall[] = [];
  for (const wall of walls) {
    const dir = unit(sub(wall.b, wall.a));
    const length = wallLength(wall);
    const cuts = [0, length];
    for (const point of ends) {
      const at = dot(sub(point, wall.a), dir);
      if (at < NODE_TOL_M || at > length - NODE_TOL_M) continue;
      // Only a junction: a point off the line is another wall passing by, not meeting.
      if (Math.abs(dot(sub(point, wall.a), leftNormal(dir))) > NODE_TOL_M) continue;
      if (!cuts.some((c) => Math.abs(c - at) < NODE_TOL_M)) cuts.push(at);
    }
    if (cuts.length === 2) {
      out.push(wall);
      continue;
    }
    cuts.sort((a, b) => a - b);
    for (let i = 0; i + 1 < cuts.length; i++) {
      out.push({ ...wall, id: i === 0 ? wall.id : `${wall.id}j${i}`, a: roundVec(add(wall.a, scale(dir, cuts[i]))), b: roundVec(add(wall.a, scale(dir, cuts[i + 1]))) });
    }
  }
  return out;
}

/** Drops vertices that sit on the straight line between their neighbours, and repeats. */
export function simplifyPolygon(polygon: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const prev = polygon[(i - 1 + n) % n];
    const cur = polygon[i];
    const next = polygon[(i + 1) % n];
    if (dist(prev, cur) < 0.005) continue;
    const d1 = unit(sub(cur, prev));
    const d2 = unit(sub(next, cur));
    if (Math.abs(cross(d1, d2)) < 1e-4 && dot(d1, d2) > 0) continue;
    out.push(cur);
  }
  return out.length >= 3 ? out : polygon;
}

/**
 * A plan with walls: converts one that arrived as polygons (the parser, the calculator, a
 * saved project from before walls existed) and re-derives its rooms from them, keeping ids,
 * names, doors and windows. A plan that already has walls comes back as it is.
 */
export function ensureWalls(plan: FloorPlan): FloorPlan {
  if (plan.walls && plan.walls.length > 0) {
    // A plan drawn before walls were cut at their junctions carries one wall under four
    // rooms; this is the hook every plan taken in passes through, so it is put right here
    // rather than waiting for the first edit.
    const cut = splitAtJunctions(plan.walls);
    return withAlignedTwins(cut.length === plan.walls.length ? plan : rebuildRooms(plan, cut));
  }
  if (plan.rooms.length === 0) return { ...plan, walls: [] };
  const walls = wallsFromRooms(plan.rooms, plan.wallThicknessM, plan.source === 'manual' ? 'user' : 'existing');
  const rooms = roomsFromWalls(walls, { previous: plan.rooms, defaultHeightM: plan.wallHeightM, defaultThicknessM: plan.wallThicknessM });
  return withAlignedTwins(withBounds({ ...plan, walls, rooms: rooms.length > 0 ? rooms : plan.rooms }));
}

/** The two halves of every interior door agree on one leaf (see `alignTwins`); same plan object when they already do. */
function withAlignedTwins(plan: FloorPlan): FloorPlan {
  const rooms = alignTwins(plan.rooms);
  return rooms === plan.rooms ? plan : { ...plan, rooms };
}

/** Recomputes `bounds` from the rooms and walls. */
export function withBounds(plan: FloorPlan): FloorPlan {
  const points = [...plan.rooms.flatMap((r) => r.polygon), ...(plan.walls ?? []).flatMap((w) => [w.a, w.b])];
  if (points.length === 0) return { ...plan, bounds: { width: 0, depth: 0 } };
  const xs = points.map((p) => p.x);
  const zs = points.map((p) => p.z);
  return { ...plan, bounds: { width: round2(Math.max(...xs) - Math.min(...xs)), depth: round2(Math.max(...zs) - Math.min(...zs)) } };
}

/**
 * The plan after its walls changed: rooms re-derived (ids and doors kept where the rooms
 * survived), bounds refreshed. Every wall edit in the store ends here.
 */
export function rebuildRooms(plan: FloorPlan, walls: Wall[]): FloorPlan {
  // A wall runs from junction to junction and no further, whatever it was drawn as. Without
  // this a partition dropped into a long wall left that wall whole underneath it: selecting
  // it selected the length of the flat and dragging it moved every room along it.
  const cut = splitAtJunctions(walls);
  const rooms = roomsFromWalls(cut, { previous: plan.rooms, defaultHeightM: plan.wallHeightM, defaultThicknessM: plan.wallThicknessM });
  return withBounds({ ...plan, walls: cut, rooms });
}

// ---------------------------------------------------------------------------
// Edits
// ---------------------------------------------------------------------------

/**
 * Adds walls without ever fusing one into another.
 *
 * Every collinear wall that touched used to be unioned, and a room drawn against its
 * neighbours therefore dissolved into them: four walls became one eleven-metre wall running
 * under three rooms, and from that moment there was no such thing as *this room's* wall —
 * nothing could be pulled apart again. Now a new wall only gives way where a wall of the
 * same thickness genuinely stands on the same stretch already (drawing over one twice), and
 * the stretches nobody holds are added exactly as drawn. A room that snapped up against its
 * neighbour keeps its own four walls and stays detachable (`moveRooms`).
 */
export function addWalls(walls: Wall[], added: Wall[]): Wall[] {
  const out = [...walls];
  for (const wall of added) {
    if (wallLength(wall) < NODE_TOL_M * 2) continue;
    out.push(...uncoveredPieces(wall, out));
  }
  return out;
}

/** The stretches of `wall` that no wall in `existing` already covers, in the order drawn. */
function uncoveredPieces(wall: Wall, existing: Wall[]): Wall[] {
  const dir = unit(sub(wall.b, wall.a));
  const along = (p: Vec2) => dot(sub(p, wall.a), dir);
  let free: Array<[number, number]> = [[0, wallLength(wall)]];
  for (const other of existing) {
    if (!collinearSameThickness(wall, other)) continue;
    const lo = Math.min(along(other.a), along(other.b));
    const hi = Math.max(along(other.a), along(other.b));
    if (hi - lo < NODE_TOL_M) continue;
    free = free.flatMap(([a, b]): Array<[number, number]> => {
      if (hi <= a + NODE_TOL_M || lo >= b - NODE_TOL_M) return [[a, b]];
      const rest: Array<[number, number]> = [];
      if (lo - a > NODE_TOL_M) rest.push([a, lo]);
      if (b - hi > NODE_TOL_M) rest.push([hi, b]);
      return rest;
    });
  }
  return free
    .filter(([a, b]) => b - a >= NODE_TOL_M * 2)
    .map(([a, b], i) => ({ ...wall, id: i === 0 ? wall.id : `${wall.id}s${i}`, a: roundVec(add(wall.a, scale(dir, a))), b: roundVec(add(wall.a, scale(dir, b))) }));
}

/** Two walls on one line, the same thickness — so one can stand for the other. */
function collinearSameThickness(w: Wall, v: Wall): boolean {
  if (Math.abs(w.thicknessM - v.thicknessM) > 0.001) return false;
  const dw = unit(sub(w.b, w.a));
  if (Math.abs(cross(dw, unit(sub(v.b, v.a)))) > 1e-3) return false;
  return Math.abs(dot(sub(v.a, w.a), leftNormal(dw))) <= NODE_TOL_M;
}

/**
 * Moves whole rooms across the plan, detaching them from the rooms staying behind.
 *
 * A wall only the moving rooms use travels with them. A wall they share with a room that
 * stays is *split*: the original stays for the room that stays, and a copy goes with the
 * movers — which is the only thing "pull this room away from that one" can mean once two
 * rooms have a wall in common. Rooms keep their identity because the previous rooms are
 * handed to `rebuildRooms` already shifted, so each moved face finds its own room again.
 */
export function moveRooms(plan: FloorPlan, roomIds: string[], delta: Vec2): FloorPlan {
  const moving = new Set(roomIds);
  const movers = plan.rooms.filter((r) => moving.has(r.id));
  if (movers.length === 0 || (Math.abs(delta.x) < 1e-4 && Math.abs(delta.z) < 1e-4)) return plan;
  const shift = (p: Vec2): Vec2 => roundVec({ x: p.x + delta.x, z: p.z + delta.z });
  const mine = new Set(movers.flatMap((r) => r.wallIds ?? []));
  const theirs = new Set(plan.rooms.filter((r) => !moving.has(r.id)).flatMap((r) => r.wallIds ?? []));
  let copies = 0;
  const walls: Wall[] = [];
  for (const wall of plan.walls ?? []) {
    if (!mine.has(wall.id)) walls.push(wall);
    else if (theirs.has(wall.id)) walls.push(wall, { ...wall, id: `${wall.id}m${++copies}`, a: shift(wall.a), b: shift(wall.b) });
    else walls.push({ ...wall, a: shift(wall.a), b: shift(wall.b) });
  }
  const previous = plan.rooms.map((r) => (moving.has(r.id) ? { ...r, polygon: r.polygon.map(shift) } : r));
  return rebuildRooms({ ...plan, rooms: previous }, walls);
}

/**
 * Slides a wall sideways by `distance` metres along its own normal (`wallNormal`; negative
 * goes the other way). Walls that end on it — at its ends or against its middle — follow,
 * so the plan stays joined up: each such end is moved to where its wall's line meets the
 * wall's new line.
 */
export function offsetWall(walls: Wall[], id: string, distance: number): Wall[] {
  const wall = walls.find((w) => w.id === id);
  if (!wall) return walls;
  const dir = wallDirection(wall);
  const normal = leftNormal(dir);
  const shift = scale(normal, distance);
  const movedA = add(wall.a, shift);
  const movedB = add(wall.b, shift);
  return walls.map((w) => {
    if (w.id === id) return { ...w, a: roundVec(movedA), b: roundVec(movedB) };
    const fix = (p: Vec2): Vec2 => {
      const { distance: gap } = closestOnSegment(p, wall.a, wall.b);
      if (gap > NODE_TOL_M) return p;
      const d = wallDirection(w);
      const meet = lineIntersection(w.a, d, movedA, dir);
      return roundVec(meet ?? add(p, shift));
    };
    return { ...w, a: fix(w.a), b: fix(w.b) };
  });
}

/** Moves a junction: every wall end within a junction's tolerance of `from` goes to `to`. */
/**
 * Stretches a wall to `lengthM`, keeping the end it starts from and its direction. Whatever
 * meets its far end comes along, exactly as dragging that end by hand does — typing 4.20
 * into the inspector and pulling the handle until it reads 4.20 are the same edit.
 */
export function resizeWall(walls: Wall[], id: string, lengthM: number): Wall[] {
  const wall = walls.find((w) => w.id === id);
  if (!wall) return walls;
  const current = wallLength(wall);
  const wanted = Math.max(0.1, lengthM);
  if (current < EPS || Math.abs(current - wanted) < 0.005) return walls;
  return moveNode(walls, wall.b, roundVec(add(wall.a, scale(wallDirection(wall), wanted))));
}

export function moveNode(walls: Wall[], from: Vec2, to: Vec2): Wall[] {
  const target = roundVec(to);
  return walls.map((w) => ({
    ...w,
    a: dist(w.a, from) <= NODE_TOL_M ? target : w.a,
    b: dist(w.b, from) <= NODE_TOL_M ? target : w.b,
  }));
}

export function removeWall(walls: Wall[], id: string): Wall[] {
  return walls.filter((w) => w.id !== id);
}

export function updateWall(walls: Wall[], id: string, patch: Partial<Pick<Wall, 'thicknessM' | 'heightM' | 'material' | 'locked' | 'origin'>>): Wall[] {
  return walls.map((w) => (w.id === id ? { ...w, ...patch } : w));
}

/** Four walls around an inner rectangle, so the room inside is exactly the rectangle drawn. */
export function wallsForRectangle(rect: { x: number; z: number; width: number; depth: number }, thicknessM: number, origin: ElementOrigin = 'user', idPrefix = `w${Date.now().toString(36)}`): Wall[] {
  const h = thicknessM / 2;
  const x0 = rect.x - h;
  const x1 = rect.x + rect.width + h;
  const z0 = rect.z - h;
  const z1 = rect.z + rect.depth + h;
  const corners = [
    { x: x0, z: z0 },
    { x: x1, z: z0 },
    { x: x1, z: z1 },
    { x: x0, z: z1 },
  ].map(roundVec);
  return corners.map((a, i) => ({ id: `${idPrefix}-${i}`, a, b: corners[(i + 1) % 4], thicknessM, origin }));
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

/** The wall a room's polygon edge lies on, by the room's `wallIds` or, failing that, by position. */
export function wallForEdge(plan: FloorPlan, room: PlanRoom, edge: PlanEdge): Wall | null {
  const walls = plan.walls ?? [];
  if (walls.length === 0) return null;
  const byId = room.wallIds?.[edge.index] ? walls.find((w) => w.id === room.wallIds![edge.index]) : null;
  if (byId) return byId;
  const mid = add(edge.a, scale(sub(edge.b, edge.a), 0.5));
  let best: { wall: Wall; distance: number } | null = null;
  for (const wall of walls) {
    const d = wallDirection(wall);
    if (Math.abs(dot(d, edge.dir)) < 0.95) continue;
    const { distance } = closestOnSegment(mid, wall.a, wall.b);
    const expected = wall.thicknessM / 2;
    if (Math.abs(distance - expected) <= NODE_TOL_M * 2 && (!best || distance < best.distance)) best = { wall, distance };
  }
  return best?.wall ?? null;
}

/** The thickness of the wall behind a room edge — the wall's own, or the plan's default. */
export function wallThicknessForEdge(plan: FloorPlan, room: PlanRoom, edge: PlanEdge): number {
  return wallForEdge(plan, room, edge)?.thicknessM ?? plan.wallThicknessM;
}

/** The height a wall stands: its own, else the room's, else the plan's default. */
export function wallHeightFor(plan: FloorPlan, wall: Wall | null, room?: PlanRoom | null): number {
  return wall?.heightM ?? room?.heightM ?? plan.wallHeightM ?? DEFAULT_WALL_HEIGHT_M;
}

/** The pieces of wall that bound no room at all — free-standing walls the 3D view still has to draw. */
export function orphanWallSegments(plan: FloorPlan): Array<{ wall: Wall; a: Vec2; b: Vec2 }> {
  const walls = plan.walls ?? [];
  const out: Array<{ wall: Wall; a: Vec2; b: Vec2 }> = [];
  for (const wall of walls) {
    const dir = wallDirection(wall);
    const length = wallLength(wall);
    if (length < NODE_TOL_M) continue;
    const covered: Array<[number, number]> = [];
    for (const room of plan.rooms) {
      for (const edge of roomEdges(room.polygon)) {
        if (Math.abs(dot(edge.dir, dir)) < 0.95) continue;
        const { distance } = closestOnSegment(edge.a, wall.a, wall.b);
        const { distance: distanceB } = closestOnSegment(edge.b, wall.a, wall.b);
        if (Math.abs(distance - wall.thicknessM / 2) > NODE_TOL_M * 2.5 || Math.abs(distanceB - wall.thicknessM / 2) > NODE_TOL_M * 2.5) continue;
        const s0 = dot(sub(edge.a, wall.a), dir);
        const s1 = dot(sub(edge.b, wall.a), dir);
        covered.push([Math.max(0, Math.min(s0, s1)), Math.min(length, Math.max(s0, s1))]);
      }
    }
    // A room's edge stops half a wall short of the corner, so the corners of a bounded wall
    // would look uncovered; anything shorter than a real stub is ignored.
    covered.sort((p, q) => p[0] - q[0]);
    let cursor = 0;
    for (const [lo, hi] of covered) {
      if (lo > cursor + MIN_ORPHAN_M) out.push({ wall, a: pointAt(wall, cursor / length), b: pointAt(wall, lo / length) });
      cursor = Math.max(cursor, hi);
    }
    if (length - cursor > MIN_ORPHAN_M) out.push({ wall, a: pointAt(wall, cursor / length), b: wall.b });
  }
  return out;
}

/** Every column standing in a room, as the floor boxes the furniture has to keep off. */
export function columnFootprints(plan: FloorPlan, roomId: string): Array<{ minX: number; maxX: number; minZ: number; maxZ: number }> {
  const room = plan.rooms.find((r) => r.id === roomId);
  if (!room) return [];
  return (plan.columns ?? [])
    .filter((c) => pointInPolygon(c.position, room.polygon))
    .map((c) => columnBox(c));
}

export function columnBox(c: Column): { minX: number; maxX: number; minZ: number; maxZ: number } {
  return { minX: c.position.x - c.widthM / 2, maxX: c.position.x + c.widthM / 2, minZ: c.position.z - c.depthM / 2, maxZ: c.position.z + c.depthM / 2 };
}

/** The wall nearest to a point, within `maxDistance` of its centreline. */
export function nearestWallTo(walls: Wall[], point: Vec2, maxDistance: number): { wall: Wall; t: number; distance: number; point: Vec2 } | null {
  let best: { wall: Wall; t: number; distance: number; point: Vec2 } | null = null;
  for (const wall of walls) {
    const hit = closestOnSegment(point, wall.a, wall.b);
    if (hit.distance <= maxDistance && (!best || hit.distance < best.distance)) best = { wall, ...hit };
  }
  return best;
}

/** Every distinct junction (wall end) in the plan. */
export function wallNodes(walls: Wall[]): Vec2[] {
  const nodes: Vec2[] = [];
  for (const wall of walls) {
    for (const p of [wall.a, wall.b]) {
      if (!nodes.some((n) => dist(n, p) <= NODE_TOL_M)) nodes.push(p);
    }
  }
  return nodes;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
