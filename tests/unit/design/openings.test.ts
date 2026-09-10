import { describe, expect, it } from 'vitest';
import { addOpening, moveOpening, openingWorldPoint, projectToEdge, removeOpening, twinOf, updateOpening } from '@/lib/design/openings';
import { deriveOpenings, refreshRoom, roomEdges } from '@/lib/design/planGeometry';
import type { PlanRoom } from '@/lib/design/types';

const rect = (id: string, x: number, z: number, w: number, d: number, type: PlanRoom['type'] = 'bedroom'): PlanRoom =>
  refreshRoom({
    id,
    type,
    name: id,
    polygon: [
      { x, z },
      { x: x + w, z },
      { x: x + w, z: z + d },
      { x, z: z + d },
    ],
    heightM: 2.8,
    areaM2: 0,
    perimeterM: 0,
    openings: [],
  });

/** A hallway with a bedroom to its right, sharing the wall at x = 4. */
function flat(): PlanRoom[] {
  const rooms = [rect('hall', 0, 0, 4, 3, 'hallway'), rect('bed', 4, 0, 4, 3, 'bedroom')];
  deriveOpenings(rooms, 0.12);
  return rooms;
}

describe('openings', () => {
  it('derives a paired interior door that both rooms share', () => {
    const rooms = flat();
    const door = rooms[1].openings.find((o) => o.kind === 'door' && o.connectsToRoomId === 'hall')!;
    expect(door).toBeDefined();
    const twin = twinOf(rooms, door);
    expect(twin?.room.id).toBe('hall');
    const a = openingWorldPoint(rooms[1], door)!;
    const b = openingWorldPoint(twin!.room, twin!.opening)!;
    expect(a.x).toBeCloseTo(b.x, 5);
    expect(a.z).toBeCloseTo(b.z, 5);
  });

  it('moves a door and its twin together, clamped away from the corners', () => {
    const rooms = flat();
    const door = rooms[1].openings.find((o) => o.connectsToRoomId === 'hall')!;
    const moved = moveOpening(rooms, 'bed', door.id, 0.99);
    const next = moved.find((r) => r.id === 'bed')!.openings.find((o) => o.id === door.id)!;
    expect(next.t).toBeLessThan(0.99);
    const twin = twinOf(moved, next)!;
    const a = openingWorldPoint(moved.find((r) => r.id === 'bed')!, next)!;
    const b = openingWorldPoint(twin.room, twin.opening)!;
    expect(a.z).toBeCloseTo(b.z, 5);
  });

  it('projects a point onto an edge with a margin for the opening width', () => {
    const edge = roomEdges(rect('r', 0, 0, 4, 3).polygon)[0];
    expect(projectToEdge(edge, { x: -3, z: 0 }, 0.9)).toBeCloseTo((0.45 + 0.15) / 4, 5);
    expect(projectToEdge(edge, { x: 2, z: 0 }, 0.9)).toBeCloseTo(0.5, 5);
  });

  it('adds a window on a free exterior wall and refuses one on a shared wall', () => {
    const rooms = flat();
    const bed = rooms[1];
    const sharedIndex = bed.openings.find((o) => o.connectsToRoomId === 'hall')!.wallIndex;
    const refused = addOpening(rooms, 'bed', 'window', sharedIndex, 0.12);
    expect(refused.openingId).toBeNull();
    const before = bed.openings.length;
    const added = addOpening(rooms, 'bed', 'window', null, 0.12);
    expect(added.openingId).not.toBeNull();
    expect(added.rooms.find((r) => r.id === 'bed')!.openings).toHaveLength(before + 1);
  });

  it('adds a door on a shared wall together with its twin', () => {
    const rooms = flat();
    const bed = rooms[1];
    const sharedIndex = bed.openings.find((o) => o.connectsToRoomId === 'hall')!.wallIndex;
    const cleared = removeOpening(rooms, 'bed', bed.openings.find((o) => o.connectsToRoomId === 'hall')!.id);
    expect(cleared.find((r) => r.id === 'hall')!.openings.some((o) => o.connectsToRoomId === 'bed')).toBe(false);
    const added = addOpening(cleared, 'bed', 'door', sharedIndex, 0.12);
    const door = added.rooms.find((r) => r.id === 'bed')!.openings.find((o) => o.id === added.openingId)!;
    expect(door.connectsToRoomId).toBe('hall');
    expect(added.rooms.find((r) => r.id === 'hall')!.openings.some((o) => o.connectsToRoomId === 'bed')).toBe(true);
  });

  it('turning a door into a window gives it a sill', () => {
    const rooms = flat();
    const bed = rooms[1];
    const win = bed.openings.find((o) => o.kind === 'window')!;
    const next = updateOpening(rooms, 'bed', win.id, { kind: 'door' });
    const door = next.find((r) => r.id === 'bed')!.openings.find((o) => o.id === win.id)!;
    expect(door.kind).toBe('door');
    expect(door.sillM).toBe(0);
  });
});

