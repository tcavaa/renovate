import { describe, expect, it } from 'vitest';
import { findFreeSpot, layoutBounds, overlappingRoomIds, rectsOverlap, snap, LAYOUT_GRID_M } from '@/lib/calculator/layout';
import { computeRoomAreas } from '@/lib/calculator/materials';
import type { Room } from '@/lib/calculator/types';

const room = (id: string, width: number, length: number, x?: number, z?: number): Room => ({
  ...computeRoomAreas({ id, type: 'bedroom', nameKa: id, width, length, height: 2.8 }),
  ...(x != null && z != null ? { x, z } : {}),
});

describe('layout grid', () => {
  it('snaps to the editor grid', () => {
    expect(snap(1.13)).toBe(1.25);
    expect(snap(1.12)).toBe(1);
    expect(snap(0.4, 0.5)).toBe(0.5);
    expect(LAYOUT_GRID_M).toBe(0.25);
  });

  it('detects overlapping rectangles but not touching ones', () => {
    expect(rectsOverlap({ x: 0, z: 0, width: 4, length: 3 }, { x: 3, z: 1, width: 2, length: 2 })).toBe(true);
    expect(rectsOverlap({ x: 0, z: 0, width: 4, length: 3 }, { x: 4, z: 0, width: 2, length: 2 })).toBe(false);
  });
});

describe('overlappingRoomIds', () => {
  it('names both rooms of every overlapping pair and ignores unplaced rooms', () => {
    const rooms = [room('a', 4, 3, 0, 0), room('b', 3, 3, 2, 1), room('c', 3, 3, 10, 10), room('d', 3, 3)];
    const ids = overlappingRoomIds(rooms);
    expect([...ids].sort()).toEqual(['a', 'b']);
  });
});

describe('findFreeSpot', () => {
  it('starts at the origin on an empty plan', () => {
    expect(findFreeSpot([], 4, 3)).toEqual({ x: 0, z: 0 });
  });

  it('packs the next room beside the first without overlapping', () => {
    const first = room('a', 4, 3, 0, 0);
    const spot = findFreeSpot([first], 3, 3);
    expect(spot).toEqual({ x: 4, z: 0 });
    expect(rectsOverlap({ ...spot, width: 3, length: 3 }, { x: 0, z: 0, width: 4, length: 3 })).toBe(false);
  });

  it('drops to the next row when the first is full', () => {
    const rooms = [room('a', 7, 3, 0, 0), room('b', 7, 3, 7, 0)];
    const spot = findFreeSpot(rooms, 5, 3);
    expect(spot.z).toBeGreaterThanOrEqual(3);
    expect(rooms.every((r) => !rectsOverlap({ ...spot, width: 5, length: 3 }, { x: r.x!, z: r.z!, width: r.width, length: r.length }))).toBe(true);
  });
});

describe('layoutBounds', () => {
  it('never shrinks below the minimum canvas', () => {
    expect(layoutBounds([])).toEqual({ width: 12, depth: 8 });
  });

  it('grows with the placed rooms plus a margin', () => {
    const rooms = [room('a', 10, 6, 5, 4)];
    expect(layoutBounds(rooms)).toEqual({ width: 16, depth: 11 });
  });
});
