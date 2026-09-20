/**
 * How each room's walls are cut up for the 3D view.
 *
 * A room's polygon is its inner face, and the 3D view builds every room edge as a slab
 * standing *behind* that face. Three things about those slabs used to be wrong, and all
 * three showed:
 *
 *   1. **Corners.** A slab as long as the inner edge stops short of the corner, so every
 *      outside corner of the flat, and every T-junction, had a notch a wall's thickness
 *      square cut out of it — walls that met on the plan stood apart in 3D. Each slab is
 *      now mitred: its far face runs on (or stops short, at an inside corner) to where the
 *      outer lines of the two walls cross, and the two slabs meet along that diagonal.
 *   2. **Walls shared for part of their length.** A slab is half as deep where another room
 *      stands behind the wall (the two rooms' halves meet in the middle) and full depth
 *      where nothing does. That used to be decided once per edge, by probing behind its
 *      midpoint — so a wall shared for four of its six metres was half as thick as it
 *      should be for the other two. An edge is now cut into *pieces* wherever what stands
 *      behind it changes.
 *   3. **Who is behind.** Each shared piece knows the room and wall on its other side, so
 *      the far face can wear that room's finish and a click on it can be given to that room.
 *
 * Gaps are what the eye catches; overlaps inside a wall are invisible. So wherever the
 * geometry is ambiguous — the butt end of a partition between two neighbours, a jog where
 * two thicknesses meet — the piece is built full depth and allowed to overlap.
 *
 * Pure geometry: no THREE, no React. Tested in `tests/unit/design/wallPieces.test.ts`.
 */

import { roomEdges, type PlanEdge } from './planGeometry';
import { lineIntersection, wallThicknessForEdge } from './walls';
import type { FloorPlan, PlanRoom, Vec2 } from './types';

export interface WallPiece {
  /** The room face of the piece: metres along the edge from its first corner. */
  from: number;
  to: number;
  /** The far face: beyond `from`/`to` at a mitred outside corner, short of them at an inside one, the same at a straight cut. */
  farFrom: number;
  farTo: number;
  /** How far the slab stands back from the room face: half the wall where it is shared, all of it otherwise. */
  depth: number;
  /** The room and wall on the other side of this stretch, when another room stands there. */
  neighbour: { roomId: string; wallIndex: number } | null;
}

export interface EdgeWall {
  room: PlanRoom;
  edge: PlanEdge;
  thickness: number;
  pieces: WallPiece[];
}

/** Two faces further apart than this many wall thicknesses are not the two sides of one wall. */
const FACING_REACH = 1.5;
/** Stretches shorter than this are folded into their neighbour rather than built on their own. */
const MIN_PIECE_M = 0.02;
/** A mitre never runs further than this past a corner, however sharp the angle. */
const MAX_MITRE_M = 1;

export function edgeWallKey(roomId: string, wallIndex: number): string {
  return `${roomId}:${wallIndex}`;
}

/** Every room edge of the plan with the pieces its wall is built from, keyed by `edgeWallKey`. */
export function planEdgeWalls(plan: FloorPlan): Map<string, EdgeWall> {
  const out = new Map<string, EdgeWall>();
  const edgesOf = new Map(plan.rooms.map((room) => [room.id, roomEdges(room.polygon)]));

  // First the stretches: where each edge is shared, and with whom.
  for (const room of plan.rooms) {
    for (const edge of edgesOf.get(room.id) ?? []) {
      const thickness = wallThicknessForEdge(plan, room, edge);
      out.set(edgeWallKey(room.id, edge.index), { room, edge, thickness, pieces: stretches(room, edge, thickness, plan.rooms, edgesOf) });
    }
  }

  // Then the corners: each slab's far face ends where the outer lines of the two walls cross.
  for (const room of plan.rooms) {
    const edges = edgesOf.get(room.id) ?? [];
    if (edges.length < 2) continue;
    for (let i = 0; i < edges.length; i++) {
      const previous = out.get(edgeWallKey(room.id, edges[(i - 1 + edges.length) % edges.length].index));
      const current = out.get(edgeWallKey(room.id, edges[i].index));
      if (!previous || !current || previous.pieces.length === 0 || current.pieces.length === 0) continue;
      const last = previous.pieces[previous.pieces.length - 1];
      const first = current.pieces[0];
      const corner = current.edge.a;
      const meet = lineIntersection(
        offset(corner, previous.edge.inward, -last.depth),
        previous.edge.dir,
        offset(corner, current.edge.inward, -first.depth),
        current.edge.dir
      );
      if (!meet) continue; // in line with each other: both end square
      last.farTo = clamp(along(previous.edge, meet), previous.edge.length - MAX_MITRE_M, previous.edge.length + MAX_MITRE_M);
      first.farFrom = clamp(along(current.edge, meet), -MAX_MITRE_M, MAX_MITRE_M);
    }
  }

  // A short edge between an outside and an inside corner can have its far face turned inside out.
  for (const wall of out.values()) {
    for (const piece of wall.pieces) {
      if (piece.farTo - piece.farFrom < 1e-4) {
        const middle = (piece.farFrom + piece.farTo) / 2;
        piece.farFrom = middle;
        piece.farTo = middle;
      }
    }
  }
  return out;
}

