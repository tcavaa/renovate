import { describe, expect, it } from 'vitest';
import { MAX_SECTIONS, MIN_SECTIONS, isHeatedRoom, outsideEdges, radiatorCandidates, radiatorSections, radiatorsNeeded, roomHeatDemandW, sectionsForRoom, suggestRadiators, withRadiatorProduct, withRadiatorProducts } from '@/lib/design/radiators';
import { addWalls, rebuildRooms, wallsForRectangle } from '@/lib/design/walls';
import type { CatalogProduct } from '@/lib/design/matcher';
import type { FloorPlan, TechnicalPoint, Wall } from '@/lib/design/types';

const T = 0.12;
const blank: FloorPlan = { rooms: [], metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', wallThicknessM: T, walls: [] };
const fromRects = (...rects: Array<{ x: number; z: number; width: number; depth: number }>): FloorPlan =>
  rebuildRooms(blank, rects.reduce((all, rect, i) => addWalls(all, wallsForRectangle(rect, T, 'user', `r${i}`)), [] as Wall[]));

const radiator = (id: number, price: number, watts: number, styles: string[]): CatalogProduct =>
  ({ id, nameKa: `r${id}`, slug: `r${id}`, brand: null, categorySlug: 'radiators', pricePerUnit: price, unit: 'piece', imageUrl: null, colorHex: null, textureUrl: null, model3dKind: 'radiator', model3dUrl: `/models/radiators/r${id}.glb`, widthCm: 8, depthCm: 10, heightCm: 60, styleTags: styles, tags: [], isFeatured: false, specs: { wattsPerSection: watts, sectionWidthCm: 8 }, coveragePerUnit: null, store: null }) as unknown as CatalogProduct;

describe('heat demand', () => {
  it('counts about 100 W a square metre, and a fifth more when the room has two outside walls', () => {
    const plan = fromRects({ x: 0, z: 0, width: 4, depth: 3 });
    const room = plan.rooms[0];
    // One room alone: every wall is an outside wall, so it is a corner room.
    expect(outsideEdges(plan, room)).toHaveLength(4);
    expect(roomHeatDemandW(plan, room)).toBe(Math.round(12 * 100 * (2.8 / 2.7) * 1.2));

    // Wedged between neighbours on three sides: one outside wall, no corner uplift.
    const terrace = fromRects({ x: 0, z: 0, width: 4, depth: 3 }, { x: 4 + T, z: 0, width: 4, depth: 3 }, { x: 8 + 2 * T, z: 0, width: 4, depth: 3 }, { x: 4 + T, z: 3 + T, width: 4, depth: 3 });
    const middle = terrace.rooms.find((r) => r.polygon.every((p) => p.x > 4) && r.polygon.some((p) => p.z < 3))!;
    expect(outsideEdges(terrace, middle).length).toBeLessThan(2);
    expect(roomHeatDemandW(terrace, middle)).toBe(Math.round(middle.areaM2 * 100 * (middle.heightM / 2.7)));
  });

  it('heats no balcony, no storage and no closet', () => {
    const plan = fromRects({ x: 0, z: 0, width: 3, depth: 2 });
    const balcony = { ...plan.rooms[0], type: 'balcony' as const };
    expect(isHeatedRoom(balcony)).toBe(false);
    expect(roomHeatDemandW({ ...plan, rooms: [balcony] }, balcony)).toBe(0);
    expect(sectionsForRoom({ ...plan, rooms: [balcony] }, balcony)).toBe(0);
  });

  it('turns the demand into sections of the radiator that was chosen', () => {
    const plan = fromRects({ x: 0, z: 0, width: 4, depth: 3 });
    const room = plan.rooms[0];
    const demand = roomHeatDemandW(plan, room);
    expect(sectionsForRoom(plan, room, 180)).toBe(Math.ceil(demand / 180));
    // A cast-iron column gives less per section, so the same room wants more of them.
    expect(sectionsForRoom(plan, room, 120)).toBeGreaterThan(sectionsForRoom(plan, room, 180));
    // A hall big enough for more than fourteen sections wants a second radiator.
    const hall = fromRects({ x: 0, z: 0, width: 9, depth: 6 });
    expect(radiatorsNeeded(hall, hall.rooms[0], 120)).toBeGreaterThan(1);
  });
});

describe('radiators on the plan', () => {
  const planWithWindow = (): FloorPlan => {
    const plan = fromRects({ x: 0, z: 0, width: 4, depth: 3 });
    const room = plan.rooms[0];
    return { ...plan, rooms: [{ ...room, type: 'living_room', openings: [{ id: 'w1', kind: 'window', wallIndex: 0, t: 0.5, widthM: 1.4, heightM: 1.4, sillM: 0.9, roomId: room.id, exterior: true }] }] };
  };

  it('hangs one under the window of every heated room that has none', () => {
    const plan = planWithWindow();
    let n = 0;
    const added = suggestRadiators(plan, () => `t${n++}`);
    expect(added).toHaveLength(1);
    expect(added[0].kind).toBe('radiator');
    expect(added[0].roomId).toBe(plan.rooms[0].id);
    // Under the window: on that wall (the room's face is the rectangle that was drawn), at
    // its middle, a hand inside the room.
    expect(added[0].position.z).toBeCloseTo(0.08, 2);
    expect(added[0].position.x).toBeCloseTo(2, 1);
    // A room that already has one is left alone.
    const withOne: FloorPlan = { ...plan, technical: { points: added } };
    expect(suggestRadiators(withOne, () => 'x')).toHaveLength(0);
  });

  it('shares a room’s sections between its radiators, and keeps them within the sensible range', () => {
    const plan = fromRects({ x: 0, z: 0, width: 6, depth: 5 });
    const room = plan.rooms[0];
    const point = (id: string): TechnicalPoint => ({ id, kind: 'radiator', roomId: room.id, position: { x: 1, z: 0.2 }, elevationM: 0.12, origin: 'user' });
    const one: FloorPlan = { ...plan, technical: { points: [point('a')] } };
    const two: FloorPlan = { ...plan, technical: { points: [point('a'), point('b')] } };
    const alone = radiatorSections(one, one.technical!.points[0]);
    const shared = radiatorSections(two, two.technical!.points[0]);
    expect(alone).toBeGreaterThan(shared);
    expect(shared).toBeGreaterThanOrEqual(MIN_SECTIONS);
    expect(alone).toBeLessThanOrEqual(MAX_SECTIONS);
    // What the person typed wins over the arithmetic.
    expect(radiatorSections(two, { ...two.technical!.points[0], sections: 3 })).toBe(3);
  });

  it('buys the style’s radiator and prices it by the section, re-pricing when the sections change', () => {
    const catalog = [radiator(1, 38, 170, ['modern']), radiator(2, 85, 120, ['industrial']), radiator(3, 20, 150, ['vintage'])];
    expect(radiatorCandidates(catalog, 'industrial').map((p) => p.id)).toEqual([2, 3, 1]);

    const plan = fromRects({ x: 0, z: 0, width: 4, depth: 3 });
    const room = plan.rooms[0];
    const base: FloorPlan = { ...plan, technical: { points: [{ id: 'a', kind: 'radiator', roomId: room.id, position: { x: 2, z: 0.2 }, elevationM: 0.12, origin: 'user' }] } };
    const priced = withRadiatorProducts(base, catalog, 'industrial');
    const point = priced.technical!.points[0];
    expect(point.product?.productId).toBe(2);
    expect(point.radiator?.wattsPerSection).toBe(120);
    const sections = radiatorSections(priced, point);
    expect(point.product?.qty).toBe(sections);
    expect(point.product?.totalPrice).toBeCloseTo(sections * 85, 2);
    // Nothing to do the second time round.
    expect(withRadiatorProducts(priced, catalog, 'industrial')).toBe(priced);
    // A radiator put back to the estimate keeps neither product nor per-section facts.
    const plain = withRadiatorProduct(priced, point, null);
    expect(plain.product).toBeUndefined();
    expect(plain.radiator).toBeUndefined();
  });
});
