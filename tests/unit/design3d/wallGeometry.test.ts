import { describe, expect, it } from 'vitest';
import { buildMouldingGeometry, buildWallGeometry, WALL_SLOT_CAP } from '@/lib/design3d/wallGeometry';
import { planEdgeWalls } from '@/lib/design/wallPieces';
import { addWalls, rebuildRooms, wallsForRectangle } from '@/lib/design/walls';
import { roomEdges } from '@/lib/design/planGeometry';
import { trimOutline } from '@/lib/design/trims';
import type { FloorPlan, Vec2, Wall } from '@/lib/design/types';

const T = 0.12;
const blank: FloorPlan = { rooms: [], metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', wallThicknessM: T, walls: [] };
const fromRects = (...rects: Array<{ x: number; z: number; width: number; depth: number }>): FloorPlan =>
  rebuildRooms(blank, rects.reduce((all, rect, i) => addWalls(all, wallsForRectangle(rect, T, 'user', `r${i}`)), [] as Wall[]));

/** The triangles of every wall's top, flattened onto the plan. */
function wallTops(plan: FloorPlan): Array<[Vec2, Vec2, Vec2]> {
  const triangles: Array<[Vec2, Vec2, Vec2]> = [];
  for (const wall of planEdgeWalls(plan).values()) {
    const geometry = buildWallGeometry({ edge: wall.edge, height: 2.8, pieces: wall.pieces, holes: [] });
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    for (const group of geometry.groups) {
      if (group.materialIndex !== WALL_SLOT_CAP) continue;
      for (let i = group.start; i < group.start + group.count; i += 3) {
        if (normal.getY(i) < 0.9) continue; // an end face, not the top
        triangles.push([0, 1, 2].map((k) => ({ x: position.getX(i + k), z: position.getZ(i + k) })) as [Vec2, Vec2, Vec2]);
      }
    }
  }
  return triangles;
}

function inTriangle(p: Vec2, [a, b, c]: [Vec2, Vec2, Vec2]): boolean {
  const side = (u: Vec2, v: Vec2) => (v.x - u.x) * (p.z - u.z) - (v.z - u.z) * (p.x - u.x);
  const d1 = side(a, b);
  const d2 = side(b, c);
  const d3 = side(c, a);
  const eps = 1e-7;
  return !((d1 < -eps || d2 < -eps || d3 < -eps) && (d1 > eps || d2 > eps || d3 > eps));
}

/** Every point of the walls' footprint — each wall's strip, run half a thickness past both ends so corners are square. */
function footprintSamples(walls: Wall[], step: number): Vec2[] {
  const samples: Vec2[] = [];
  const xs = walls.flatMap((w) => [w.a.x, w.b.x]);
  const zs = walls.flatMap((w) => [w.a.z, w.b.z]);
  for (let x = Math.min(...xs) - T; x <= Math.max(...xs) + T; x += step) {
    for (let z = Math.min(...zs) - T; z <= Math.max(...zs) + T; z += step) {
      const inside = walls.some((w) => {
        const h = w.thicknessM / 2 - 0.004; // a hair inside the faces
        const horizontal = Math.abs(w.a.z - w.b.z) < 1e-9;
        const lo = horizontal ? Math.min(w.a.x, w.b.x) : Math.min(w.a.z, w.b.z);
        const hi = horizontal ? Math.max(w.a.x, w.b.x) : Math.max(w.a.z, w.b.z);
        const along = horizontal ? x : z;
        const across = horizontal ? z - w.a.z : x - w.a.x;
        return along >= lo - h && along <= hi + h && Math.abs(across) <= h;
      });
      if (inside) samples.push({ x, z });
    }
  }
  return samples;
}

function uncovered(plan: FloorPlan): Vec2[] {
  const tops = wallTops(plan);
  return footprintSamples(plan.walls ?? [], 0.013).filter((p) => !tops.some((t) => inTriangle(p, t)));
}

describe('buildWallGeometry', () => {
  it('leaves no gap anywhere in the walls of a flat with T-junctions and part-shared walls', () => {
    // The flat from the bug report: a long room over three, the middle one running on below its neighbours.
    const plan = fromRects({ x: 0.06, z: 1.95, width: 5.08, depth: 4 }, { x: 0.06, z: 0.06, width: 10.01, depth: 1.77 }, { x: 7.92, z: 1.95, width: 2.15, depth: 4.12 }, { x: 5.26, z: 1.95, width: 2.54, depth: 5.75 });
    expect(plan.rooms).toHaveLength(4);
    expect(uncovered(plan)).toEqual([]);
  });

  it('closes a four-way crossing and the corners of an L-shaped room', () => {
    const grid = fromRects({ x: 0, z: 0, width: 3, depth: 3 }, { x: 3 + T, z: 0, width: 3, depth: 3 }, { x: 0, z: 3 + T, width: 3, depth: 3 }, { x: 3 + T, z: 3 + T, width: 3, depth: 3 });
    expect(grid.rooms).toHaveLength(4);
    expect(uncovered(grid)).toEqual([]);

    const P = (x: number, z: number) => ({ x, z });
    const outline = [P(0, 0), P(6, 0), P(6, 3), P(3, 3), P(3, 6), P(0, 6)];
    const ell = rebuildRooms(blank, outline.map((a, i) => ({ id: `l${i}`, a, b: outline[(i + 1) % outline.length], thicknessM: T, origin: 'user' as const })));
    expect(ell.rooms).toHaveLength(1);
    expect(uncovered(ell)).toEqual([]);
  });

  it('cuts holes through every face and paints a strip of the room face in its own slot', () => {
    const plan = fromRects({ x: 0, z: 0, width: 4, depth: 3 });
    const wall = [...planEdgeWalls(plan).values()][0];
    const solid = buildWallGeometry({ edge: wall.edge, height: 2.8, pieces: wall.pieces, holes: [] });
    const holed = buildWallGeometry({ edge: wall.edge, height: 2.8, pieces: wall.pieces, holes: [{ left: 1, right: 1.9, bottom: 0, top: 2.1 }], spans: [{ from: 2, to: 3, slot: 3 }] });
    const area = (geometry: ReturnType<typeof buildWallGeometry>, slot: number) => {
      const position = geometry.getAttribute('position');
      let sum = 0;
      for (const group of geometry.groups.filter((g) => g.materialIndex === slot)) {
        for (let i = group.start; i < group.start + group.count; i += 3) {
          const [ax, ay, az, bx, by, bz, cx, cy, cz] = [0, 1, 2].flatMap((k) => [position.getX(i + k), position.getY(i + k), position.getZ(i + k)]);
          const [ux, uy, uz, vx, vy, vz] = [bx - ax, by - ay, bz - az, cx - ax, cy - ay, cz - az];
          sum += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
        }
      }
      return sum;
    };
    // The strip is one metre of wall, floor to ceiling.
    expect(area(holed, 3)).toBeCloseTo(2.8, 4);
    // Slot 0 holds both faces and the reveals: the hole comes out of both faces, the strip out of one, the reveals go in.
    const door = 0.9 * 2.1;
    const reveals = T * (2.1 + 2.1 + 0.9);
    expect(area(holed, 0)).toBeCloseTo(area(solid, 0) - 2 * door - 2.8 + reveals, 4);
    // Every normal is a unit vector, every vertex finite.
    const normal = holed.getAttribute('normal');
    for (let i = 0; i < normal.count; i++) expect(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i))).toBeCloseTo(1, 5);
  });

  it('shows a square metre painted over a strip: what was painted last lies on top', () => {
    const plan = fromRects({ x: 0, z: 0, width: 4, depth: 3 });
    const wall = [...planEdgeWalls(plan).values()][0];
    const area = (geometry: ReturnType<typeof buildWallGeometry>, slot: number) => {
      const position = geometry.getAttribute('position');
      let sum = 0;
      for (const group of geometry.groups.filter((g) => g.materialIndex === slot)) {
        for (let i = group.start; i < group.start + group.count; i += 3) {
          const [ax, ay, az, bx, by, bz, cx, cy, cz] = [0, 1, 2].flatMap((k) => [position.getX(i + k), position.getY(i + k), position.getZ(i + k)]);
          const [ux, uy, uz, vx, vy, vz] = [bx - ax, by - ay, bz - az, cx - ax, cy - ay, cz - az];
          sum += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
        }
      }
      return sum;
    };
    // A strip from 2 m to 3 m, and one square metre of another finish in the middle of it.
    const painted = buildWallGeometry({ edge: wall.edge, height: 2.8, pieces: wall.pieces, holes: [], spans: [{ from: 2, to: 3, slot: 3 }, { from: 2, to: 3, bottom: 1, top: 2, slot: 4 }] });
    expect(area(painted, 4)).toBeCloseTo(1, 4);
    expect(area(painted, 3)).toBeCloseTo(2.8 - 1, 4);
  });

  it('sweeps a moulding round a room so neighbouring runs meet on the mitre', () => {
    const plan = fromRects({ x: 0, z: 0, width: 4, depth: 3 });
    const edges = roomEdges(plan.rooms[0].polygon);
    const outline = trimOutline('skirting', { profile: 'flat', heightM: 0.08, depthM: 0.02 });
    // In a square inside corner each run gives way by exactly how far it stands out.
    const first = buildMouldingGeometry(edges[0], 0, edges[0].length, 0, outline, 1, 1);
    const position = first.getAttribute('position');
    let reach = 0;
    for (let i = 0; i < position.count; i++) {
      const along = (position.getX(i) - edges[0].a.x) * edges[0].dir.x + (position.getZ(i) - edges[0].a.z) * edges[0].dir.z;
      const out = (position.getX(i) - edges[0].a.x) * edges[0].inward.x + (position.getZ(i) - edges[0].a.z) * edges[0].inward.z;
      expect(along).toBeGreaterThanOrEqual(out - 1e-6);
      expect(along).toBeLessThanOrEqual(edges[0].length - out + 1e-6);
      reach = Math.max(reach, out);
    }
    expect(reach).toBeCloseTo(0.02, 6);
  });
});
