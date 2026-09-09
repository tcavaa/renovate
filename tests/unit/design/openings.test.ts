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
