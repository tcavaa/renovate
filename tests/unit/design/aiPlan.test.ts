import { describe, expect, it } from 'vitest';
import { buildPlanFromReading, labelMetres, normaliseReading, type AiOpening, type AiPlanReading, type AiRoom } from '@/lib/design/aiPlan';
import { outerDimensionChains } from '@/components/plan/draw';
import type { InkImage } from '@/lib/design/planInk';
import { openingWorldPoint } from '@/lib/design/openings';
import { withPartialWallSeparators, withSplitRoomTypes } from '@/lib/design/separators';
import { ensureWalls } from '@/lib/design/walls';
import type { FloorPlan, PlanRoom } from '@/lib/design/types';

const room = (name: string, type: AiRoom['type'], box: AiRoom['parts'][0]['box'], widthLabel: string | null = null, depthLabel: string | null = null): AiRoom => ({
  name,
  type,
  parts: [{ box, widthLabel, depthLabel }],
});

const opening = (o: Partial<AiOpening> & Pick<AiOpening, 'kind' | 'roomA' | 'side' | 'from' | 'to'>): AiOpening => ({
  roomB: null,
  widthLabel: null,
  hinge: null,
  swingsInto: null,
  ...o,
});

const size = (r: PlanRoom) => {
  const xs = r.polygon.map((p) => p.x);
  const zs = r.polygon.map((p) => p.z);
  return { w: Math.max(...xs) - Math.min(...xs), d: Math.max(...zs) - Math.min(...zs) };
};
const byName = (plan: FloorPlan, name: string) => plan.rooms.find((r) => r.name === name)!;

// ---------------------------------------------------------------------------
// A drawing whose walls are known to the pixel
// ---------------------------------------------------------------------------

/**
 * A 400 × 300 px plan at 2.5 cm a pixel (10 × 7.5 m): 8 px (20 cm) outer walls, 5 px (12.5 cm)
 * partitions. A living room on the left open to a kitchen below it — no line between them, a
 * sofa's hairline just above the boundary — a bedroom and a bathroom on the right, a door from
 * the living room into each through a gap in the partition, a window in the top wall drawn as
 * three thin lines, and the front door a gap in the kitchen's outer wall.
 */
function drawing(): InkImage {
  const width = 400;
  const height = 300;
  const dark = new Uint8Array(width * height);
  const fill = (x0: number, y0: number, x1: number, y1: number, v = 1) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) dark[y * width + x] = v;
  };
  fill(20, 20, 379, 27); // top
  fill(20, 272, 379, 279); // bottom
  fill(20, 20, 27, 279); // left
  fill(372, 20, 379, 279); // right
  fill(196, 28, 200, 271); // partition, living | bedroom and bathroom
  fill(201, 150, 371, 154); // partition, bedroom | bathroom
  fill(196, 100, 200, 136, 0); // door living → bedroom: 36 px = 0.9 m
  fill(196, 200, 200, 232, 0); // door living → bathroom: 32 px = 0.8 m
  fill(60, 20, 120, 27, 0); // window in the top wall: 60 px = 1.5 m …
  for (const row of [20, 23, 27]) fill(60, row, 120, row); // … drawn as three lines
  fill(60, 272, 96, 279, 0); // front door: 36 px
  // A sofa drawn with a hairline, just above the open boundary at y = 200.
  fill(40, 190, 150, 190);
  fill(40, 160, 150, 160);
  fill(40, 160, 40, 190);
  fill(150, 160, 150, 190);
  return { width, height, dark };
}

