import { describe, expect, it } from 'vitest';
import { samplePlan } from '@/lib/design/samplePlan';
import { ensureWalls } from '@/lib/design/walls';
import { withPartialWallSeparators, withSplitRoomTypes } from '@/lib/design/separators';
import { countDoors, countWindows } from '@/lib/design/openings';
import { calculatorRoomsFromPlan } from '@/lib/design/planGeometry';

/** Taken onto the board as `designStore.setPlan` takes any plan. */
function onBoard() {
  const ensured = ensureWalls(samplePlan());
  return withSplitRoomTypes(ensured.rooms, withPartialWallSeparators(ensured));
}

describe('the sample flat (სანიმუშო გეგმა)', () => {
  it('has every kind of room the studio furnishes', () => {
    const plan = onBoard();
    const types = plan.rooms.map((r) => r.type).sort();
    expect(types).toEqual(['balcony', 'balcony', 'bathroom', 'bedroom', 'bedroom', 'closet', 'hallway', 'kitchen', 'living_room', 'office', 'toilet']);
    expect(plan.rooms.find((r) => r.type === 'office')!.polygon).toHaveLength(6);
    const area = plan.rooms.reduce((s, r) => s + r.areaM2, 0);
    expect(area).toBeGreaterThan(110);
    expect(area).toBeLessThan(125);
    expect(plan.walls?.length).toBeGreaterThan(15);
  });

  it('cuts every door between two rooms in both of them, and can be walked from the entrance to every room', () => {
    const plan = onBoard();
    const byId = new Map(plan.rooms.map((r) => [r.id, r]));
    for (const room of plan.rooms) {
      for (const o of room.openings) {
        if (!o.connectsToRoomId) continue;
        const other = byId.get(o.connectsToRoomId)!;
        expect(other.openings.some((x) => x.connectsToRoomId === room.id)).toBe(true);
      }
    }
    const entrance = plan.rooms.find((r) => r.openings.some((o) => o.kind === 'door' && o.exterior))!;
    expect(entrance.type).toBe('hallway');
    const seen = new Set([entrance.id]);
    const queue = [entrance.id];
    while (queue.length) {
      const room = byId.get(queue.shift()!)!;
      for (const o of room.openings) if (o.connectsToRoomId && !seen.has(o.connectsToRoomId)) {
        seen.add(o.connectsToRoomId);
        queue.push(o.connectsToRoomId);
      }
    }
    expect(seen.size).toBe(plan.rooms.length);
  });

  it('counts its doors and windows once, and the calculator takes every room', () => {
    const plan = onBoard();
    // Seven doors inside, the entrance and the two balcony doors; two archways are not doors.
    expect(countDoors(plan)).toBe(10);
    expect(countWindows(plan)).toBe(8);
    expect(calculatorRoomsFromPlan(plan)).toHaveLength(11);
    // Each balcony's front is a railing.
    for (const balcony of plan.rooms.filter((r) => r.type === 'balcony')) expect(balcony.openings.some((o) => o.kind === 'railing')).toBe(true);
  });
});
