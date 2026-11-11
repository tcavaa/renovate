import { describe, expect, it } from 'vitest';
import { buildPlanFromReading, labelArea, normaliseReading, type AiOpening, type AiPlanReading, type AiRoom } from '@/lib/design/aiPlan';
import { parseArea } from '@/lib/design/measure';
import { areaStep, squeezedPairs } from '@/lib/design/planAreas';
import { SOLID, assignCells, boundaryRuns } from '@/lib/design/planGrid';
import { blockBox, withoutInk, type InkImage } from '@/lib/design/planInk';
import { withPartialWallSeparators } from '@/lib/design/separators';
import { ensureWalls } from '@/lib/design/walls';
import type { FloorPlan } from '@/lib/design/types';

const room = (name: string, type: AiRoom['type'], areaLabel: string | null, box: AiRoom['parts'][0]['box']): AiRoom => ({
  name,
  type,
  areaLabel,
  parts: [{ box, widthLabel: null, depthLabel: null }],
});

const opening = (o: Partial<AiOpening> & Pick<AiOpening, 'kind' | 'roomA' | 'side' | 'from' | 'to'>): AiOpening => ({
  roomB: null,
  widthLabel: null,
  hinge: null,
  swingsInto: null,
  ...o,
});

const byName = (plan: FloorPlan, name: string) => plan.rooms.find((r) => r.name === name)!;

describe('parseArea', () => {
  it('reads the ways a floor area is printed', () => {
    expect(parseArea('10.8 m²')).toBeCloseTo(10.8);
    expect(parseArea('10,8 მ²')).toBeCloseTo(10.8);
    expect(parseArea('6.3 m2')).toBeCloseTo(6.3);
    expect(parseArea('48.4 кв.м')).toBeCloseTo(48.4);
    expect(parseArea('12 sqm')).toBeCloseTo(12);
    expect(parseArea('116 sq ft')).toBeCloseTo(10.78, 2);
    expect(parseArea('116 SF')).toBeCloseTo(10.78, 2);
  });

  it('reads a bare number in the drawing’s units and refuses what is not an area', () => {
    expect(parseArea('10.8')).toBeCloseTo(10.8);
    expect(labelArea('116', 'imperial')).toBeCloseTo(10.78, 2);
    expect(parseArea('3.5 m')).toBeNull();
    expect(parseArea('Bedroom')).toBeNull();
    expect(parseArea('')).toBeNull();
    expect(labelArea(null, 'metric')).toBeNull();
  });
});

describe('areaStep', () => {
  // Two rooms side by side, 3 m and 2 m wide, 4 m deep, on lines x = 0, 3, 5 and y = 0, 4.
  const grid = assignCells([0, 3, 5], [0, 4], [{ parts: [{ x0: 0, x1: 1, y0: 0, y1: 1 }] }, { parts: [{ x0: 1, x1: 2, y0: 0, y1: 1 }] }]);
  const runs = boundaryRuns(grid);
  const even = { x: [1, 1, 1], y: [1, 1] };

  it('moves the lines so a room gains what it is short of', () => {
    const step = areaStep({ nx: 3, ny: 2, runs, targets: [{ room: 0, target: 13, current: 12 }], stiffness: even, ties: [] })!;
    // To first order the room grows by its boundary on each line times the line's move.
    const gained = 4 * (step.dx[1] - step.dx[0]) + 3 * (step.dy[1] - step.dy[0]);
    expect(gained).toBeCloseTo(1, 2);
  });

  it('moves a line nothing is built on before a wall the image showed', () => {
    const step = areaStep({ nx: 3, ny: 2, runs, targets: [{ room: 0, target: 13, current: 12 }], stiffness: { x: [1, 0.03, 1], y: [1, 1] }, ties: [] })!;
    expect(step.dx[1]).toBeGreaterThan(0.2);
    expect(Math.abs(step.dx[0])).toBeLessThan(0.02);
    expect(Math.abs(step.dy[1])).toBeLessThan(0.02);
  });

  it('keeps two lines a printed size holds apart at their distance', () => {
    const step = areaStep({ nx: 3, ny: 2, runs, targets: [{ room: 0, target: 13, current: 12 }], stiffness: even, ties: [{ axis: 'x', lo: 0, hi: 1 }] })!;
    expect(step.dx[1] - step.dx[0]).toBeCloseTo(0, 3);
    expect(3 * (step.dy[1] - step.dy[0])).toBeCloseTo(1, 2);
  });

  it('has nothing to do without a target', () => {
    expect(areaStep({ nx: 3, ny: 2, runs, targets: [], stiffness: even, ties: [] })).toBeNull();
  });

  it('names the neighbours a step would squeeze', () => {
    expect(squeezedPairs([0, 1, 3], [0, 0.5, 0], [0, 1, 3], 'x')).toEqual([]);
    expect(squeezedPairs([0, 1, 3], [0.5, 0, 0], [0, 1, 3], 'x')).toEqual([{ axis: 'x', lo: 0, hi: 1 }]);
    // Already closer than the limit, and not being brought closer: left alone.
    expect(squeezedPairs([0, 0.5, 3], [0, 0.1, 0], [0, 1, 3], 'x')).toEqual([]);
  });
});

