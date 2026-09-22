import { describe, expect, it } from 'vitest';
import { cartKey, categorySlugFromKey, finishPickQuantity, isCartKey, roomIdFromKey } from '@/lib/calculator/quantities';
import { catalogProductFromPick, finishAreasByProduct, surfaceOfCategory } from '@/lib/calculator/placement';
import type { SelectedProduct } from '@/lib/calculator/types';
import type { SurfaceFinish } from '@/lib/design/types';

const pick = (over: Partial<SelectedProduct> = {}): SelectedProduct => ({
  productId: 7,
  nameKa: 'ლამინატი',
  pricePerUnit: 40,
  unit: 'm2',
  qty: 0,
  totalPrice: 0,
  imageUrl: null,
  categorySlug: 'laminate',
  surface: 'floor',
  ...over,
});

describe('cart keys', () => {
  it('carry the product, so several finishes of one kind can be in the cart', () => {
    expect(cartKey('laminate', 7)).toBe('laminate_item:7');
    expect(isCartKey('laminate_item:7')).toBe(true);
    expect(isCartKey('laminate_global')).toBe(false);
    expect(isCartKey('laminate_room:r1')).toBe(false);
    expect(categorySlugFromKey('laminate_item:7')).toBe('laminate');
    expect(roomIdFromKey('laminate_item:7')).toBeNull();
  });
});

describe('finishPickQuantity', () => {
  it('buys a tile by the square metre with a tenth of cutting waste, and nothing for nothing laid', () => {
    expect(finishPickQuantity(pick(), 20)).toBe(22);
    expect(finishPickQuantity(pick({ categorySlug: 'floor-tiles' }), 4)).toBe(4.4);
    expect(finishPickQuantity(pick(), 0)).toBe(0);
  });

  it('buys a paint in tins by its own coverage, rounded up', () => {
    expect(finishPickQuantity(pick({ unit: 'liter', categorySlug: 'paint', coveragePerUnit: 10 }), 25)).toBe(3);
    // Eight square metres a litre when the row says nothing.
    expect(finishPickQuantity(pick({ unit: 'liter', categorySlug: 'paint', coveragePerUnit: null }), 16)).toBe(2);
  });
});

describe('finishAreasByProduct', () => {
  it('adds up what each product covers — whole rooms, tiles and strips alike — and ignores the style defaults', () => {
    const product = (qty: number) => ({ productId: 7, nameKa: 'x', slug: 'x', brand: null, pricePerUnit: 40, unit: 'm2', qty, totalPrice: 40 * qty, imageUrl: null, colorHex: null, textureUrl: null, model3dUrl: null, categorySlug: 'laminate', store: null });
    const base = (roomId: string, surface: SurfaceFinish['surface'], qty: number): SurfaceFinish => ({ roomId, surface, colorHex: '#fff', textureUrl: null, textureScaleM: 1, product: product(qty) });
    const finishes: SurfaceFinish[] = [
      base('r1', 'floor', 12),
      { ...base('r2', 'floor', 2), cells: [[0, 0], [1, 0]] },
      { ...base('r2', 'wall', 2.8), wallIndex: 0, span: { from: 0, to: 1 } },
      { ...base('r3', 'floor', 9), product: null },
      { ...base('r3', 'skirting', 9) },
    ];
    expect(finishAreasByProduct(finishes).get(7)).toBe(16.8);
  });
});

describe('the cart pick as a catalogue product', () => {
  it('carries what the board needs to lay it', () => {
    const product = catalogProductFromPick(pick({ slug: 'lam', textureUrl: '/t.jpg', colorHex: '#abcdef', coveragePerUnit: null, specs: { textureScaleM: 0.5 } }));
    expect(product).toMatchObject({ id: 7, slug: 'lam', textureUrl: '/t.jpg', colorHex: '#abcdef', categorySlug: 'laminate', specs: { textureScaleM: 0.5 } });
  });

  it('knows which surface a category is laid on', () => {
    expect(surfaceOfCategory({ calculationType: 'per_m2_floor' })).toBe('floor');
    expect(surfaceOfCategory({ calculationType: 'per_m2_wall' })).toBe('wall');
    expect(surfaceOfCategory({ calculationType: 'per_piece' } as never)).toBeNull();
    expect(surfaceOfCategory(null)).toBeNull();
  });
});
