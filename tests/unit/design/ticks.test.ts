import { describe, expect, it } from 'vitest';
import { budgetSections, budgetSummary, priceScene } from '@/lib/design/pricing';
import { pruneTicks, tickFor, tickedOff, toggleTick } from '@/lib/design/ticks';
import { designCheckoutPart } from '@/lib/projects/checkoutParts';
import { sceneLinesByStore } from '@/lib/finance/money';
import { refreshRoom } from '@/lib/design/planGeometry';
import type { DesignScene, ElectricalPoint, FloorPlan, PlacedItem, PlanRoom, SceneProduct, SceneStore, SurfaceFinish, Vec2 } from '@/lib/design/types';

const P = (x: number, z: number): Vec2 => ({ x, z });
const rect = (id: string, x: number): PlanRoom =>
  refreshRoom({ id, type: 'bedroom', name: id, polygon: [P(x, 0), P(x + 4, 0), P(x + 4, 3), P(x, 3)], heightM: 2.7, areaM2: 0, perimeterM: 0, openings: [] });

const store: SceneStore = { id: 1, nameKa: 'Woody', logoUrl: null, websiteUrl: null, phone: null, address: null, city: null, rating: null, deliveryDays: 3, deliveryFeeGel: 40 };
const product = (id: number, price: number, qty = 1, extra: Partial<SceneProduct> = {}): SceneProduct => ({ productId: id, nameKa: `p${id}`, slug: `p${id}`, brand: null, pricePerUnit: price, unit: 'piece', qty, totalPrice: price * qty, imageUrl: null, colorHex: null, textureUrl: null, model3dUrl: '/models/x.glb', categorySlug: 'beds', store, ...extra });
const bed = (id: string, roomId: string): PlacedItem => ({ id, roomId, slot: 'bed', kind: 'bed_double', position: P(1, 1), elevationM: 0, rotation: 0, size: { width: 1.6, depth: 2, height: 0.9 }, product: product(7, 2450) });

const rooms = ['b1', 'b2', 'b3', 'b5'].map((id, i) => rect(id, i * 4.12));
const plan: FloorPlan = { rooms, metresPerPixel: null, bounds: { width: 17, depth: 3 }, source: 'manual', wallThicknessM: 0.12 };
const beds = rooms.map((r) => bed(`bed-${r.id}`, r.id));
const scene = (extra: Partial<DesignScene> = {}): DesignScene => ({ styleId: 'modern', mode: 'design_only', budgetGel: null, items: beds, finishes: [], ...extra });

describe('ticks are per line', () => {
  it('unticks one bed of four, not the product — the other three stay in the order', () => {
    const excluded = toggleTick([], tickFor.item('bed-b1'), 7);
    const cost = priceScene(plan, scene({ excluded }));
    const lines = cost.lines.filter((l) => l.section === 'furniture');
    expect(lines.map((l) => !!l.excluded)).toEqual([true, false, false, false]);
    expect(cost.furnitureTotal).toBe(3 * 2450);
    expect(budgetSections(cost).furniture).toBe(3 * 2450);
    expect(budgetSummary(cost).products).toBe(3 * 2450);
    // The basket, the dialogue and the order the stores are sent all agree.
    expect(cost.baskets[0].lines).toHaveLength(3);
    expect(designCheckoutPart(plan, beds, [], 12, 'ka', excluded)!.lines.map((l) => l.key)).toEqual(['i-bed-b2', 'i-bed-b3', 'i-bed-b5']);
    const sent = sceneLinesByStore(plan, scene({ excluded }));
    expect(sent.groups.get(1)).toHaveLength(3);
  });

  it('keeps every line where it was: ticking changes what a line counts for, never where it stands', () => {
    const order = (excluded: DesignScene['excluded']) => priceScene(plan, scene({ excluded })).lines.map((l) => l.tick ?? l.key);
    const all = order([]);
    expect(order([tickFor.item('bed-b2')])).toEqual(all);
    expect(order([tickFor.item('bed-b1'), tickFor.item('bed-b5')])).toEqual(all);
  });

  it('still reads a bare product id from an older scene as every line of that product', () => {
    const cost = priceScene(plan, scene({ excluded: [7] }));
    expect(cost.lines.filter((l) => l.excluded)).toHaveLength(4);
    expect(cost.furnitureTotal).toBe(0);
    // Putting one line back lets go of the product-wide entry.
    expect(toggleTick([7], tickFor.item('bed-b1'), 7)).toEqual([]);
  });

  it('forgets the tick of a piece that is no longer in the design', () => {
    expect(pruneTicks([tickFor.item('gone'), tickFor.item('bed-b1'), tickFor.finish(3), 9], ['bed-b1'])).toEqual([tickFor.item('bed-b1'), tickFor.finish(3), 9]);
    expect(tickedOff([])('item:x', 1)).toBe(false);
  });
});

