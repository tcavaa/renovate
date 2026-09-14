import { describe, expect, it } from 'vitest';
import {
  addWalls,
  buildWallGraph,
  ensureWalls,
  moveNode,
  offsetWall,
  orphanWallSegments,
  rebuildRooms,
  removeWall,
  reprojectOpenings,
  roomsFromWalls,
  wallFaces,
  wallForEdge,
  wallsForRectangle,
  wallsFromRooms,
  wallThicknessForEdge,
} from '@/lib/design/walls';
import { addOpening } from '@/lib/design/openings';
import { polygonAreaM2, refreshRoom, roomEdges } from '@/lib/design/planGeometry';
import type { FloorPlan, PlanRoom, Vec2, Wall } from '@/lib/design/types';

const wall = (id: string, a: Vec2, b: Vec2, thicknessM = 0.12): Wall => ({ id, a, b, thicknessM, origin: 'user' });
const P = (x: number, z: number): Vec2 => ({ x, z });

/** A closed rectangle of walls with centrelines on the given box. */
function box(prefix: string, x0: number, z0: number, x1: number, z1: number, t = 0.12): Wall[] {
  return [
    wall(`${prefix}-top`, P(x0, z0), P(x1, z0), t),
    wall(`${prefix}-right`, P(x1, z0), P(x1, z1), t),
    wall(`${prefix}-bottom`, P(x1, z1), P(x0, z1), t),
    wall(`${prefix}-left`, P(x0, z1), P(x0, z0), t),
  ];
}

const rect = (id: string, x: number, z: number, w: number, d: number, type: PlanRoom['type'] = 'bedroom'): PlanRoom =>
  refreshRoom({
    id,
    type,
    name: id,
    polygon: [P(x, z), P(x + w, z), P(x + w, z + d), P(x, z + d)],
    heightM: 2.8,
    areaM2: 0,
    perimeterM: 0,
    openings: [],
  });

const plan = (rooms: PlanRoom[], walls?: Wall[]): FloorPlan => ({
  rooms,
  metresPerPixel: null,
  bounds: { width: 0, depth: 0 },
  source: 'manual',
  wallThicknessM: 0.12,
  ...(walls ? { walls } : {}),
});

describe('wall graph and faces', () => {
  it('finds one room inside four walls, offset inwards by half the thickness', () => {
    const rooms = roomsFromWalls(box('a', 0, 0, 4, 3));
    expect(rooms).toHaveLength(1);
    const [room] = rooms;
    expect(room.polygon).toHaveLength(4);
    expect(room.areaM2).toBeCloseTo(3.88 * 2.88, 2);
    const xs = room.polygon.map((p) => p.x);
    expect(Math.min(...xs)).toBeCloseTo(0.06, 3);
    expect(Math.max(...xs)).toBeCloseTo(3.94, 3);
    // The polygon winds the way every other room does: positive area.
    expect(polygonAreaM2(room.polygon)).toBeGreaterThan(0);
    expect(room.wallIds).toHaveLength(4);
  });

  it('splits a loop in two with one partition and keeps the wall ids per edge', () => {
    const walls = [...box('a', 0, 0, 8, 3), wall('mid', P(4, 0), P(4, 3))];
    const graph = buildWallGraph(walls);
    // The top and bottom walls are split at the partition: 4 + 1 + 2 extra pieces.
    expect(graph.edges).toHaveLength(7);
    const faces = wallFaces(graph);
    expect(faces).toHaveLength(2);
    const rooms = roomsFromWalls(walls);
    expect(rooms).toHaveLength(2);
    for (const room of rooms) {
      expect(room.areaM2).toBeCloseTo(3.88 * 2.88, 2);
      expect(room.wallIds).toContain('mid');
    }
  });

  it('closes a T-junction whose end stops a hair short of the wall', () => {
    const walls = [...box('a', 0, 0, 8, 3), wall('mid', P(4, 0.015), P(4, 2.99))];
    expect(roomsFromWalls(walls)).toHaveLength(2);
  });

  it('ignores a dangling wall inside a room but still reports it as a free-standing piece', () => {
    const walls = [...box('a', 0, 0, 4, 3), wall('stub', P(2, 1), P(2, 2))];
    const rooms = roomsFromWalls(walls);
    expect(rooms).toHaveLength(1);
    const orphans = orphanWallSegments(plan(rooms, walls));
    expect(orphans.map((o) => o.wall.id)).toEqual(['stub']);
  });

  it('keeps an L-shaped loop as one six-cornered room', () => {
    const pts = [P(0, 0), P(6, 0), P(6, 3), P(3, 3), P(3, 5), P(0, 5)];
    const walls = pts.map((p, i) => wall(`l${i}`, p, pts[(i + 1) % pts.length]));
    const rooms = roomsFromWalls(walls);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].polygon).toHaveLength(6);
    expect(rooms[0].areaM2).toBeCloseTo(polygonAreaM2(pts) - 0.06 * 22 + 0.06 * 0.06 * 2, 1);
  });

  it('lets two walls of different thickness meet in line with a small jog', () => {
    const walls = [wall('thin', P(0, 0), P(3, 0), 0.1), wall('thick', P(3, 0), P(6, 0), 0.25), wall('r', P(6, 0), P(6, 3)), wall('b', P(6, 3), P(0, 3)), wall('l', P(0, 3), P(0, 0))];
    const rooms = roomsFromWalls(walls);
    expect(rooms).toHaveLength(1);
    const zs = rooms[0].polygon.map((p) => p.z);
    expect(Math.min(...zs)).toBeCloseTo(0.05, 3);
    expect(zs.filter((z) => Math.abs(z - 0.125) < 1e-6).length).toBeGreaterThan(0);
  });
});

