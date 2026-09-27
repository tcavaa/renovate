import { describe, expect, it } from 'vitest';
import { divideAlongPartialWall, isAppSeparator, joinRoom, openNeighbours, partialWallIn, withPartialWallSeparators, withSplitRoomTypes, withoutWall } from '@/lib/design/separators';
import { edgeWallKey, planEdgeWalls } from '@/lib/design/wallPieces';
import { addWalls, moveNode, rebuildRooms } from '@/lib/design/walls';
import { calculatorRoomsFromPlan, deriveOpenings, planToCalculatorRooms, pointInPolygon, wallEdges } from '@/lib/design/planGeometry';
import { partitionArea } from '@/lib/design/partitions';
import { wallAreaM2 } from '@/lib/design/surfaces';
import { trimLengthM } from '@/lib/design/trims';
import type { FloorPlan, PlanRoom, Vec2, Wall } from '@/lib/design/types';

const P = (x: number, z: number): Vec2 => ({ x, z });
const wall = (id: string, a: Vec2, b: Vec2, extra: Partial<Wall> = {}): Wall => ({ id, a, b, thicknessM: 0.12, origin: 'existing', ...extra });

/**
 * The screenshot's corner of a flat: a 6.82 × 7.87 m block, a bedroom in its bottom right
 * corner, and the bedroom's top wall carried on 2.26 m into the living room — the partial wall
 * that leaves the living room one L-shaped room.
 */
