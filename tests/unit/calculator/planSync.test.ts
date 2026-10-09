import { describe, expect, it } from 'vitest';
import { planFollowsRooms, reconcileCalculatorPlan, sameCalculatorRooms } from '@/lib/calculator/planSync';
import { computeRoomAreas } from '@/lib/calculator/materials';
import { roomWallAreasM2 } from '@/lib/calculator/quantities';
import { ensureWalls } from '@/lib/design/walls';
import { calculatorRoomsFromPlan, edgeLengthsM, planFromCalculatorRooms, roomEdges } from '@/lib/design/planGeometry';
import type { Room } from '@/lib/calculator/types';
import type { FloorPlan, Opening, PlanRoom } from '@/lib/design/types';

const room = (id: string, width: number, length: number, x: number, z: number, type: Room['type'] = 'bedroom'): Room => ({
  ...computeRoomAreas({ id, type, nameKa: id, width, length, height: 2.7 }),
  x,
  z,
});

/** Flat A: two rooms side by side. Flat B: three rooms, none sharing an id with A. */
const flatA = [room('a-living', 5, 4, 0, 0, 'living_room'), room('a-bed', 3, 4, 5.12, 0)];
const flatB = [room('b-hall', 2, 6, 0, 0, 'hallway'), room('b-kitchen', 3, 3, 2.12, 0, 'kitchen'), room('b-bath', 3, 2.88, 2.12, 3.12, 'bathroom')];

describe('the calculator and the plan agree on one flat', () => {
  it('rebuilds the plan only when the rooms are a different flat', () => {
    const planA = ensureWalls(planFromCalculatorRooms(flatA));
    expect(planFollowsRooms(null, flatA)).toBe(true);
    expect(planFollowsRooms(planA, [])).toBe(false);
    expect(planFollowsRooms(planA, flatA)).toBe(false);
    expect(planFollowsRooms(planA, flatB)).toBe(true);
  });

  it('settles in one step when the plan and the rooms are different flats, and stays settled', () => {
    const planA = ensureWalls(planFromCalculatorRooms(flatA));
    const first = reconcileCalculatorPlan(planA, flatB);
    expect(first.plan).not.toBe(planA);
    expect(first.plan!.rooms).toHaveLength(3);
    // The rooms now carry the plan's ids, so the next round changes nothing.
    const second = reconcileCalculatorPlan(first.plan, first.rooms);
    expect(second.plan).toBe(first.plan);
    expect(second.rooms).toBe(first.rooms);
    // …and a third round neither grows the plan nor moves a room.
    const third = reconcileCalculatorPlan(second.plan, second.rooms);
    expect(third.plan!.rooms).toHaveLength(3);
    expect(third.rooms).toBe(second.rooms);
  });

  it('reads the rooms off an agreeing plan and writes nothing when they already match', () => {
    const planA = ensureWalls(planFromCalculatorRooms(flatA));
    const synced = reconcileCalculatorPlan(planA, flatA);
    expect(synced.plan).toBe(planA);
    // The wall graph lists its faces in its own order; the ids are the rooms' own.
    expect(synced.rooms.map((r) => r.id).sort()).toEqual(['a-bed', 'a-living']);
    const again = reconcileCalculatorPlan(planA, synced.rooms);
    expect(again.rooms).toBe(synced.rooms);
    expect(sameCalculatorRooms(synced.rooms, again.rooms)).toBe(true);
  });

  it('makes a plan for typed rooms when there is none', () => {
    const made = reconcileCalculatorPlan(null, flatA);
    expect(made.plan?.rooms.map((r) => r.id).sort()).toEqual(['a-bed', 'a-living']);
    expect(made.plan?.walls?.length ?? 0).toBeGreaterThan(0);
  });
});

describe('a room’s walls one by one', () => {
  it('are read off the board with the room, in the order of its outline, and change what counts as the same room', () => {
    const planA = ensureWalls(planFromCalculatorRooms(flatA));
    const [first] = calculatorRoomsFromPlan(planA);
    const outline = planA.rooms.find((r) => r.id === first.id)!.polygon;
    expect(first.walls).toEqual(edgeLengthsM(outline));
    expect(first.walls).toHaveLength(outline.length);
    // Round the room, the walls come to its perimeter.
    expect(first.walls!.reduce((sum, l) => sum + l, 0)).toBeCloseTo(first.perimeterM, 1);
    expect(sameCalculatorRooms([first], [{ ...first, walls: undefined }])).toBe(false);
  });
});

