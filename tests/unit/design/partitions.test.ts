import { describe, expect, it } from 'vitest';
import { boardPartitionCounts, buildsPartitions, partitionArea, partitionWall, partitionWalls } from '@/lib/design/partitions';
import { rebuildRooms, wallsForRectangle } from '@/lib/design/walls';
import { HOME_STATES } from '@/lib/calculator/constants';
import type { FloorPlan, Vec2, Wall } from '@/lib/design/types';

const P = (x: number, z: number): Vec2 => ({ x, z });
const wall = (id: string, a: Vec2, b: Vec2, extra: Partial<Wall> = {}): Wall => ({ id, a, b, thicknessM: 0.12, origin: 'existing', ...extra });
const base: FloorPlan = { rooms: [], metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', wallThicknessM: 0.12, wallHeightM: 2.8, walls: [] };

/** Two rooms side by side, 4 × 3 m each, sharing the wall at x = 4. */
function pair(extra: Wall[] = []): FloorPlan {
  return rebuildRooms(base, [
    wall('top', P(0, 0), P(8, 0)),
    wall('right', P(8, 0), P(8, 3)),
    wall('bottom', P(8, 3), P(0, 3)),
    wall('left', P(0, 3), P(0, 0)),
    wall('mid', P(4, 0), P(4, 3)),
    ...extra,
  ]);
}

describe('partition walls', () => {
  it('prices the wall between two rooms, never the building’s own', () => {
    const plan = pair();
    expect(partitionWalls(plan).map((p) => p.wall.id)).toEqual(['mid']);
    expect(partitionWall(plan, 'mid')).toMatchObject({ interior: true, areaM2: 8.4 });
    // Every piece of the outer walls has a room on one side only.
    expect(partitionWall(plan, 'top')).toBeNull();
    expect(partitionArea(plan).partitionM2).toBeCloseTo(3 * 2.8, 2);
  });

  it('prices a partial wall standing in a room: the room is on both of its sides', () => {
    const plan = pair([wall('stub', P(0, 1.5), P(2, 1.5))]);
    expect(partitionWall(plan, 'stub')).toMatchObject({ interior: true, areaM2: 5.6 });
    expect(partitionArea(plan).partitionM2).toBeCloseTo((3 + 2) * 2.8, 2);
  });

  it('leaves out a wall that already stands, and a room separator', () => {
    const plan = pair();
    const built = { ...plan, walls: (plan.walls ?? []).map((w) => (w.id === 'mid' ? { ...w, built: true } : w)) };
    expect(partitionArea(built).partitionM2).toBe(0);
    // Still a partition — the question is asked of it — only not priced.
    expect(partitionWall(built, 'mid')).not.toBeNull();
    const separated = { ...plan, walls: (plan.walls ?? []).map((w) => (w.id === 'mid' ? { ...w, thicknessM: 0, separator: true } : w)) };
    expect(partitionWall(separated, 'mid')).toBeNull();
  });

  it('counts a wall standing free at its own height', () => {
    const plan = pair([wall('free', P(10, 0), P(10, 2), { heightM: 3 })]);
    expect(partitionWall(plan, 'free')).toMatchObject({ interior: false, areaM2: 6 });
  });
});

describe('the calculator’s board', () => {
  it('measures the partitions of a flat drawn joined up', () => {
    expect(boardPartitionCounts(pair()).partitionM2).toBeCloseTo(8.4, 2);
  });

  it('leaves rooms typed by size, standing apart, to the estimate from the rooms', () => {
    const apart = rebuildRooms(base, [...wallsForRectangle({ x: 0, z: 0, width: 4, depth: 3 }, 0.12, 'user', 'a'), ...wallsForRectangle({ x: 6, z: 0, width: 3, depth: 3 }, 0.12, 'user', 'b')]);
    expect(apart.rooms).toHaveLength(2);
    expect(boardPartitionCounts(apart)).toEqual({});
    expect(boardPartitionCounts(null)).toEqual({});
  });

  it('is asked only when the renovation builds walls: a black frame', () => {
    expect(buildsPartitions(HOME_STATES.black_frame.includedPhases)).toBe(true);
    expect(buildsPartitions(HOME_STATES.white_frame.includedPhases)).toBe(false);
    expect(buildsPartitions(HOME_STATES.green_frame.includedPhases)).toBe(false);
    expect(buildsPartitions(HOME_STATES.old_renovation.includedPhases)).toBe(false);
  });
});
