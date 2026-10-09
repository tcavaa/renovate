import { describe, expect, it } from 'vitest';
import { findFreeSpot } from '@/lib/design/freeSpot';

describe('findFreeSpot', () => {
  it('starts at the origin on an empty plan', () => {
    expect(findFreeSpot([], 4, 3)).toEqual({ x: 0, z: 0 });
  });

  it('packs the next room beside the first without overlapping', () => {
    expect(findFreeSpot([{ x: 0, z: 0, width: 4, length: 3 }], 3, 3)).toEqual({ x: 4, z: 0 });
  });

  it('drops to the next row when the first is full', () => {
    const spot = findFreeSpot([{ x: 0, z: 0, width: 7, length: 3 }, { x: 7, z: 0, width: 7, length: 3 }], 5, 3);
    expect(spot.z).toBeGreaterThanOrEqual(3);
  });
});
