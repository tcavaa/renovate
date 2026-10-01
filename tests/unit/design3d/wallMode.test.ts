import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildRoomShells, type WallCut } from '@/lib/design3d/buildScene';
import { cameraFacesWall, wallPartVisible, WALL_STUB_M } from '@/lib/design3d/wallMode';
import { StyleMaterials } from '@/lib/design3d/materials';
import { refreshRoom } from '@/lib/design/planGeometry';
import { getStyle } from '@/lib/design/styles';
import type { FloorPlan, PlanRoom, StyleDefinition } from '@/lib/design/types';

describe('the walls menu', () => {
  it('shows every wall up, and none of the stubs', () => {
    for (const facing of [true, false]) {
      expect(wallPartVisible('up', 'wall', facing)).toBe(true);
      expect(wallPartVisible('up', 'stub', facing)).toBe(false);
      expect(wallPartVisible('up', 'opening', facing)).toBe(true);
      expect(wallPartVisible('up', 'cornice', facing)).toBe(true);
    }
  });

  it('takes a wall facing the camera away in the cutaway — with its windows, skirting and cornice', () => {
    expect(wallPartVisible('cutaway', 'wall', true)).toBe(false);
    expect(wallPartVisible('cutaway', 'stub', true)).toBe(false);
    expect(wallPartVisible('cutaway', 'opening', true, true)).toBe(false);
    expect(wallPartVisible('cutaway', 'skirting', true)).toBe(false);
    expect(wallPartVisible('cutaway', 'cornice', true)).toBe(false);
    // A door into the next room stays: that room's half of the wall is standing.
    expect(wallPartVisible('cutaway', 'opening', true, false)).toBe(true);
    // The far walls stand whole.
    expect(wallPartVisible('cutaway', 'wall', false)).toBe(true);
    expect(wallPartVisible('cutaway', 'opening', false, true)).toBe(true);
  });

  it('lowers a wall facing the camera to its stub in the low cutaway, the skirting kept', () => {
    expect(wallPartVisible('cutawayLow', 'wall', true)).toBe(false);
    expect(wallPartVisible('cutawayLow', 'stub', true)).toBe(true);
    expect(wallPartVisible('cutawayLow', 'skirting', true)).toBe(true);
    expect(wallPartVisible('cutawayLow', 'cornice', true)).toBe(false);
    expect(wallPartVisible('cutawayLow', 'opening', true, true)).toBe(false);
    expect(wallPartVisible('cutawayLow', 'stub', false)).toBe(false);
  });

  it('lowers every wall with the walls down, and takes the doors, windows, cornices and beams away', () => {
    for (const facing of [true, false]) {
      expect(wallPartVisible('down', 'wall', facing)).toBe(false);
      expect(wallPartVisible('down', 'stub', facing)).toBe(true);
      expect(wallPartVisible('down', 'skirting', facing)).toBe(true);
      expect(wallPartVisible('down', 'cornice', facing)).toBe(false);
      expect(wallPartVisible('down', 'opening', facing, false)).toBe(false);
    }
    expect(wallPartVisible('down', 'beam', false)).toBe(false);
    expect(wallPartVisible('cutaway', 'beam', false)).toBe(true);
  });

  it('counts the camera as facing a wall only past a margin on its outward side', () => {
    const outward = { x: 0, z: -1 };
    const mid = { x: 2, z: 0 };
    expect(cameraFacesWall(outward, mid, { x: 2, z: -5 })).toBe(true);
    expect(cameraFacesWall(outward, mid, { x: 2, z: -0.2 })).toBe(false);
    expect(cameraFacesWall(outward, mid, { x: 2, z: 3 })).toBe(false);
  });
});

describe('the shell builds every wall twice', () => {
  const room = (id: string): PlanRoom =>
    refreshRoom({
      id,
      type: 'bedroom',
      name: id,
      polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }],
      heightM: 2.7,
      areaM2: 0,
      perimeterM: 0,
      openings: [
        { id: 'w', kind: 'window', wallIndex: 0, t: 0.5, widthM: 1.2, heightM: 1.4, sillM: 0.9 },
        { id: 'd', kind: 'door', wallIndex: 2, t: 0.5, widthM: 0.9, heightM: 2.1, sillM: 0 },
      ],
    } as PlanRoom);
  const plan = { rooms: [room('a')], wallThicknessM: 0.12 } as unknown as FloorPlan;
  // Without their maps: a texture wants a `document` to load into (as in cornice.test.ts).
  const modern = getStyle('modern');
  const bare = <S extends object>(spec: S): S => ({ ...spec, textureUrl: null, normalUrl: null, roughnessUrl: null });
  const sf = modern.surfaces;
  const style: StyleDefinition = { ...modern, rooms: {}, surfaces: { floor: bare(sf.floor), wall: bare(sf.wall), featureWall: bare(sf.featureWall), ceiling: bare(sf.ceiling), wetFloor: bare(sf.wetFloor), wetWall: bare(sf.wetWall) } };
  const parts: Array<{ object: THREE.Object3D; cut: WallCut }> = [];
  buildRoomShells(plan, [], style, new StyleMaterials(style)).traverse((child) => {
    const cut = child.userData.wallCut as WallCut | undefined;
    if (cut) parts.push({ object: child, cut });
  });

  it('at its height and as a stub the menu lowers it to, the stub hidden to begin with', () => {
    const walls = parts.filter((p) => p.cut.kind === 'wall');
    const stubs = parts.filter((p) => p.cut.kind === 'stub');
    expect(walls).toHaveLength(4);
    expect(stubs).toHaveLength(4);
    for (const stub of stubs) {
      expect(stub.object.visible).toBe(false);
      const box = new THREE.Box3().setFromObject(stub.object, true);
      expect(box.max.y).toBeCloseTo(WALL_STUB_M, 2);
    }
  });

  it('tags the window as an opening to the outside, with its wall’s side', () => {
    const openings = parts.filter((p) => p.cut.kind === 'opening');
    expect(openings).toHaveLength(2);
    expect(openings.every((o) => o.cut.exterior && o.cut.outward && o.cut.mid)).toBe(true);
  });
});
