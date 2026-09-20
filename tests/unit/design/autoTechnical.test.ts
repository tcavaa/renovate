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

    expect(kindsIn(points, 'bath')).toEqual(['boiler', 'extractor', 'floor_drain', 'sewer', 'water_supply']);
    expect(kindsIn(points, 'kit')).toEqual(['extractor', 'gas', 'sewer', 'water_supply']);
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
});