describe('editing walls', () => {
  it('keeps room ids, names and doors when a wall is moved', () => {
    const walls = [...box('a', 0, 0, 8, 3), wall('mid', P(4, 0), P(4, 3))];
    let rooms = roomsFromWalls(walls).map((r, i) => ({ ...r, name: i === 0 ? 'Hall' : 'Bed', type: (i === 0 ? 'hallway' : 'bedroom') as PlanRoom['type'] }));
    const left = rooms.find((r) => r.polygon.some((p) => p.x < 1))!;
    const shared = roomEdges(left.polygon).find((e) => Math.abs(e.a.x - 3.94) < 1e-6 && Math.abs(e.b.x - 3.94) < 1e-6)!;
    const added = addOpening(rooms, left.id, 'door', shared.index, 0.12);
    expect(added.openingId).not.toBeNull();
    rooms = added.rooms;
    const before = new Map(rooms.map((r) => [r.id, r.name]));

    // Push the partition half a metre to the right (the partition runs a → b downwards, so
    // its left-hand normal points west and a negative offset moves it east): the hall
    // grows, the bedroom shrinks.
    const moved = offsetWall(walls, 'mid', -0.5);
    const mid = moved.find((w) => w.id === 'mid')!;
    expect(mid.a.x).toBeCloseTo(4.5, 3);
    const next = roomsFromWalls(moved, { previous: rooms });
    expect(next.map((r) => r.id).sort()).toEqual([...before.keys()].sort());
    for (const room of next) expect(room.name).toBe(before.get(room.id));
    const hall = next.find((r) => r.name === 'Hall')!;
    expect(hall.areaM2).toBeCloseTo(4.38 * 2.88, 2);
    // The door came along, still on the partition, still paired.
    const door = hall.openings.find((o) => o.kind === 'door')!;
    expect(door).toBeDefined();
    const edge = roomEdges(hall.polygon).find((e) => e.index === door.wallIndex)!;
    expect(edge.a.x).toBeCloseTo(4.44, 2);
    const bed = next.find((r) => r.name === 'Bed')!;
    expect(bed.openings.some((o) => o.connectsToRoomId === hall.id)).toBe(true);
  });

  it('drags the walls that end on a moved wall along with it', () => {
    const walls = [...box('a', 0, 0, 8, 3), wall('mid', P(4, 0), P(4, 3))];
    const moved = offsetWall(walls, 'a-top', -0.4);
    const mid = moved.find((w) => w.id === 'mid')!;
    expect(Math.min(mid.a.z, mid.b.z)).toBeCloseTo(-0.4, 3);
    const left = moved.find((w) => w.id === 'a-left')!;
    expect(Math.min(left.a.z, left.b.z)).toBeCloseTo(-0.4, 3);
    expect(roomsFromWalls(moved)).toHaveLength(2);
  });

  it('moves a junction with every wall that ends there', () => {
    const moved = moveNode(box('a', 0, 0, 4, 3), P(4, 3), P(5, 3.5));
    expect(moved.filter((w) => (w.a.x === 5 && w.a.z === 3.5) || (w.b.x === 5 && w.b.z === 3.5))).toHaveLength(2);
    expect(roomsFromWalls(moved)).toHaveLength(1);
  });

  it('merges a wall drawn along an existing one instead of doubling it', () => {
    const walls = addWalls(box('a', 0, 0, 4, 3), [wall('ext', P(4, 0), P(7, 0))]);
    expect(walls.filter((w) => w.a.z === 0 && w.b.z === 0)).toHaveLength(1);
    const top = walls.find((w) => w.a.z === 0 && w.b.z === 0)!;
    expect(Math.max(top.a.x, top.b.x)).toBe(7);
    expect(Math.min(top.a.x, top.b.x)).toBe(0);
  });

  it('removing the partition merges the rooms into one that keeps the larger room’s identity', () => {
    const walls = [...box('a', 0, 0, 8, 3), wall('mid', P(4, 0), P(4, 3))];
    const rooms = roomsFromWalls(walls).map((r, i) => ({ ...r, name: `room ${i}` }));
    const next = roomsFromWalls(removeWall(walls, 'mid'), { previous: rooms });
    expect(next).toHaveLength(1);
    expect(rooms.map((r) => r.id)).toContain(next[0].id);
  });

  it('builds four walls around the exact rectangle drawn', () => {
    const walls = wallsForRectangle({ x: 1, z: 1, width: 3.32, depth: 2.5 }, 0.12);
    const [room] = roomsFromWalls(walls);
    const xs = room.polygon.map((p) => p.x);
    const zs = room.polygon.map((p) => p.z);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(3.32, 3);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(2.5, 3);
    expect(Math.min(...xs)).toBeCloseTo(1, 3);
  });
});

