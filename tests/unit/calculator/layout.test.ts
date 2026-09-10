import { describe, expect, it } from 'vitest';
import { findFreeSpot, layoutBounds, overlappingRoomIds, rectsOverlap, snap, snapCm, snapToNeighbours, LAYOUT_GRID_M, MOVE_STEP_M } from '@/lib/calculator/layout';
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

  it('moves rooms to the centimetre', () => {
    expect(MOVE_STEP_M).toBe(0.01);
    expect(snapCm(3.3249)).toBe(3.32);
    expect(snapCm(0.1 + 0.2)).toBe(0.3);
  });

  it('detects overlapping rectangles but not touching ones', () => {
    expect(rectsOverlap({ x: 0, z: 0, width: 4, length: 3 }, { x: 3, z: 1, width: 2, length: 2 })).toBe(true);
    expect(rectsOverlap({ x: 0, z: 0, width: 4, length: 3 }, { x: 4, z: 0, width: 2, length: 2 })).toBe(false);
  });
});

describe('snapToNeighbours', () => {
  const anchor = { x: 0, z: 0, width: 4, length: 3 };

  it('pulls a room flush against the wall it is pushed towards', () => {
    // Dragged to 17 cm short of the anchor's right wall, on the same row.
    const snapped = snapToNeighbours({ x: 4.17, z: 0.2, width: 3, length: 3 }, [anchor]);
    expect(snapped.x).toBe(4);
    // Top walls line up too — 20 cm off is within reach.
    expect(snapped.z).toBe(0);
    expect(snapped.guides.map((g) => g.axis).sort()).toEqual(['x', 'z']);
    expect(rectsOverlap({ ...snapped, width: 3, length: 3 }, anchor)).toBe(false);
  });

  it('snaps below a neighbour as well as beside it', () => {
    const snapped = snapToNeighbours({ x: 0.1, z: 3.22, width: 4, length: 2 }, [anchor]);
    expect(snapped).toMatchObject({ x: 0, z: 3 });
  });

  it('leaves a room alone when nothing is close', () => {
    const snapped = snapToNeighbours({ x: 7.5, z: 6.2, width: 3, length: 3 }, [anchor]);
    expect(snapped).toMatchObject({ x: 7.5, z: 6.2, guides: [] });
  });

  it('ignores rooms that are not alongside on the other axis', () => {
    // Left wall 10 cm from the anchor's left wall, but three metres below it: no snap.
    const snapped = snapToNeighbours({ x: 0.1, z: 6.5, width: 3, length: 3 }, [anchor]);
    expect(snapped.x).toBe(0.1);
    expect(snapped.guides).toEqual([]);
  });

  it('takes the closest candidate when several walls are in reach', () => {
    const other = { x: 7, z: 0, width: 3, length: 3 };
    // 5 cm from the first room's right wall, 25 cm from the second's left wall.
    const snapped = snapToNeighbours({ x: 4.05, z: 0, width: 2.7, length: 3 }, [anchor, other]);
    expect(snapped.x).toBe(4);
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
