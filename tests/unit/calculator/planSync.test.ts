import { describe, expect, it } from 'vitest';
import { planFollowsRooms, reconcileCalculatorPlan, sameCalculatorRooms } from '@/lib/calculator/planSync';
import { computeRoomAreas } from '@/lib/calculator/materials';
import { ensureWalls } from '@/lib/design/walls';
import { planFromCalculatorRooms } from '@/lib/design/planGeometry';
import type { Room } from '@/lib/calculator/types';

const room = (id: string, width: number, length: number, x: number, z: number, type: Room['type'] = 'bedroom'): Room => ({
  ...computeRoomAreas({ id, type, nameKa: id, width, length, height: 2.7 }),
  x,
  z,
});

/** Flat A: two rooms side by side. Flat B: three rooms, none sharing an id with A. */
const flatA = [room('a-living', 5, 4, 0, 0, 'living_room'), room('a-bed', 3, 4, 5.12, 0)];
const flatB = [room('b-hall', 2, 6, 0, 0, 'hallway'), room('b-kitchen', 3, 3, 2.12, 0, 'kitchen'), room('b-bath', 3, 2.88, 2.12, 3.12, 'bathroom')];

describe('the calculator and the plan agree on one flat', () => {
  it('rebuilds the plan only when the rooms are a different flat', () => {
    const planA = ensureWalls(planFromCalculatorRooms(flatA));
    expect(planFollowsRooms(null, flatA)).toBe(true);
    expect(planFollowsRooms(planA, [])).toBe(false);
    expect(planFollowsRooms(planA, flatA)).toBe(false);
    expect(planFollowsRooms(planA, flatB)).toBe(true);
  });

  it('settles in one step when the plan and the rooms are different flats, and stays settled', () => {
    const planA = ensureWalls(planFromCalculatorRooms(flatA));
    const first = reconcileCalculatorPlan(planA, flatB);
    expect(first.plan).not.toBe(planA);
    expect(first.plan!.rooms).toHaveLength(3);
    // The rooms now carry the plan's ids, so the next round changes nothing.
    const second = reconcileCalculatorPlan(first.plan, first.rooms);
    expect(second.plan).toBe(first.plan);
    expect(second.rooms).toBe(first.rooms);
    // …and a third round neither grows the plan nor moves a room.
    const third = reconcileCalculatorPlan(second.plan, second.rooms);
    expect(third.plan!.rooms).toHaveLength(3);
    expect(third.rooms).toBe(second.rooms);
  });

  it('reads the rooms off an agreeing plan and writes nothing when they already match', () => {
    const planA = ensureWalls(planFromCalculatorRooms(flatA));
    const synced = reconcileCalculatorPlan(planA, flatA);
    expect(synced.plan).toBe(planA);
    // The wall graph lists its faces in its own order; the ids are the rooms' own.
    expect(synced.rooms.map((r) => r.id).sort()).toEqual(['a-bed', 'a-living']);
    const again = reconcileCalculatorPlan(planA, synced.rooms);
    expect(again.rooms).toBe(synced.rooms);
    expect(sameCalculatorRooms(synced.rooms, again.rooms)).toBe(true);
  });

  it('makes a plan for typed rooms when there is none', () => {
    const made = reconcileCalculatorPlan(null, flatA);
    expect(made.plan?.rooms.map((r) => r.id).sort()).toEqual(['a-bed', 'a-living']);
    expect(made.plan?.walls?.length ?? 0).toBeGreaterThan(0);
  });
});
