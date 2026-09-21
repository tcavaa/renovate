import { describe, expect, it } from 'vitest';
import {
  buildStoreOrders,
  calculatorLinesByStore,
  commissionFor,
  costLinesByStore,
  eachDay,
  effectiveCommissionPct,
  labourLines,
  mergeLines,
  orderTotals,
  periodRange,
  platformFee,
  sceneLinesByStore,
} from '@/lib/finance/money';
import { priceScene } from '@/lib/design/pricing';
import { tickFor } from '@/lib/design/ticks';
import { addOpening } from '@/lib/design/openings';
import { refreshRoom } from '@/lib/design/planGeometry';
import type { SelectedProduct } from '@/lib/calculator/types';
import type { DesignScene, ElectricalPoint, FloorPlan, PlacedItem, PlanRoom, SceneProduct, SceneStore, Vec2 } from '@/lib/design/types';

const pick = (productId: number, price: number, qty = 1, extra: Partial<SelectedProduct> = {}): SelectedProduct => ({
  productId,
  nameKa: `პროდუქტი ${productId}`,
  pricePerUnit: price,
  unit: 'piece',
  qty,
  totalPrice: price * qty,
  imageUrl: null,
  ...extra,
});

describe('platform fee and commission', () => {
  it('charges per square metre and rounds to tetri', () => {
    expect(platformFee(72.35, 2)).toBe(144.7);
    expect(platformFee(72.35, 12.5)).toBeCloseTo(904.38, 1);
    expect(platformFee(0, 12)).toBe(0);
    expect(platformFee(-5, 12)).toBe(0);
  });

  it('takes a percentage of the subtotal', () => {
    expect(commissionFor(1000, 5)).toBe(50);
    expect(commissionFor(333.33, 7.5)).toBe(25);
    expect(commissionFor(0, 5)).toBe(0);
  });

  it("uses the partner's own rate when it has one and the default otherwise", () => {
    expect(effectiveCommissionPct('8.50', 5)).toBe(8.5);
    expect(effectiveCommissionPct(null, 5)).toBe(5);
    expect(effectiveCommissionPct('', 5)).toBe(5);
    expect(effectiveCommissionPct('abc', 5)).toBe(5);
    expect(effectiveCommissionPct(0, 5)).toBe(0);
  });

  it('leaves struck-out lines out of the totals', () => {
    const totals = orderTotals(
      [
        { qty: 2, unitPrice: '100.00' },
        { qty: '1', unitPrice: 50, removed: true },
        { qty: 3, unitPrice: 10 },
      ],
      5
    );
    expect(totals.subtotal).toBe(230);
    expect(totals.commissionAmount).toBe(11.5);
  });
});

