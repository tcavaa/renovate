import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { refreshRoom, roomEdges } from '@/lib/design/planGeometry';
import type { DecorFamily, DecorPiece, FloorPlan, PlanRoom } from '@/lib/design/types';
import { DECOR_FAMILY_LIST } from '@/lib/design/decor/families';
import { buildDecor, buildDecorPiece } from '@/lib/design3d/decor';
import { wallPartVisible } from '@/lib/design3d/wallMode';

const room: PlanRoom = refreshRoom({ id: 'r1', type: 'living_room', name: 'Living', polygon: [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 4 }, { x: 0, z: 4 }], heightM: 2.8, areaM2: 0, perimeterM: 0, openings: [] });
const north = roomEdges(room.polygon).find((e) => e.inward.z > 0.5)!.index;

const PARAMS: Partial<Record<DecorFamily, DecorPiece['params']>> = {
  slats: { led: 'halo' },
  niche: { count: 2, mantel: true, led: 'inside' },
  slab: { led: 'halo' },
  panel: { style: 'upholstered' },
  tile: { border: true },
};

function piece(family: DecorFamily): DecorPiece {
  return { id: `d-${family}`, roomId: room.id, family, wallIndex: family === 'light' ? null : north, span: { from: 0, to: 5 }, height: { from: family === 'slab' ? 0.7 : 0, to: family === 'slab' ? 2.4 : 2.8 }, params: PARAMS[family] ?? {}, materials: {} };
}

describe('a wall of wardrobe with sliding doors in 3D', () => {
  it('draws leaves in front of its carcass, on two tracks, overlapping, across its whole width', () => {
    const sections = [0, 1, 2].map(() => ({ kind: 'doors' as const, widthMm: 1200, heightMm: 2700, depthMm: 600 }));
    const wardrobe = (sliding: boolean): DecorPiece => ({ ...piece('cabinet'), span: { from: 0, to: 3.6 }, height: { from: 0, to: 2.7 }, params: { sections, depthMm: 600, ...(sliding ? { sliding: true } : {}) } });
    const fronts = (built: THREE.Object3D) => {
      const out: THREE.Box3[] = [];
      built.updateMatrixWorld(true);
      built.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const box = new THREE.Box3().setFromObject(child);
        const size = box.getSize(new THREE.Vector3());
        // A leaf: tall, wide, thin.
        if (size.y > 2 && Math.min(size.x, size.z) < 0.03 && Math.max(size.x, size.z) > 0.5) out.push(box);
      });
      return out;
    };
    expect(fronts(buildDecorPiece(wardrobe(false), room)!)).toHaveLength(0);
    const leaves = fronts(buildDecorPiece(wardrobe(true), room)!);
    // 3.6 m: four leaves, none wider than a metre and a bit of overlap.
    expect(leaves).toHaveLength(4);
    for (const leaf of leaves) expect(Math.max(leaf.max.x - leaf.min.x, leaf.max.z - leaf.min.z)).toBeLessThanOrEqual(1.0);
    // Two tracks: the leaves stand at two depths off the wall.
    const depths = new Set(leaves.map((l) => Math.round(((l.min.z + l.max.z) / 2) * 1000)));
    expect(depths.size).toBe(2);
  });
});

describe('decor in 3D', () => {
  it.each(DECOR_FAMILY_LIST)('builds %s, every mesh tagged for picking', (family) => {
    const built = buildDecorPiece(piece(family), room);
    expect(built).toBeInstanceOf(THREE.Object3D);
    let meshes = 0;
    built!.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        meshes++;
        expect(child.userData.pickKind).toBe('decor');
        expect(child.userData.decorId).toBe(`d-${family}`);
        const position = child.geometry.attributes.position;
        for (let i = 0; i < position.array.length; i++) expect(Number.isFinite(position.array[i])).toBe(true);
      }
    });
    expect(meshes).toBeGreaterThan(0);
  });

  it('goes with its wall in the cutaway, and with the walls down', () => {
    const built = buildDecorPiece(piece('slats'), room)!;
    expect(built.userData.wallCut?.kind).toBe('decor');
    expect(wallPartVisible('cutaway', 'decor', true)).toBe(false);
    expect(wallPartVisible('cutaway', 'decor', false)).toBe(true);
    expect(wallPartVisible('down', 'decor', false)).toBe(false);
  });

  it('draws only the rooms in view, and nothing for a piece whose room is gone', () => {
    const plan = { rooms: [room] } as FloorPlan;
    expect(buildDecor(plan, [piece('slats'), { ...piece('slab'), roomId: 'gone' }], null).children).toHaveLength(1);
    expect(buildDecor(plan, [piece('slats')], new Set(['other'])).children).toHaveLength(0);
  });
});
