import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildRoomShells } from '@/lib/design3d/buildScene';
import { StyleMaterials } from '@/lib/design3d/materials';
import { getStyle } from '@/lib/design/styles';
import { rebuildRooms, updateWall, wallForEdge, wallsForRectangle } from '@/lib/design/walls';
import { roomEdges } from '@/lib/design/planGeometry';
import type { FloorPlan, StyleDefinition } from '@/lib/design/types';

/**
 * A cornice runs along the top of its wall. It was built at the room's ceiling height, so a
 * wall given a height of its own in the inspector left the cornice behind — a white line
 * part of the way up it.
 */

const T = 0.12;
const blank: FloorPlan = { rooms: [], metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', wallThicknessM: T, walls: [] };
const flat = (): FloorPlan => rebuildRooms(blank, wallsForRectangle({ x: 0, z: 0, width: 4, depth: 3 }, T, 'user', 'r'));

// Vintage is a style that has a cornice of its own (modern and industrial have none). Its
// surfaces are taken without their maps: a texture wants a `document` to load into, and what
// is measured here is where the geometry stands, not what it wears.
const vintage = getStyle('vintage');
const bare = <S extends object>(spec: S): S => ({ ...spec, textureUrl: null, normalUrl: null, roughnessUrl: null });
const s = vintage.surfaces;
const plain: StyleDefinition['surfaces'] = { floor: bare(s.floor), wall: bare(s.wall), featureWall: bare(s.featureWall), ceiling: bare(s.ceiling), wetFloor: bare(s.wetFloor), wetWall: bare(s.wetWall) };
const style: StyleDefinition = { ...vintage, surfaces: plain };

/** Where every cornice in the shells stands, by the wall it belongs to; `nose*` is the part that stands out from the wall. */
interface CorniceBox { low: number; high: number; reach: number; noseFrom: number; noseTo: number }
function cornices(plan: FloorPlan): Map<number, CorniceBox> {
  const root = buildRoomShells(plan, [], style, new StyleMaterials(style));
  const room = plan.rooms[0];
  const edges = roomEdges(room.polygon);
  const found = new Map<number, CorniceBox>();
  root.traverse((node) => {
    if (node.name !== 'cornice') return;
    const wallIndex = (node.userData as { wallIndex?: number }).wallIndex;
    const edge = edges.find((e) => e.index === wallIndex);
    if (wallIndex == null || !edge) return;
    const points: Array<{ along: number; out: number; y: number }> = [];
    node.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const position = (child.geometry as THREE.BufferGeometry).getAttribute('position');
      for (let i = 0; i < position.count; i++) {
        const dx = position.getX(i) - edge.a.x;
        const dz = position.getZ(i) - edge.a.z;
        points.push({ along: dx * edge.dir.x + dz * edge.dir.z, out: dx * edge.inward.x + dz * edge.inward.z, y: position.getY(i) });
      }
    });
    const reach = Math.max(...points.map((p) => p.out));
    const nose = points.filter((p) => p.out > reach - 1e-6);
    found.set(wallIndex, {
      low: Math.min(...points.map((p) => p.y)),
      high: Math.max(...points.map((p) => p.y)),
      reach,
      noseFrom: Math.min(...nose.map((p) => p.along)),
      noseTo: Math.max(...nose.map((p) => p.along)),
    });
  });
  return found;
}

describe('a cornice follows the height of its wall', () => {
  it('runs under the ceiling on every wall of an ordinary room', () => {
    const plan = flat();
    const all = cornices(plan);
    expect(all.size).toBe(4);
    for (const box of all.values()) expect(box.high).toBeCloseTo(plan.rooms[0].heightM, 6);
  });

  it('goes up with a wall that was raised, and stays where it was on the others', () => {
    const base = flat();
    const room = base.rooms[0];
    const edges = roomEdges(room.polygon);
    const raised = wallForEdge(base, room, edges[0])!;
    const plan = rebuildRooms(base, updateWall(base.walls!, raised.id, { heightM: room.heightM + 0.6 }));
    const all = cornices(plan);
    const room2 = plan.rooms[0];
    for (const edge of roomEdges(room2.polygon)) {
      const own = wallForEdge(plan, room2, edge)?.heightM ?? room2.heightM;
      expect(all.get(edge.index)!.high).toBeCloseTo(own, 6);
    }
    expect([...all.values()].filter((b) => Math.abs(b.high - (room.heightM + 0.6)) < 1e-6)).toHaveLength(1);
  });

  it('is cut square, not mitred, beside a wall that stands at another height', () => {
    const base = flat();
    const room = base.rooms[0];
    const edges = roomEdges(room.polygon);
    // Level with its neighbours, a run gives way at both ends by as far as it stands out from
    // the wall, to meet the next wall's cornice on the diagonal.
    const level = cornices(base).get(edges[0].index)!;
    expect(level.reach).toBeGreaterThan(0.02);
    expect(level.noseFrom).toBeCloseTo(level.reach, 6);
    expect(level.noseTo).toBeCloseTo(edges[0].length - level.reach, 6);

    // Raised, there is no cornice at that height to meet: it runs the whole wall, corner to corner…
    const raised = wallForEdge(base, room, edges[0])!;
    const plan = rebuildRooms(base, updateWall(base.walls!, raised.id, { heightM: room.heightM + 0.6 }));
    const after = roomEdges(plan.rooms[0].polygon);
    const edge = after.find((e) => wallForEdge(plan, plan.rooms[0], e)?.id === raised.id)!;
    const all = cornices(plan);
    const high = all.get(edge.index)!;
    expect(high.noseFrom).toBeCloseTo(0, 6);
    expect(high.noseTo).toBeCloseTo(edge.length, 6);
    // …and so do its two neighbours at the end where they meet it, while the far wall, level
    // with both of them, still mitres.
    const order = after.indexOf(edge);
    const next = all.get(after[(order + 1) % after.length].index)!;
    const far = all.get(after[(order + 2) % after.length].index)!;
    expect(next.noseFrom).toBeCloseTo(0, 6);
    expect(next.noseTo).toBeCloseTo(after[(order + 1) % after.length].length - next.reach, 6);
    expect(far.noseFrom).toBeCloseTo(far.reach, 6);
    expect(far.noseTo).toBeCloseTo(after[(order + 2) % after.length].length - far.reach, 6);
  });
});
