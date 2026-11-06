import { describe, expect, it } from 'vitest';
import { isInteriorWall } from '@/components/plan/draw';
import { alignAcross } from '@/lib/design/openings';
import { refreshRoom, roomEdges } from '@/lib/design/planGeometry';
import { roomTypeName, isAutoRoomName } from '@/lib/design/roomNames';
import type { Opening, PlanRoom } from '@/lib/design/types';

function room(id: string, x0: number, w: number, d: number, openings: Array<Omit<Opening, 'roomId' | 'id'>> = []): PlanRoom {
  return refreshRoom({ id, type: 'living_room', name: id, polygon: [{ x: x0, z: 0 }, { x: x0 + w, z: 0 }, { x: x0 + w, z: d }, { x: x0, z: d }], heightM: 2.7, areaM2: 0, perimeterM: 0, openings: openings.map((o, i) => ({ ...o, id: `${id}-o${i}`, roomId: id })) });
}
const window = (wallIndex: number, t: number): Omit<Opening, 'roomId' | 'id'> => ({ kind: 'window', wallIndex, t, widthM: 1.2, heightM: 1.4, sillM: 0.9, exterior: true });

describe('the plan board', () => {
  it('lines a window up with the one on the opposite wall when it comes within 15 cm (P-4)', () => {
    // A 5 × 4 room: a window on the far wall (z = 4, running from x = 5 to 0) with its middle at x = 2.
    const r = room('r', 0, 5, 4, [window(2, 0.6)]);
    const near = roomEdges(r.polygon).find((e) => e.index === 0)!; // z = 0, x from 0 to 5
    expect(alignAcross([r], near, 2.1 / 5, 1.2, 'window') * 5).toBeCloseTo(2, 5);
    // Further off than 15 cm, it stays where it is put.
    expect(alignAcross([r], near, 2.4 / 5, 1.2, 'window') * 5).toBeCloseTo(2.4, 5);
    // A door is not lined up with a window.
    expect(alignAcross([r], near, 2.1 / 5, 0.8, 'door') * 5).toBeCloseTo(2.1, 5);
  });

  it('measures a wall inside the flat, not one on its outline (P-1)', () => {
    const a = room('a', 0, 4, 4);
    const b = room('b', 4, 3, 4);
    expect(isInteriorWall({ a: { x: 4, z: 0 }, b: { x: 4, z: 4 }, thicknessM: 0.12 }, [a, b])).toBe(true);
    expect(isInteriorWall({ a: { x: 0, z: 0 }, b: { x: 0, z: 4 }, thicknessM: 0.3 }, [a, b])).toBe(false);
  });

  it('names the hall as the entrance too, and still deals the old name again (E-10)', () => {
    expect(roomTypeName('hallway')).toBe('დერეფანი / ჰოლი');
    expect(isAutoRoomName('დერეფანი')).toBe(true);
    expect(isAutoRoomName('დერეფანი / ჰოლი 2')).toBe(true);
  });
});
