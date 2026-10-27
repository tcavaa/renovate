import { describe, expect, it } from 'vitest';
import { suggestTechnical } from '@/lib/design/autoTechnical';
import { refreshRoom } from '@/lib/design/planGeometry';
import type { FloorPlan, PlacedItem, PlanRoom, TechnicalKind, Vec2 } from '@/lib/design/types';

const P = (x: number, z: number): Vec2 => ({ x, z });
const room = (id: string, type: PlanRoom['type'], x: number, z: number, w: number, d: number): PlanRoom =>
  refreshRoom({ id, type, name: id, polygon: [P(x, z), P(x + w, z), P(x + w, z + d), P(x, z + d)], heightM: 2.8, areaM2: 0, perimeterM: 0, openings: [] });

const planOf = (rooms: PlanRoom[]): FloorPlan => ({ rooms, metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', imageUrl: null, wallThicknessM: 0.12, wallHeightM: 2.8, walls: [] });

let n = 0;
const ids = () => `t${n++}`;
const kindsIn = (points: Array<{ kind: TechnicalKind; roomId: string | null }>, roomId: string) => points.filter((p) => p.roomId === roomId).map((p) => p.kind).sort();

describe('placing the technical points by the rules', () => {
  it('services each room by what it is, and puts one panel and one boiler in the flat', () => {
    const plan = planOf([room('bath', 'bathroom', 0, 0, 2, 2.5), room('kit', 'kitchen', 3, 0, 3, 3), room('hall', 'hallway', 7, 0, 2, 4), room('bed', 'bedroom', 10, 0, 4, 3.5)]);
    const { points } = suggestTechnical(plan, [], ids);

    // No utility room and no balcony: the boiler goes to the kitchen, before the bathroom.
    expect(kindsIn(points, 'bath')).toEqual(['extractor', 'floor_drain', 'sewer', 'water_supply']);
    expect(kindsIn(points, 'kit')).toEqual(['boiler', 'extractor', 'gas', 'sewer', 'water_supply']);
    expect(kindsIn(points, 'hall')).toEqual(['electrical_panel']);
    expect(kindsIn(points, 'bed')).toEqual(['ac_unit']);
    // One boiler and one panel for the flat, not one per room that could take them.
    expect(points.filter((p) => p.kind === 'boiler')).toHaveLength(1);
    expect(points.filter((p) => p.kind === 'electrical_panel')).toHaveLength(1);
    // Asking for them is asking to pay for them.
    expect(points.every((p) => p.origin === 'user')).toBe(true);
  });

  it('places nothing a rule cannot decide, and nothing twice', () => {
    // A flat of bedrooms: no water, no waste, no gas — and the panel goes nowhere either.
    const bedrooms = planOf([room('b1', 'bedroom', 0, 0, 4, 3), room('b2', 'bedroom', 5, 0, 4, 3)]);
    const { points } = suggestTechnical(bedrooms, [], ids);
    expect(points.map((p) => p.kind).sort()).toEqual(['ac_unit', 'ac_unit']);

    // Run again over the result and nothing is added: the rooms already have theirs.
    const filled = { ...bedrooms, technical: { points } };
    expect(suggestTechnical(filled, [], ids).points).toHaveLength(0);
  });

  it('brings the water to the wall behind the fixture it serves', () => {
    const plan = planOf([room('bath', 'bathroom', 0, 0, 3, 2)]);
    const sink: PlacedItem = { id: 'i1', slot: 'sink', kind: 'sink', roomId: 'bath', position: P(2.6, 1), rotation: 0, size: { width: 0.6, depth: 0.45, height: 0.85 }, elevationM: 0, product: null, origin: 'style' };
    const { points } = suggestTechnical(plan, [sink], ids);
    const water = points.find((p) => p.kind === 'water_supply')!;
    // On the wall the basin stands against (x = 3), not in the middle of the room.
    expect(water.position.x).toBeGreaterThan(2.8);
    expect(water.position.z).toBeCloseTo(1, 1);
    // The waste sits under the basin itself.
    expect(points.find((p) => p.kind === 'sewer')!.position).toEqual({ x: 2.6, z: 1 });
  });

  it('hangs a kitchen’s extractor — a cooker hood — over the run, and never over a window', () => {
    // A 4 × 3 kitchen whose longest walls are z = 0 (a window in it) and z = 3.
    const kitchen = { ...room('kit', 'kitchen', 0, 0, 4, 3), openings: [{ id: 'w1', kind: 'window' as const, wallIndex: 0, t: 0.5, widthM: 1.4, heightM: 1.4, sillM: 0.9, roomId: 'kit', exterior: true }] };
    const bare = suggestTechnical(planOf([kitchen]), [], ids).points.find((p) => p.kind === 'extractor')!;
    // No run to go over: the long wall without the window, not the window's middle.
    expect(bare.position.z).toBeGreaterThan(2.8);

    // The run along the east wall (x = 4), z 0.4–2.8: the sink is taken to be at its first end
    // (no water marked yet, no fridge) and the hob 1.8 m along — the water comes to the sink,
    // the gas and the hood to the hob, on the wall behind the run.
    const run: PlacedItem = { id: 'k1', slot: 'kitchen_run', kind: 'kitchen_run', roomId: 'kit', position: P(3.69, 1.6), rotation: -Math.PI / 2, size: { width: 2.4, depth: 0.62, height: 0.92 }, elevationM: 0, product: null, origin: 'style' };
    const placed = suggestTechnical(planOf([kitchen]), [run], ids).points;
    const hood = placed.find((p) => p.kind === 'extractor')!;
    expect(hood.position.x).toBeGreaterThan(3.85);
    expect(hood.position.z).toBeCloseTo(2.2, 1);
    expect(placed.find((p) => p.kind === 'gas')!.position.z).toBeCloseTo(2.2, 1);
    expect(placed.find((p) => p.kind === 'water_supply')!.position.z).toBeCloseTo(0.7, 1);

    // A bathroom's fan still goes on the outside wall with the window, where the duct goes.
    const bath = { ...room('bath', 'bathroom', 0, 0, 3, 2), openings: [{ id: 'w2', kind: 'window' as const, wallIndex: 0, t: 0.5, widthM: 0.6, heightM: 0.6, sillM: 1.5, roomId: 'bath', exterior: true }] };
    expect(suggestTechnical(planOf([bath]), [], ids).points.find((p) => p.kind === 'extractor')!.position.z).toBeLessThan(0.2);
  });

  it('hangs the boiler on an outside wall: a utility room first, then the balcony, then the kitchen', () => {
    // A strip of rooms side by side: each shares its side walls, so only the top and bottom are outside.
    const strip = (types: Array<PlanRoom['type']>) => planOf(types.map((type, i) => room(`r${i}`, type, i * 3.12, 0, 3, 3)));
    const boilerIn = (plan: FloorPlan) => suggestTechnical(plan, [], ids).points.find((p) => p.kind === 'boiler')!;

    const withUtility = strip(['kitchen', 'balcony', 'storage', 'bathroom']);
    expect(boilerIn(withUtility).roomId).toBe('r2');
    const withBalcony = strip(['kitchen', 'balcony', 'bathroom']);
    expect(boilerIn(withBalcony).roomId).toBe('r1');
    const neither = strip(['bathroom', 'kitchen']);
    expect(boilerIn(neither).roomId).toBe('r1');

    // On an outside wall — the top (z = 0) or the bottom (z = 3), never the shared sides.
    for (const plan of [withUtility, withBalcony, neither]) {
      const z = boilerIn(plan).position.z;
      expect(z < 0.2 || z > 2.8).toBe(true);
    }
  });

  it('skips a utility room with no outside wall', () => {
    // The storage room is boxed in on every side: kitchen to the left, bathroom to the right, hall above and below.
    const plan = planOf([room('k', 'kitchen', 0, 1.12, 2, 2), room('s', 'storage', 2.12, 1.12, 1.5, 2), room('b', 'bathroom', 3.74, 1.12, 2, 2), room('h1', 'hallway', 0, 0, 6, 1), room('h2', 'hallway', 0, 3.24, 6, 1)]);
    expect(suggestTechnical(plan, [], ids).points.find((p) => p.kind === 'boiler')!.roomId).toBe('k');
  });
});
