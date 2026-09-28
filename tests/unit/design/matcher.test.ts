import { describe, expect, it } from 'vitest';
import { applySwap, candidatesFor, matchProducts, quantityFor, toSceneProduct, type CatalogProduct } from '@/lib/design/matcher';
import type { PlacedItem } from '@/lib/design/types';

function catalogProduct(id: number, overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id,
    nameKa: `p${id}`,
    slug: `p${id}`,
    brand: null,
    categorySlug: 'sofas',
    pricePerUnit: 1000,
    unit: 'piece',
    imageUrl: null,
    colorHex: null,
    textureUrl: null,
    model3dKind: 'sofa_3seat',
    model3dUrl: `/models/p${id}.glb`,
    widthCm: 200,
    depthCm: 90,
    heightCm: 80,
    styleTags: ['scandinavian'],
    tags: [],
    isFeatured: false,
    specs: null,
    coveragePerUnit: null,
    store: null,
    ...overrides,
  };
}

function slot(id: string, roomId: string, kind = 'sofa_3seat', slotName = 'sofa'): PlacedItem {
  return {
    id,
    roomId,
    slot: slotName as PlacedItem['slot'],
    kind,
    position: { x: 0, z: 0 },
    elevationM: 0,
    rotation: 0,
    size: { width: 2.2, depth: 0.9, height: 0.8 },
    product: null,
  };
}

describe('candidatesFor', () => {
  it('keeps only products of exactly that archetype that have a model', () => {
    const catalog = [
      catalogProduct(1),
      catalogProduct(2, { model3dUrl: null }),
      catalogProduct(3, { model3dKind: 'bed_double' }),
    ];
    expect(candidatesFor('sofa_3seat', catalog, 'scandinavian').map((c) => c.id)).toEqual([1]);
  });

  it('puts products matching the style first', () => {
    const catalog = [catalogProduct(1, { styleTags: ['industrial'] }), catalogProduct(2, { styleTags: ['scandinavian'] })];
    expect(candidatesFor('sofa_3seat', catalog, 'scandinavian')[0].id).toBe(2);
  });

  it('returns nothing for an unknown archetype', () => {
    expect(candidatesFor('spaceship', [catalogProduct(1)], 'modern')).toEqual([]);
  });
});

describe('matchProducts', () => {
  const catalog = [catalogProduct(1), catalogProduct(2), catalogProduct(3)];

  it('gives every slot of a kind in one room the same product', () => {
    const items = matchProducts([slot('a', 'living'), slot('b', 'living')], catalog, { styleId: 'scandinavian' });
    expect(items[0].product?.productId).toBe(items[1].product?.productId);
    expect(items[0].origin).toBe('style');
  });

  it('rotates to a different product for the same kind in another room', () => {
    const items = matchProducts([slot('a', 'living'), slot('b', 'bedroom')], catalog, { styleId: 'scandinavian' });
    expect(items[0].product?.productId).not.toBe(items[1].product?.productId);
  });

  it('takes the product’s real dimensions for the slot', () => {
    const [item] = matchProducts([slot('a', 'living')], catalog, { styleId: 'scandinavian' });
    expect(item.size).toEqual({ width: 2, depth: 0.9, height: 0.8 });
  });

  it('leaves a pinned item exactly as it is', () => {
    const pinned: PlacedItem = { ...slot('a', 'living'), pinned: true, product: toSceneProduct(catalogProduct(3), 1) };
    const [item] = matchProducts([pinned], catalog, { styleId: 'scandinavian', level: 'value' });
    expect(item).toBe(pinned);
  });

  it('leaves a slot empty when nothing can fill it', () => {
    const [item] = matchProducts([slot('a', 'living', 'bed_double')], catalog, { styleId: 'scandinavian' });
    expect(item.product).toBeNull();
  });

  it('shifts to the value tier when the balanced scheme exceeds the budget', () => {
    const cheap = catalogProduct(1, { pricePerUnit: 100 });
    const dear = catalogProduct(2, { pricePerUnit: 5000 });
    const [tight] = matchProducts([slot('a', 'living')], [cheap, dear], { styleId: 'scandinavian', budgetGel: 200 });
    expect(tight.product?.productId).toBe(1);
    const [rich] = matchProducts([slot('a', 'living')], [cheap, dear], { styleId: 'scandinavian', budgetGel: 100_000 });
    expect(rich.product?.productId).toBe(2);
  });
});

describe('quantityFor', () => {
  it('sells kitchen runs per 3 m and curtains per 2 m, everything else per piece', () => {
    expect(quantityFor({ ...slot('k', 'kitchen', 'kitchen_run', 'kitchen_run'), size: { width: 6, depth: 0.6, height: 2.2 } })).toBe(2);
    expect(quantityFor({ ...slot('c', 'living', 'curtain', 'curtain'), size: { width: 1, depth: 0.1, height: 2.5 } })).toBe(1);
    expect(quantityFor(slot('s', 'living'))).toBe(1);
  });
});