describe('dragging openings between walls', () => {
  const exteriorWalls = (room: PlanRoom, sharedX: number) =>
    roomEdges(room.polygon).filter((e) => !(Math.abs(e.a.x - sharedX) < 1e-6 && Math.abs(e.b.x - sharedX) < 1e-6));

  it('finds the nearest wall within reach, preferring the dragged opening’s own room on a shared wall', async () => {
    const { nearestWall } = await import('@/lib/design/openings');
    const rooms = flat();
    // Just outside the bedroom's top wall (z = 0), well within reach.
    const top = nearestWall(rooms, { x: 6, z: -0.1 }, 0.3);
    expect(top?.room.id).toBe('bed');
    expect(top?.edge.a.z === 0 && top?.edge.b.z === 0).toBe(true);
    // The middle of the room is a metre and a half from every wall: nothing in reach.
    expect(nearestWall(rooms, { x: 6, z: 1.5 }, 0.3)).toBeNull();
    // On the shared wall both rooms' copies are equally close; the preferred room wins.
    expect(nearestWall(rooms, { x: 4, z: 1.5 }, 0.3, 'hall')?.room.id).toBe('hall');
    expect(nearestWall(rooms, { x: 4, z: 1.5 }, 0.3, 'bed')?.room.id).toBe('bed');
  });

  it('moves a window to another wall of its room, keeping its width', async () => {
    const { moveOpeningToWall } = await import('@/lib/design/openings');
    const rooms = flat();
    const bed = rooms.find((r) => r.id === 'bed')!;
    const window = bed.openings.find((o) => o.kind === 'window')!;
    const target = exteriorWalls(bed, 4).find((e) => e.index !== window.wallIndex)!;
    const result = moveOpeningToWall(rooms, 'bed', window.id, { roomId: 'bed', wallIndex: target.index, t: 0.5 }, 0.12);
    expect(result.openingId).not.toBeNull();
    const moved = result.rooms.find((r) => r.id === 'bed')!.openings.find((o) => o.id === result.openingId)!;
    expect(moved.wallIndex).toBe(target.index);
    expect(moved.widthM).toBeCloseTo(window.widthM, 5);
    expect(moved.t).toBeCloseTo(0.5, 5);
    expect(result.rooms.find((r) => r.id === 'bed')!.openings.some((o) => o.id === window.id)).toBe(false);
  });

  it('slides along its own wall without changing id, and refuses a window on a shared wall', async () => {
    const { moveOpeningToWall } = await import('@/lib/design/openings');
    const rooms = flat();
    const bed = rooms.find((r) => r.id === 'bed')!;
    const window = bed.openings.find((o) => o.kind === 'window')!;
    const slid = moveOpeningToWall(rooms, 'bed', window.id, { roomId: 'bed', wallIndex: window.wallIndex, t: 0.3 }, 0.12);
    expect(slid.openingId).toBe(window.id);
    const shared = roomEdges(bed.polygon).find((e) => Math.abs(e.a.x - 4) < 1e-6 && Math.abs(e.b.x - 4) < 1e-6)!;
    const refused = moveOpeningToWall(rooms, 'bed', window.id, { roomId: 'bed', wallIndex: shared.index, t: 0.5 }, 0.12);
    expect(refused.openingId).toBeNull();
    expect(refused.rooms).toBe(rooms);
  });

  it('carries a door into the neighbouring room', async () => {
    const { moveOpeningToWall } = await import('@/lib/design/openings');
    const rooms = flat();
    const hall = rooms.find((r) => r.id === 'hall')!;
    const wall = exteriorWalls(hall, 4)[0];
    const added = addOpening(rooms, 'hall', 'door', wall.index, 0.12);
    const bed = added.rooms.find((r) => r.id === 'bed')!;
    const bedWall = exteriorWalls(bed, 4)[0];
    const moved = moveOpeningToWall(added.rooms, 'hall', added.openingId!, { roomId: 'bed', wallIndex: bedWall.index, t: 0.4 }, 0.12);
    expect(moved.openingId).not.toBeNull();
    expect(moved.rooms.find((r) => r.id === 'hall')!.openings.some((o) => o.id === added.openingId)).toBe(false);
    const door = moved.rooms.find((r) => r.id === 'bed')!.openings.find((o) => o.id === moved.openingId)!;
    expect(door.kind).toBe('door');
    expect(door.exterior).toBe(true);
    expect(door.wallIndex).toBe(bedWall.index);
  });

  it('adds at a requested position when one is given', () => {
    const rooms = flat();
    const bed = rooms.find((r) => r.id === 'bed')!;
    const wall = exteriorWalls(bed, 4).find((e) => e.length >= 4)!;
    // 0.3 keeps the 1.4 m window's edge clear of the corner; 0.2 would be clamped to the margin.
    const added = addOpening(rooms, 'bed', 'window', wall.index, 0.12, { t: 0.3 });
    const window = added.rooms.find((r) => r.id === 'bed')!.openings.find((o) => o.id === added.openingId)!;
    expect(window.t).toBeCloseTo(0.3, 5);
  });
});