describe('grouping a project into partner orders', () => {
  it('splits calculator picks by store and keeps the room on furniture', () => {
    const storeOf = (id: number) => ({ 1: 10, 2: 10, 3: 20 } as Record<number, number>)[id] ?? null;
    const result = calculatorLinesByStore(
      { laminate: pick(1, 40, 30, { unit: 'm2', categorySlug: 'laminate' }), paint: pick(9, 15, 4) },
      { r1: [pick(2, 900), pick(3, 1200)] },
      [{ id: 'r1', nameKa: 'მისაღები' }],
      storeOf
    );
    expect([...result.groups.keys()]).toEqual([10, 20]);
    const store10 = result.groups.get(10)!;
    expect(store10).toHaveLength(2);
    expect(store10[0].roomName).toBeNull();
    expect(store10[1].roomName).toBe('მისაღები');
    expect(store10[0].total).toBe(1200);
    expect(result.unassigned).toHaveLength(1);
    expect(result.unassigned[0].productId).toBe(9);
  });

  it('prices each store order with its own commission and delivery rule', () => {
    const groups = new Map([
      [10, [{ productId: 1, nameKa: 'a', nameEn: null, nameRu: null, categorySlug: null, roomName: null, unit: 'piece', qty: 1, unitPrice: 1500, total: 1500 }]],
      [20, [{ productId: 3, nameKa: 'b', nameEn: null, nameRu: null, categorySlug: null, roomName: null, unit: 'piece', qty: 2, unitPrice: 1200, total: 2400 }]],
    ]);
    const stores = new Map([
      [10, { id: 10, commissionRate: '8.00', deliveryFeeGel: '30.00' }],
      [20, { id: 20, commissionRate: null, deliveryFeeGel: '60.00' }],
    ]);
    const orders = buildStoreOrders(groups, stores, 5);
    expect(orders.map((o) => o.storeId)).toEqual([20, 10]);
    const big = orders[0];
    expect(big.subtotal).toBe(2400);
    expect(big.deliveryFee).toBe(0);
    expect(big.commissionPct).toBe(5);
    expect(big.commissionAmount).toBe(120);
    const small = orders[1];
    expect(small.deliveryFee).toBe(30);
    expect(small.commissionPct).toBe(8);
    expect(small.commissionAmount).toBe(120);
  });

  // A design is ordered from its budget (`priceScene`), so the fixtures are a real plan and
  // a real scene: two bedrooms side by side, a wall's thickness apart.
  const P = (x: number, z: number): Vec2 => ({ x, z });
  const bedroom = (id: string, name: string, x: number): PlanRoom =>
    refreshRoom({ id, type: 'bedroom', name, polygon: [P(x, 0), P(x + 4, 0), P(x + 4, 3), P(x, 3)], heightM: 2.7, areaM2: 0, perimeterM: 0, openings: [] });
  const bedrooms = [bedroom('r1', 'საძინებელი', 0), bedroom('r2', 'საბავშვო', 4.12)];
  const flat = (rooms: PlanRoom[] = bedrooms, technical?: FloorPlan['technical']): FloorPlan => ({ rooms, metresPerPixel: null, bounds: { width: 8.12, depth: 3 }, source: 'manual', wallThicknessM: 0.12, ...(technical ? { technical } : {}) });
  const shop = (id: number): SceneStore => ({ id, nameKa: `მაღაზია ${id}`, logoUrl: null, websiteUrl: null, phone: null, address: null, city: null, rating: null, deliveryDays: 3, deliveryFeeGel: 40 });
  const sold = (productId: number, nameKa: string, price: number, store: SceneStore | null, extra: Partial<SceneProduct> = {}): SceneProduct => ({ productId, nameKa, slug: `p-${productId}`, brand: null, pricePerUnit: price, unit: 'piece', qty: 1, totalPrice: price, imageUrl: null, colorHex: null, textureUrl: null, model3dUrl: null, categorySlug: null, store, ...extra });
  const placed = (id: string, roomId: string, product: SceneProduct | null): PlacedItem => ({ id, roomId, slot: 'bed', kind: 'bed_double', position: P(1, 1), elevationM: 0, rotation: 0, size: { width: 1.6, depth: 2, height: 0.9 }, product });
  const design = (extra: Partial<DesignScene> = {}): DesignScene => ({ styleId: 'modern', mode: 'design_only', budgetGel: null, items: [], finishes: [], ...extra });

  it('reads the store off a scene snapshot and names the room', () => {
    const laminate = sold(6, 'ლამინატი', 45, null, { unit: 'm2', qty: 14.2, totalPrice: 639 });
    const scene = design({
      items: [placed('i1', 'r1', sold(5, 'საწოლი', 2000, shop(7))), placed('i2', 'r1', null)],
      finishes: [{ roomId: 'r1', surface: 'floor', colorHex: '#fff', textureUrl: null, textureScaleM: 1, product: laminate }],
    });
    const result = sceneLinesByStore(flat(), scene, (id) => (id === 6 ? 9 : null));
    expect(result.groups.get(7)![0].roomName).toBe('საძინებელი');
    expect(result.groups.get(9)![0].total).toBe(639);
    expect(result.unassigned).toHaveLength(0);
  });

  // The one the platform was losing: a door, a socket and a radiator had a price on the
  // budget and no order behind it, because the order was built from furniture and finishes.
  describe('doors, fittings and radiators', () => {
    const doorProduct = sold(21, 'კარი „Oak“', 620, shop(11), { nameEn: 'Door "Oak"', nameRu: 'Дверь «Oak»', categorySlug: 'doors' });
    const socketProduct = sold(9, 'როზეტი', 30, shop(12), { categorySlug: 'sockets-switches' });
    const radiatorProduct = sold(90, 'რადიატორი „Panel“ (1 სექცია)', 38, null, { categorySlug: 'radiators' });
    // An interior door — two halves in the plan, one door in the wall — the person's own.
    const rooms = addOpening(bedrooms, 'r1', 'door', 1, 0.12).rooms.map((r) => ({ ...r, openings: r.openings.map((o) => ({ ...o, origin: 'user' as const, product: doorProduct })) }));
    const plan = flat(rooms, { points: [{ id: 't1', kind: 'radiator', roomId: 'r2', position: P(6, 0.1), origin: 'user', sections: 8, product: radiatorProduct }] });
    const sockets: ElectricalPoint[] = ['r1', 'r2', 'r2'].map((roomId, i) => ({ id: `s${i}`, roomId, kind: 'socket', position: P(1 + i, 0.01), elevationM: 0.45, wallIndex: 0, t: 0.2 + i * 0.2, origin: 'user', product: socketProduct }));
    const scene = (excluded: DesignScene['excluded'] = []) => design({ electrical: sockets, excluded });

    it('sends each to the store that sells it, as the budget counts it', () => {
      // The radiator's snapshot names no store, so the catalogue answers for it.
      const result = sceneLinesByStore(plan, scene(), (id) => (id === 90 ? 13 : null));
      expect([...result.groups.keys()].sort()).toEqual([11, 12, 13]);
      // One door for the pair of halves, under the names and the category it is sold by.
      expect(result.groups.get(11)).toEqual([{ productId: 21, nameKa: 'კარი „Oak“', nameEn: 'Door "Oak"', nameRu: 'Дверь «Oak»', categorySlug: 'doors', roomName: 'საძინებელი', unit: 'piece', qty: 1, unitPrice: 620, total: 620 }]);
      // Three sockets of one model are one line; the rooms it covers are named once each.
      expect(result.groups.get(12)).toEqual([expect.objectContaining({ productId: 9, qty: 3, unitPrice: 30, total: 90, roomName: 'საძინებელი, საბავშვო' })]);
      // A radiator is bought by the section: eight of them, at the price of one.
      expect(result.groups.get(13)).toEqual([expect.objectContaining({ productId: 90, unit: 'piece', qty: 8, unitPrice: 38, total: 304, roomName: 'საბავშვო' })]);
      expect(result.unassigned).toHaveLength(0);
    });

    it('prices the orders the way the budget priced the baskets, delivery included', () => {
      const cost = priceScene(plan, scene());
      const result = costLinesByStore(cost, (id) => (id === 90 ? 13 : null));
      const stores = new Map([11, 12, 13].map((id) => [id, { id, commissionRate: null, deliveryFeeGel: '40.00' }]));
      const orders = buildStoreOrders(result.groups, stores, 5);
      expect(orders.map((o) => [o.storeId, o.subtotal, o.deliveryFee])).toEqual([[11, 620, 40], [13, 304, 40], [12, 90, 40]]);
      // The two shops the scene knows by name are the budget's baskets, to the tetri.
      for (const basket of cost.baskets.filter((b) => b.store)) {
        const order = orders.find((o) => o.storeId === basket.store!.id)!;
        expect([order.subtotal, order.deliveryFee]).toEqual([basket.subtotal, basket.deliveryFee]);
      }
    });

    it('sends nothing that was ticked off the budget', () => {
      const result = sceneLinesByStore(plan, scene([tickFor.opening(21), tickFor.fixture(9), tickFor.radiator(90)]), () => 13);
      expect(result.groups.size).toBe(0);
      expect(result.unassigned).toHaveLength(0);
      // One of the three put back is one order again.
      const back = sceneLinesByStore(plan, scene([tickFor.opening(21), tickFor.radiator(90)]), () => 13);
      expect([...back.groups.keys()]).toEqual([12]);
    });

    it('leaves a made-to-measure kitchen to the joiner and what the flat already has to the flat', () => {
      const kitchen: PlacedItem = { ...placed('k1', 'r1', sold(40, 'სამზარეულო', 5200, shop(14))), slot: 'kitchen_run', kind: 'kitchen_run', size: { width: 3, depth: 0.6, height: 0.9 } };
      const paint = { roomId: 'r1', surface: 'wall' as const, colorHex: '#fff', textureUrl: null, textureScaleM: 1.5, product: sold(3, 'საღებავი', 12, shop(15), { unit: 'm2', qty: 30, totalPrice: 360 }) };
      const custom = sceneLinesByStore(flat(), design({ items: [kitchen], finishes: [paint] }));
      expect([...custom.groups.keys()]).toEqual([15]);
      // Bought off the shelf instead, the kitchen is a product again and its shop gets the order.
      const stock = sceneLinesByStore(flat(), design({ items: [{ ...kitchen, custom: false }], finishes: [paint] }));
      expect([...stock.groups.keys()].sort()).toEqual([14, 15]);
      // Walls the flat already has painted are not painted again, and nobody is sent the paint.
      const painted = sceneLinesByStore(flat(bedrooms, { points: [], existing: ['wall'] }), design({ finishes: [paint] }));
      expect(painted.groups.size).toBe(0);
    });

    it('folds into what was ordered before: a thirteenth socket is one socket, not thirteen', () => {
      const result = sceneLinesByStore(plan, scene(), () => 13);
      const again = mergeLines(result, null, { 9: 2, 21: 1 });
      expect(again.groups.get(12)).toEqual([expect.objectContaining({ productId: 9, qty: 1, total: 30 })]);
      expect(again.groups.has(11)).toBe(false);
      expect(again.skipped).toBe(1);
      // A calculator pick of the same door is the studio's door, not a second one.
      const calculator = calculatorLinesByStore({ doors_global: pick(21, 620, 1) }, {}, [], () => 11);
      expect(mergeLines(result, calculator).groups.get(11)).toHaveLength(1);
    });

    it('keeps a room list that would not fit the column from failing the order', () => {
      const long = bedrooms.map((r, i) => ({ ...r, name: `${'ოთახი '.repeat(30)}${i}` }));
      const crowded = sceneLinesByStore(flat(long), design({ electrical: sockets }));
      const roomName = crowded.groups.get(12)![0].roomName!;
      expect(roomName.length).toBeLessThanOrEqual(255);
      expect(roomName.endsWith('…')).toBe(true);
    });
  });

  it('turns the labour estimate into booking lines', () => {
    const lines = labourLines({
      workerCosts: [
        { key: 'tiling', labelKa: 'ფილის დაგება', qty: 12.5, qtyUnit: 'm2', pricePerQty: 40, totalGEL: 500 },
        { key: 'nothing', labelKa: '—', qty: 0, qtyUnit: 'unit', pricePerQty: 0, totalGEL: 0 },
      ],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].categorySlug).toBe('labour:tiling');
    expect(lines[0].total).toBe(500);
  });
});

