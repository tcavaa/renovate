import { describe, expect, it } from 'vitest';
import { bedsideSocketHeight, electricalCounts, fittingClashes, fittingFootprintM, KITCHEN_SOCKET_M, placeElectrical, reprojectElectrical, standardElectrical, suggestElectrical, SWITCH_M } from '@/lib/design/electrical';
import { addOpening } from '@/lib/design/openings';
import { APPLIANCE_SOCKET_M, BEDSIDE_LOW_SOCKET_M, BEDSIDE_SWITCH_M, FRIDGE_SOCKET_M, HOOD_SOCKET_M } from '@/lib/design/rules';
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
  it('puts two double sockets and two bedside lights beside the bed, low with no nightstand', () => {
    const points = suggestElectrical(plan(), [bed]);
    const bedroom = points.filter((p) => p.roomId === 'bed');
    const sockets = bedroom.filter((p) => p.kind === 'socket_double');
    expect(sockets).toHaveLength(2);
    for (const s of sockets) {
      expect(s.elevationM).toBe(BEDSIDE_LOW_SOCKET_M);
      expect(s.wallIndex).toBe(0);
      expect(s.position.z).toBeLessThan(0.05);
    }
    const xs = sockets.map((s) => s.position.x).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(2 - 0.8 - 0.25, 1);
    expect(xs[1]).toBeCloseTo(2 + 0.8 + 0.25, 1);
    expect(bedroom.filter((p) => p.kind === 'light_wall' && p.category === 'bedside')).toHaveLength(2);
    expect(bedroom.filter((p) => p.kind === 'light_ceiling')).toHaveLength(1);
    // Two-way: the door's switch and one by each side of the double bed.
    expect(bedroom.some((p) => p.kind === 'switch')).toBe(false);
    const door = bedroom.find((p) => p.kind === 'switch_two_way' && p.wallIndex === 2)!;
    expect(door.elevationM).toBe(SWITCH_M);
    const bedside = bedroom.filter((p) => p.kind === 'switch_two_way' && p.wallIndex === 0);
    expect(bedside).toHaveLength(2);
    expect(bedside.every((p) => p.elevationM === BEDSIDE_SWITCH_M)).toBe(true);
  });

  it('puts a bedside socket 10 cm over its nightstand, within 45–75 cm', () => {
    const stand = (height: number): PlacedItem => ({ id: 'n', roomId: 'bed', slot: 'nightstand', kind: 'nightstand', position: P(0.9, 0.2), elevationM: 0, rotation: 0, size: { width: 0.45, depth: 0.4, height }, product: null });
    expect(bedsideSocketHeight(undefined)).toBe(0.35);
    expect(bedsideSocketHeight(stand(0.55))).toBe(0.65);
    expect(bedsideSocketHeight(stand(0.3))).toBe(0.45);
    expect(bedsideSocketHeight(stand(0.8))).toBe(0.75);
    const points = suggestElectrical(plan(), [bed, stand(0.55)]).filter((p) => p.roomId === 'bed' && p.kind === 'socket_double');
    expect(points.map((p) => p.elevationM).sort()).toEqual([0.35, 0.65]);
  });

  it('switches a hallway 4 m long from both ends', () => {
    let rooms = [rect('hall', 0, 0, 5, 1.4, 'hallway'), rect('a', 0, 1.52, 2, 3, 'bedroom'), rect('b', 3, 1.52, 2, 3, 'bedroom')];
    rooms = addOpening(rooms, 'hall', 'door', 2, 0.1).rooms; // into a, near the hall's left end
    const hallPlan: FloorPlan = { rooms, metresPerPixel: null, bounds: { width: 5, depth: 4.6 }, source: 'manual', wallThicknessM: 0.12 };
    const hall = standardElectrical(hallPlan).filter((p) => p.roomId === 'hall');
    const twoWay = hall.filter((p) => p.kind === 'switch_two_way');
    expect(twoWay).toHaveLength(2);
    const xs = twoWay.map((p) => p.position.x).sort((a, b) => a - b);
    expect(xs[1] - xs[0]).toBeGreaterThan(3);
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
    expect(KITCHEN_SOCKET_M).toBe(1.05);
    expect(kitchen.some((p) => p.kind === 'light_furniture')).toBe(true);
    // The dishwasher's, the oven's and the hob's ignition in the base units; the hood's high; the LED's in the wall cabinets.
    expect(kitchen.filter((p) => p.kind === 'socket' && p.elevationM === APPLIANCE_SOCKET_M)).toHaveLength(3);
    expect(kitchen.filter((p) => p.kind === 'socket_high' && p.elevationM === HOOD_SOCKET_M)).toHaveLength(1);
    expect(kitchen.filter((p) => p.kind === 'socket_high')).toHaveLength(2);
  });

  it('keeps the worktop sockets off the sink, the hob and each other', () => {
    const points = suggestElectrical(plan(), [run]).filter((p) => p.roomId === 'kitchen');
    // No water marked and no fridge: the sink is at the wall's first end (x = 5.32..), the hob 1.8 m along.
    const sinkX = 5.32 + 0.3;
    const hobX = 5.32 + 1.8;
    const worktop = points.filter((p) => p.kind === 'socket_kitchen').map((p) => p.position.x).sort((a, b) => a - b);
    for (const x of worktop) {
      expect(Math.abs(x - sinkX)).toBeGreaterThan(0.45);
      expect(Math.abs(x - hobX)).toBeGreaterThan(0.3);
    }
    for (let i = 1; i < worktop.length; i++) expect(worktop[i] - worktop[i - 1]).toBeGreaterThan(0.2);
  });

  it('puts the fridge’s socket low', () => {
    const fridge: PlacedItem = { id: 'f', roomId: 'kitchen', slot: 'fridge', kind: 'fridge', position: P(8.35, 5.5), elevationM: 0, rotation: -Math.PI / 2, size: { width: 0.6, depth: 0.65, height: 1.9 }, product: null };
    const points = suggestElectrical(plan(), [fridge]).filter((p) => p.roomId === 'kitchen' && p.kind === 'socket' && p.elevationM === FRIDGE_SOCKET_M);
    expect(points).toHaveLength(1);
  });

  it('keeps the points a person placed and does not refill their room', () => {
    const mine: ElectricalPoint = { id: 'mine', roomId: 'bed', kind: 'socket', position: P(1, 0.01), elevationM: 0.45, wallIndex: 0, t: 0.25, origin: 'user' };
    const points = suggestElectrical(plan(), [bed], [mine]);
    expect(points.filter((p) => p.roomId === 'bed')).toEqual([mine]);
    expect(points.some((p) => p.roomId === 'living')).toBe(true);
  });

  it('keeps a room the person wired by hand whole — the app’s points in it too — and wires the others again', () => {
    const before = standardElectrical(plan());
    const bedroom = before.filter((p) => p.roomId === 'bed');
    expect(bedroom.length).toBeGreaterThan(1);
    const mine: ElectricalPoint = { id: 'mine', roomId: 'bed', kind: 'socket', position: P(1, 0.01), elevationM: 0.45, wallIndex: 0, t: 0.25, origin: 'user' };
    const existing = [...before, mine];
    // One socket added: the bedroom keeps its light and switch, and gets no bedside sockets over them.
    for (const points of [suggestElectrical(plan(), [bed], existing), standardElectrical(plan(), existing)]) {
      expect(points.filter((p) => p.roomId === 'bed')).toEqual([...bedroom, mine]);
      // The rooms nobody touched are wired again from the rules: as many points, new ones.
      const living = points.filter((p) => p.roomId === 'living');
      expect(living.map((p) => p.kind).sort()).toEqual(before.filter((p) => p.roomId === 'living').map((p) => p.kind).sort());
      expect(living.some((p) => before.includes(p))).toBe(false);
    }
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
    // One door in the flat — the bedroom's, twinned into the living room — so two switches, and
    // the bedroom's two-way pair adds one by each side of the bed.
    expect(counts.switches).toBe(4);
    expect(counts.lightPoints).toBeGreaterThanOrEqual(5);
    expect(counts.stripM).toBe(4.2);
    expect(counts.dataPoints).toBe(2);
    expect(counts.outlets).toBeGreaterThan(10);
  });
});