describe('solid blocks on the grid', () => {
  it('belong to no room, are never filled, and are walled off from the rooms and the outside', () => {
    // One room over a 3 × 3 grid with a column in its middle, and one in its corner.
    const rooms = [{ parts: [{ x0: 0, x1: 3, y0: 0, y1: 3 }] }];
    const grid = assignCells([0, 1, 2, 3], [0, 1, 2, 3], rooms, [
      { x0: 1, x1: 2, y0: 1, y1: 2 },
      { x0: 0, x1: 1, y0: 0, y1: 1 },
    ]);
    expect(grid.owner[4]).toBe(SOLID);
    expect(grid.owner[0]).toBe(SOLID);
    expect([...grid.owner].filter((o) => o === 0)).toHaveLength(7);
    const runs = boundaryRuns(grid);
    // The middle column: four sides against the room. The corner one: two against the room, two against the outside.
    expect(runs.filter((r) => (r.a === SOLID && r.b === 0) || (r.a === 0 && r.b === SOLID))).toHaveLength(6);
    expect(runs.filter((r) => (r.a === SOLID && r.b === -1) || (r.a === -1 && r.b === SOLID))).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// A drawing with nothing printed but each room's area
// ---------------------------------------------------------------------------

/**
 * A 400 × 500 px plan at 2 cm a pixel: 10 px (20 cm) outer walls, 5 px (10 cm) partitions. On
 * the left a living room with a shaft (30 × 30 px, filled) in its top-left corner, open to the
 * kitchen below it; on the right a bedroom over a bathroom. A balcony along the top, drawn with
 * a 2 px line. Doors as gaps: living → bedroom (which the reading below does not report),
 * kitchen → bathroom, the front door in the kitchen's outer wall, and one from the living room
 * and one from the bedroom onto the balcony; a window, three thin lines, between the shaft and
 * the living room's balcony door.
 */
function drawing(): InkImage {
  const width = 400;
  const height = 500;
  const dark = new Uint8Array(width * height);
  const fill = (x0: number, y0: number, x1: number, y1: number, v = 1) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) dark[y * width + x] = v;
  };
  fill(40, 100, 359, 109); // top wall
  fill(40, 430, 359, 439); // bottom
  fill(40, 100, 49, 439); // left
  fill(350, 100, 359, 439); // right
  fill(198, 110, 202, 429); // partition, left | right
  fill(203, 298, 349, 302); // partition, bedroom | bathroom
  fill(50, 110, 79, 139); // the shaft
  fill(198, 180, 202, 219, 0); // door living → bedroom: 40 px = 0.8 m
  fill(198, 340, 202, 374, 0); // door kitchen → bathroom: 35 px = 0.7 m
  fill(100, 430, 144, 439, 0); // front door: 45 px = 0.9 m
  fill(125, 100, 169, 109, 0); // door living → balcony: 45 px
  fill(240, 100, 284, 109, 0); // door bedroom → balcony: 45 px
  fill(82, 100, 123, 109, 0); // window beside the shaft: 42 px …
  for (const row of [100, 104, 109]) fill(82, row, 123, row); // … as three lines
  // The balcony's outline: a line, not a wall.
  fill(40, 40, 359, 41);
  fill(40, 40, 41, 99);
  fill(358, 40, 359, 99);
  return { width, height, dark };
}

/** The rooms' true floors at 50 px to the metre, m²: what a drawing prints, to one decimal. */
const PRINTED = { Living: '9.1 m²', Kitchen: '9,5 მ²', Bedroom: '11.1 m²', Bath: '7.5 m²', Balcony: '7.3 m²' };

/** What a model might read: boxes a few pixels out, every area, the shaft — and one door missed. */
function areasReading(): AiPlanReading {
  return {
    unitSystem: 'metric',
    rooms: [
      room('Living', 'living_room', PRINTED.Living, { x0: 0.13, y0: 0.225, x1: 0.49, y1: 0.545 }),
      room('Kitchen', 'kitchen', PRINTED.Kitchen, { x0: 0.125, y0: 0.54, x1: 0.495, y1: 0.86 }),
      room('Bedroom', 'bedroom', PRINTED.Bedroom, { x0: 0.51, y0: 0.225, x1: 0.87, y1: 0.59 }),
      room('Bath', 'bathroom', PRINTED.Bath, { x0: 0.505, y0: 0.61, x1: 0.875, y1: 0.855 }),
      room('Balcony', 'balcony', PRINTED.Balcony, { x0: 0.11, y0: 0.09, x1: 0.89, y1: 0.2 }),
    ],
    voids: [{ box: { x0: 0.12, y0: 0.215, x1: 0.205, y1: 0.285 } }],
    openings: [
      opening({ kind: 'open', roomA: 'Living', roomB: 'Kitchen', side: 'bottom', from: { x: 0.13, y: 0.54 }, to: { x: 0.49, y: 0.54 } }),
      opening({ kind: 'door', roomA: 'Kitchen', roomB: 'Bath', side: 'right', from: { x: 0.5, y: 0.68 }, to: { x: 0.5, y: 0.75 }, hinge: { x: 0.5, y: 0.68 }, swingsInto: 'Bath' }),
      opening({ kind: 'door', roomA: 'Kitchen', side: 'bottom', from: { x: 0.25, y: 0.87 }, to: { x: 0.36, y: 0.87 }, hinge: { x: 0.25, y: 0.87 }, swingsInto: 'Kitchen' }),
      opening({ kind: 'door', roomA: 'Living', roomB: 'Balcony', side: 'top', from: { x: 0.31, y: 0.21 }, to: { x: 0.42, y: 0.21 }, hinge: { x: 0.42, y: 0.21 }, swingsInto: 'Living' }),
      opening({ kind: 'window', roomA: 'Living', roomB: 'Balcony', side: 'top', from: { x: 0.205, y: 0.21 }, to: { x: 0.31, y: 0.21 } }),
      opening({ kind: 'door', roomA: 'Bedroom', roomB: 'Balcony', side: 'top', from: { x: 0.6, y: 0.21 }, to: { x: 0.71, y: 0.21 }, hinge: { x: 0.6, y: 0.21 }, swingsInto: 'Bedroom' }),
    ],
    dimensions: [],
    notes: null,
  };
}

describe('buildPlanFromReading on a drawing with only the rooms’ areas printed', () => {
  const result = buildPlanFromReading(normaliseReading(areasReading()), { ink: drawing() });
  const { plan } = result;

  it('takes its size from the areas: nothing is asked, and the flat is as big as drawn', () => {
    expect(result.scaleKnown).toBe(true);
    // 320 px between the outer faces across, 400 px from the balcony's line to the bottom wall.
    expect(plan.bounds.width).toBeGreaterThan(6.2);
    expect(plan.bounds.width).toBeLessThan(6.6);
    expect(plan.bounds.depth).toBeGreaterThan(7.7);
    expect(plan.bounds.depth).toBeLessThan(8.2);
  });

  it('makes every room exactly the area printed in it', () => {
    expect(byName(plan, 'Living').areaM2).toBe(9.1);
    expect(byName(plan, 'Kitchen').areaM2).toBe(9.5);
    expect(byName(plan, 'Bedroom').areaM2).toBe(11.1);
    expect(byName(plan, 'Bath').areaM2).toBe(7.5);
    expect(byName(plan, 'Balcony').areaM2).toBe(7.3);
    expect(result.areas.every((a) => a.fitted && Math.abs(a.solved - a.target) < 0.005)).toBe(true);
    expect(plan.rooms.some((r) => r.lowConfidence)).toBe(false);
  });

  it('cuts the shaft out of the room it stands in, and makes no room of it', () => {
    expect(plan.rooms).toHaveLength(5);
    const living = byName(plan, 'Living');
    // An L round the shaft: six corners, not four; the shaft's walls are partitions, not facade.
    expect(living.polygon).toHaveLength(6);
    const xs = living.polygon.map((p) => p.x);
    const zs = living.polygon.map((p) => p.z);
    const box = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...zs) - Math.min(...zs));
    expect(box - living.areaM2).toBeGreaterThan(0.25);
    expect(box - living.areaM2).toBeLessThan(0.5);
    const walls = plan.walls!.filter((w) => !w.separator);
    expect(Math.max(...walls.map((w) => w.thicknessM))).toBeLessThanOrEqual(0.3);
  });

  it('keeps the kitchen open to the living room', () => {
    expect(plan.walls!.filter((w) => w.separator).length).toBeGreaterThanOrEqual(1);
    expect(byName(plan, 'Living').open?.length).toBe(1);
    expect(byName(plan, 'Kitchen').open?.length).toBe(1);
  });

  it('finds the doorway the reading left out, in the gap the drawing leaves', () => {
    const living = byName(plan, 'Living');
    const bedroom = byName(plan, 'Bedroom');
    const door = living.openings.find((o) => o.connectsToRoomId === bedroom.id);
    expect(door?.kind).toBe('door');
    expect(door!.widthM).toBeCloseTo(0.8, 1);
    expect(bedroom.openings.filter((o) => o.connectsToRoomId === living.id)).toHaveLength(1);
    // And only that one: the doors that were read are not found a second time.
    const doors = plan.rooms.flatMap((r) => r.openings.filter((o) => o.kind === 'door'));
    expect(doors).toHaveLength(2 * 4 + 1);
  });

  it('keeps a window squeezed between the shaft’s corner and a door, narrower', () => {
    const living = byName(plan, 'Living');
    const window = living.openings.find((o) => o.kind === 'window');
    expect(window).toBeDefined();
    expect(window!.widthM).toBeGreaterThanOrEqual(0.3);
    expect(window!.widthM).toBeLessThan(0.84);
    expect(window!.connectsToRoomId).toBe(byName(plan, 'Balcony').id);
  });

  it('reads a balcony drawn with a thin line as open: a railing on each of its three outer sides', () => {
    const balcony = byName(plan, 'Balcony');
    const railings = balcony.openings.filter((o) => o.kind === 'railing');
    expect(railings).toHaveLength(3);
    expect(railings.every((o) => o.exterior)).toBe(true);
  });

  it('is taken in by the board as it is, areas and all', () => {
    const taken = withPartialWallSeparators(ensureWalls(plan));
    expect(taken.rooms.map((r) => [r.name, r.areaM2])).toEqual(plan.rooms.map((r) => [r.name, r.areaM2]));
    expect(taken.walls).toHaveLength(plan.walls!.length);
  });
});

