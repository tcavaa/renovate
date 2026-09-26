import { describe, expect, it } from 'vitest';
import { finishQuantity, visibleFinishes } from '@/lib/design/finishQuantity';
import { paintCell, paintPatch, paintSpan } from '@/lib/design/paint';
import { refreshRoom } from '@/lib/design/planGeometry';
import { priceScene } from '@/lib/design/pricing';
import { finishFromProduct } from '@/lib/design/surfaces';
import type { CatalogProduct } from '@/lib/design/matcher';
import type { DesignScene, FloorPlan, PlanRoom, SurfaceFinish } from '@/lib/design/types';

/**
 * Finishes lie on one another like coats of paint, and only the top coat is bought. A 4 × 4 m
 * room 2.5 m high: 16 m² of floor, four walls of 10 m², 40 m² of wall in all; a painted strip
 * is 2.5 m², a painted square metre 1 m².
 */

const room: PlanRoom = refreshRoom({
  id: 'r',
  type: 'bedroom',
  name: 'bedroom',
  polygon: [
    { x: 0, z: 0 },
    { x: 4, z: 0 },
    { x: 4, z: 4 },
    { x: 0, z: 4 },
  ],
  heightM: 2.5,
  areaM2: 0,
  perimeterM: 0,
  openings: [],
});
const plan: FloorPlan = { rooms: [room], metresPerPixel: null, bounds: { width: 4, depth: 4 }, source: 'manual', wallThicknessM: 0.12 };

const product = (id: number, pricePerM2: number, surfaces: Array<'floor' | 'wall'> = ['floor', 'wall']): CatalogProduct =>
  ({ id, nameKa: `p${id}`, slug: `p${id}`, brand: null, categorySlug: 'paint', pricePerUnit: pricePerM2, unit: 'm2', imageUrl: null, colorHex: '#886644', textureUrl: `/textures/p${id}.jpg`, model3dKind: null, model3dUrl: null, widthCm: null, depthCm: null, heightCm: null, styleTags: [], tags: [], isFeatured: false, specs: { surfaces }, coveragePerUnit: null, store: null }) as CatalogProduct;

const walls = (id: number, price = 10) => finishFromProduct(room, 'wall', product(id, price));
const floor = (id: number, price = 10) => finishFromProduct(room, 'floor', product(id, price));
/** A finish of `id` laid as `shape` says, counted over what it covers. */
const laid = (id: number, shape: Partial<SurfaceFinish> & Pick<SurfaceFinish, 'surface'>): SurfaceFinish => {
  const base = shape.surface === 'floor' ? floor(id) : walls(id);
  const finish = { ...base, ...shape };
  const qty = finishQuantity(room, finish);
  return { ...finish, product: { ...base.product!, qty, totalPrice: Math.round(base.product!.pricePerUnit * qty * 100) / 100 } };
};

/** What is bought of each product, m². */
const bought = (finishes: SurfaceFinish[]) => Object.fromEntries(visibleFinishes(finishes, [room]).map((f) => [f.product!.productId, f.product!.qty]));

describe('visibleFinishes — the walls', () => {
  it('buys the room’s paint only where no strip lies on it', () => {
    expect(finishQuantity(room, { surface: 'wall' })).toBe(40);
    const strip = laid(2, { surface: 'wall', wallIndex: 0, span: { from: 0, to: 1 } });
    expect(strip.product!.qty).toBe(2.5);
    expect(bought([walls(1), strip])).toEqual({ 1: 37.5, 2: 2.5 });
  });

  it('lays a square metre on the strip it is painted over, and on the bare wall elsewhere', () => {
    const strip = laid(2, { surface: 'wall', wallIndex: 0, span: { from: 0, to: 2 } });
    // Column 0 is inside the strip, column 3 is not.
    const squares = laid(3, { surface: 'wall', wallIndex: 0, cells: [[0, 0], [3, 1]] });
    expect(bought([walls(1), strip, squares])).toEqual({ 1: 34, 2: 4, 3: 2 });
  });

  it('gives a wall of its own the room’s place there, and what is painted on it that wall’s', () => {
    const own = laid(4, { surface: 'wall', wallIndex: 1 });
    const strip = laid(2, { surface: 'wall', wallIndex: 1, span: { from: 1, to: 2 } });
    const square = laid(3, { surface: 'wall', wallIndex: 1, cells: [[3, 0]] });
    expect(bought([walls(1), own, strip, square])).toEqual({ 1: 30, 4: 6.5, 2: 2.5, 3: 1 });
  });

  it('drops the room’s walls altogether when every wall has one of its own', () => {
    const own = [0, 1, 2, 3].map((wallIndex) => laid(4 + wallIndex, { surface: 'wall', wallIndex }));
    expect(bought([walls(1), ...own])).toEqual({ 4: 10, 5: 10, 6: 10, 7: 10 });
  });
});

