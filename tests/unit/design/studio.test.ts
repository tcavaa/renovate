import { describe, expect, it } from 'vitest';
import { clampT, defaultSplit, dividerSegments, lineCoordinate, partAt, studioParts, swapped, turned, withFirstArea, withPartType } from '@/lib/design/studio';
import { planToCalculatorRooms, polygonPerimeterM, refreshRoom } from '@/lib/design/planGeometry';
import { layoutRoom } from '@/lib/design/autoLayout';
import { calculateWorkerCosts, computeRoomAreas, estimateCounts } from '@/lib/calculator/materials';
import type { FloorPlan, PlanRoom, Vec2 } from '@/lib/design/types';

const P = (x: number, z: number): Vec2 => ({ x, z });
const room = (polygon: Vec2[], extra: Partial<PlanRoom> = {}): PlanRoom =>
  refreshRoom({ id: 's', type: 'studio', name: 'სტუდიო 1', polygon, heightM: 2.8, areaM2: 0, perimeterM: 0, openings: [], ...extra });

const rect = room([P(0, 0), P(7, 0), P(7, 4), P(0, 4)]);
// An L: 6 × 4 with the top-right 2 × 2 cut away (20 m²).
const ell = room([P(0, 0), P(4, 0), P(4, 2), P(6, 2), P(6, 4), P(0, 4)]);

describe('dividing a studio', () => {
  it('divides the longer side, the kitchen taking about a third', () => {
    const split = defaultSplit(rect);
    expect(split.axis).toBe('x');
    expect(split.parts).toEqual(['kitchen', 'living_room']);
    const [kitchen, living] = studioParts({ ...rect, split })!;
    expect(kitchen.areaM2).toBeCloseTo(28 * 0.35, 1);
    expect(kitchen.areaM2 + living.areaM2).toBeCloseTo(28, 2);
    // The line is not a wall: the two parts share the room's 22 m of wall between them.
    expect(kitchen.wallLengthM).toBeCloseTo(2 * 2.45 + 4, 1);
    expect(kitchen.wallLengthM + living.wallLengthM).toBeCloseTo(22, 2);
  });

  it('divides a room with no split of its own the default way', () => {
    expect(studioParts(rect)!.map((p) => p.type)).toEqual(['kitchen', 'living_room']);
    expect(studioParts({ ...rect, type: 'living_room' })).toBeNull();
  });

  it('sets a part to a typed area, and keeps both parts a usable size', () => {
    const split = withFirstArea(rect, 12);
    expect(studioParts({ ...rect, split })![0].areaM2).toBeCloseTo(12, 1);
    expect(lineCoordinate(rect, split)).toBeCloseTo(3, 2);
    // Nothing smaller than 1.5 m² either side, however it is asked.
    expect(studioParts({ ...rect, split: withFirstArea(rect, 0) })![0].areaM2).toBeGreaterThanOrEqual(1.49);
    expect(studioParts({ ...rect, split: withFirstArea(rect, 28) })![1].areaM2).toBeGreaterThanOrEqual(1.49);
    expect(clampT(rect, 'x', -3)).toBeGreaterThan(0);
    expect(clampT(rect, 'x', 3)).toBeLessThan(1);
  });

  it('turns the line keeping the first part’s share, swaps the parts, and changes one part’s type', () => {
    const split = withFirstArea(rect, 10);
    const t = turned({ ...rect, split });
    expect(t.axis).toBe('z');
    expect(studioParts({ ...rect, split: t })![0].areaM2).toBeCloseTo(10, 1);
    expect(swapped({ ...rect, split }).parts).toEqual(['living_room', 'kitchen']);
    expect(withPartType({ ...rect, split }, 1, 'bedroom').parts).toEqual(['kitchen', 'bedroom']);
    // A part cannot be another studio.
    expect(withPartType({ ...rect, split }, 0, 'studio').parts[0]).toBe('kitchen');
  });

  it('says which part a point is in, and draws the line from wall to wall', () => {
    const split = withFirstArea(rect, 12);
    expect(partAt({ ...rect, split }, P(1, 2))).toBe(0);
    expect(partAt({ ...rect, split }, P(6, 2))).toBe(1);
    const segments = dividerSegments({ ...rect, split });
    expect(segments).toHaveLength(1);
    expect(segments[0][0].x).toBeCloseTo(3, 2);
    expect(Math.abs(segments[0][1].z - segments[0][0].z)).toBeCloseTo(4, 2);
  });

  it('measures an L-shaped studio exactly, whichever way it is divided', () => {
    expect(ell.areaM2).toBe(20);
    for (const axis of ['x', 'z'] as const) {
      for (const t of [0.2, 0.5, 0.8]) {
        const [a, b] = studioParts({ ...ell, split: { axis, t: clampT(ell, axis, t), parts: ['kitchen', 'living_room'] } })!;
        expect(a.areaM2 + b.areaM2).toBeCloseTo(20, 1);
        expect(a.wallLengthM + b.wallLengthM).toBeCloseTo(polygonPerimeterM(ell.polygon), 1);
      }
    }
    // Across the notch the line runs from the bottom wall to the top of the short arm.
    const segments = dividerSegments({ ...ell, split: { axis: 'x', t: 5 / 6, parts: ['kitchen', 'living_room'] } });
    expect(segments).toHaveLength(1);
    expect(Math.abs(segments[0][1].z - segments[0][0].z)).toBeCloseTo(2, 2);
  });
});