describe('two fittings may not share the same piece of wall', () => {
  const room = rect('r', 0, 0, 4, 3, 'living_room');
  const on = (id: string, t: number, elevationM: number, extra: Partial<ElectricalPoint> = {}): ElectricalPoint => ({
    id,
    roomId: room.id,
    kind: 'socket',
    position: P(t * 4, 0),
    elevationM,
    wallIndex: 0,
    t,
    origin: 'user',
    ...extra,
  });

  it('refuses one dropped on top of another', () => {
    const there = on('a', 0.5, 0.45);
    expect(fittingClashes(room, on('b', 0.5, 0.45), [there])).toBe(there);
  });

  it('allows one a plate’s width along the wall', () => {
    // The wall is 4 m, so 0.03 of it is 12 cm — wider than two half-plates of 8 cm.
    expect(fittingClashes(room, on('b', 0.53, 0.45), [on('a', 0.5, 0.45)])).toBeNull();
  });

  it('allows a switch above a socket on the very same spot', () => {
    expect(fittingClashes(room, on('b', 0.5, 1.05, { kind: 'switch' }), [on('a', 0.5, 0.45)])).toBeNull();
  });

  it('never measures a fitting against itself while it is being moved', () => {
    const there = on('a', 0.5, 0.45);
    expect(fittingClashes(room, { ...there, t: 0.505 }, [there], 'a')).toBeNull();
  });

  it('ignores a fitting round the corner on another wall, and one in another room', () => {
    // Another wall and somewhere else in the room: no argument between them.
    expect(fittingClashes(room, on('b', 0.5, 0.45), [on('a', 0.5, 0.45, { wallIndex: 1, position: P(4, 1.5) })])).toBeNull();
    expect(fittingClashes(room, on('b', 0.5, 0.45), [on('a', 0.5, 0.45, { roomId: 'other' })])).toBeNull();
  });

  it('still refuses two that meet at a corner, each on its own wall', () => {
    // Different walls, but the same spot in the room: physically one inside the other.
    expect(fittingClashes(room, on('b', 0.5, 0.45), [on('a', 0.5, 0.45, { wallIndex: 1 })])).not.toBeNull();
  });

  it('gives a double socket a wider plate than a single one', () => {
    expect(fittingFootprintM({ kind: 'socket_double', count: 2 }).width).toBeGreaterThan(fittingFootprintM({ kind: 'socket', count: 1 }).width);
  });

  it('measures a bought fitting by its real size', () => {
    const big = { kind: 'light_wall' as const, sizeM: { width: 0.4, depth: 0.2, height: 0.4 } };
    expect(fittingFootprintM(big)).toEqual({ width: 0.4, height: 0.4 });
    // Two 40 cm lamps 12 cm apart along the wall still bury each other.
    expect(fittingClashes(room, on('b', 0.53, 1.8, big), [on('a', 0.5, 1.8, big)])).not.toBeNull();
  });
});
