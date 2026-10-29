import { describe, expect, it } from 'vitest';
import { ENSUITE_DEPTH_M, ENTRY_DEPTH_M, PASSAGE_M, withGeneratedPartitions } from '@/lib/design/autoPartitions';
import { roomEdges } from '@/lib/design/planGeometry';
import { roomsFromWalls } from '@/lib/design/walls';
import type { FloorPlan, Opening, PlanRoom, Wall } from '@/lib/design/types';

/** The partitions the app adds at generation (lib/design/autoPartitions.ts). */

const wall = (id: string, ax: number, az: number, bx: number, bz: number, thicknessM = 0.3): Wall => ({ id, a: { x: ax, z: az }, b: { x: bx, z: bz }, thicknessM, origin: 'existing' });

function planOf(walls: Wall[], type: (room: PlanRoom) => PlanRoom['type']): FloorPlan {
  const rooms = roomsFromWalls(walls, { defaultHeightM: 2.7 }).map((r) => ({ ...r, type: type(r) }));
  return { rooms, walls, metresPerPixel: null, bounds: { width: 6, depth: 5 }, source: 'manual', wallThicknessM: 0.12, wallHeightM: 2.7 };
}

/** A door on the room's edge nearest `side` (z = 0 → 'top'), its middle `fromStart` metres along that edge. */
function withDoor(plan: FloorPlan, roomId: string, pick: (room: PlanRoom) => number, fromStart: number, extra: Partial<Opening> = {}): FloorPlan {
  return {
    ...plan,
    rooms: plan.rooms.map((room) => {
      if (room.id !== roomId) return room;
      const edge = roomEdges(room.polygon)[pick(room)];
      const door: Opening = { id: `${roomId}-door-${room.openings.length}`, roomId, kind: 'door', wallIndex: edge.index, t: fromStart / edge.length, widthM: 0.9, heightM: 2.05, sillM: 0, exterior: false, ...extra };
      return { ...room, openings: [...room.openings, door] };
    }),
  };
}

/** The index of the room's edge running along z = `z` (its inner face). */
const edgeAtZ = (z: number) => (room: PlanRoom) => roomEdges(room.polygon).findIndex((e) => Math.abs(e.a.z - z) < 0.2 && Math.abs(e.b.z - z) < 0.2);
const edgeAtX = (x: number) => (room: PlanRoom) => roomEdges(room.polygon).findIndex((e) => Math.abs(e.a.x - x) < 0.2 && Math.abs(e.b.x - x) < 0.2);

const box = [wall('n', 0, 0, 6, 0), wall('e', 6, 0, 6, 5), wall('s', 6, 5, 0, 5), wall('w', 0, 5, 0, 0)];

describe('the entrance out of the living room\'s sight', () => {
  const living = planOf(box, () => 'living_room');
  const roomId = living.rooms[0].id;

  it('screens a front door near a corner, running the screen on to that corner\'s wall', () => {
    const plan = withDoor(living, roomId, edgeAtZ(0.15), 0.6, { exterior: true });
    const { plan: next, added, keepouts } = withGeneratedPartitions(plan);
    expect(added).toHaveLength(1);
    const screen = added[0];
    // Parallel to the entrance wall, `ENTRY_DEPTH_M` in, joined to the west wall's centreline.
    expect(screen.a.z).toBeCloseTo(0.15 + ENTRY_DEPTH_M + 0.05, 2);
    expect(screen.b.z).toBeCloseTo(screen.a.z, 5);
    expect(Math.min(screen.a.x, screen.b.x)).toBeCloseTo(0, 2);
    // A way past the open end.
    expect(6 - 0.15 - Math.max(screen.a.x, screen.b.x)).toBeGreaterThanOrEqual(PASSAGE_M);
    // Still one room, kept whole, the floor behind the screen kept free.
    expect(next.rooms).toHaveLength(1);
    expect(next.rooms[0].keepWhole).toBe(true);
    expect(keepouts[next.rooms[0].id]).toHaveLength(1);
    // Laid out again, nothing more is added.
    expect(withGeneratedPartitions(next).added).toHaveLength(0);
  });

  it('leaves a screen free at both ends when the door has a way past either side', () => {
    const plan = withDoor(living, roomId, edgeAtZ(0.15), 2.85, { exterior: true });
    const [screen] = withGeneratedPartitions(plan).added;
    expect(screen).toBeDefined();
    expect(Math.abs(screen.b.x - screen.a.x)).toBeCloseTo(0.9 + 0.6, 2);
  });

  it('adds nothing when the front door opens into a hall, or the room is too shallow', () => {
    const hall = planOf(box, () => 'hallway');
    expect(withGeneratedPartitions(withDoor(hall, hall.rooms[0].id, edgeAtZ(0.15), 0.6, { exterior: true })).added).toHaveLength(0);
    const shallow = planOf([wall('n', 0, 0, 6, 0), wall('e', 6, 0, 6, 2.8), wall('s', 6, 2.8, 0, 2.8), wall('w', 0, 2.8, 0, 0)], () => 'living_room');
    expect(withGeneratedPartitions(withDoor(shallow, shallow.rooms[0].id, edgeAtZ(0.15), 0.6, { exterior: true })).added).toHaveLength(0);
  });
});

describe('an en-suite\'s lobby', () => {
  it('encloses the en-suite door in its bedroom, run on to the corner', () => {
    const walls = [wall('n', 0, 0, 6, 0), wall('e', 6, 0, 6, 5), wall('s', 6, 5, 0, 5), wall('w', 0, 5, 0, 0), wall('p', 4, 0, 4, 5, 0.12)];
    let plan = planOf(walls, (room) => (room.polygon.some((p) => p.x > 4.5) ? 'bathroom' : 'bedroom'));
    const bedroom = plan.rooms.find((r) => r.type === 'bedroom')!;
    const bath = plan.rooms.find((r) => r.type === 'bathroom')!;
    plan = withDoor(plan, bedroom.id, edgeAtX(3.94), 0.6, { connectsToRoomId: bath.id });
    plan = withDoor(plan, bath.id, edgeAtX(4.06), 0.6, { connectsToRoomId: bedroom.id });
    const { added, plan: next } = withGeneratedPartitions(plan);
    expect(added).toHaveLength(1);
    const screen = added[0];
    // Parallel to the partition between them, `ENSUITE_DEPTH_M` into the bedroom.
    expect(screen.a.x).toBeCloseTo(3.94 - ENSUITE_DEPTH_M - 0.05, 2);
    expect(next.rooms.filter((r) => r.type === 'bedroom')).toHaveLength(1);
  });
});