/** What a model might read off that drawing: boxes a few pixels out, a couple of labels. */
function drawnReading(): AiPlanReading {
  return {
    unitSystem: 'metric',
    rooms: [
      room('Living', 'living_room', { x0: 0.075, y0: 0.1, x1: 0.485, y1: 0.66 }, '4,20'),
      room('Kitchen', 'kitchen', { x0: 0.07, y0: 0.675, x1: 0.49, y1: 0.9 }),
      room('Bedroom', 'bedroom', { x0: 0.505, y0: 0.095, x1: 0.925, y1: 0.495 }, '427', '3.05 m'),
      room('Bath', 'bathroom', { x0: 0.5, y0: 0.52, x1: 0.93, y1: 0.9 }),
    ],
    openings: [
      opening({ kind: 'door', roomA: 'Living', roomB: 'Bedroom', side: 'right', from: { x: 0.49, y: 0.31 }, to: { x: 0.49, y: 0.43 }, hinge: { x: 0.49, y: 0.31 }, swingsInto: 'Bedroom' }),
      opening({ kind: 'door', roomA: 'Bath', roomB: 'Living', side: 'left', from: { x: 0.5, y: 0.64 }, to: { x: 0.5, y: 0.75 }, hinge: { x: 0.5, y: 0.75 }, swingsInto: 'Bath' }),
      opening({ kind: 'window', roomA: 'Living', side: 'top', from: { x: 0.13, y: 0.08 }, to: { x: 0.27, y: 0.08 } }),
      opening({ kind: 'door', roomA: 'Kitchen', side: 'bottom', from: { x: 0.17, y: 0.92 }, to: { x: 0.26, y: 0.92 }, swingsInto: 'Kitchen', hinge: { x: 0.17, y: 0.92 } }),
    ],
    notes: null,
  };
}

describe('buildPlanFromReading against the drawing', () => {
  const result = buildPlanFromReading(drawnReading(), { ink: drawing() });
  const { plan } = result;

  it('honours the printed dimensions face to face, with the walls as thick as drawn', () => {
    expect(size(byName(plan, 'Living')).w).toBeCloseTo(4.2, 1);
    expect(size(byName(plan, 'Bedroom')).w).toBeCloseTo(4.275, 1);
    expect(size(byName(plan, 'Bedroom')).d).toBeCloseTo(3.05, 1);
    expect(result.worstResidualM).toBeLessThan(0.03);
    const walls = plan.walls!.filter((w) => !w.separator);
    const thick = Math.max(...walls.map((w) => w.thicknessM));
    const thin = Math.min(...walls.map((w) => w.thicknessM));
    expect(thick).toBeCloseTo(0.2, 1);
    expect(thin).toBeGreaterThan(0.09);
    expect(thin).toBeLessThan(0.16);
  });

  it('builds four rooms and no more, the open kitchen divided off by a room separator', () => {
    expect(plan.rooms.map((r) => r.name).sort()).toEqual(['Bath', 'Bedroom', 'Kitchen', 'Living']);
    const separators = plan.walls!.filter((w) => w.separator);
    expect(separators).toHaveLength(1);
    expect(separators[0].thicknessM).toBe(0);
    expect(byName(plan, 'Living').open?.length).toBe(1);
    expect(byName(plan, 'Kitchen').open?.length).toBe(1);
    // The sofa's hairline did not move the boundary: the living room is as deep as drawn.
    expect(size(byName(plan, 'Living')).d).toBeGreaterThan(4.2);
  });

  it('puts each door in the gap the drawing leaves, as one door with two halves', () => {
    const living = byName(plan, 'Living');
    const bedroom = byName(plan, 'Bedroom');
    const toBedroom = living.openings.find((o) => o.connectsToRoomId === bedroom.id)!;
    expect(toBedroom.kind).toBe('door');
    expect(toBedroom.widthM).toBeCloseTo(0.9, 1);
    // The gap's centre is at y = 118 px; the plan's top line is the outer wall's centre, 23.5 px.
    expect(openingWorldPoint(living, toBedroom)!.z).toBeCloseTo((118 - 23.5) * 0.025, 1);
    const twin = bedroom.openings.find((o) => o.connectsToRoomId === living.id)!;
    expect(openingWorldPoint(bedroom, twin)!.z).toBeCloseTo(openingWorldPoint(living, toBedroom)!.z, 2);
    // It swings into the bedroom, from the jamb its arc pivots on, and both halves agree.
    expect(twin.swing).toBe('in');
    expect(toBedroom.swing).toBe('out');
    expect(twin.hinge).not.toBe(toBedroom.hinge);

    // Read as a door to the living room, but the gap is beside the kitchen: the wall decides.
    const bath = byName(plan, 'Bath');
    const toBath = bath.openings.find((o) => o.connectsToRoomId === byName(plan, 'Kitchen').id)!;
    expect(toBath.widthM).toBeCloseTo(0.8, 1);
    expect(openingWorldPoint(bath, toBath)!.z).toBeCloseTo((216 - 23.5) * 0.025, 1);
    expect(toBath.swing).toBe('in');
  });

  it('takes the window and the front door off the drawing and invents nothing else', () => {
    const living = byName(plan, 'Living');
    const windows = plan.rooms.flatMap((r) => r.openings.filter((o) => o.kind === 'window'));
    expect(windows).toHaveLength(1);
    expect(living.openings.find((o) => o.kind === 'window')!.widthM).toBeCloseTo(1.5, 1);
    const front = plan.rooms.flatMap((r) => r.openings.filter((o) => o.kind === 'door' && o.exterior));
    expect(front).toHaveLength(1);
    expect(front[0].roomId).toBe(byName(plan, 'Kitchen').id);
    expect(front[0].swing).toBe('in');
  });

  it('is taken in by the board as it is', () => {
    const ensured = ensureWalls(plan);
    const taken = withSplitRoomTypes(ensured.rooms, withPartialWallSeparators(ensured));
    expect(taken.rooms.map((r) => r.id).sort()).toEqual(plan.rooms.map((r) => r.id).sort());
    expect(taken.walls).toHaveLength(plan.walls!.length);
    const count = (p: FloorPlan) => p.rooms.reduce((n, r) => n + r.openings.length, 0);
    expect(count(taken)).toBe(count(plan));
  });
});

