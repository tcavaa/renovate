import { describe, expect, it } from 'vitest';
import { BEDSIDE_SOCKET_M, electricalCounts, KITCHEN_SOCKET_M, placeElectrical, reprojectElectrical, suggestElectrical, SWITCH_M } from '@/lib/design/electrical';
import { addOpening } from '@/lib/design/openings';
import { refreshRoom, roomEdges } from '@/lib/design/planGeometry';
import type { ElectricalPoint, FloorPlan, PlacedItem, PlanRoom, Vec2 } from '@/lib/design/types';

const P = (x: number, z: number): Vec2 => ({ x, z });
const rect = (id: string, x: number, z: number, w: number, d: number, type: PlanRoom['type']): PlanRoom =>
  refreshRoom({ id, type, name: id, polygon: [P(x, z), P(x + w, z), P(x + w, z + d), P(x, z + d)], heightM: 2.7, areaM2: 0, perimeterM: 0, openings: [] });

/** A bed against the top wall (z = 0), facing +z into the room. */
const bed: PlacedItem = { id: 'bed', roomId: 'bed', slot: 'bed', kind: 'bed_double', position: P(2, 1.05), elevationM: 0, rotation: 0, size: { width: 1.6, depth: 2.05, height: 1 }, product: null };
/** A television unit against the living room's bottom wall (z = 8.62), facing up the room. */
const tv: PlacedItem = { id: 'tv', roomId: 'living', slot: 'tv_unit', kind: 'tv_unit', position: P(2.5, 8.41), elevationM: 0, rotation: Math.PI, size: { width: 1.6, depth: 0.42, height: 0.5 }, product: null };
/** A kitchen run along the kitchen's top wall (z = 3.62). */
const run: PlacedItem = { id: 'run', roomId: 'kitchen', slot: 'kitchen_run', kind: 'kitchen_run', position: P(6.92, 3.92), elevationM: 0, rotation: 0, size: { width: 3.2, depth: 0.6, height: 2.2 }, product: null };

function plan(): FloorPlan {
  let rooms = [rect('bed', 0, 0, 4, 3.5, 'bedroom'), rect('living', 0, 3.62, 5, 5, 'living_room'), rect('kitchen', 5.12, 3.62, 3.6, 3, 'kitchen')];
  rooms = addOpening(rooms, 'bed', 'door', 2, 0.12).rooms; // bottom wall of the bedroom, into the living room
  return { rooms, metresPerPixel: null, bounds: { width: 8.7, depth: 8.6 }, source: 'manual', wallThicknessM: 0.12 };
}

describe('suggestElectrical', () => {
  it('puts two double sockets and two bedside lights beside the bed at bedside height', () => {
    const points = suggestElectrical(plan(), [bed]);
    const bedroom = points.filter((p) => p.roomId === 'bed');
    const sockets = bedroom.filter((p) => p.kind === 'socket_double');
    expect(sockets).toHaveLength(2);
    for (const s of sockets) {
      expect(s.elevationM).toBe(BEDSIDE_SOCKET_M);
      expect(s.wallIndex).toBe(0);
      expect(s.position.z).toBeLessThan(0.05);
    }
    const xs = sockets.map((s) => s.position.x).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(2 - 0.8 - 0.25, 1);
    expect(xs[1]).toBeCloseTo(2 + 0.8 + 0.25, 1);
    expect(bedroom.filter((p) => p.kind === 'light_wall' && p.category === 'bedside')).toHaveLength(2);
    expect(bedroom.filter((p) => p.kind === 'light_ceiling')).toHaveLength(1);
    const sw = bedroom.find((p) => p.kind === 'switch')!;
    expect(sw.elevationM).toBe(SWITCH_M);
    expect(sw.wallIndex).toBe(2);
  });

  it('wires the television wall and the kitchen worktop', () => {
    const points = suggestElectrical(plan(), [tv, run]);
    const living = points.filter((p) => p.roomId === 'living');
    expect(living.some((p) => p.kind === 'tv')).toBe(true);
    expect(living.some((p) => p.kind === 'internet')).toBe(true);
    expect(living.filter((p) => p.kind === 'socket_high').every((p) => p.elevationM === 1.7)).toBe(true);
    expect(living.filter((p) => p.kind === 'socket_high')).toHaveLength(2);
    const kitchen = points.filter((p) => p.roomId === 'kitchen');
    const worktop = kitchen.filter((p) => p.kind === 'socket_kitchen');
    expect(worktop).toHaveLength(3);
    expect(worktop.every((p) => p.elevationM === KITCHEN_SOCKET_M)).toBe(true);
    expect(kitchen.some((p) => p.kind === 'light_furniture')).toBe(true);
  });

  it('keeps the points a person placed and does not refill their room', () => {
    const mine: ElectricalPoint = { id: 'mine', roomId: 'bed', kind: 'socket', position: P(1, 0.01), elevationM: 0.45, wallIndex: 0, t: 0.25, origin: 'user' };
    const points = suggestElectrical(plan(), [bed], [mine]);
    expect(points.filter((p) => p.roomId === 'bed')).toEqual([mine]);
    expect(points.some((p) => p.roomId === 'living')).toBe(true);
  });
});

describe('placing and counting', () => {
  it('drops a hand-placed socket onto the nearest wall and a ceiling light where it is', () => {
    const room = plan().rooms[0];
    const socket = placeElectrical(room, 'socket', P(1, 0.3), 's1');
    expect(socket.wallIndex).toBe(0);
    expect(socket.position.z).toBeCloseTo(0.01, 3);
    expect(socket.origin).toBe('user');
    const light = placeElectrical(room, 'light_ceiling', P(2, 1.5), 'l1');
    expect(light.wallIndex).toBeNull();
    expect(light.elevationM).toBe(2.7);
    expect(light.on).toBe(true);
  });

  it('follows a wall that moved and drops a point whose wall is gone', () => {
    const before = plan();
    const socket = placeElectrical(before.rooms[0], 'socket', P(1, 0.3), 's1');
    const taller = { ...before, rooms: [rect('bed', 0, -0.5, 4, 4, 'bedroom'), ...before.rooms.slice(1)] };
    const [moved] = reprojectElectrical([socket], taller);
    expect(moved.position.z).toBeCloseTo(-0.49, 2);
    expect(roomEdges(taller.rooms[0].polygon).find((e) => e.index === moved.wallIndex)!.a.z).toBeCloseTo(-0.5, 6);
    const gone = { ...before, rooms: before.rooms.slice(1) };
    expect(reprojectElectrical([socket], gone)).toEqual([]);
  });

  it('counts outlets, switches, lights and strip metres', () => {
    const points = suggestElectrical(plan(), [bed, tv, run]);
    const counts = electricalCounts([...points, { id: 'strip', roomId: 'bed', kind: 'light_strip', position: P(2, 2), elevationM: 0.3, lengthM: 4.2, on: true, origin: 'user' }]);
    // One door in the flat — the bedroom's, twinned into the living room — so two switches.
    expect(counts.switches).toBe(2);
    expect(counts.lightPoints).toBeGreaterThanOrEqual(5);
    expect(counts.stripM).toBe(4.2);
    expect(counts.dataPoints).toBe(2);
    expect(counts.outlets).toBeGreaterThan(10);
  });
});