function flat(stub = true): FloorPlan {
  const walls: Wall[] = [
    wall('top', P(0, 0), P(6.82, 0)),
    wall('right', P(6.82, 0), P(6.82, 7.87)),
    wall('bottom', P(6.82, 7.87), P(0, 7.87)),
    wall('left', P(0, 7.87), P(0, 0)),
    wall('bed-top', P(4.26, 3.73), P(6.82, 3.73)),
    wall('bed-left', P(4.26, 3.73), P(4.26, 7.87)),
    ...(stub ? [wall('stub', P(2, 3.73), P(4.26, 3.73))] : []),
  ];
  const base: FloorPlan = { rooms: [], metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', wallThicknessM: 0.12, wallHeightM: 2.8, walls: [] };
  const plan = rebuildRooms(base, walls);
  return { ...plan, rooms: plan.rooms.map((r) => ({ ...r, type: pointInPolygon(P(5.5, 6), r.polygon) ? 'bedroom' : 'living_room', name: pointInPolygon(P(5.5, 6), r.polygon) ? 'საძინებელი' : 'მისაღები ოთახი' })) };
}

const roomAt = (plan: FloorPlan, p: Vec2): PlanRoom | undefined => plan.rooms.find((r) => pointInPolygon(p, r.polygon));
const read = (plan: FloorPlan) => withSplitRoomTypes(plan.rooms, withPartialWallSeparators(plan));

describe('partial walls', () => {
  it('finds the wall that runs into the living room and stops short', () => {
    const plan = flat();
    expect(plan.rooms).toHaveLength(2);
    const living = roomAt(plan, P(1, 1))!;
    const partial = partialWallIn(plan, living)!;
    expect(partial.wall.id).toBe('stub');
    expect(partial.free.x).toBeCloseTo(2, 3);
    // Carried on, its line reaches the living room's far side: the left wall's inner face.
    expect(partial.far.x).toBeCloseTo(0.06, 3);
    expect(partial.far.z).toBeCloseTo(3.73, 3);
    // The bedroom has no partial wall in it.
    expect(partialWallIn(plan, roomAt(plan, P(5.5, 6))!)).toBeNull();
  });

  it('ignores a stub too short to divide anything', () => {
    const plan = rebuildRooms(flat(false), [...(flat(false).walls ?? []), wall('stub', P(3.9, 3.73), P(4.26, 3.73))]);
    expect(partialWallIn(plan, roomAt(plan, P(1, 1))!)).toBeNull();
  });
});

describe('room separators drawn on from a partial wall', () => {
  it('divides the living room in two: the living room and a kitchen, open onto each other', () => {
    const plan = read(flat());
    const separator = (plan.walls ?? []).find(isAppSeparator)!;
    expect(separator).toMatchObject({ thicknessM: 0, separator: true, origin: 'generated' });
    // From the partial wall's free end to the left wall's centreline.
    expect(separator.a).toEqual(P(2, 3.73));
    expect(separator.b.x).toBeCloseTo(0, 3);
    expect(plan.rooms).toHaveLength(3);
    const top = roomAt(plan, P(1, 1))!;
    const nook = roomAt(plan, P(1, 6))!;
    // The room that kept the living room's identity keeps its type; the one cut off is its kitchen.
    expect([top.type, nook.type].sort()).toEqual(['kitchen', 'living_room']);
    expect(top.open?.length).toBe(1);
    expect(nook.open?.length).toBe(1);
    expect(roomAt(plan, P(5.5, 6))!.open).toBeUndefined();
  });

  it('is read once: running it again changes nothing', () => {
    const plan = read(flat());
    expect(withPartialWallSeparators(plan)).toBe(plan);
  });

  it('follows its wall, and goes when the wall goes', () => {
    const plan = read(flat());
    // The stub made shorter: the separator starts at its new free end.
    const shorter = rebuildRooms(plan, (plan.walls ?? []).map((w) => (w.id === 'stub' ? { ...w, a: P(3, 3.73) } : w)));
    const moved = withPartialWallSeparators(shorter);
    expect((moved.walls ?? []).find(isAppSeparator)!.a).toEqual(P(3, 3.73));
    // The stub deleted: nothing to carry on from, one room again.
    const gone = withPartialWallSeparators(withoutWall(plan, 'stub'));
    expect((gone.walls ?? []).some((w) => w.separator)).toBe(false);
    expect(gone.rooms).toHaveLength(2);
  });

  it('goes with its wall when the wall’s end is dragged, even off square', () => {
    const plan = read(flat());
    // What the board's handle drag does: every wall end on the junction goes, the separator's too.
    const dragged = withPartialWallSeparators(rebuildRooms(plan, moveNode(plan.walls ?? [], P(2, 3.73), P(3, 2.5))));
    const separator = (dragged.walls ?? []).find(isAppSeparator)!;
    expect(separator.a).toEqual(P(3, 2.5));
    expect(separator.b.x).toBeCloseTo(0, 3);
    expect(dragged.rooms).toHaveLength(3);
  });

  it('gives way to a partition drawn on from the wall’s end', () => {
    const plan = read(flat());
    const on = withPartialWallSeparators(rebuildRooms(plan, addWalls(plan.walls ?? [], [wall('down', P(2, 3.73), P(2, 7.87), { origin: 'user' })])));
    expect((on.walls ?? []).some((w) => w.separator)).toBe(false);
    // The stub and the new wall close a room of their own; the rest is one room again.
    expect(on.rooms).toHaveLength(3);
    expect(on.rooms.every((r) => !r.open)).toBe(true);
  });

  it('goes when the partial wall is closed into a full partition', () => {
    const plan = read(flat());
    const closed = withPartialWallSeparators(rebuildRooms(plan, [...(plan.walls ?? []).filter((w) => !w.separator), wall('rest', P(0, 3.73), P(2, 3.73), { origin: 'user' })]));
    expect((closed.walls ?? []).some((w) => w.separator)).toBe(false);
    expect(closed.rooms).toHaveLength(3);
    expect(closed.rooms.every((r) => !r.open)).toBe(true);
  });

  it('leaves a bedroom one room: only the open-plan rooms are divided without being asked', () => {
    const plan = flat();
    const bedroomish = { ...plan, rooms: plan.rooms.map((r) => ({ ...r, type: 'bedroom' as const })) };
    expect(withPartialWallSeparators(bedroomish)).toBe(bedroomish);
  });

  it('keeps the room whole once its separator is deleted, and lets it go when the wall goes', () => {
    const plan = read(flat());
    const separator = (plan.walls ?? []).find(isAppSeparator)!;
    const joined = withoutWall(plan, separator.id);
    expect(joined.rooms).toHaveLength(2);
    const living = roomAt(joined, P(1, 1))!;
    expect(living.keepWhole).toBe(true);
    // Not drawn back.
    expect(withPartialWallSeparators(joined)).toBe(joined);
    // The partial wall taken away: nothing to keep it whole against any more.
    const released = withPartialWallSeparators(withoutWall(joined, 'stub'));
    expect(roomAt(released, P(1, 1))!.keepWhole).toBeUndefined();
  });

  it('joins a room with the rooms across its separators, from its card', () => {
    const plan = read(flat());
    const joined = joinRoom(plan, roomAt(plan, P(1, 6))!.id);
    expect(joined.rooms).toHaveLength(2);
    expect(roomAt(joined, P(1, 6))!.keepWhole).toBe(true);
    expect(joinRoom(joined, roomAt(joined, P(1, 6))!.id)).toBe(joined);
  });

  it('divides a room along its partial wall when asked, whatever it is', () => {
    const plan = flat();
    const office = { ...plan, rooms: plan.rooms.map((r) => (r.type === 'living_room' ? { ...r, type: 'office' as const, keepWhole: true } : r)) };
    const divided = divideAlongPartialWall(office, roomAt(office, P(1, 1))!.id);
    expect(divided.rooms).toHaveLength(3);
    const separator = (divided.walls ?? []).find((w) => w.separator)!;
    // The person's own: the app does not move or take it away.
    expect(separator.origin).toBe('user');
    expect(withPartialWallSeparators(divided)).toBe(divided);
    // The room cut off an office is an office too.
    expect(roomAt(divided, P(1, 6))!.type).toBe('office');
  });
});

describe('a room separator is no wall', () => {
  const plan = read(flat());
  const top = roomAt(plan, P(1, 1))!;
  const nook = roomAt(plan, P(1, 6))!;

  it('bounds rooms without a body: the two rooms meet on its line', () => {
    expect(wallEdges(nook)).toHaveLength(nook.polygon.length - 1);
    // The L-shaped room, less the footprint of the partial wall that now bounds both rooms.
    expect(top.areaM2 + nook.areaM2).toBeCloseTo(roomAt(flat(), P(1, 1))!.areaM2 - 2.26 * 0.12, 1);
  });

  it('is never priced as a partition, while the partial wall is', () => {
    // The stub (2.26 m × 2.8 m) has the living room on both sides: an inner wall to build.
    const walled = partitionArea(flat()).partitionM2!;
    const separated = partitionArea(plan).partitionM2!;
    expect(separated).toBeCloseTo(walled, 2);
    expect(walled).toBeCloseTo((2.56 + 4.14 + 2.26) * 2.8, 1);
    expect(partitionArea({ ...plan, walls: (plan.walls ?? []).map((w) => (w.id === 'stub' ? { ...w, built: true } : w)) }).partitionM2!).toBeCloseTo((2.56 + 4.14) * 2.8, 1);
  });

  it('has no wall area, skirting or cornice along it', () => {
    // The nook is open onto the living room from the left wall to the partial wall's free end.
    const openLength = nook.perimeterM - wallEdges(nook).reduce((s, e) => s + e.length, 0);
    expect(openLength).toBeCloseTo(1.94, 2);
    expect(wallAreaM2(nook)).toBeCloseTo((nook.perimeterM - openLength) * nook.heightM, 0);
    expect(trimLengthM(nook, 'cornice')).toBeCloseTo(nook.perimeterM - openLength, 0);
    const [calc] = planToCalculatorRooms({ ...plan, rooms: [nook] });
    expect(calc.wallM2).toBeCloseTo((nook.perimeterM - openLength) * nook.heightM, 1);
    const [board] = calculatorRoomsFromPlan({ ...plan, rooms: [nook] });
    expect(board.walls?.filter((l) => l === 0)).toHaveLength(1);
  });

  it('stands no wall in 3D', () => {
    const edgeWalls = planEdgeWalls(plan);
    for (const room of [top, nook]) {
      for (const index of room.open ?? []) expect(edgeWalls.has(edgeWallKey(room.id, index))).toBe(false);
    }
    expect([...edgeWalls.keys()].filter((k) => k.startsWith(`${nook.id}:`))).toHaveLength(nook.polygon.length - 1);
  });

  it('names the rooms each opens onto', () => {
    expect(openNeighbours(plan, nook.id).map((r) => r.id)).toEqual([top.id]);
    expect(openNeighbours(plan, roomAt(plan, P(5.5, 6))!.id)).toEqual([]);
  });

  it('needs no door: the two rooms open onto each other', () => {
    const rooms: PlanRoom[] = plan.rooms.map((r) => ({ ...r, openings: [] }));
    deriveOpenings(rooms, 0.12);
    const nookDoors = rooms.find((r) => r.id === nook.id)!.openings.filter((o) => o.kind !== 'window');
    expect(nookDoors.every((o) => !nook.open?.includes(o.wallIndex))).toBe(true);
  });
});

describe('drawing over a room separator', () => {
  it('gives way to a wall, and a wall drawn over it takes its place', () => {
    const walls = [wall('w', P(0, 0), P(4, 0))];
    // A separator drawn along a wall adds only what sticks out past it.
    const withSeparator = addWalls(walls, [wall('s', P(2, 0), P(6, 0), { thicknessM: 0, separator: true })]);
    expect(withSeparator.find((w) => w.separator)).toMatchObject({ a: P(4, 0), b: P(6, 0) });
    // A wall drawn over a separator cuts it back to what it does not cover.
    const walled = addWalls(withSeparator, [wall('w2', P(3, 0), P(5, 0))]);
    expect(walled.find((w) => w.separator)).toMatchObject({ a: P(5, 0), b: P(6, 0) });
  });
});
