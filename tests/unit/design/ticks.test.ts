import { describe, expect, it } from 'vitest';
import { budgetSections, budgetSummary, priceScene } from '@/lib/design/pricing';
import { pruneTicks, tickFor, tickedOff, toggleTick } from '@/lib/design/ticks';
import { designCheckoutPart } from '@/lib/projects/checkoutParts';
import { sceneLinesByStore } from '@/lib/finance/money';
import { addOpening } from '@/lib/design/openings';
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
    expect(designCheckoutPart(plan, cost, 12, 'ka')!.lines.map((l) => l.key)).toEqual(['item:bed-b2', 'item:bed-b3', 'item:bed-b5']);
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
    // The radiator, and the 40 ₾ its store charged to bring it: the radiator was all that
    // store was bringing, and a store with nothing in its basket delivers nothing.
    expect(full.deliveryTotal).toBe(40);
    expect(out.deliveryTotal).toBe(0);
    expect(out.grandTotal).toBeCloseTo(full.grandTotal - line.total - 40, 2);
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
    // The socket, the paint, and the 40 ₾ their store would have charged to bring the two.
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

describe('a door, a fitting and a radiator are bought like a sofa is', () => {
  const shop = (id: number, nameKa: string, deliveryFeeGel: number): SceneStore => ({ ...store, id, nameKa, deliveryFeeGel });
  const domus = shop(2, 'Domus', 60);
  const lumina = shop(3, 'Lumina', 25);
  const sanPlus = shop(4, 'San Plus', 35);
  const doorProduct = product(21, 620, 1, { categorySlug: 'doors', store: domus });
  const windowProduct = product(22, 480, 1, { categorySlug: 'windows', store: domus });
  const socketProduct = product(9, 30, 1, { categorySlug: 'sockets-switches', store: lumina });
  const radiatorProduct = product(90, 55, 6, { categorySlug: 'radiators', store: sanPlus });

  // An interior door between b1 and b2 — two halves, one door — and a window in b3, both
  // the person's own additions, so a finished home still pays for them.
  const withOpenings = (): PlanRoom[] => {
    let next = addOpening(rooms, 'b1', 'door', 1, 0.12).rooms;
    next = addOpening(next, 'b3', 'window', 0, 0.12).rooms;
    return next.map((r) => ({ ...r, openings: r.openings.map((o) => ({ ...o, origin: 'user' as const, product: o.kind === 'door' ? doorProduct : windowProduct })) }));
  };
  const fitted: FloorPlan = {
    ...plan,
    rooms: withOpenings(),
    technical: { points: [{ id: 't1', kind: 'radiator', roomId: 'b1', position: P(2, 0.1), origin: 'user', sections: 6, product: radiatorProduct }] },
  };
  const sockets: ElectricalPoint[] = [
    { id: 's1', roomId: 'b1', kind: 'socket_double', position: P(1, 0.01), elevationM: 0.45, wallIndex: 0, t: 0.2, count: 2, origin: 'user', product: { ...socketProduct, qty: 2, totalPrice: 60 } },
    { id: 's2', roomId: 'b2', kind: 'socket', position: P(5, 0.01), elevationM: 0.45, wallIndex: 0, t: 0.2, origin: 'user', product: socketProduct },
  ];
  const ticks = [tickFor.opening(21), tickFor.opening(22), tickFor.fixture(9), tickFor.radiator(90)];
  const furnished = (excluded: DesignScene['excluded'] = []) => scene({ electrical: sockets, excluded });

  it('gives each of them a basket at its own store, and that store its delivery', () => {
    const cost = priceScene(fitted, furnished());
    expect(cost.baskets.map((b) => [b.store?.nameKa, b.subtotal, b.deliveryFee])).toEqual([
      ['Woody', 9800, 0],
      ['Domus', 1100, 60],
      ['San Plus', 330, 35],
      ['Lumina', 90, 25],
    ]);
    expect(cost.deliveryTotal).toBe(120);
    // The two halves of the interior door are one door; the double socket is two plates.
    const domusLines = cost.baskets[1].lines;
    expect(domusLines.map((l) => [l.item, l.roomName, l.product.qty, l.product.totalPrice])).toEqual([
      ['შიდა კარი', 'b1', 1, 620],
      ['ფანჯარა', 'b3', 1, 480],
    ]);
    expect(cost.baskets[3].lines[0]).toMatchObject({ item: 'როზეტი', roomName: 'b1, b2', product: { productId: 9, qty: 3, totalPrice: 90 } });
    expect(cost.baskets[2].lines[0]).toMatchObject({ item: 'რადიატორი', product: { productId: 90, qty: 6, totalPrice: 330 } });
    // Everything a store is bringing, and nothing else, is what the products figure is made of.
    expect(budgetSummary(cost).products).toBe(9800 + 1100 + 330 + 90 + 120);
  });

  it('labels them in the language of whoever is asking', () => {
    const cost = priceScene(fitted, furnished(), { productLabels: { door: 'Interior door', socket: 'Socket' } });
    const items = cost.baskets.flatMap((b) => b.lines.map((l) => l.item));
    expect(items).toContain('Interior door');
    expect(items).toContain('Socket');
    expect(items).toContain('ფანჯარა'); // Georgian for whatever was not handed over
  });

  it('lists them in the checkout dialogue and sends each store its lines — the same ones', () => {
    const cost = priceScene(fitted, furnished());
    const part = designCheckoutPart(fitted, cost, 12, 'ka')!;
    expect(part.lines.map((l) => l.key)).toEqual(['item:bed-b1', 'item:bed-b2', 'item:bed-b3', 'item:bed-b5', ...ticks.slice(0, 2), tickFor.fixture(9), tickFor.radiator(90)]);
    expect(part.lines.reduce((sum, l) => sum + l.total, 0)).toBe(budgetSummary(cost).products - cost.deliveryTotal);

    const sent = sceneLinesByStore(fitted, furnished());
    expect([...sent.groups.keys()].sort()).toEqual([1, 2, 3, 4]);
    expect(sent.groups.get(2)!.map((l) => [l.productId, l.qty, l.total, l.categorySlug])).toEqual([[21, 1, 620, 'doors'], [22, 1, 480, 'windows']]);
    expect(sent.groups.get(3)).toEqual([expect.objectContaining({ productId: 9, qty: 3, unitPrice: 30, total: 90, roomName: 'b1, b2' })]);
    expect(sent.groups.get(4)).toEqual([expect.objectContaining({ productId: 90, qty: 6, unitPrice: 55, total: 330, roomName: 'b1' })]);
    // Line for line what the dialogue showed, and store for store what the baskets came to.
    const all = [...sent.groups.values()].flat();
    expect(all.map((l) => l.productId)).toEqual(part.lines.map((l) => l.productId));
    expect(all.map((l) => l.total)).toEqual(part.lines.map((l) => l.total));
    for (const basket of cost.baskets) expect(sent.groups.get(basket.store!.id)!.reduce((sum, l) => sum + l.total, 0)).toBe(basket.subtotal);
  });

  it('ticked off, they have no basket, no delivery, no line in the dialogue and no order — and are fitted all the same', () => {
    const full = priceScene(fitted, furnished());
    const cost = priceScene(fitted, furnished(ticks));
    expect(cost.baskets.map((b) => b.store?.nameKa)).toEqual(['Woody']);
    expect(cost.deliveryTotal).toBe(0);
    expect(full.grandTotal - cost.grandTotal).toBeCloseTo(1100 + 330 + 90 + 120, 2);
    expect(designCheckoutPart(fitted, cost, 12, 'ka')!.lines.map((l) => l.key)).toEqual(['item:bed-b1', 'item:bed-b2', 'item:bed-b3', 'item:bed-b5']);
    expect([...sceneLinesByStore(fitted, furnished(ticks)).groups.keys()]).toEqual([1]);
    for (const key of ['electrical_point', 'radiator_install']) expect(cost.lines.find((l) => l.key === key)?.total).toBe(full.lines.find((l) => l.key === key)?.total);
  });

  it('orders only what is new work: what the flat came with is on nobody’s order', () => {
    // The same flat, nothing in it the person's own: a finished home buys none of it…
    const asFound: FloorPlan = {
      ...fitted,
      rooms: fitted.rooms.map((r) => ({ ...r, openings: r.openings.map((o) => ({ ...o, origin: 'existing' as const })) })),
      technical: { points: fitted.technical!.points.map((p) => ({ ...p, origin: 'existing' as const })) },
    };
    const generated = scene({ electrical: sockets.map((s) => ({ ...s, origin: 'generated' as const })) });
    expect([...sceneLinesByStore(asFound, generated).groups.keys()]).toEqual([1]);
    // …a renovation that redoes the doors, the wiring and the heating buys all of it, and a
    // green frame — the same scene, the project's home state the only difference — none.
    const renovation: DesignScene = { ...generated, mode: 'full' };
    expect([...sceneLinesByStore(asFound, renovation, () => null, { homeState: 'white_frame' }).groups.keys()].sort()).toEqual([1, 2, 3, 4]);
    expect([...sceneLinesByStore(asFound, renovation, () => null, { homeState: 'green_frame' }).groups.keys()]).toEqual([1]);
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

describe('every line can be taken out, and any quantity changed', () => {
  const socket: ElectricalPoint = { id: 's1', roomId: 'b1', kind: 'socket', position: P(1, 0.01), elevationM: 0.45, wallIndex: 0, t: 0.2, origin: 'user', product: product(9, 30, 1, { categorySlug: 'sockets-switches' }) };
  const base = (extra: Partial<DesignScene> = {}): DesignScene => ({ styleId: 'modern', mode: 'full', budgetGel: null, items: beds, finishes: [], electrical: [socket], ...extra });
  const options = { homeState: 'black_frame' as const };

  it('gives every line but delivery a key of its own', () => {
    const cost = priceScene(plan, base(), options);
    const keyed = cost.lines.filter((l) => l.section !== 'delivery');
    expect(keyed.every((l) => !!l.tick)).toBe(true);
    expect(new Set(keyed.map((l) => l.tick)).size).toBe(keyed.length);
    expect(cost.lines.filter((l) => l.section === 'delivery').every((l) => l.tick == null)).toBe(true);
  });

  it('takes a bulk material and a labour phase out like any product', () => {
    const full = priceScene(plan, base(), options);
    const material = full.lines.find((l) => l.section === 'materials' && l.total > 0)!;
    const labour = full.lines.find((l) => l.section === 'labour' && l.key === 'plastering')!;
    const out = priceScene(plan, base({ excluded: [material.tick!, labour.tick!] }), options);
    expect(out.materialsTotal).toBeCloseTo(full.materialsTotal - material.total, 2);
    expect(out.labourTotal).toBeCloseTo(full.labourTotal - labour.total, 2);
    expect(out.grandTotal).toBeCloseTo(full.grandTotal - material.total - labour.total, 2);
    // Struck through where they stood, not gone.
    expect(out.lines.map((l) => l.tick ?? l.key)).toEqual(full.lines.map((l) => l.tick ?? l.key));
  });

  it('counts the quantity the person set and keeps the one that was worked out beside it', () => {
    const tick = tickFor.item('bed-b2');
    const cost = priceScene(plan, base({ quantities: { [tick]: 3 } }), options);
    const line = cost.lines.find((l) => l.tick === tick)!;
    expect(line.qty).toBe(3);
    expect(line.originalQty).toBe(1);
    expect(line.total).toBe(3 * 2450);
    // The basket and the order are read off the same line.
    expect(cost.baskets[0].lines.find((l) => l.roomName === 'b2')?.product.qty).toBe(3);
    expect(sceneLinesByStore(plan, base({ quantities: { [tick]: 3 } })).groups.get(1)!.find((l) => l.roomName === 'b2')?.qty).toBe(3);
    // Setting it back to what was worked out lets go of the edit.
    expect(priceScene(plan, base({ quantities: { [tick]: 1 } }), options).lines.find((l) => l.tick === tick)?.originalQty).toBeUndefined();
  });

  it('changes a labour quantity, and the trades and the totals follow', () => {
    const full = priceScene(plan, base(), options);
    const labour = full.lines.find((l) => l.section === 'labour' && l.key === 'plastering')!;
    const half = priceScene(plan, base({ quantities: { [labour.tick!]: labour.qty / 2 } }), options);
    expect(half.labourTotal).toBeCloseTo(full.labourTotal - labour.total / 2, 1);
    expect(half.lines.find((l) => l.tick === labour.tick)?.originalQty).toBe(labour.qty);
  });

  it('ignores a quantity nobody could mean', () => {
    const tick = tickFor.item('bed-b2');
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(priceScene(plan, base({ quantities: { [tick]: bad } }), options).lines.find((l) => l.tick === tick)?.qty).toBe(1);
    }
  });
});