// ---------------------------------------------------------------------------
// Without the image
// ---------------------------------------------------------------------------

/**
 * A two-bedroom flat as the model would report it: rough boxes a few percent off, exact printed
 * dimensions in feet and inches, a hallway given as one box drawn over a corner of the bathroom.
 */
function reading(): AiPlanReading {
  return {
    unitSystem: 'imperial',
    rooms: [
      room('Living Room', 'living_room', { x0: 0.02, y0: 0.03, x1: 0.51, y1: 0.55 }, "16' 0\"", "14' 0\""),
      room('Kitchen', 'kitchen', { x0: 0.52, y0: 0.03, x1: 0.97, y1: 0.31 }, "12' 0\"", "8' 0\""),
      room('Bedroom', 'bedroom', { x0: 0.52, y0: 0.32, x1: 0.97, y1: 0.55 }, "12' 0\"", "6' 0\""),
      room('Bath', 'bathroom', { x0: 0.02, y0: 0.57, x1: 0.3, y1: 0.95 }, "8' 0\"", "10' 0\""),
      room('Hall', 'hallway', { x0: 0.22, y0: 0.57, x1: 0.97, y1: 0.95 }),
    ],
    openings: [
      opening({ kind: 'door', roomA: 'Bedroom', roomB: 'Living Room', side: 'left', from: { x: 0.515, y: 0.4 }, to: { x: 0.515, y: 0.5 }, hinge: { x: 0.515, y: 0.5 }, swingsInto: 'Bedroom' }),
      opening({ kind: 'window', roomA: 'Living Room', side: 'top', from: { x: 0.15, y: 0.03 }, to: { x: 0.35, y: 0.03 }, widthLabel: "5' 0\"" }),
      opening({ kind: 'open', roomA: 'Living Room', roomB: 'Kitchen', side: 'right', from: { x: 0.515, y: 0.05 }, to: { x: 0.515, y: 0.3 } }),
      opening({ kind: 'door', roomA: 'Hall', side: 'bottom', from: { x: 0.7, y: 0.95 }, to: { x: 0.78, y: 0.95 } }),
    ],
    notes: null,
  };
}

