import { describe, expect, it } from 'vitest';
import {
  hangPendants,
  hangPendantSlots,
  pendantClass,
  pendantCount,
  pendantPositions,
  pendantSizing,
  pendantSurface,
  relayRow,
  ringAround,
  scaleRing,
  shiftRow,
  underShade,
} from '@/lib/design/ceilingLights';
import { suggestElectrical } from '@/lib/design/electrical';
import { lightingPlan } from '@/lib/design/lightingPlan';
import { matchProducts, type CatalogProduct } from '@/lib/design/matcher';
import { refreshRoom } from '@/lib/design/planGeometry';
import { PENDANT_PAIR_FROM_M, PENDANT_TRIO_FROM_M, SPOT_PENDANT_GAP_M } from '@/lib/design/rules';
import { auditScene } from '@/lib/design/sceneAudit';
import type { FloorPlan, PlacedItem, PlanRoom, SceneProduct, Vec2 } from '@/lib/design/types';
import type { RoomType } from '@/lib/calculator/types';

/**
 * The ceiling laid out as one (Nini, 23 Nov 2026, decision 10b): a pendant over what it lights, one
 * large or two or three small down a long table, and the spots moved off the lamps — never dropped.
 */

const P = (x: number, z: number): Vec2 => ({ x, z });
function room(id: string, type: RoomType, w: number, d: number): PlanRoom {
  return refreshRoom({ id, type, name: id, polygon: [P(0, 0), P(w, 0), P(w, d), P(0, d)], heightM: 2.7, areaM2: 0, perimeterM: 0, openings: [] });
}
const plan = (...rooms: PlanRoom[]): FloorPlan => ({ rooms, metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', wallThicknessM: 0.12 });
const piece = (id: string, roomId: string, slot: string, x: number, z: number, size: [number, number, number], rotation = 0, elevationM = 0): PlacedItem => ({ id, roomId, slot: slot as PlacedItem['slot'], kind: slot, position: P(x, z), rotation, elevationM, size: { width: size[0], depth: size[1], height: size[2] }, product: null });
const product = (id: number): SceneProduct => ({ productId: id, name: `lamp ${id}`, price: 100, unit: 'piece' }) as unknown as SceneProduct;
/** A matched lamp of `across` metres, hung from a 2.7 m ceiling. */
const lamp = (id: string, roomId: string, x: number, z: number, across: number, height = 0.5): PlacedItem => ({ ...piece(id, roomId, 'pendant', x, z, [across, across, height], 0, 2.7 - height), product: product(7) });

describe('what a pendant lights', () => {
  const kitchen = room('k', 'kitchen', 4, 4);
  it('takes the dining table, else the island, in a kitchen; the bed in a bedroom; nothing in an office', () => {
    const table = piece('t', 'k', 'dining_table', 2, 3, [1.4, 0.8, 0.75]);
    const island = piece('i', 'k', 'kitchen_island', 2, 1.8, [1.8, 0.9, 0.9]);
    const slot = piece('p', 'k', 'pendant', 2, 2, [0.52, 0.52, 0.55]);
    expect(pendantSurface(kitchen, [table, island, slot], slot)?.id).toBe('t');
    expect(pendantSurface(kitchen, [island, slot], slot)?.id).toBe('i');
    const bedroom = room('b', 'bedroom', 4, 4);
    expect(pendantSurface(bedroom, [piece('bed', 'b', 'bed', 2, 1, [1.6, 2.05, 1.05])], { id: 'p', position: P(2, 2) })?.id).toBe('bed');
    expect(pendantSurface(room('o', 'office', 3, 3), [piece('d', 'o', 'desk', 1.5, 0.3, [1.2, 0.6, 0.75])], { id: 'p', position: P(1.5, 1.5) })).toBeNull();
  });

  it('hangs no lamp over a four-poster: the lamp goes to the middle of the room', () => {
    const bedroom = room('b', 'bedroom', 4, 6);
    const canopy = piece('bed', 'b', 'bed', 2, 1, [1.6, 2.05, 2.3]);
    expect(pendantSurface(bedroom, [canopy], { id: 'p', position: P(2, 1) })).toBeNull();
    const [, hung] = hangPendantSlots(bedroom, [canopy, piece('p', 'b', 'pendant', 2, 1, [0.52, 0.52, 0.55])]);
    expect(hung.position).toEqual(P(2, 3));
  });

  it('hangs the layout\'s pendant over a living room\'s dining table laid after it', () => {
    const living = room('l', 'living_room', 6, 6);
    const laid = hangPendantSlots(living, [piece('l-pendant-3', 'l', 'pendant', 3, 3, [0.52, 0.52, 0.55]), piece('l-coffee', 'l', 'coffee_table', 3, 4, [1, 0.6, 0.4]), piece('l-dining', 'l', 'dining_table', 1.5, 1.2, [1.6, 0.9, 0.75])]);
    expect(laid[0].position).toEqual(P(1.5, 1.2));
  });
});

describe('one large lamp, or two or three small ones', () => {
  it('counts the lamps by the table: one under 1.4 m, two from 1.4 m, three from 1.8 m — one over a coffee table or a bed', () => {
    const table = (length: number) => piece('t', 'k', 'dining_table', 0, 0, [length, 0.9, 0.75]);
    expect(pendantCount(table(1.2))).toBe(1);
    expect(pendantCount(table(PENDANT_PAIR_FROM_M))).toBe(2);
    expect(pendantCount(table(1.7))).toBe(2);
    expect(pendantCount(table(PENDANT_TRIO_FROM_M))).toBe(3);
    expect(pendantCount({ ...table(2.2), slot: 'kitchen_island' })).toBe(3);
    expect(pendantCount({ ...table(2.2), slot: 'coffee_table' })).toBe(1);
    expect(pendantCount({ ...table(2.2), slot: 'bed' })).toBe(1);
    expect(pendantCount(null)).toBe(1);
  });

  it('sizes a lamp by its round shade: large from 45 cm to a metre, small 12–40 cm, neither a linear one or a bulb', () => {
    expect(pendantClass({ width: 0.6, depth: 0.6 })).toBe('large');
    expect(pendantClass({ width: 0.3, depth: 0.3 })).toBe('small');
    expect(pendantClass({ width: 0.92, depth: 0.36 })).toBeNull();
    expect(pendantClass({ width: 0.05, depth: 0.05 })).toBeNull();
    expect(pendantClass({ width: 1.5, depth: 1.5 })).toBeNull();
  });

  it('offers a large lamp over a short table and small ones over a long one', () => {
    const kitchen = room('k', 'kitchen', 5, 4);
    const offer = [{ id: 1, widthCm: 60, depthCm: 60 }, { id: 2, widthCm: 30, depthCm: 30 }, { id: 3, widthCm: 5, depthCm: 5 }];
    const slot = piece('p', 'k', 'pendant', 2.5, 2, [0.52, 0.52, 0.55]);
    expect(pendantSizing(offer, kitchen, slot, [piece('t', 'k', 'dining_table', 2.5, 2, [1.2, 0.8, 0.75])]).map((p) => p.id)).toEqual([1]);
    expect(pendantSizing(offer, kitchen, slot, [piece('t', 'k', 'dining_table', 2.5, 2, [1.8, 0.9, 0.75])]).map((p) => p.id)).toEqual([2]);
  });

  it('spaces the lamps evenly down the table\'s length, turned or not', () => {
    const along = pendantPositions(piece('t', 'k', 'dining_table', 2, 2, [1.8, 0.9, 0.75]), 3);
    expect(along.map((p) => [Math.round(p.x * 100) / 100, Math.round(p.z * 100) / 100])).toEqual([[1.4, 2], [2, 2], [2.6, 2]]);
    const turned = pendantPositions(piece('t', 'k', 'dining_table', 2, 2, [1.4, 0.9, 0.75], Math.PI / 2), 2);
    expect(turned.map((p) => Math.round(p.x * 100) / 100)).toEqual([2, 2]);
    expect(Math.abs(turned[0].z - turned[1].z)).toBeCloseTo(0.7, 5);
  });

  it('hangs three of a small lamp down a 1.8 m table, one of a large lamp, and changes nothing hung again', () => {
    const kitchen = room('k', 'kitchen', 5, 4);
    const table = piece('k-dining_table-3', 'k', 'dining_table', 2.5, 2.4, [1.8, 0.9, 0.75]);
    const small = hangPendants([table, lamp('k-pendant-6', 'k', 2.3, 2.2, 0.3)], [kitchen]);
    const lamps = small.filter((i) => i.slot === 'pendant');
    expect(lamps.map((l) => l.id)).toEqual(['k-pendant-6', 'k-pendant-6-g2', 'k-pendant-6-g3']);
    expect(lamps.map((l) => l.position.x)).toEqual([1.9, 2.5, 3.1].map((x) => expect.closeTo(x, 5)));
    expect(new Set(lamps.map((l) => l.product?.productId))).toEqual(new Set([7]));
    expect(hangPendants(small, [kitchen])).toEqual(small);
    const large = hangPendants([table, lamp('k-pendant-6', 'k', 2.3, 2.2, 0.6)], [kitchen]).filter((i) => i.slot === 'pendant');
    expect(large).toHaveLength(1);
    expect(large[0].position).toEqual(P(2.5, 2.4));
    // The table taken away: one lamp, where it hung.
    expect(hangPendants(small.filter((i) => i.slot !== 'dining_table'), [kitchen]).filter((i) => i.slot === 'pendant')).toHaveLength(1);
  });

  it('hangs a lamp that would reach into the bed in the middle of the room', () => {
    const bedroom = room('b', 'bedroom', 4, 6);
    const bed = piece('bed', 'b', 'bed', 2, 1, [1.6, 2.05, 1.7]);
    const [, hung] = hangPendants([bed, lamp('p', 'b', 2, 1, 0.6, 1)], [bedroom]);
    expect(hung.position).toEqual(P(2, 3));
  });
});

describe('matched as one', () => {
  const make = (id: number, kind: string, w: number, d: number, h: number): CatalogProduct =>
    ({ id, nameKa: `p${id}`, slug: `p${id}`, brand: null, categorySlug: kind, pricePerUnit: 300 + id, unit: 'piece', imageUrl: null, colorHex: null, textureUrl: null, model3dKind: kind, model3dUrl: `/models/p${id}.glb`, widthCm: w, depthCm: d, heightCm: h, styleTags: ['modern'], tags: [], isFeatured: false, specs: null, coveragePerUnit: null, store: null }) as unknown as CatalogProduct;
  const lamps = [make(1, 'pendant', 60, 60, 50), make(2, 'pendant', 30, 30, 50)];
  const kitchen = room('k', 'kitchen', 5, 4);
  const table = (length: number) => piece('k-dining_table-3', 'k', 'dining_table', 2.5, 2.5, [length, 0.9, 0.75]);
  const slotAt = (x: number, z: number) => ({ ...piece('k-pendant-5', 'k', 'pendant', x, z, [0.52, 0.52, 0.55]), elevationM: 2.15 });
  const hung = (items: PlacedItem[]) => items.filter((i) => i.slot === 'pendant' && i.product);

  it('takes small lamps, three of them, over a 1.8 m table, and a large one over a short table — and keeps them so when dressed again', () => {
    const long = [...lamps, make(10, 'dining_table', 180, 90, 75)];
    const matched = matchProducts([table(1.8), slotAt(1, 1)], long, { styleId: 'modern', rooms: [kitchen] });
    expect(hung(matched).map((l) => [l.product?.productId, Math.round(l.position.x * 100) / 100])).toEqual([[2, 1.9], [2, 2.5], [2, 3.1]]);
    // A new style or budget dresses the flat again: the line stays a line, not three lamps in one spot.
    const again = matchProducts(matched.map((i) => ({ ...i, pinned: false })), long, { styleId: 'modern', rooms: [kitchen] });
    expect(hung(again).map((l) => Math.round(l.position.x * 100) / 100)).toEqual([1.9, 2.5, 3.1]);
    const short = [...lamps, make(11, 'dining_table', 120, 80, 75)];
    expect(hung(matchProducts([table(1.2), slotAt(1, 1)], short, { styleId: 'modern', rooms: [kitchen] })).map((l) => l.product?.productId)).toEqual([1]);
  });
});

describe('spots moved off the lamps, never dropped', () => {
  const shade = (x: number, z: number, radius = 0.15) => ({ position: P(x, z), radius });
  const square = [P(0, 0), P(4, 0), P(4, 4), P(0, 4)];

  it('lays a row again either side of the lamps it runs under, mirrored about them, an odd row gaining one', () => {
    const row = [P(1.1, 2), P(2, 2), P(2.9, 2)];
    const shades = [shade(2, 2)];
    const laid = relayRow(row, shades, square)!;
    expect(laid).toHaveLength(4);
    expect(laid.some((s) => underShade(s, shades))).toBe(false);
    for (const s of laid) expect(s.z).toBeCloseTo(2, 5);
    const xs = laid.map((s) => s.x).sort((a, b) => a - b);
    expect(xs[0] + xs[3]).toBeCloseTo(4, 5);
    expect(xs[1] + xs[2]).toBeCloseTo(4, 5);
    // A lamp away from the row leaves it as it was.
    expect(relayRow(row, [shade(2, 3.5)], square)).toEqual(row);
  });

  it('round three lamps down an island the row runs over, as many either side as have 40 cm each — or the row moved whole', () => {
    const row = [P(0.45, 1.5), P(1.35, 1.5), P(2.25, 1.5), P(3.15, 1.5)];
    const shades = [shade(1.2, 1.5), shade(1.8, 1.5), shade(2.4, 1.5)];
    const laid = relayRow(row, shades, square)!;
    expect(laid).toHaveLength(2);
    expect(laid.some((s) => underShade(s, shades))).toBe(false);
    expect(laid[0].x + laid[1].x).toBeCloseTo(3.6, 5);
    // Moved whole, every spot is kept, away from the worktop (north of it here) first.
    const moved = shiftRow(row, shades, square, 0.6, P(0, 1))!;
    expect(moved).toHaveLength(4);
    for (const s of moved) expect(s.z).toBeGreaterThan(1.5);
    expect(moved.some((s) => underShade(s, shades))).toBe(false);
  });

  it('moves a track whole, square to itself, just clear of the lamp', () => {
    const track = [P(1.3, 2), P(2, 2), P(2.7, 2)];
    const moved = shiftRow(track, [shade(2, 2, 0.3)], square)!;
    expect(moved).toHaveLength(3);
    expect(moved.some((s) => underShade(s, [shade(2, 2, 0.3)]))).toBe(false);
    expect(new Set(moved.map((s) => Math.round(s.z * 100)))).toHaveProperty('size', 1);
    expect(Math.abs(moved[0].z - 2)).toBeLessThanOrEqual(0.3 + SPOT_PENDANT_GAP_M + 0.05 + 1e-9);
  });

  it('lays a ring round the main light where it hangs, symmetric and off the walls, and draws a ring out off a lamp', () => {
    const ring = ringAround(square, P(1.5, 2))!;
    expect(ring).toHaveLength(4);
    const cx = ring.reduce((s, p) => s + p.x, 0) / 4;
    expect(cx).toBeCloseTo(1.5, 5);
    for (const p of ring) expect(p.x).toBeGreaterThanOrEqual(0.3 - 1e-9);
    const quarters = [P(1, 1), P(3, 1), P(3, 3), P(1, 3)];
    const out = scaleRing(quarters, P(2, 2), [shade(1.2, 1.2, 0.3)], square)!;
    expect(out.some((s) => underShade(s, [shade(1.2, 1.2, 0.3)]))).toBe(false);
    expect(out[0].x + out[2].x).toBeCloseTo(4, 5);
  });
});

describe('the ceiling wired as one', () => {
  it('keeps every spot of a kitchen\'s row, moved off the pendants over the table on its line', () => {
    const kitchen = room('k', 'kitchen', 4, 3);
    const run = piece('run', 'k', 'kitchen_run', 2, 0.31, [3.6, 0.62, 0.9]);
    const bare = suggestElectrical(plan(kitchen), [run]).filter((p) => p.kind === 'light_spot');
    // A long island on the row's line, three small lamps over it.
    const island = piece('k-island', 'k', 'kitchen_island', 2, 1.5, [1.8, 0.8, 0.9]);
    const lamps = hangPendants([island, lamp('k-pendant-4', 'k', 2, 1.5, 0.3)], [kitchen]).filter((i) => i.slot === 'pendant');
    expect(lamps).toHaveLength(3);
    const points = suggestElectrical(plan(kitchen), [run, island, ...lamps]);
    const spots = points.filter((p) => p.kind === 'light_spot');
    expect(spots.length).toBeGreaterThanOrEqual(bare.length);
    expect(points.some((p) => p.lampOutlet)).toBe(false);
    const flat = { plan: plan(kitchen), items: [run, island, ...lamps], electrical: points };
    expect(auditScene(flat).map((i) => i.code)).not.toContain('spot_under_pendant');
    expect(auditScene(flat).map((i) => i.code)).not.toContain('pendant_off_surface');
    // Each lamp of the line lights the island.
    const rows = lightingPlan(plan(kitchen), [run, island, ...lamps], points)[0].rows;
    expect(rows.find((r) => r.fixture === 'pendant')).toMatchObject({ purpose: 'furniture', count: 3 });
  });

  it('makes the bedroom\'s ceiling light the outlet of the lamp over the bed, and rings the spots round it', () => {
    const bedroom = room('b', 'bedroom', 4, 4.5);
    const bed = piece('b-bed', 'b', 'bed', 2, 1.03, [1.6, 2.05, 1.05]);
    const hung = hangPendants([bed, lamp('b-pendant-5', 'b', 2, 2.25, 0.6)], [bedroom]);
    const pendant = hung.find((i) => i.slot === 'pendant')!;
    expect(pendant.position).toEqual(P(2, 1.03));
    const points = suggestElectrical(plan(bedroom), hung, [], 'modern');
    const outlet = points.find((p) => p.lampOutlet)!;
    expect(outlet.position).toEqual(pendant.position);
    expect(points.filter((p) => p.kind === 'light_ceiling' && !p.lampOutlet)).toHaveLength(0);
    const ring = points.filter((p) => p.kind === 'light_spot');
    expect(ring).toHaveLength(4);
    expect(ring.reduce((s, p) => s + p.position.x, 0) / 4).toBeCloseTo(2, 5);
    expect(ring.reduce((s, p) => s + p.position.z, 0) / 4).toBeCloseTo(1.03, 5);
    expect(ring.some((s) => underShade(s.position, [{ position: pendant.position, radius: 0.3 }]))).toBe(false);
  });

  it('is checked as a whole: a spot under a lamp, and a lamp off the table it lights', () => {
    const kitchen = room('k', 'kitchen', 4, 4);
    const table = piece('k-table', 'k', 'dining_table', 2, 2, [1.2, 0.8, 0.75]);
    const over = lamp('k-pendant-4', 'k', 2, 2, 0.5);
    const spot = { id: 's', roomId: 'k', kind: 'light_spot' as const, category: 'primary' as const, position: P(2.3, 2), elevationM: 2.7, origin: 'generated' as const };
    const codes = (items: PlacedItem[], electrical = [spot]) => auditScene({ plan: plan(kitchen), items, electrical }).map((i) => i.code);
    expect(codes([table, over])).toContain('spot_under_pendant');
    expect(codes([table, over], [{ ...spot, position: P(2.9, 2) }])).not.toContain('spot_under_pendant');
    expect(codes([table, { ...over, position: P(2.5, 2) }], [])).toContain('pendant_off_surface');
    expect(codes([table, over], [])).not.toContain('pendant_off_surface');
  });

  it('moves an industrial bedroom\'s track off the lamp over the bed rather than drop a spot for it', () => {
    const bedroom = room('b', 'bedroom', 4, 4);
    const bed = piece('b-bed', 'b', 'bed', 2, 1.03, [1.6, 2.05, 1.05]);
    const pendant = lamp('b-pendant-5', 'b', 2, 2, 0.4);
    const points = suggestElectrical(plan(bedroom), [bed, pendant], [], 'industrial');
    const spots = points.filter((p) => p.kind === 'light_spot');
    expect(spots).toHaveLength(3);
    expect(spots.some((s) => underShade(s.position, [{ position: pendant.position, radius: 0.2 }]))).toBe(false);
  });
});
