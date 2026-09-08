import { describe, expect, it } from 'vitest';
import { picksFromScene, projectKind } from '@/lib/projects/saved';
import type { DesignScene, SceneProduct } from '@/lib/design/types';

const product = (id: number, categorySlug: string | null, qty = 1): SceneProduct => ({
  productId: id,
  nameKa: `p${id}`,
  slug: `p-${id}`,
  brand: null,
  pricePerUnit: 100,
  unit: 'piece',
  qty,
  totalPrice: 100 * qty,
  imageUrl: null,
  colorHex: null,
  textureUrl: null,
  model3dUrl: null,
  categorySlug,
  store: null,
});

describe('projectKind', () => {
  it('counts a renovation + design project as a calculation even without calculator picks', () => {
    expect(projectKind({ plan: {}, selectedProducts: null, mode: 'full' })).toEqual({ hasCalculator: true, hasDesign: true });
    expect(projectKind({ plan: {}, selectedProducts: null, mode: 'design_only' })).toEqual({ hasCalculator: false, hasDesign: true });
    expect(projectKind({ plan: null, selectedProducts: {}, mode: 'full' })).toEqual({ hasCalculator: true, hasDesign: false });
  });
});

describe('picksFromScene', () => {
  it('turns placed items into room furniture and the first finish per category into the material pick', () => {
    const scene = {
      items: [
        { roomId: 'r1', product: product(1, 'sofas') },
        { roomId: 'r1', product: null },
        { roomId: 'r2', product: product(2, 'beds') },
      ],
      finishes: [
        { roomId: 'r1', surface: 'floor', product: product(3, 'laminate', 20) },
        { roomId: 'r2', surface: 'floor', product: product(4, 'laminate', 12) },
        { roomId: 'r1', surface: 'wall', product: null },
      ],
    } as unknown as DesignScene;
    const picks = picksFromScene(scene);
    expect(Object.keys(picks.selectedFurniture)).toEqual(['r1', 'r2']);
    expect(picks.selectedFurniture.r1.map((p) => p.productId)).toEqual([1]);
    // Keyed the way the materials step keys its own choices.
    expect(Object.keys(picks.selectedProducts)).toEqual(['laminate_global']);
    expect(picks.selectedProducts.laminate_global.productId).toBe(3);
    expect(picks.selectedProducts.laminate_global.categorySlug).toBe('laminate');
  });
});