describe('every kind of product line honours its tick', () => {
  const radiator = product(90, 55, 1, { unit: 'section', categorySlug: 'radiators' });
  const socketProduct = product(9, 30, 1, { categorySlug: 'sockets-switches' });
  const socket: ElectricalPoint = { id: 's1', roomId: 'b1', kind: 'socket', position: P(1, 0.01), elevationM: 0.45, wallIndex: 0, t: 0.2, origin: 'user', product: socketProduct };
  const paint: SurfaceFinish = { roomId: 'b1', surface: 'wall', colorHex: '#fff', textureUrl: null, textureScaleM: 1.5, product: product(3, 12, 30, { unit: 'm2', categorySlug: 'paint' }), origin: 'studio' };
  const heated: FloorPlan = { ...plan, technical: { points: [{ id: 't1', kind: 'radiator', roomId: 'b1', position: P(2, 0.1), origin: 'user', product: radiator }] } };

  it('takes a radiator out of the total once — it used to stay in it and be listed twice', () => {
    const full = priceScene(heated, scene({ items: [] }));
    const line = full.lines.find((l) => l.section === 'heating' && l.tick)!;
    expect(line.tick).toBe(tickFor.radiator(90));
    const out = priceScene(heated, scene({ items: [], excluded: [line.tick!] }));
    const heating = out.lines.filter((l) => l.section === 'heating');
    expect(heating).toHaveLength(1);
    expect(heating[0].excluded).toBe(true);
    expect(budgetSections(out).heating).toBe(0);
    expect(out.grandTotal).toBeCloseTo(full.grandTotal - line.total, 2);
    // Hanging it is still work somebody does.
    expect(out.lines.find((l) => l.key === 'radiator_install')?.total).toBe(full.lines.find((l) => l.key === 'radiator_install')?.total);
  });

  it('takes a fitting and a finish out by their own lines, and leaves the labour', () => {
    const base = scene({ items: [], electrical: [socket], finishes: [paint] });
    const full = priceScene(plan, base);
    const out = priceScene(plan, { ...base, excluded: [tickFor.fixture(9), tickFor.finish(3)] });
    expect(out.lines.filter((l) => l.excluded).map((l) => l.tick).sort()).toEqual([tickFor.finish(3), tickFor.fixture(9)].sort());
    expect(out.finishesTotal).toBe(0);
    expect(out.coverage).toHaveLength(0);
    // The socket, the paint, and the 40 ₾ the paint's store would have charged to bring it.
    expect(full.grandTotal - out.grandTotal).toBeCloseTo(30 + 360 + 40, 2);
    expect(out.lines.find((l) => l.key === 'electrical_point')?.total).toBe(full.lines.find((l) => l.key === 'electrical_point')?.total);
  });

  it('says what the ticks came to: the products, and the delivery of a store left with nothing', () => {
    const cheap = [{ ...beds[0], product: product(7, 300) }];
    const full = priceScene(plan, scene({ items: cheap }));
    const out = priceScene(plan, scene({ items: cheap, excluded: [tickFor.item(cheap[0].id)] }));
    expect(full.deliveryTotal).toBe(40);
    expect(out.deliveryTotal).toBe(0);
    expect(full.grandTotal - out.grandTotal).toBe(340);
  });
});

describe('the budget adds up, ticks or no ticks', () => {
  const radiator = product(90, 55, 1, { unit: 'section', categorySlug: 'radiators' });
  const socket: ElectricalPoint = { id: 's1', roomId: 'b1', kind: 'socket', position: P(1, 0.01), elevationM: 0.45, wallIndex: 0, t: 0.2, origin: 'user', product: product(9, 30, 1, { categorySlug: 'sockets-switches' }) };
  const paint: SurfaceFinish = { roomId: 'b1', surface: 'wall', colorHex: '#fff', textureUrl: null, textureScaleM: 1.5, product: product(3, 12, 30, { unit: 'm2', categorySlug: 'paint' }), origin: 'studio' };
  const skirting: SurfaceFinish = { roomId: 'b2', surface: 'skirting', colorHex: '#fff', textureUrl: null, textureScaleM: 1, product: product(4, 9, 14, { unit: 'linear_m', categorySlug: 'skirting' }), origin: 'studio' };
  const heated: FloorPlan = { ...plan, technical: { points: [{ id: 't1', kind: 'radiator', roomId: 'b1', position: P(2, 0.1), origin: 'user', product: radiator }] } };
  const everything = (mode: DesignScene['mode'], excluded: DesignScene['excluded'] = []): DesignScene => ({ styleId: 'modern', mode, budgetGel: null, items: beds, finishes: [paint, skirting], electrical: [socket], excluded });
  const ticks = [tickFor.item('bed-b3'), tickFor.finish(4), tickFor.fixture(9), tickFor.radiator(90)];

  for (const mode of ['design_only', 'full'] as const) {
    for (const excluded of [[], ticks]) {
      it(`${mode}, ${excluded.length} ticked off: the rows of the totals card, the sections and the three figures all come to the grand total`, () => {
        const cost = priceScene(heated, everything(mode, excluded), { homeState: 'black_frame' });
        const rows = cost.furnitureTotal + cost.finishesTotal + cost.openingsTotal + cost.technicalTotal + cost.materialsTotal + cost.labourTotal + cost.deliveryTotal;
        expect(rows).toBeCloseTo(cost.grandTotal, 2);
        expect(Object.values(budgetSections(cost)).reduce((a, b) => a + b, 0)).toBeCloseTo(cost.grandTotal, 2);
        const figures = budgetSummary(cost);
        expect(figures.materials + figures.products + figures.labour).toBeCloseTo(cost.grandTotal, 2);
        expect(figures.total).toBeCloseTo(cost.grandTotal, 2);
        // Nothing ticked off is counted; everything else is.
        const counted = cost.lines.filter((l) => !l.excluded).reduce((sum, l) => sum + l.total, 0);
        expect(counted).toBeCloseTo(cost.grandTotal, 2);
        expect(cost.lines.filter((l) => l.excluded)).toHaveLength(excluded.length);
      });
    }
  }

  it('a design-only project still pays to fit the skirting board it chose — and shows it', () => {
    const cost = priceScene(heated, everything('design_only'));
    expect(cost.labourTotal).toBeGreaterThan(0);
    expect(cost.materialsTotal).toBe(0);
  });
});