describe('walls from room polygons', () => {
  it('turns two rooms with a gap between them into one shared wall of that thickness', () => {
    const rooms = [rect('living', 0, 0, 5, 4, 'living_room'), rect('bed', 5.12, 0, 4, 4)];
    const walls = wallsFromRooms(rooms, 0.12);
    const shared = walls.find((w) => Math.abs(w.a.x - 5.06) < 1e-6 && Math.abs(w.b.x - 5.06) < 1e-6);
    expect(shared).toBeDefined();
    expect(shared!.thicknessM).toBeCloseTo(0.12, 3);
    // Exterior walls sit outside the rooms.
    expect(walls.some((w) => Math.abs(w.a.x + 0.06) < 1e-6 && Math.abs(w.b.x + 0.06) < 1e-6)).toBe(true);
    expect(walls).toHaveLength(7);

    const derived = roomsFromWalls(walls, { previous: rooms });
    expect(derived.map((r) => r.id).sort()).toEqual(['bed', 'living']);
    expect(derived.find((r) => r.id === 'living')!.areaM2).toBeCloseTo(20, 1);
    expect(derived.find((r) => r.id === 'bed')!.areaM2).toBeCloseTo(16, 1);
  });

  it('reads a thicker gap as a thicker wall and closes a T-junction plan', () => {
    const rooms = [rect('hall', 0, 0, 6, 1.5, 'hallway'), rect('bed', 0, 1.7, 3, 3), rect('bath', 3.2, 1.7, 2.8, 2.3, 'bathroom')];
    const walls = wallsFromRooms(rooms, 0.12);
    const between = walls.find((w) => Math.abs(w.a.z - 1.6) < 1e-6 && Math.abs(w.b.z - 1.6) < 1e-6)!;
    expect(between.thicknessM).toBeCloseTo(0.2, 3);
    const derived = roomsFromWalls(walls, { previous: rooms });
    expect(derived.map((r) => r.id).sort()).toEqual(['bath', 'bed', 'hall']);
    for (const room of derived) {
      const original = rooms.find((r) => r.id === room.id)!;
      expect(Math.abs(room.areaM2 - original.areaM2)).toBeLessThan(0.2);
    }
  });

  it('keeps ids and windows through ensureWalls on a plan that had none', () => {
    const rooms = [rect('living', 0, 0, 5, 4, 'living_room'), rect('bed', 5.12, 0, 4, 4)];
    const added = addOpening(rooms, 'living', 'window', 0, 0.12);
    const source = plan(added.rooms);
    const converted = ensureWalls(source);
    expect(converted.walls!.length).toBeGreaterThan(0);
    expect(converted.rooms.map((r) => r.id).sort()).toEqual(['bed', 'living']);
    expect(converted.rooms.find((r) => r.id === 'living')!.openings.some((o) => o.kind === 'window')).toBe(true);
    expect(ensureWalls(converted)).toBe(converted);
  });

  it('gives touching rooms a wall of the default thickness on the shared line', () => {
    const rooms = [rect('a', 0, 0, 4, 3), rect('b', 4, 0, 4, 3)];
    const walls = wallsFromRooms(rooms, 0.12);
    const shared = walls.find((w) => w.a.x === 4 && w.b.x === 4)!;
    expect(shared.thicknessM).toBeCloseTo(0.12, 3);
    const derived = roomsFromWalls(walls, { previous: rooms });
    expect(derived).toHaveLength(2);
  });
});