describe('buildPlanFromReading with dimension lines', () => {
  /**
   * The same drawing with its sizes as an architect chains them outside the plan, and no size in
   * any room: the overall width 9.00 (outer face to outer face), cut at the partition's middle
   * into 4.46 + 4.54, and the overall depth 6.50.
   */
  const chained = (): AiPlanReading => {
    const r = drawnReading();
    for (const room of r.rooms) for (const part of room.parts) {
      part.widthLabel = null;
      part.depthLabel = null;
    }
    r.dimensions = [
      { label: '4,46', axis: 'across', from: 0.05, to: 0.496, at: 0.02 },
      { label: '4,54', axis: 'across', from: 0.496, to: 0.95, at: 0.02 },
      { label: '9,00', axis: 'across', from: 0.05, to: 0.95, at: 0.01 },
      { label: '6,50', axis: 'down', from: 0.067, to: 0.933, at: 0.02 },
    ];
    return r;
  };
  const result = buildPlanFromReading(chained(), { ink: drawing() });

  it('measures a chain from the outer faces at the corners to the middle of the partition', () => {
    expect(result.scaleKnown).toBe(true);
    expect(result.worstResidualM).toBeLessThan(0.03);
    const chains = outerDimensionChains(result.plan)!;
    expect(chains.box.maxX - chains.box.minX).toBeCloseTo(9, 1);
    expect(chains.box.maxZ - chains.box.minZ).toBeCloseTo(6.5, 1);
    // The board's own chain along the top shows the drawing's numbers.
    expect(chains.top).toHaveLength(3);
    expect(chains.top[1] - chains.top[0]).toBeCloseTo(4.46, 1);
    expect(chains.top[2] - chains.top[1]).toBeCloseTo(4.54, 1);
    expect(Math.abs(chains.top[1] - chains.top[0] - 4.46)).toBeLessThan(0.02);
  });

  it('keeps the walls as thick as drawn, at standard sizes', () => {
    const walls = result.plan.walls!.filter((w) => !w.separator);
    expect([...new Set(walls.map((w) => w.thicknessM))].sort()).toEqual([0.12, 0.2]);
  });

  it('with nothing printed, says so and builds 30 cm outside walls and 12 cm partitions', () => {
    const r = chained();
    r.dimensions = [];
    const bare = buildPlanFromReading(r, { ink: drawing() });
    expect(bare.scaleKnown).toBe(false);
    const walls = bare.plan.walls!.filter((w) => !w.separator);
    expect([...new Set(walls.map((w) => w.thicknessM))].sort()).toEqual([0.12, 0.3]);
  });
});

describe('buildPlanFromReading from the reading alone', () => {
  it('turns printed feet and inches into rooms that measure them, face to face', () => {
    const result = buildPlanFromReading(reading());
    const living = byName(result.plan, 'Living Room');
    expect(size(living).w).toBeCloseTo(16 * 0.3048, 1);
    expect(size(living).d).toBeCloseTo(14 * 0.3048, 1);
    expect(result.worstResidualM).toBeLessThan(0.1);
    expect(result.lowConfidence).toBe(false);
    expect(result.plan.source).toBe('parsed');
  });

  it('keeps ids in reading order and builds the walls with the plan', () => {
    const { plan } = buildPlanFromReading(reading());
    expect(plan.rooms.map((r) => r.id).sort()).toEqual(['r1', 'r2', 'r3', 'r4', 'r5']);
    expect(plan.walls!.length).toBeGreaterThan(0);
  });

  it('gives an overlapped corner to the smaller room, leaving the hallway an L — and no room the drawing does not have', () => {
    const { plan } = buildPlanFromReading(reading());
    expect(plan.rooms).toHaveLength(5);
    const bath = byName(plan, 'Bath');
    const hall = byName(plan, 'Hall');
    expect(bath.polygon).toHaveLength(4);
    expect(size(bath).w).toBeCloseTo(8 * 0.3048, 1);
    // The hall's box ran over the bath; what is left of it is everything to the bath's right.
    expect(Math.min(...hall.polygon.map((p) => p.x))).toBeGreaterThan(Math.max(...bath.polygon.map((p) => p.x)) - 0.01);
  });

  it('opens the rooms the drawing shows open onto each other with a room separator', () => {
    const { plan } = buildPlanFromReading(reading());
    expect(plan.walls!.filter((w) => w.separator)).toHaveLength(1);
    expect(byName(plan, 'Kitchen').open?.length).toBe(1);
    // No door is hung on the open side.
    expect(byName(plan, 'Kitchen').openings.some((o) => o.connectsToRoomId === byName(plan, 'Living Room').id)).toBe(false);
  });

  it('places the openings the drawing shows on the walls they are in', () => {
    const { plan } = buildPlanFromReading(reading());
    const living = byName(plan, 'Living Room');
    const window = living.openings.find((o) => o.kind === 'window')!;
    expect(window.widthM).toBeCloseTo(5 * 0.3048, 2);
    expect(window.exterior).toBe(true);
    const bedroom = byName(plan, 'Bedroom');
    const door = bedroom.openings.find((o) => o.kind === 'door')!;
    expect(door.connectsToRoomId).toBe(living.id);
    expect(door.swing).toBe('in');
    expect(living.openings.find((o) => o.connectsToRoomId === bedroom.id)?.swing).toBe('out');
  });

  it('infers a door only for a room nothing leads to', () => {
    const { plan } = buildPlanFromReading(reading());
    // The bath was given no door; it is reached from a neighbour all the same.
    const bath = byName(plan, 'Bath');
    expect(bath.openings.some((o) => o.kind !== 'window' && o.connectsToRoomId)).toBe(true);
    // The front door was read, so no second one is inferred.
    expect(plan.rooms.flatMap((r) => r.openings).filter((o) => o.kind === 'door' && o.exterior)).toHaveLength(1);
  });

  it('flags a room whose printed dimension could not be honoured', () => {
    const r = reading();
    // The kitchen and bedroom stack under one 14' living-room depth but claim 8' + 6' = 14'
    // — consistent. Make the bedroom claim 9', so the column disagrees by 3'.
    r.rooms[2].parts[0].depthLabel = "9' 0\"";
    const result = buildPlanFromReading(r);
    expect(result.worstResidualM).toBeGreaterThan(0.08);
    expect(result.lowConfidence).toBe(true);
    expect(result.plan.rooms.some((room) => room.lowConfidence)).toBe(true);
  });
});