describe('visibleFinishes — the floor', () => {
  it('buys the room’s floor round a zone and the painted tiles, and the zone round the tiles on it', () => {
    const zone = laid(5, { surface: 'floor', zone: { id: 'z', polygon: [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 1 }, { x: 0, z: 1 }] } });
    expect(zone.product!.qty).toBe(2);
    // One tile half inside the zone's 2 m² ([1, 0] is wholly in it), one clear of it.
    const tiles = laid(6, { surface: 'floor', cells: [[1, 0], [3, 3]] });
    expect(bought([floor(1), zone, tiles])).toEqual({ 1: 13, 5: 1, 6: 2 });
  });

  it('drops a floor painted over edge to edge', () => {
    const cells: Array<[number, number]> = [];
    for (let x = 0; x < 4; x++) for (let z = 0; z < 4; z++) cells.push([x, z]);
    expect(bought([floor(1), laid(6, { surface: 'floor', cells })])).toEqual({ 6: 16 });
  });
});

describe('visibleFinishes — what stays as it is', () => {
  it('is the same list when nothing lies on anything', () => {
    const finishes = [floor(1), walls(2)];
    expect(visibleFinishes(finishes, [room])).toBe(finishes);
  });

  it('lets a layer with no product hide nothing, and leaves the style’s look and other rooms alone', () => {
    const waiting: SurfaceFinish = { ...floor(1), zone: { id: 'z', polygon: [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 2 }, { x: 0, z: 2 }] }, product: null };
    const gone = { ...walls(3), roomId: 'gone' };
    const shown = visibleFinishes([floor(2), waiting, gone], [room]);
    expect(shown.find((f) => f.product?.productId === 2)?.product?.qty).toBe(16);
    expect(shown).toContain(gone);
  });

  it('buys only the first of two finishes that claim the whole floor — the one drawn', () => {
    expect(bought([floor(1), floor(2)])).toEqual({ 1: 16 });
  });
});

describe('painting over paint, in the budget', () => {
  const scene = (finishes: SurfaceFinish[]): DesignScene => ({ styleId: 'modern', mode: 'full', budgetGel: null, items: [], finishes });
  const lines = (finishes: SurfaceFinish[]) => {
    const cost = priceScene(plan, scene(finishes), { homeState: 'white_frame' });
    return { cost, qty: Object.fromEntries(cost.lines.filter((l) => l.bucket === 'finishes').map((l) => [l.product!.productId, l.qty])) };
  };

  it('counts a strip painted twice once, in the colour on top, and the wall round it once', () => {
    let finishes = [walls(1), floor(9)];
    finishes = paintSpan(finishes, room, 0, { from: 0, to: 1 }, product(2, 20));
    finishes = paintSpan(finishes, room, 0, { from: 0, to: 1 }, product(3, 30));
    const { cost, qty } = lines(finishes);
    expect(qty).toEqual({ 1: 37.5, 3: 2.5, 9: 16 });
    // 37.5 m² of paint at 10, 2.5 m² at 30, the floor at 10: the wall is bought once over.
    expect(cost.finishesTotal).toBe(375 + 75 + 160);
    expect(cost.perRoom[0].total).toBe(cost.finishesTotal);
  });

  it('keeps a square metre painted on a strip off both the strip and the wall', () => {
    let finishes = [walls(1)];
    finishes = paintSpan(finishes, room, 2, { from: 1, to: 2 }, product(2, 20));
    finishes = paintPatch(finishes, room, 2, [1, 0], product(3, 30));
    finishes = paintCell(finishes, room, [0, 0], product(4, 50));
    expect(lines(finishes).qty).toEqual({ 1: 37.5, 2: 1.5, 3: 1, 4: 1 });
  });
});
