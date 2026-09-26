import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildRoomShells, type SceneUserData } from '@/lib/design3d/buildScene';
import { StyleMaterials } from '@/lib/design3d/materials';
import { wallSideAt } from '@/lib/design3d/wallSide';
import { getStyle } from '@/lib/design/styles';
import { rebuildRooms, wallsForRectangle } from '@/lib/design/walls';
import type { FloorPlan, StyleDefinition } from '@/lib/design/types';

/**
 * Two ways a room's wall came to show a brick nobody had chosen. A brush on the outside of the
 * flat — a far face with no room behind it — resolved to the room's own wall and painted it on
 * the inside; and the style's accent (industrial's brick) stood on the longest clear wall of
 * every dry room by itself, priced nowhere and impossible to erase.
 */

describe('whose wall a hit is', () => {
  // A wall along x from (0, 0) to (4, 0), its room on the +z side, so its far face looks to -z.
  // A neighbour stands behind the first 2.5 m of it; the rest is the outside of the flat.
  const data: Pick<SceneUserData, 'roomId' | 'wallIndex' | 'outward' | 'wallFrame'> = {
    roomId: 'a',
    wallIndex: 0,
    outward: { x: 0, z: -1 },
    wallFrame: { mid: { x: 2, z: 0 }, a: { x: 0, z: 0 }, dir: { x: 1, z: 0 }, length: 4, behind: [{ from: 0, to: 2.5, roomId: 'b', wallIndex: 2 }] },
  };
  const intoTheRoom = { x: 0, z: 1 };
  const outOfIt = { x: 0, z: -1 };

  it('gives the room face, the top and a reveal to the room itself', () => {
    expect(wallSideAt(data, { x: 3, z: 0 }, intoTheRoom)).toEqual({ roomId: 'a', wallIndex: 0 });
    expect(wallSideAt(data, { x: 3, z: 0 }, { x: 0, z: 0 })).toEqual({ roomId: 'a', wallIndex: 0 });
    expect(wallSideAt(data, { x: 3, z: 0 }, { x: 1, z: 0 })).toEqual({ roomId: 'a', wallIndex: 0 });
  });

  it('gives a far face to the room standing behind that stretch', () => {
    expect(wallSideAt(data, { x: 1, z: -0.12 }, outOfIt)).toEqual({ roomId: 'b', wallIndex: 2 });
  });

  it('gives the outside of the flat to nobody, so a brush there paints nothing inside', () => {
    expect(wallSideAt(data, { x: 3.5, z: -0.12 }, outOfIt)).toBeNull();
  });

  it('takes a hit on the mitred run past a corner as the stretch at that end', () => {
    expect(wallSideAt(data, { x: -0.1, z: -0.12 }, outOfIt)).toEqual({ roomId: 'b', wallIndex: 2 });
    expect(wallSideAt(data, { x: 4.1, z: -0.12 }, outOfIt)).toBeNull();
  });
});

describe('the style’s accent wall', () => {
  // Industrial, whose accent is brick; the maps are dropped (a texture wants a `document`),
  // and every surface gets a colour of its own so a wall can be told apart by it.
  const industrial = getStyle('industrial');
  const s = industrial.surfaces;
  const bare = <S extends object>(spec: S, colorHex: string): S => ({ ...spec, colorHex, textureUrl: null, normalUrl: null, roughnessUrl: null });
  const style: StyleDefinition = {
    ...industrial,
    surfaces: { floor: bare(s.floor, '#101010'), wall: bare(s.wall, '#202020'), featureWall: bare(s.featureWall, '#8a4a2b'), ceiling: bare(s.ceiling, '#303030'), wetFloor: bare(s.wetFloor, '#404040'), wetWall: bare(s.wetWall, '#505050') },
  };
  const blank: FloorPlan = { rooms: [], metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', wallThicknessM: 0.12, walls: [] };

  it('is on no wall of a room that chose nothing', () => {
    const built = rebuildRooms(blank, wallsForRectangle({ x: 0, z: 0, width: 5, depth: 3 }, 0.12, 'user', 'r'));
    const plan: FloorPlan = { ...built, rooms: built.rooms.map((r) => ({ ...r, type: 'living_room' })) };
    const colours = new Set<string>();
    buildRoomShells(plan, [], style, new StyleMaterials(style)).traverse((node) => {
      if (!(node instanceof THREE.Mesh) || (node.userData as SceneUserData).surface !== 'wall') return;
      for (const material of [node.material].flat()) if (material instanceof THREE.MeshStandardMaterial) colours.add(material.color.getHexString());
    });
    expect(colours.size).toBeGreaterThan(0);
    expect(colours.has('8a4a2b')).toBe(false);
    expect(colours.has('202020')).toBe(true);
  });
});
