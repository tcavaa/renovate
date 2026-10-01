import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { boardCounts, boardDoorCounts, boardWindowCounts } from '@/lib/calculator/boardCounts';
import { aggregateRoomTotals, calculateWorkerCosts, type EstimateCounts } from '@/lib/calculator/materials';
import { suggestedQuantity } from '@/lib/calculator/quantities';
import { countDoors, countWindows } from '@/lib/design/openings';
import { parseFloorPlan } from '@/lib/design/planParser';
import { buildPlanFromRegions, calculatorRoomsFromPlan, metresPerPixelFromArea } from '@/lib/design/planGeometry';
import { withPartialWallSeparators, withSplitRoomTypes } from '@/lib/design/separators';
import { ensureWalls, rebuildRooms } from '@/lib/design/walls';
import type { FloorPlan, Opening, PlanRoom, Vec2, Wall } from '@/lib/design/types';

const P = (x: number, z: number): Vec2 => ({ x, z });
const wall = (id: string, a: Vec2, b: Vec2): Wall => ({ id, a, b, thicknessM: 0.12, origin: 'existing' });
const base: FloorPlan = { rooms: [], metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', wallThicknessM: 0.12, wallHeightM: 2.8, walls: [] };

/** Two rooms side by side, 4 × 3 m each, sharing the wall at x = 4 — drawn, with no doors yet. */
const pair = (): FloorPlan =>
  rebuildRooms(base, [wall('top', P(0, 0), P(8, 0)), wall('right', P(8, 0), P(8, 3)), wall('bottom', P(8, 3), P(0, 3)), wall('left', P(0, 3), P(0, 0)), wall('mid', P(4, 0), P(4, 3))]);

const opening = (room: PlanRoom, kind: Opening['kind'], to: PlanRoom | null = null, n = 0): Opening => ({
  id: `${room.id}-${to?.id ?? 'out'}-${kind}${n}`,
  kind,
  wallIndex: 0,
  t: 0.5,
  widthM: kind === 'window' ? 1.4 : 0.9,
  heightM: kind === 'window' ? 1.4 : 2.05,
  sillM: kind === 'window' ? 0.9 : 0,
  roomId: room.id,
  connectsToRoomId: to?.id ?? null,
  exterior: !to,
});

/** The pair with openings of its own: each room's list made from both rooms. */
function withOpenings(plan: FloorPlan, of: (a: PlanRoom, b: PlanRoom) => [Opening[], Opening[]]): FloorPlan {
  const [a, b] = plan.rooms;
  const [first, second] = of(a, b);
  return { ...plan, rooms: [{ ...a, openings: first }, { ...b, openings: second }] };
}

describe('countDoors', () => {
  it('counts an interior door’s two halves once, a front door once, and no archway or window', () => {
    const plan = withOpenings(pair(), (a, b) => [
      [opening(a, 'door', b), opening(a, 'door'), opening(a, 'window')],
      [opening(b, 'door', a), opening(b, 'archway')],
    ]);
    expect(countDoors(plan)).toBe(2);
  });

  it('counts two doors between the same two rooms as two', () => {
    const plan = withOpenings(pair(), (a, b) => [
      [opening(a, 'door', b, 0), opening(a, 'door', b, 1)],
      [opening(b, 'door', a, 0), opening(b, 'door', a, 1)],
    ]);
    expect(countDoors(plan)).toBe(2);
  });

  it('counts the windows, every one once, and no door or archway', () => {
    const plan = withOpenings(pair(), (a, b) => [
      [opening(a, 'window', null, 0), opening(a, 'window', null, 1), opening(a, 'door', b)],
      [opening(b, 'window'), opening(b, 'archway', a)],
    ]);
    expect(countWindows(plan)).toBe(3);
  });
});

describe('the calculator’s board counts', () => {
  it('counts the doors on a board that has its doorways drawn', () => {
    const plan = withOpenings(pair(), (a, b) => [[opening(a, 'door', b), opening(a, 'door')], [opening(b, 'door', a)]]);
    expect(boardDoorCounts(plan)).toEqual({ doors: 2 });
  });

  it('leaves a board with no doorway drawn to the rooms — a door each — rather than hanging none', () => {
    const drawn = pair();
    expect(drawn.rooms.every((r) => r.openings.length === 0)).toBe(true);
    expect(boardDoorCounts(drawn)).toEqual({});
    // Windows say nothing about the doors.
    expect(boardDoorCounts(withOpenings(drawn, (a, b) => [[opening(a, 'window')], [opening(b, 'window')]]))).toEqual({});
    expect(boardDoorCounts(null)).toEqual({});
    expect(boardDoorCounts(undefined)).toEqual({});
  });

  it('hangs no door where the doorways drawn are all archways', () => {
    const open = withOpenings(pair(), (a, b) => [[opening(a, 'archway', b)], [opening(b, 'archway', a)]]);
    expect(boardDoorCounts(open)).toEqual({ doors: 0 });
  });

  it('counts the windows on a board that has any, and leaves one that has none to the rooms', () => {
    expect(boardWindowCounts(withOpenings(pair(), (a, b) => [[opening(a, 'window'), opening(a, 'window', null, 1)], [opening(b, 'window')]]))).toEqual({ windows: 3 });
    expect(boardWindowCounts(pair())).toEqual({});
    expect(boardWindowCounts(withOpenings(pair(), (a, b) => [[opening(a, 'door', b)], [opening(b, 'door', a)]]))).toEqual({});
    expect(boardWindowCounts(null)).toEqual({});
  });

  it('gives the partition walls, the doors and the windows together: the estimate’s counts', () => {
    const plan = withOpenings(pair(), (a, b) => [[opening(a, 'door', b), opening(a, 'window')], [opening(b, 'door', a)]]);
    const counts = boardCounts(plan);
    expect(counts.doors).toBe(1);
    expect(counts.windows).toBe(1);
    expect(counts.partitionM2).toBeCloseTo(3 * 2.8, 2);
    expect(boardCounts(pair())).toEqual({ partitionM2: 8.4 });
    expect(boardCounts(null)).toEqual({});
  });

  it('buys a window for the whole flat for the board’s windows', () => {
    const plan = withOpenings(pair(), (a, b) => [[opening(a, 'window'), opening(a, 'window', null, 1)], [opening(b, 'window')]]);
    const rooms = calculatorRoomsFromPlan(plan);
    expect(suggestedQuantity('windows', aggregateRoomTotals(rooms))).toBe(2); // a window a room
    expect(suggestedQuantity('windows', aggregateRoomTotals(rooms, boardCounts(plan)))).toBe(3);
  });

  it('prices the door installation and a door for the whole flat by the board’s doors', () => {
    const plan = withOpenings(pair(), (a, b) => [[opening(a, 'door', b)], [opening(b, 'door', a)]]);
    const rooms = calculatorRoomsFromPlan(plan);
    const doorLine = (counts?: Partial<EstimateCounts>) => calculateWorkerCosts(rooms, 'white_frame', undefined, { counts }).find((w) => w.key === 'door_install');
    expect(doorLine()?.qty).toBe(2);
    expect(doorLine(boardCounts(plan))?.qty).toBe(1);
    expect(suggestedQuantity('doors', aggregateRoomTotals(rooms))).toBe(2);
    expect(suggestedQuantity('doors', aggregateRoomTotals(rooms, boardCounts(plan)))).toBe(1);
  });
});

describe('the sample plan (სანიმუშო გეგმა)', () => {
  // Read the way the calculator's first step reads it without a Claude key: the CV parser,
  // scaled to the 86 m² the card fills in, then taken onto the board (`setPlan`).
  const png = PNG.sync.read(readFileSync(join(process.cwd(), 'public/samples/plan-2br.png')));
  const parse = parseFloorPlan({ data: new Uint8ClampedArray(png.data), width: png.width, height: png.height });
  const read = buildPlanFromRegions(parse, { metresPerPixel: metresPerPixelFromArea(parse.regions, 86) });
  const ensured = ensureWalls(read);
  const board = withSplitRoomTypes(ensured.rooms, withPartialWallSeparators(ensured));
  const rooms = calculatorRoomsFromPlan(board);
  const labour = (key: string, of: typeof rooms = rooms) => calculateWorkerCosts(of, 'white_frame', undefined, { counts: boardCounts(board) }).find((w) => w.key === key);

  it('hangs the three doors its board shows, not a door for each of its five rooms', () => {
    expect(rooms).toHaveLength(5);
    expect(countDoors(board)).toBe(3);
    expect(labour('door_install')).toMatchObject({ qty: 3, totalGEL: 450 });
  });

  it('buys a window for the whole flat for its eight windows, and paints the walls without the doors and windows in them', () => {
    expect(countWindows(board)).toBe(8);
    expect(suggestedQuantity('windows', aggregateRoomTotals(rooms, boardCounts(board)))).toBe(8);
    // Its walls whole, every room 2.8 m high: 234.96 m². The eight windows come to 19.6 m², the three doors and the
    // archway — each cut into the walls of both rooms — to 17.5 m² more.
    const whole = calculatorRoomsFromPlan({ ...board, rooms: board.rooms.map((r) => ({ ...r, openings: [] })) });
    expect(labour('paint_walls', whole)?.qty).toBe(234.96);
    expect(labour('paint_walls')?.qty).toBe(197.85);
  });
});