describe('a studio in the estimate', () => {
  const plan = (r: PlanRoom): FloorPlan => ({ rooms: [r], metresPerPixel: null, bounds: { width: 7, depth: 4 }, source: 'manual', wallThicknessM: 0.12 });

  it('reaches the calculator with its two parts measured off the plan', () => {
    const [calc] = planToCalculatorRooms(plan({ ...rect, split: withFirstArea(rect, 12) }));
    expect(calc.type).toBe('studio');
    expect(calc.parts!.map((p) => p.type)).toEqual(['kitchen', 'living_room']);
    expect(calc.parts![0].floorM2).toBeCloseTo(12, 1);
    expect(calc.parts![0].wallM2 + calc.parts![1].wallM2).toBeCloseTo(calc.wallM2, 1);
  });

  it('prices each part as its own type: the kitchen floor tiled, the living floor laid, no partition, one door', () => {
    const [calc] = planToCalculatorRooms(plan({ ...rect, split: withFirstArea(rect, 12) }));
    const byKey = Object.fromEntries(calculateWorkerCosts([calc], 'black_frame').map((c) => [c.key, c]));
    expect(byKey.kitchen_tiling.qty).toBeCloseTo(12, 1);
    expect(byKey.laminate_laying.qty).toBeCloseTo(16, 1);
    expect(byKey.wall_build).toBeUndefined();
    expect(byKey.door_install.qty).toBe(1);
    // A kitchen's and a living room's points, radiators and water — and the washing machine.
    expect(estimateCounts([calc])).toMatchObject({ electricPoints: 20, plumbingPoints: 3, radiators: 2, doors: 1, partitionM2: 0 });
  });

  it('prices a studio saved without its parts the default way', () => {
    const bare = computeRoomAreas({ id: 'x', type: 'studio', nameKa: 'სტუდიო', width: 7, length: 4, height: 2.8 });
    const byKey = Object.fromEntries(calculateWorkerCosts([bare], 'green_frame').map((c) => [c.key, c]));
    expect(byKey.kitchen_tiling.qty).toBeCloseTo(28 * 0.35, 1);
    expect(byKey.laminate_laying.qty).toBeCloseTo(28 * 0.65, 1);
  });
});

describe('furnishing a studio', () => {
  it('lays each part out with its own type’s program, on its own side of the line', () => {
    const split = withFirstArea(rect, 12);
    const items = layoutRoom({ ...rect, split });
    const at = lineCoordinate(rect, split);
    const kitchen = items.find((i) => i.kind === 'kitchen_run');
    const sofa = items.find((i) => i.slot === 'sofa');
    expect(kitchen).toBeDefined();
    expect(sofa).toBeDefined();
    expect(kitchen!.position.x).toBeLessThan(at);
    expect(sofa!.position.x).toBeGreaterThan(at);
    expect(items.every((i) => i.roomId === 's')).toBe(true);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  });
});
