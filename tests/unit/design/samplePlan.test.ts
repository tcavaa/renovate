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
    expect(types).toEqual(['balcony', 'balcony', 'bathroom', 'bedroom', 'bedroom', 'hallway', 'kitchen', 'living_room', 'office', 'toilet']);
    // About 150 m² as a flat is advertised (to the walls' middle), about 144 m² of floor once the walls stand.
    const outline = samplePlan().rooms.reduce((s, r) => s + r.areaM2, 0);
    expect(outline).toBeGreaterThan(149);
    expect(outline).toBeLessThan(152);
    const floor = plan.rooms.reduce((s, r) => s + r.areaM2, 0);
    expect(floor).toBeGreaterThan(140);
    expect(floor).toBeLessThan(150);
    expect(plan.walls?.length).toBeGreaterThan(15);
  });

  it('opens every bedroom, the bathroom, the toilet, the office and the living room off the hallway', () => {
    const plan = onBoard();
    const hallway = plan.rooms.find((r) => r.type === 'hallway')!;
    const off = new Set(hallway.openings.map((o) => o.connectsToRoomId).filter(Boolean).map((id) => plan.rooms.find((r) => r.id === id)!.type));
    expect([...off].sort()).toEqual(['bathroom', 'bedroom', 'living_room', 'office', 'toilet']);
    expect(hallway.openings.filter((o) => o.connectsToRoomId && plan.rooms.find((r) => r.id === o.connectsToRoomId)!.type === 'bedroom')).toHaveLength(2);
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
    // Five doors inside, the entrance and the two balcony doors; two archways are not doors.
    expect(countDoors(plan)).toBe(8);
    expect(countWindows(plan)).toBe(9);
    expect(calculatorRoomsFromPlan(plan)).toHaveLength(10);
    // Each balcony's front is a railing.
    for (const balcony of plan.rooms.filter((r) => r.type === 'balcony')) expect(balcony.openings.some((o) => o.kind === 'railing')).toBe(true);
  });
});