describe('applySwap', () => {
  it('replaces the product, pins the item and marks it as a studio choice', () => {
    const items = matchProducts([slot('a', 'living'), slot('b', 'living')], [catalogProduct(1), catalogProduct(2)], { styleId: 'scandinavian' });
    const swapped = applySwap(items, 'a', catalogProduct(2, { widthCm: 180 }));
    expect(swapped[0].product?.productId).toBe(2);
    expect(swapped[0].pinned).toBe(true);
    expect(swapped[0].origin).toBe('studio');
    expect(swapped[0].size.width).toBe(1.8);
    expect(swapped[1]).toBe(items[1]);
  });
});

describe('toSceneProduct', () => {
  it('computes the line total from price and quantity, rounded to cents', () => {
    const p = toSceneProduct(catalogProduct(1, { pricePerUnit: 33.335 }), 3);
    expect(p.totalPrice).toBe(100.01);
    expect(p.qty).toBe(3);
  });
});

describe('matchProducts with rooms', () => {
  it('does not place a product that would poke through the wall, and takes the next one that fits', async () => {
    const { matchProducts } = await import('@/lib/design/matcher');
    const { refreshRoom } = await import('@/lib/design/planGeometry');
    const room = refreshRoom({ id: 'small', type: 'living_room', name: 'small', polygon: [{ x: 0, z: 0 }, { x: 2.4, z: 0 }, { x: 2.4, z: 3 }, { x: 0, z: 3 }], heightM: 2.8, areaM2: 0, perimeterM: 0, openings: [] });
    const huge = catalogProduct(901, { widthCm: 320, depthCm: 100, heightCm: 80, pricePerUnit: 100 });
    const fits = catalogProduct(902, { widthCm: 200, depthCm: 90, heightCm: 80, pricePerUnit: 2000 });
    const sofa = { ...slot('a', 'small'), kind: 'sofa_3seat', position: { x: 1.2, z: 0.5 }, size: { width: 2, depth: 0.9, height: 0.8 } };
    const [placed] = matchProducts([sofa], [huge, fits], { styleId: 'scandinavian', rooms: [room] });
    expect(placed.product?.productId).toBe(902);
    const [dropped] = matchProducts([sofa], [huge], { styleId: 'scandinavian', rooms: [room] });
    expect(dropped.product).toBeNull();
  });

  it('does not stand a product through the end of a partial wall, where every corner of it is on the floor', async () => {
    const { matchProducts } = await import('@/lib/design/matcher');
    const { pointInPolygon } = await import('@/lib/design/planGeometry');
    const { rebuildRooms } = await import('@/lib/design/walls');
    // Test project 219's corner: a diagonal partial wall ending at (3, 2.5), a separator on from it.
    const w = (id: string, a: [number, number], b: [number, number], extra: object = {}) => ({ id, a: { x: a[0], z: a[1] }, b: { x: b[0], z: b[1] }, thicknessM: 0.12, origin: 'existing' as const, ...extra });
    const plan = rebuildRooms({ rooms: [], metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', wallThicknessM: 0.12, wallHeightM: 2.8, walls: [] }, [
      w('top', [0, 0], [6.82, 0]), w('right', [6.82, 0], [6.82, 7.87]), w('bottom', [6.82, 7.87], [0, 7.87]), w('left', [0, 7.87], [0, 0]),
      w('bed-top', [4.26, 3.73], [6.82, 3.73]), w('bed-left', [4.26, 3.73], [4.26, 7.87]),
      w('diagonal', [4.26, 3.73], [3, 2.5]), w('diagonal-sep', [3, 2.5], [0, 3.73], { thicknessM: 0, separator: true }),
    ]);
    const living = plan.rooms.find((r) => pointInPolygon({ x: 1, z: 1 }, r.polygon))!;
    const tv = catalogProduct(903, { model3dKind: 'tv_unit', categorySlug: 'storage', widthCm: 180, depthCm: 58, heightCm: 50 });
    const atTip = { ...slot('tv', living.id, 'tv_unit', 'tv_unit'), position: { x: 2.96, z: 2.52 }, rotation: Math.PI, size: { width: 1.8, depth: 0.42, height: 0.5 } };
    const [onTip] = matchProducts([atTip], [tv], { styleId: 'scandinavian', rooms: [living] });
    expect(onTip.product).toBeNull();
    const [clear] = matchProducts([{ ...atTip, position: { x: 4.31, z: 2.52 } }], [tv], { styleId: 'scandinavian', rooms: [living] });
    expect(clear.product?.productId).toBe(903);
  });
});
