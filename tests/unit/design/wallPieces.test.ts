import { describe, expect, it } from 'vitest';
import { edgeWallKey, planEdgeWalls } from '@/lib/design/wallPieces';
import { addWalls, rebuildRooms, wallsForRectangle } from '@/lib/design/walls';
import { roomEdges } from '@/lib/design/planGeometry';
import type { FloorPlan, PlanRoom } from '@/lib/design/types';

const T = 0.12;
const planOf = (...rects: Array<{ x: number; z: number; width: number; depth: number }>): FloorPlan => {
  const walls = rects.reduce((all, rect, i) => addWalls(all, wallsForRectangle(rect, T, 'user', `r${i}`)), [] as FloorPlan['walls'] & object);
  return rebuildRooms({ rooms: [], metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', wallThicknessM: T, walls: [] }, walls);
};
const roomAt = (plan: FloorPlan, x: number, z: number): PlanRoom => plan.rooms.find((r) => Math.abs(r.polygon[0].x - x) < 0.5 && Math.abs(Math.min(...r.polygon.map((p) => p.z)) - z) < 0.5) ?? plan.rooms[0];

describe('planEdgeWalls', () => {
  it('mitres the four corners of a room standing alone: each far face runs a thickness past both ends', () => {
    const plan = planOf({ x: 0, z: 0, width: 4, depth: 3 });
    const walls = planEdgeWalls(plan);
    expect(walls.size).toBe(4);
    for (const wall of walls.values()) {
      expect(wall.pieces).toHaveLength(1);
      const [piece] = wall.pieces;
      expect(piece.depth).toBeCloseTo(T, 6);
      expect(piece.neighbour).toBeNull();
      expect(piece.farFrom).toBeCloseTo(-T, 6);
      expect(piece.farTo).toBeCloseTo(wall.edge.length + T, 6);
    }
  });

  it('builds a wall two rooms share as two halves that know each other', () => {
    const plan = planOf({ x: 0, z: 0, width: 4, depth: 3 }, { x: 4 + T, z: 0, width: 3, depth: 3 });
    expect(plan.rooms).toHaveLength(2);
    const walls = planEdgeWalls(plan);
    const shared = [...walls.values()].filter((w) => w.pieces.some((p) => p.neighbour));
    expect(shared).toHaveLength(2);
    for (const wall of shared) {
      expect(wall.pieces).toHaveLength(1);
      expect(wall.pieces[0].depth).toBeCloseTo(T / 2, 6);
      const other = shared.find((w) => w !== wall)!;
      expect(wall.pieces[0].neighbour).toEqual({ roomId: other.room.id, wallIndex: other.edge.index });
    }
    // At the T-junction the outer walls run on to the partition's centreline, so the two
    // rooms' slabs meet there with nothing left open.
    const left = shared.find((w) => w.room.polygon.some((p) => p.x < 1))!;
    const edges = roomEdges(left.room.polygon);
    const top = walls.get(edgeWallKey(left.room.id, edges[(edges.findIndex((e) => e.index === left.edge.index) - 1 + edges.length) % edges.length].index))!;
    expect(top.pieces[top.pieces.length - 1].farTo).toBeCloseTo(top.edge.length + T / 2, 6);
  });

  it('cuts an edge in two where the room behind it ends: half depth where shared, full where not', () => {
    // A short room beside a tall one: the tall room's wall is shared for 3 m of its 5.
    const plan = planOf({ x: 0, z: 0, width: 4, depth: 3 }, { x: 4 + T, z: 0, width: 3, depth: 5 });
    const tall = roomAt(plan, 4 + T, 0);
    const walls = planEdgeWalls(plan);
    const partly = [...walls.values()].find((w) => w.room.id === tall.id && w.pieces.length === 2);
    expect(partly).toBeDefined();
    const sharedPiece = partly!.pieces.find((p) => p.neighbour)!;
    const openPiece = partly!.pieces.find((p) => !p.neighbour)!;
    expect(sharedPiece.depth).toBeCloseTo(T / 2, 6);
    expect(openPiece.depth).toBeCloseTo(T, 6);
    expect(sharedPiece.to - sharedPiece.from).toBeCloseTo(3, 2);
    expect(openPiece.to - openPiece.from).toBeCloseTo(2, 2);
  });

  it('pulls the far face in at an inside corner of an L-shaped room', () => {
    const base: FloorPlan = { rooms: [], metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', wallThicknessM: T, walls: [] };
    const P = (x: number, z: number) => ({ x, z });
    const outline = [P(0, 0), P(6, 0), P(6, 3), P(3, 3), P(3, 6), P(0, 6)];
    const walls = outline.map((a, i) => ({ id: `l${i}`, a, b: outline[(i + 1) % outline.length], thicknessM: T, origin: 'user' as const }));
    const plan = rebuildRooms(base, walls);
    expect(plan.rooms).toHaveLength(1);
    const pieces = [...planEdgeWalls(plan).values()];
    // Two walls meet at the inside corner: one of their ends stops short of the corner.
    const pulledIn = pieces.filter((w) => w.pieces[0].farFrom > 1e-6 || w.pieces[w.pieces.length - 1].farTo < w.edge.length - 1e-6);
    expect(pulledIn).toHaveLength(2);
  });
});