describe('a room’s doors and windows', () => {
  /** Flat A's board with no doors or windows but these in its living room. */
  function withOpenings(openings: (living: PlanRoom) => Opening[], patch: Partial<PlanRoom> = {}): { plan: FloorPlan; living: PlanRoom } {
    const board = ensureWalls(planFromCalculatorRooms(flatA));
    const bare = board.rooms.map((r) => ({ ...r, openings: [] as Opening[] }));
    const living = { ...bare.find((r) => r.id === 'a-living')!, ...patch };
    const rooms = bare.map((r) => (r.id === living.id ? { ...living, openings: openings(living) } : r));
    return { plan: { ...board, rooms }, living };
  }
  const opening = (room: PlanRoom, kind: Opening['kind'], wallIndex: number, widthM: number, heightM: number, t = 0.5): Opening => ({
    id: `${room.id}-${kind}${wallIndex}-${t}`,
    kind,
    wallIndex,
    t,
    widthM,
    heightM,
    sillM: kind === 'window' ? 0.9 : 0,
    roomId: room.id,
    connectsToRoomId: null,
    exterior: true,
  });
  const read = (plan: FloorPlan, id = 'a-living') => calculatorRoomsFromPlan(plan).find((r) => r.id === id)!;

  it('come off the wall they are in and off the room’s walls when the rooms are read off the board', () => {
    const bare = read(withOpenings(() => []).plan);
    const { plan } = withOpenings((living) => [opening(living, 'window', 0, 1.8, 1.4, 0.3), opening(living, 'window', 0, 1, 1.4, 0.7), opening(living, 'door', 1, 0.9, 2.05)]);
    const living = read(plan);
    // Wall by wall, as the design measures a wall (`edgeWallAreaM2`): the two windows off wall 0, the door off wall 1.
    expect(living.wallsM2![0]).toBeCloseTo(bare.wallsM2![0] - 3.92, 2); // 2.52 + 1.4 m²
    expect(living.wallsM2![1]).toBeCloseTo(bare.wallsM2![1] - 1.845, 1); // 0.9 × 2.05 m²
    expect(living.wallsM2!.slice(2)).toEqual(bare.wallsM2!.slice(2));
    expect(living.wallM2).toBeCloseTo(bare.wallM2 - 3.92 - 1.845, 1);
    expect(roomWallAreasM2(living)).toEqual(living.wallsM2);
    // The room next door keeps its walls whole.
    expect(read(plan, 'a-bed').wallsM2).toEqual(read(withOpenings(() => []).plan, 'a-bed').wallsM2);
    // An opening changes what counts as the same room, so the plan step writes it in.
    expect(sameCalculatorRooms([living], [bare])).toBe(false);
  });

  it('never come off a room separator’s open edge, which is no wall', () => {
    const { plan, living: room } = withOpenings((living) => [opening(living, 'window', 0, 1.8, 1.4)], { open: [0] });
    const living = read(plan);
    expect(living.wallsM2![0]).toBe(0);
    expect(living.walls![0]).toBe(0);
    const open = edgeLengthsM(room.polygon)[0];
    expect(living.wallM2).toBeCloseTo(read(withOpenings(() => []).plan).wallM2 - open * room.heightM, 2);
  });

  it('come off the part of a studio they are in', () => {
    const split = { axis: 'x' as const, t: 0.5, parts: ['kitchen', 'living_room'] as ['kitchen', 'living_room'] };
    const bare = read(withOpenings(() => [], { type: 'studio', split }).plan);
    // A window in the wall at the far end of the line, in the living part.
    const { plan } = withOpenings(
      (living) => {
        const far = roomEdges(living.polygon).find((e) => Math.min(e.a.x, e.b.x) > Math.min(...living.polygon.map((p) => p.x)) + 1 && e.a.x === e.b.x)!;
        return [opening(living, 'window', far.index, 1.8, 1.4)];
      },
      { type: 'studio', split }
    );
    const studio = read(plan);
    expect(studio.parts).toHaveLength(2);
    expect(studio.parts![0].wallM2).toBe(bare.parts![0].wallM2);
    expect(studio.parts![1].wallM2).toBeCloseTo(bare.parts![1].wallM2 - 2.52, 2);
    expect(studio.wallM2).toBeCloseTo(bare.wallM2 - 2.52, 2);
  });
});
