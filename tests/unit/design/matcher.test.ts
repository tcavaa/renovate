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
