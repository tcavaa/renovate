import { describe, expect, it } from 'vitest';
import { layoutRoom } from '@/lib/design/autoLayout';
import { getArchetype } from '@/lib/design/catalog';
import { footprintOf } from '@/lib/design/manipulate';
import { boxInPolygon, pointInPolygon, roomEdges, wallsEnterBox } from '@/lib/design/planGeometry';
import { rebuildRooms } from '@/lib/design/walls';
import type { FloorPlan, PlanRoom, Vec2, Wall } from '@/lib/design/types';

const P = (x: number, z: number): Vec2 => ({ x, z });
const wall = (id: string, a: Vec2, b: Vec2, extra: Partial<Wall> = {}): Wall => ({ id, a, b, thicknessM: 0.12, origin: 'existing', ...extra });
const base: FloorPlan = { rooms: [], metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', wallThicknessM: 0.12, wallHeightM: 2.8, walls: [] };
const roomAt = (plan: FloorPlan, p: Vec2): PlanRoom => plan.rooms.find((r) => pointInPolygon(p, r.polygon))!;

describe('a box inside a room (boxInPolygon)', () => {
  // A U: the gap between its arms runs from x 2 to 4, from z 1.5 to the open side.
  const u: Vec2[] = [P(0, 0), P(6, 0), P(6, 4), P(4, 4), P(4, 1.5), P(2, 1.5), P(2, 4), P(0, 4)];

  it('refuses a box across the gap of a U, though every corner of it is on the floor', () => {
    const across = { minX: 1, maxX: 5, minZ: 2, maxZ: 3 };
    const corners = [P(1, 2), P(5, 2), P(5, 3), P(1, 3)];
    expect(corners.every((c) => pointInPolygon(c, u))).toBe(true);
    expect(boxInPolygon(across, u)).toBe(false);
    expect(boxInPolygon({ minX: 0.5, maxX: 1.5, minZ: 2, maxZ: 3 }, u)).toBe(true);
  });

  it('lets a box touch a wall, not reach into it', () => {
    const left = [{ a: P(0, 0), b: P(0, 4) }];
    expect(wallsEnterBox(left, { minX: 0, maxX: 1, minZ: 1, maxZ: 2 })).toBe(false);
    expect(wallsEnterBox(left, { minX: -0.01, maxX: 1, minZ: 1, maxZ: 2 })).toBe(true);
  });
});

describe('the layout engine stands nothing through a wall', () => {
  // Test project 219's corner: a diagonal partial wall from the bedroom's corner to (3, 2.5),
  // carried on by a separator to the left wall. The engine stood the living room's TV unit on
  // the partial wall's tip, and its rug under it: every corner of both was on the floor.
  const corner = rebuildRooms(base, [
    wall('top', P(0, 0), P(6.82, 0)),
    wall('right', P(6.82, 0), P(6.82, 7.87)),
    wall('bottom', P(6.82, 7.87), P(0, 7.87)),
    wall('left', P(0, 7.87), P(0, 0)),
    wall('bed-top', P(4.26, 3.73), P(6.82, 3.73)),
    wall('bed-left', P(4.26, 3.73), P(4.26, 7.87)),
    wall('diagonal', P(4.26, 3.73), P(3, 2.5), { origin: 'user' }),
    wall('diagonal-sep', P(3, 2.5), P(0, 3.73), { thicknessM: 0, separator: true, origin: 'generated' }),
  ]);
  const living: PlanRoom = { ...roomAt(corner, P(1, 1)), type: 'living_room' };
  const kitchen: PlanRoom = { ...roomAt(corner, P(1, 6)), type: 'kitchen' };

  /** The floor pieces of a layout — what stands on the floor and has to be inside the room. */
  const onFloor = (room: PlanRoom) =>
    layoutRoom(room).filter((item) => {
      const type = getArchetype(item.kind)?.placement.type;
      return type !== 'ceiling' && type !== 'wall-mounted' && type !== 'window';
    });

  it('puts the TV unit where no wall runs through it', () => {
    const tv = onFloor(living).find((item) => item.kind === 'tv_unit');
    expect(tv).toBeDefined();
    const box = footprintOf(tv!.position, tv!.size, tv!.rotation);
    expect(wallsEnterBox(roomEdges(living.polygon), box)).toBe(false);
    // Not on the partial wall's end, where it used to stand.
    expect(Math.hypot(tv!.position.x - 2.96, tv!.position.z - 2.52)).toBeGreaterThan(0.3);
  });

  it('keeps every floor piece of both rooms, the rug included, inside its room', () => {
    for (const room of [living, kitchen]) {
      for (const item of onFloor(room)) {
        expect({ kind: item.kind, inside: boxInPolygon(footprintOf(item.position, item.size, item.rotation), room.polygon) }).toEqual({ kind: item.kind, inside: true });
      }
    }
  });
});

describe('dining chairs', () => {
  it('stand a little under their table, not clear of its edge', () => {
    // A kitchen big enough for a dining table with chairs on every side.
    const plan = rebuildRooms(base, [wall('t', P(0, 0), P(6, 0)), wall('r', P(6, 0), P(6, 5)), wall('b', P(6, 5), P(0, 5)), wall('l', P(0, 5), P(0, 0))]);
    const room = { ...plan.rooms[0], type: 'kitchen' as const };
    const items = layoutRoom(room);
    const table = items.find((i) => i.kind === 'dining_table');
    const chairs = items.filter((i) => i.kind === 'dining_chair');
    expect(table).toBeDefined();
    expect(chairs.length).toBeGreaterThan(0);
    const t = footprintOf(table!.position, table!.size, table!.rotation);
    for (const chair of chairs) {
      const c = footprintOf(chair.position, chair.size, chair.rotation);
      // The two boxes overlap: the seat's front is under the table's top.
      const overlapX = Math.min(t.maxX, c.maxX) - Math.max(t.minX, c.minX);
      const overlapZ = Math.min(t.maxZ, c.maxZ) - Math.max(t.minZ, c.minZ);
      expect(Math.min(overlapX, overlapZ)).toBeGreaterThan(0.05);
    }
  });
});
