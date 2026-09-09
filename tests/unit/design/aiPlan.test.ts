import { describe, expect, it } from 'vitest';
import { buildPlanFromReading, normaliseReading, type AiPlanReading } from '@/lib/design/aiPlan';

/**
 * A two-bedroom flat as the model would report it: rough boxes a few percent off, exact
 * printed dimensions in feet and inches. The geometry that comes out must honour the labels,
 * not the boxes.
 */
function reading(): AiPlanReading {
  return {
    unitSystem: 'imperial',
    rooms: [
      { name: 'Living Room', type: 'living_room', box: { x0: 0.02, y0: 0.03, x1: 0.51, y1: 0.55 }, widthLabel: "16' 0\"", depthLabel: "14' 0\"" },
      { name: 'Kitchen', type: 'kitchen', box: { x0: 0.52, y0: 0.03, x1: 0.97, y1: 0.31 }, widthLabel: "12' 0\"", depthLabel: "8' 0\"" },
      { name: 'Bedroom', type: 'bedroom', box: { x0: 0.52, y0: 0.32, x1: 0.97, y1: 0.55 }, widthLabel: "12' 0\"", depthLabel: "6' 0\"" },
      { name: 'Bath', type: 'bathroom', box: { x0: 0.02, y0: 0.57, x1: 0.3, y1: 0.95 }, widthLabel: "8' 0\"", depthLabel: "10' 0\"" },
    ],
    openings: [
      { kind: 'door', roomA: 'Bedroom', roomB: 'Living Room', at: { x: 0.515, y: 0.45 }, widthLabel: null },
      { kind: 'window', roomA: 'Living Room', roomB: null, at: { x: 0.25, y: 0.03 }, widthLabel: "5' 0\"" },
    ],
    notes: null,
  };
}

describe('buildPlanFromReading', () => {
  it('turns printed feet and inches into metres the walls actually match', () => {
    const result = buildPlanFromReading(reading());
    const living = result.plan.rooms.find((r) => r.name === 'Living Room')!;
    const xs = living.polygon.map((p) => p.x);
    const zs = living.polygon.map((p) => p.z);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(16 * 0.3048, 1);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(14 * 0.3048, 1);
    expect(result.worstResidualM).toBeLessThan(0.1);
    expect(result.lowConfidence).toBe(false);
    expect(result.plan.source).toBe('parsed');
  });

  it('keeps the room order and ids stable so openings can refer to them', () => {
    const result = buildPlanFromReading(reading());
    expect(result.plan.rooms.map((r) => r.id)).toEqual(['r1', 'r2', 'r3', 'r4']);
    expect(result.plan.rooms.map((r) => r.type)).toEqual(['living_room', 'kitchen', 'bedroom', 'bathroom']);
  });

  it('places the openings the drawing shows and drops the inferred ones for that room', () => {
    const result = buildPlanFromReading(reading());
    const living = result.plan.rooms.find((r) => r.name === 'Living Room')!;
    const window = living.openings.find((o) => o.kind === 'window');
    expect(window).toBeDefined();
    expect(window!.widthM).toBeCloseTo(5 * 0.3048, 2);
    expect(window!.exterior).toBe(true);
    const bedroom = result.plan.rooms.find((r) => r.name === 'Bedroom')!;
    const door = bedroom.openings.find((o) => o.kind === 'door');
    expect(door?.connectsToRoomId).toBe(living.id);
    // Rooms the drawing said nothing about keep the geometric inference — nobody is sealed in.
    const bath = result.plan.rooms.find((r) => r.name === 'Bath')!;
    expect(bath.openings.length).toBeGreaterThan(0);
  });

  it('flags a room whose printed dimension could not be honoured', () => {
    const r = reading();
    // The kitchen and bedroom stack under one 14' living-room depth but claim 8' + 6' = 14'
    // — consistent. Make the bedroom claim 9', so the column disagrees by 3'.
    r.rooms[2].depthLabel = "9' 0\"";
    const result = buildPlanFromReading(r);
    expect(result.worstResidualM).toBeGreaterThan(0.08);
    expect(result.lowConfidence).toBe(true);
    expect(result.plan.rooms.some((room) => room.lowConfidence)).toBe(true);
  });
});

describe('normaliseReading', () => {
  it('clamps boxes into the image, fixes inverted corners and blanks empty labels', () => {
    const messy = normaliseReading({
      unitSystem: 'metric',
      rooms: [{ name: '  Hall ', type: 'hallway', box: { x0: 0.6, y0: 1.2, x1: 0.1, y1: 0.4 }, widthLabel: '  ', depthLabel: '3,5 м' }],
      openings: [{ kind: 'door', roomA: 'Hall', roomB: null, at: { x: -0.1, y: 0.5 }, widthLabel: null }],
      notes: '',
    });
    expect(messy.rooms[0].name).toBe('Hall');
    expect(messy.rooms[0].box).toEqual({ x0: 0.1, y0: 0.4, x1: 0.6, y1: 1 });
    expect(messy.rooms[0].widthLabel).toBeNull();
    expect(messy.rooms[0].depthLabel).toBe('3,5 м');
    expect(messy.openings[0].at.x).toBe(0);
    expect(messy.notes).toBeNull();
  });

  it('drops a room with no area and falls back on an unknown type', () => {
    const cleaned = normaliseReading({
      unitSystem: 'metric',
      rooms: [
        { name: 'Dot', type: 'bedroom', box: { x0: 0.5, y0: 0.5, x1: 0.5, y1: 0.5 }, widthLabel: null, depthLabel: null },
        { name: 'Den', type: 'sauna' as never, box: { x0: 0, y0: 0, x1: 0.5, y1: 0.5 }, widthLabel: null, depthLabel: null },
      ],
      openings: [],
      notes: null,
    });
    expect(cleaned.rooms).toHaveLength(1);
    expect(cleaned.rooms[0].type).toBe('living_room');
  });
});
