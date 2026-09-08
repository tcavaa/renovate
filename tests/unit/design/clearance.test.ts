import { describe, expect, it } from 'vitest';
import { gapBetween, tightSpots } from '@/lib/design/clearance';
import { refreshRoom } from '@/lib/design/planGeometry';
import type { PlacedItem, PlanRoom } from '@/lib/design/types';

const room: PlanRoom = refreshRoom({ id: 'r', type: 'bedroom', name: 'r', polygon: [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 4 }, { x: 0, z: 4 }], heightM: 2.8, areaM2: 0, perimeterM: 0, openings: [] });
const item = (id: string, x: number, z: number, width: number, depth: number, kind = 'bed_double'): PlacedItem => ({ id, roomId: 'r', slot: 'bed', kind, position: { x, z }, elevationM: 0, rotation: 0, size: { width, depth, height: 0.5 }, product: null });

describe('tightSpots', () => {
  it('flags a bed that leaves less than a shoulder to the wall', () => {
    // 1.8 m bed, 0.4 m from the left wall, a metre from the others: the left side is a 40 cm squeeze
    const spots = tightSpots(room, [item('bed', 1.3, 2, 1.8, 2)]);
    expect(spots).toHaveLength(1);
    expect(spots[0].against).toBe('wall');
    expect(spots[0].gapM).toBeCloseTo(0.4, 2);
  });

  it('does not flag pieces standing against a wall or well clear of it', () => {
    expect(tightSpots(room, [item('bed', 0.9, 2, 1.8, 2)])).toHaveLength(0); // flush left, a metre to the other walls
    expect(tightSpots(room, [item('t', 3, 2, 0.8, 0.8)])).toHaveLength(0); // middle of the room
  });

  it('ignores small things and the short ends of big ones', () => {
    // a chair 20 cm from the wall is not a passage problem; neither is the end of a wardrobe
    expect(tightSpots(room, [item('chair', 0.4, 2, 0.5, 0.5, 'dining_chair')])).toHaveLength(0);
    // a wardrobe flush against the top wall: its long side faces 3.4 m of open floor, its ends do not matter
    expect(tightSpots(room, [item('wardrobe', 0.9, 0.3, 1.8, 0.6, 'wardrobe')])).toHaveLength(0);
  });

  it('flags anything standing in a doorway', () => {
    const withDoor: PlanRoom = { ...room, openings: [{ id: 'd', roomId: 'r', kind: 'door', wallIndex: 0, t: 0.5, widthM: 0.9, heightM: 2.05, sillM: 0, exterior: false }] };
    // wall 0 runs along z = 0; the door's inside point is 45 cm in — a cabinet right there blocks it
    const spots = tightSpots(withDoor, [item('cab', 3, 0.5, 1, 0.6, 'shoe_cabinet')]);
    expect(spots.map((s) => s.against)).toEqual(['door']);
    expect(tightSpots(withDoor, [item('cab', 3, 2, 1, 0.6, 'shoe_cabinet')])).toHaveLength(0);
  });

  it('flags two pieces with a sliver between them, but not touching ones', () => {
    const spots = tightSpots(room, [item('a', 2, 2, 1.4, 1, 'wardrobe'), item('b', 3.6, 2, 1.4, 1, 'wardrobe')]);
    expect(spots.map((s) => s.itemId).sort()).toEqual(['a', 'b']);
    expect(spots[0].gapM).toBeCloseTo(0.2, 2);
    expect(spots[0].against).not.toBe('wall');
    expect(tightSpots(room, [item('a', 2, 2, 1.4, 1, 'wardrobe'), item('b', 3.4, 2, 1.4, 1, 'wardrobe')])).toHaveLength(0);
  });

  it('measures the passage only between boxes that face each other', () => {
    expect(gapBetween({ minX: 0, maxX: 1, minZ: 0, maxZ: 1 }, { minX: 1.3, maxX: 2, minZ: 0.5, maxZ: 1.5 })).toBeCloseTo(0.3, 6);
    expect(gapBetween({ minX: 0, maxX: 1, minZ: 0, maxZ: 1 }, { minX: 2, maxX: 3, minZ: 2, maxZ: 3 })).toBeNull();
    expect(gapBetween({ minX: 0, maxX: 1, minZ: 0, maxZ: 1 }, { minX: 0.5, maxX: 1.5, minZ: 0.5, maxZ: 1.5 })).toBeNull();
  });
});
