import { describe, expect, it } from 'vitest';
import {
  addWalls,
  buildWallGraph,
  ensureWalls,
  moveNode,
  moveRooms,
  roomCluster,
  splitAtJunctions,
  wallsBoundingRoom,
  wallsClash,
  wallsForMove,
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

const blankPlan = (): FloorPlan => ({ rooms: [], metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', imageUrl: null, wallThicknessM: 0.12, wallHeightM: 2.8, walls: [] });

const polygonCentroidX = (room: PlanRoom): number => room.polygon.reduce((s, p) => s + p.x, 0) / room.polygon.length;

/** Two rooms side by side with a wide one under both, drawn one after another as on the board. */
function threeRooms(): FloorPlan {
  const rects = [
    { x: 0.06, z: 0.06, width: 3.88, depth: 2.88 },
    { x: 4.06, z: 0.06, width: 3.88, depth: 2.88 },
    { x: 0.06, z: 3.06, width: 7.88, depth: 2.88 },
  ];
  const walls = rects.reduce((all, r, i) => addWalls(all, wallsForRectangle(r, 0.12, 'user', `r${i}`)), [] as Wall[]);
  return rebuildRooms(blankPlan(), walls);
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

  it('cuts a wall where another one meets it, so each room owns its own stretch', () => {
    // Two rooms side by side: the top of the flat is one line, but the partition ends it.
    const walls = [...box('a', 0, 0, 8, 3), wall('mid', P(4, 0), P(4, 3))];
    const cut = splitAtJunctions(walls);
    const top = cut.filter((w) => w.a.z === 0 && w.b.z === 0);
    expect(top).toHaveLength(2);
    expect(top.map((w) => [Math.min(w.a.x, w.b.x), Math.max(w.a.x, w.b.x)]).sort((p, q) => p[0] - q[0])).toEqual([
      [0, 4],
      [4, 8],
    ]);
    // The rooms are unchanged by the cutting: two rooms, the same floor.
    expect(roomsFromWalls(cut)).toHaveLength(2);
    expect(roomsFromWalls(cut).reduce((s, r) => s + r.areaM2, 0)).toBeCloseTo(roomsFromWalls(walls).reduce((s, r) => s + r.areaM2, 0), 2);
  });

  it('leaves a wall alone when another only passes by without meeting it', () => {
    const walls = [wall('long', P(0, 0), P(8, 0)), wall('away', P(4, 1), P(4, 3))];
    expect(splitAtJunctions(walls).filter((w) => w.id.startsWith('long'))).toHaveLength(1);
  });

  it('leaves a wall drawn on from the end as its own wall, so the two come apart again', () => {
    const walls = addWalls(box('a', 0, 0, 4, 3), [wall('ext', P(4, 0), P(7, 0))]);
    const top = walls.filter((w) => w.a.z === 0 && w.b.z === 0);
    expect(top).toHaveLength(2);
    expect(walls.find((w) => w.id === 'ext')).toMatchObject({ a: P(4, 0), b: P(7, 0) });
    expect(walls.find((w) => w.id === 'a-top')).toMatchObject({ a: P(0, 0), b: P(4, 0) });
  });

  it('does not double a wall drawn straight over one already there', () => {
    const walls = addWalls(box('a', 0, 0, 4, 3), [wall('again', P(0, 0), P(4, 0))]);
    expect(walls.filter((w) => w.a.z === 0 && w.b.z === 0)).toHaveLength(1);
  });

  it('keeps only the stretch of a new wall nobody already holds', () => {
    const walls = addWalls(box('a', 0, 0, 4, 3), [wall('long', P(2, 0), P(7, 0))]);
    const added = walls.find((w) => w.id === 'long')!;
    expect(Math.min(added.a.x, added.b.x)).toBeCloseTo(4, 5);
    expect(Math.max(added.a.x, added.b.x)).toBeCloseTo(7, 5);
  });

  it('knows every wall of a room, even the sides cut into several', () => {
    // Two rooms side by side with a wide one under both: the wide room's top side is met by
    // the partition above it, so `splitAtJunctions` cuts that side in two and `wallIds`
    // names only one of the pieces.
    const plan = threeRooms();
    expect(plan.rooms).toHaveLength(3);
    const wide = [...plan.rooms].sort((a, b) => b.areaM2 - a.areaM2)[0];
    expect(wallsBoundingRoom(plan.walls!, wide).size).toBeGreaterThan(wide.polygon.length);
  });

  it('moves rooms that share a wall as one body — nothing is pulled apart', () => {
    const plan = threeRooms();
    const wide = [...plan.rooms].sort((a, b) => b.areaM2 - a.areaM2)[0];
    // Grabbing one room takes the flat.
    expect(roomCluster(plan, [wide.id]).sort()).toEqual(plan.rooms.map((r) => r.id).sort());

    const moved = moveRooms(plan, [wide.id], P(2, 6));
    expect(moved.rooms.map((r) => r.id).sort()).toEqual(plan.rooms.map((r) => r.id).sort());
    for (const room of plan.rooms) {
      const after = moved.rooms.find((r) => r.id === room.id)!;
      expect(after.areaM2).toBeCloseTo(room.areaM2, 2);
      expect(polygonCentroidX(after)).toBeCloseTo(polygonCentroidX(room) + 2, 2);
    }
    // No wall was split and none was left behind: the same walls, all six metres further down.
    expect(moved.walls!.length).toBe(plan.walls!.length);
    expect(Math.min(...moved.walls!.flatMap((w) => [w.a.z, w.b.z]))).toBeCloseTo(6, 3);
  });

  it('leaves a room that shares no wall where it is', () => {
    const walls = [...box('a', 0, 0, 4, 3), ...box('b', 6, 0, 10, 3)];
    const plan = rebuildRooms(blankPlan(), walls);
    const [left, right] = [...plan.rooms].sort((p, q) => polygonCentroidX(p) - polygonCentroidX(q));
    expect(roomCluster(plan, [right.id])).toEqual([right.id]);
    const moved = moveRooms(plan, [right.id], P(3, 1));
    expect(polygonCentroidX(moved.rooms.find((r) => r.id === left.id)!)).toBeCloseTo(polygonCentroidX(left), 3);
    expect(polygonCentroidX(moved.rooms.find((r) => r.id === right.id)!)).toBeCloseTo(polygonCentroidX(right) + 3, 3);
  });

  it('gives two rooms pushed together one wall between them, and they then move as one', () => {
    // A 5 m room with a 4 m room under it, 1.2 m in from its left — the case from the board.
    const walls = [...box('a', 0, 0, 5, 4), ...box('b', 1.2, 6, 5.2, 10)];
    const plan = rebuildRooms(blankPlan(), walls);
    const [top, bottom] = [...plan.rooms].sort((p, q) => p.polygon[0].z - q.polygon[0].z);
    const pushed = moveRooms(plan, [bottom.id], P(0, -2));

    // Still two rooms, each exactly the floor it had.
    expect(pushed.rooms.map((r) => r.id).sort()).toEqual([top.id, bottom.id].sort());
    expect(pushed.rooms.find((r) => r.id === top.id)!.areaM2).toBeCloseTo(top.areaM2, 2);
    expect(pushed.rooms.find((r) => r.id === bottom.id)!.areaM2).toBeCloseTo(bottom.areaM2, 2);
    // One wall on the line z = 4 wherever both rooms stand: nothing is doubled…
    const onLine = pushed.walls!.filter((w) => Math.abs(w.a.z - 4) < 1e-6 && Math.abs(w.b.z - 4) < 1e-6);
    const covered = onLine.reduce((sum, w) => sum + Math.abs(w.a.x - w.b.x), 0);
    expect(covered).toBeCloseTo(5.2, 3); // 0 → 5 is the upper room's wall, 5 → 5.2 what sticks out of the lower one
    // …and no wall stands anywhere but on the two rooms' outlines.
    expect(orphanWallSegments(pushed)).toHaveLength(0);

    // From now on they are one body.
    expect(roomCluster(pushed, [bottom.id]).sort()).toEqual([top.id, bottom.id].sort());
    const together = moveRooms(pushed, [bottom.id], P(-3, 0));
    expect(polygonCentroidX(together.rooms.find((r) => r.id === top.id)!)).toBeCloseTo(polygonCentroidX(top) - 3, 2);
    expect(together.walls!.length).toBe(pushed.walls!.length);
  });

  it('lets the wall that was there stand for a thinner one arriving on its line', () => {
    const walls = [...box('a', 0, 0, 5, 4, 0.2), ...box('b', 0, 6, 5, 10, 0.1)];
    const plan = rebuildRooms(blankPlan(), walls);
    const bottom = [...plan.rooms].sort((p, q) => q.polygon[0].z - p.polygon[0].z)[0];
    const pushed = moveRooms(plan, [bottom.id], P(0, -2));
    const between = pushed.walls!.filter((w) => Math.abs(w.a.z - 4) < 1e-6 && Math.abs(w.b.z - 4) < 1e-6);
    expect(between).toHaveLength(1);
    expect(between[0].thicknessM).toBe(0.2);
    expect(pushed.rooms).toHaveLength(2);
  });

  it('takes a partition inside a room and a stub hanging off it along, but not a wall tied to a room that stays', () => {
    const walls = [
      ...box('a', 0, 0, 4, 3),
      wall('inside', P(2, 0), P(2, 1.5)), // a partition that closes nothing
      wall('stub', P(4, 3), P(4, 5)), // a half-drawn room on the corner
      ...box('b', 8, 0, 12, 3),
      wall('fence', P(8, 3), P(8, 5)), // hangs off the room that stays
    ];
    const plan = rebuildRooms(blankPlan(), walls);
    const left = [...plan.rooms].sort((p, q) => polygonCentroidX(p) - polygonCentroidX(q))[0];
    const move = wallsForMove(plan, [left.id]);
    const travelling = move.moving.map((w) => w.id);
    expect(travelling.some((id) => id.startsWith('inside'))).toBe(true);
    expect(travelling.some((id) => id.startsWith('stub'))).toBe(true);
    expect(travelling.some((id) => id.startsWith('fence'))).toBe(false);
    expect(travelling.some((id) => id.startsWith('b-'))).toBe(false);
  });

  it('carries the columns and beams standing in a moved room', () => {
    const base = rebuildRooms(blankPlan(), [...box('a', 0, 0, 4, 3), ...box('b', 8, 0, 12, 3)]);
    const left = [...base.rooms].sort((p, q) => polygonCentroidX(p) - polygonCentroidX(q))[0];
    const plan: FloorPlan = {
      ...base,
      columns: [
        { id: 'in-corner', position: P(0.1, 0.1), widthM: 0.3, depthM: 0.3, origin: 'user' },
        { id: 'elsewhere', position: P(10, 1.5), widthM: 0.3, depthM: 0.3, origin: 'user' },
      ],
      beams: [{ id: 'beam', a: P(0, 1.5), b: P(4, 1.5), widthM: 0.25, depthM: 0.3, elevationM: 2.4, origin: 'user' }],
    };
    const moved = moveRooms(plan, [left.id], P(0, 5));
    expect(moved.columns!.find((c) => c.id === 'in-corner')!.position).toEqual(P(0.1, 5.1));
    expect(moved.columns!.find((c) => c.id === 'elsewhere')!.position).toEqual(P(10, 1.5));
    expect(moved.beams![0].a).toEqual(P(0, 6.5));
  });

  it('calls it a clash when a wall would stand half inside another, not when it shares its line or stands clear', () => {
    const staying = [wall('s', P(0, 4), P(5, 4))];
    const at = (z: number, x0 = 1, x1 = 4) => [wall('m', P(x0, z), P(x1, z))];
    expect(wallsClash(at(4), staying)).toBe(false); // one line: one wall
    expect(wallsClash(at(4.06), staying)).toBe(true); // the six centimetres from the board
    expect(wallsClash(at(3.9), staying)).toBe(true); // …from either side
    expect(wallsClash(at(4.14), staying)).toBe(true); // back to back with no air between
    expect(wallsClash(at(4.5), staying)).toBe(false); // clear
    expect(wallsClash(at(4.06, 5, 9), staying)).toBe(false); // end to end is a jog, not an overlap
    expect(wallsClash([wall('m', P(2, 4.06), P(2, 8))], staying)).toBe(false); // a wall meeting it square
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
