import { describe, expect, it } from 'vitest';
import { ceilingDropFor, withCeiling } from '@/lib/design/ceiling';
import { ceilingHeightM, underCeiling } from '@/lib/design/rules';
import { fitLight } from '@/lib/design/decor/layout';
import { refreshRoom } from '@/lib/design/planGeometry';
import type { DecorPiece, FloorPlan, PlanRoom, TechnicalPoint, Vec2 } from '@/lib/design/types';

const P = (x: number, z: number): Vec2 => ({ x, z });
const rect = (id: string, type: PlanRoom['type'], w: number, d: number): PlanRoom =>
  refreshRoom({ id, type, name: id, polygon: [P(0, 0), P(w, 0), P(w, d), P(0, d)], heightM: 2.8, areaM2: 0, perimeterM: 0, openings: [] });
const planOf = (rooms: PlanRoom[], technical: FloorPlan['technical'] = { points: [] }): FloorPlan => ({ rooms, metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', wallThicknessM: 0.12, technical });

describe('the new ceiling', () => {
  it('drops 10 cm for plasterboard, 3 for a stretch ceiling, only when a full renovation does the ceiling', () => {
    const plan = planOf([rect('a', 'living_room', 4, 3)]);
    expect(ceilingDropFor(plan, 'design_only', 'white_frame')).toBe(0);
    expect(ceilingDropFor(plan, 'full', null)).toBe(0);
    expect(ceilingDropFor(plan, 'full', 'white_frame')).toBe(0.1);
    expect(ceilingDropFor(planOf(plan.rooms, { points: [], choices: { ceiling: 'barisol' } }), 'full', 'white_frame')).toBe(0.03);
    expect(ceilingDropFor(planOf(plan.rooms, { points: [], works: ['painting'] }), 'full', 'white_frame')).toBe(0);
  });

  it('measures every room under it but a balcony', () => {
    const plan = planOf([rect('a', 'living_room', 4, 3), rect('b', 'balcony', 3, 1.2)], { points: [], ceilingDropM: 0.1 });
    expect(ceilingHeightM(plan.rooms[0], plan)).toBeCloseTo(2.7, 6);
    expect(ceilingHeightM(plan.rooms[1], plan)).toBeCloseTo(2.8, 6);
    expect(underCeiling(plan.rooms[0], plan).heightM).toBeCloseTo(2.7, 6);
    expect(underCeiling(plan.rooms[1], plan)).toBe(plan.rooms[1]);
  });

  it('hangs an air conditioner left at its usual height, and a curtain run from under the ceiling, from the new one', () => {
    const room = rect('a', 'living_room', 4, 3);
    const ac: TechnicalPoint = { id: 'ac', kind: 'ac_unit', roomId: 'a', position: P(2, 0.08), elevationM: 2.8 - 0.18 - 0.3, origin: 'user' };
    const moved: TechnicalPoint = { ...ac, id: 'ac2', elevationM: 2.0 };
    const curtain = { id: 'c', roomId: 'a', slot: 'curtain' as const, kind: 'curtain', position: P(2, 0.1), rotation: 0, elevationM: 0, size: { width: 2, depth: 0.12, height: 2.77 }, product: null };
    const out = withCeiling({ plan: planOf([room], { points: [ac, moved] }), items: [curtain], electrical: [] }, 'full', 'white_frame');
    const points = out.plan!.technical!.points;
    expect(points.find((p) => p.id === 'ac')!.elevationM).toBeCloseTo(2.7 - 0.18 - 0.3, 6);
    expect(points.find((p) => p.id === 'ac2')!.elevationM).toBe(2.0);
    expect(out.items[0].size.height).toBeCloseTo(2.67, 6);
    // Nothing to change: the same objects back.
    const settled = { plan: out.plan, items: out.items, electrical: out.electrical };
    expect(withCeiling(settled, 'full', 'white_frame')).toBe(settled);
  });

  it('builds a cove 15 cm off the walls and 12 cm down, its strip 5 cm back from the edge', () => {
    const room = rect('a', 'living_room', 5, 4);
    const cove = { id: 'c', roomId: 'a', family: 'light', wallIndex: null, span: { from: 0, to: 0 }, height: { from: 2.5, to: 2.7 }, params: { path: 'cove' }, materials: {} } as unknown as DecorPiece;
    const fit = fitLight(cove, underCeiling(room, planOf([room], { points: [], ceilingDropM: 0.1 })), { path: 'cove' });
    expect(fit.panel!.minX).toBeCloseTo(0.15, 6);
    expect(fit.panel!.y).toBeCloseTo(2.7 - 0.12, 6);
    expect(fit.runs[0].a.x).toBeCloseTo(0.2, 6);
    expect(fit.runs[0].a.z).toBeCloseTo(0.2, 6);
    expect(fit.ledM).toBeCloseTo(2 * (4.7 + 3.7) - 0.4, 6);
  });
});