describe('labelMetres', () => {
  it('reads the units a bare metric number implies', () => {
    expect(labelMetres('3,50', 'metric')).toBeCloseTo(3.5);
    expect(labelMetres('350', 'metric')).toBeCloseTo(3.5);
    expect(labelMetres('3500', 'metric')).toBeCloseTo(3.5);
    expect(labelMetres('3.5 м', 'metric')).toBeCloseTo(3.5);
    expect(labelMetres("12' 3\"", 'imperial')).toBeCloseTo(3.7338, 3);
    expect(labelMetres('Bedroom', 'metric')).toBeNull();
    expect(labelMetres(null, 'metric')).toBeNull();
  });
});

describe('normaliseReading', () => {
  it('clamps boxes and points into the image, fixes inverted corners and blanks empty labels', () => {
    const messy = normaliseReading({
      unitSystem: 'metric',
      rooms: [{ name: '  Hall ', type: 'hallway', parts: [{ box: { x0: 0.6, y0: 1.2, x1: 0.1, y1: 0.4 }, widthLabel: '  ', depthLabel: '3,5 м' }] }],
      openings: [opening({ kind: 'door', roomA: 'Hall', side: 'left', from: { x: -0.1, y: 0.5 }, to: { x: -0.1, y: 0.6 } })],
      notes: '',
    });
    expect(messy.rooms[0].name).toBe('Hall');
    expect(messy.rooms[0].parts[0].box).toEqual({ x0: 0.1, y0: 0.4, x1: 0.6, y1: 1 });
    expect(messy.rooms[0].parts[0].widthLabel).toBeNull();
    expect(messy.rooms[0].parts[0].depthLabel).toBe('3,5 м');
    expect(messy.openings[0].from.x).toBe(0);
    expect(messy.notes).toBeNull();
  });

  it('drops a rectangle with no area, a room left with none, and falls back on an unknown type', () => {
    const cleaned = normaliseReading({
      unitSystem: 'metric',
      rooms: [
        room('Dot', 'bedroom', { x0: 0.5, y0: 0.5, x1: 0.5, y1: 0.5 }),
        room('Den', 'sauna' as never, { x0: 0, y0: 0, x1: 0.5, y1: 0.5 }),
      ],
      openings: [],
      notes: null,
    });
    expect(cleaned.rooms).toHaveLength(1);
    expect(cleaned.rooms[0].type).toBe('living_room');
  });
});