describe('lookups', () => {
  it('finds the wall behind a room edge and its thickness', () => {
    const walls = [wall('thin', P(0, 0), P(4, 0), 0.1), wall('r', P(4, 0), P(4, 3), 0.25), wall('b', P(4, 3), P(0, 3)), wall('l', P(0, 3), P(0, 0))];
    const rooms = roomsFromWalls(walls);
    const p = plan(rooms, walls);
    const edges = roomEdges(rooms[0].polygon);
    const top = edges.find((e) => Math.abs(e.a.z - 0.05) < 1e-6 && Math.abs(e.b.z - 0.05) < 1e-6)!;
    expect(wallForEdge(p, rooms[0], top)?.id).toBe('thin');
    expect(wallThicknessForEdge(p, rooms[0], top)).toBeCloseTo(0.1, 3);
    const right = edges.find((e) => Math.abs(e.a.x - 3.875) < 1e-6 && Math.abs(e.b.x - 3.875) < 1e-6)!;
    expect(wallThicknessForEdge(p, rooms[0], right)).toBeCloseTo(0.25, 3);
    // Without wallIds the lookup falls back to position.
    expect(wallForEdge(p, { ...rooms[0], wallIds: undefined }, right)?.id).toBe('r');
  });

  it('rebuilds a plan after a wall edit and refreshes its bounds', () => {
    const walls = box('a', 0, 0, 4, 3);
    const p = rebuildRooms(plan([], walls), walls);
    expect(p.rooms).toHaveLength(1);
    expect(p.bounds.width).toBeCloseTo(4, 2);
    const wider = rebuildRooms(p, offsetWall(walls, 'a-right', -2));
    expect(wider.rooms[0].id).toBe(p.rooms[0].id);
    expect(wider.bounds.width).toBeCloseTo(6, 2);
  });

  it('reprojects an opening onto the nearest parallel edge and drops one whose wall is gone', () => {
    const before = rect('r', 0, 0, 4, 3);
    const withDoor = addOpening([before], 'r', 'door', 0, 0.12).rooms[0];
    const taller = rect('r', 0, -0.5, 4, 3.5);
    const moved = reprojectOpenings(withDoor, taller);
    expect(moved).toHaveLength(1);
    expect(moved[0].wallIndex).toBe(0);
    const far = rect('r', 0, 2, 4, 3);
    expect(reprojectOpenings(withDoor, far)).toHaveLength(0);
  });
});