describe('buildPlanFromReading from areas alone, without the image', () => {
  const reading = (areas: boolean): AiPlanReading => ({
    unitSystem: 'metric',
    rooms: [
      room('Room', 'living_room', areas ? '20 m²' : null, { x0: 0.1, y0: 0.1, x1: 0.5, y1: 0.9 }),
      room('Bedroom', 'bedroom', areas ? '12 m²' : null, { x0: 0.52, y0: 0.1, x1: 0.9, y1: 0.6 }),
      room('Bath', 'bathroom', areas ? '7 m²' : null, { x0: 0.52, y0: 0.62, x1: 0.9, y1: 0.9 }),
    ],
    openings: [],
    dimensions: [],
    notes: null,
  });

  it('calls a room the drawing prints no name for what it is, and keeps a printed one', () => {
    const unnamed = reading(true);
    unnamed.rooms[0].printedName = null;
    unnamed.rooms[1].printedName = 'Master';
    const { plan } = buildPlanFromReading(normaliseReading(unnamed), { aspect: 1.25 });
    expect(plan.rooms.map((r) => r.name).sort()).toEqual(['Bath', 'Master', 'მისაღები ოთახი'].sort());
  });

  it('sizes and fits the rooms by their areas', () => {
    const result = buildPlanFromReading(normaliseReading(reading(true)), { aspect: 1.25 });
    expect(result.scaleKnown).toBe(true);
    expect(byName(result.plan, 'Room').areaM2).toBe(20);
    expect(byName(result.plan, 'Bedroom').areaM2).toBe(12);
    expect(byName(result.plan, 'Bath').areaM2).toBe(7);
  });

  it('with nothing printed, asks for a size — and keeps the picture’s shape meanwhile', () => {
    const square = buildPlanFromReading(normaliseReading(reading(false)));
    const wide = buildPlanFromReading(normaliseReading(reading(false)), { aspect: 2 });
    expect(square.scaleKnown).toBe(false);
    expect(wide.scaleKnown).toBe(false);
    // The same boxes on an image twice as wide as it is tall are a flat twice as wide for its depth.
    const ratio = (p: FloorPlan) => p.bounds.width / p.bounds.depth;
    expect(ratio(wide.plan) / ratio(square.plan)).toBeGreaterThan(1.7);
  });

  it('does not hold a room to an area far from what is drawn', () => {
    const off = reading(true);
    off.rooms[1].areaLabel = '40 m²';
    const result = buildPlanFromReading(normaliseReading(off), { aspect: 1.25 });
    // The other two agree on the scale; the third is the misread.
    expect(result.areas.find((a) => a.room === 'Bedroom')!.fitted).toBe(false);
    expect(byName(result.plan, 'Bedroom').lowConfidence).toBe(true);
    expect(byName(result.plan, 'Bedroom').areaM2).toBeLessThan(25);
    expect(byName(result.plan, 'Room').areaM2).toBe(20);
    expect(byName(result.plan, 'Bath').areaM2).toBe(7);
  });
});

describe('the ink round a solid block', () => {
  const ink = drawing();

  it('moves a block’s box onto its own edges', () => {
    const box = blockBox(ink, { x0: 0.12, y0: 0.215, x1: 0.205, y1: 0.285 });
    // The shaft is at x 50–79, y 110–139; against the outer walls its ink runs on to their outer faces.
    expect(box.x1 * 400).toBeCloseTo(80, 0);
    expect(box.y1 * 500).toBeCloseTo(140, 0);
    expect(box.x0 * 400).toBeLessThanOrEqual(50);
    expect(box.y0 * 500).toBeLessThanOrEqual(110);
  });

  it('wipes a block off the ink the rooms are pinned on', () => {
    const wiped = withoutInk(ink, [{ x0: 50 / 400, y0: 110 / 500, x1: 80 / 400, y1: 140 / 500 }]);
    expect(wiped.dark[120 * 400 + 60]).toBe(0);
    expect(ink.dark[120 * 400 + 60]).toBe(1);
    // The partition is still there.
    expect(wiped.dark[250 * 400 + 200]).toBe(1);
    expect(withoutInk(ink, [])).toBe(ink);
  });
});