describe('report periods', () => {
  const now = new Date(2026, 8, 8, 15, 30); // 8 September 2026

  it('covers whole days, exclusive at the end', () => {
    const today = periodRange('today', { now });
    expect(today.from).toEqual(new Date(2026, 8, 8));
    expect(today.to).toEqual(new Date(2026, 8, 9));
    expect(eachDay(periodRange('7d', { now }))).toHaveLength(7);
    expect(eachDay(periodRange('30d', { now }))).toHaveLength(30);
    expect(periodRange('month', { now }).from).toEqual(new Date(2026, 8, 1));
    expect(periodRange('year', { now }).to).toEqual(new Date(2027, 0, 1));
  });

  it('reads a custom window inclusively and falls back when it is nonsense', () => {
    const custom = periodRange('custom', { now, from: '2026-08-01', to: '2026-08-15' });
    expect(eachDay(custom)).toHaveLength(15);
    expect(eachDay(custom)[0]).toBe('2026-08-01');
    const open = periodRange('custom', { now, from: '2026-09-01' });
    expect(eachDay(open)).toHaveLength(8);
    const broken = periodRange('custom', { now, from: 'yesterday', to: '2026-13-40' });
    expect(eachDay(broken)).toHaveLength(30);
  });
});

describe('mergeLines', () => {
  const line = (productId: number, total: number, qty = 1, roomName: string | null = null) => ({ productId, nameKa: `p${productId}`, nameEn: null, nameRu: null, categorySlug: null, roomName, unit: 'piece', qty, unitPrice: total / qty, total });

  it('lets the design supersede the calculator copy of a product and keeps repeated items', async () => {
    const { mergeLines } = await import('@/lib/finance/money');
    const design = { groups: new Map([[10, [line(2, 200, 1, 'kitchen'), line(2, 200, 1, 'kitchen'), line(3, 300)]]]), unassigned: [] };
    const calculator = { groups: new Map([[10, [line(1, 100), line(2, 200)]]]), unassigned: [line(9, 5)] };
    const merged = mergeLines(design, calculator);
    // two chairs stay two chairs; the calculator's chair is the same product and is dropped
    expect(merged.groups.get(10)!.map((l) => l.productId)).toEqual([2, 2, 3, 1]);
    expect(merged.skipped).toBe(1);
    expect(merged.unassigned.map((l) => l.productId)).toEqual([9]);
  });

  it('takes units ordered earlier off the top, product by product', async () => {
    const { mergeLines } = await import('@/lib/finance/money');
    const design = { groups: new Map([[10, [line(2, 200), line(2, 200), line(2, 200), line(4, 400, 2)]]]), unassigned: [] };
    const merged = mergeLines(design, null, { 2: 1, 4: 1 });
    const chairs = merged.groups.get(10)!.filter((l) => l.productId === 2);
    expect(chairs).toHaveLength(2); // one of three was ordered before
    const table = merged.groups.get(10)!.find((l) => l.productId === 4)!;
    expect(table.qty).toBe(1); // two wanted, one already ordered
    expect(table.total).toBe(200);
    expect(merged.skipped).toBe(1);
  });

  it('is a plain union when nothing repeats', async () => {
    const { mergeLines } = await import('@/lib/finance/money');
    const merged = mergeLines({ groups: new Map([[10, [line(1, 100)]]]), unassigned: [] }, { groups: new Map([[20, [line(2, 50)]]]), unassigned: [] });
    expect(merged.skipped).toBe(0);
    expect([...merged.groups.keys()]).toEqual([10, 20]);
  });
});