/** The pieces of one room edge, in order, before the corners are mitred. */
function stretches(room: PlanRoom, edge: PlanEdge, thickness: number, rooms: PlanRoom[], edgesOf: Map<string, PlanEdge[]>): WallPiece[] {
  const outward = { x: -edge.inward.x, z: -edge.inward.z };
  const shared: Array<{ from: number; to: number; roomId: string; wallIndex: number }> = [];
  for (const other of rooms) {
    if (other.id === room.id) continue;
    for (const facing of edgesOf.get(other.id) ?? []) {
      // The other side of the same wall runs the other way, a wall's thickness behind this face.
      if (facing.dir.x * edge.dir.x + facing.dir.z * edge.dir.z > -0.98) continue;
      const behind = (facing.a.x - edge.a.x) * outward.x + (facing.a.z - edge.a.z) * outward.z;
      if (behind < 0.01 || behind > thickness * FACING_REACH + 0.02) continue;
      const from = Math.max(0, Math.min(along(edge, facing.a), along(edge, facing.b)));
      const to = Math.min(edge.length, Math.max(along(edge, facing.a), along(edge, facing.b)));
      if (to - from < MIN_PIECE_M) continue;
      shared.push({ from, to, roomId: other.id, wallIndex: facing.index });
    }
  }
  shared.sort((p, q) => p.from - q.from);

  const pieces: WallPiece[] = [];
  const push = (from: number, to: number, neighbour: WallPiece['neighbour']) => {
    if (to - from < MIN_PIECE_M) {
      // Too short to stand alone: the piece before it runs on over it.
      const before = pieces[pieces.length - 1];
      if (before) {
        before.to = to;
        before.farTo = to;
      }
      return;
    }
    pieces.push({ from, to, farFrom: from, farTo: to, depth: neighbour ? thickness / 2 : thickness, neighbour });
  };
  let cursor = 0;
  for (const stretch of shared) {
    const from = Math.max(stretch.from, cursor);
    if (stretch.to - from < MIN_PIECE_M) continue;
    if (from - cursor >= MIN_PIECE_M) push(cursor, from, null);
    push(from - cursor < MIN_PIECE_M ? cursor : from, stretch.to, { roomId: stretch.roomId, wallIndex: stretch.wallIndex });
    cursor = stretch.to;
  }
  if (edge.length - cursor >= MIN_PIECE_M) push(cursor, edge.length, null);
  else if (pieces.length > 0) {
    const lastPiece = pieces[pieces.length - 1];
    lastPiece.to = edge.length;
    lastPiece.farTo = edge.length;
  }
  // Even a sliver of an edge is a wall: its neighbours mitre against it.
  if (pieces.length === 0) pieces.push({ from: 0, to: edge.length, farFrom: 0, farTo: edge.length, depth: thickness, neighbour: null });
  return pieces;
}

/** The piece of an edge that covers the spot `s` metres along it. */
export function pieceAt(wall: EdgeWall, s: number): WallPiece | null {
  return wall.pieces.find((p) => s >= p.from - 1e-6 && s <= p.to + 1e-6) ?? wall.pieces[wall.pieces.length - 1] ?? null;
}

function along(edge: PlanEdge, point: Vec2): number {
  return (point.x - edge.a.x) * edge.dir.x + (point.z - edge.a.z) * edge.dir.z;
}

function offset(point: Vec2, direction: Vec2, distance: number): Vec2 {
  return { x: point.x + direction.x * distance, z: point.z + direction.z * distance };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
