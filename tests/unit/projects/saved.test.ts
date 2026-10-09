import { describe, expect, it } from 'vitest';
import { calculatorProgress, picksFromScene, projectKind } from '@/lib/projects/saved';
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
    expect(projectKind({ plan: {}, selectedProducts: null, mode: 'full' })).toMatchObject({ hasCalculator: true, hasDesign: true });
    expect(projectKind({ plan: {}, selectedProducts: null, mode: 'design_only' })).toMatchObject({ hasCalculator: false, hasDesign: true });
    // Each half is done when its saved progress says so, and not before.
    expect(projectKind({ plan: {}, selectedProducts: {}, mode: 'full', calculatorEdits: { progress: { step: 6, calculated: true } }, scene: { progress: { step: 5, generated: true } } })).toMatchObject({ calculatorPending: false, designPending: false });
    expect(projectKind({ plan: {}, selectedProducts: {}, mode: 'full' })).toMatchObject({ calculatorPending: true, designPending: true });
    expect(projectKind({ plan: null, selectedProducts: {}, mode: 'full' })).toMatchObject({ hasCalculator: true, hasDesign: false });
  });
});

describe('calculatorProgress', () => {
  it('is what the save recorded, and not worked out when nothing was', () => {
    expect(calculatorProgress({ calculatorEdits: { progress: { step: 4, calculated: true, at: 3 } } })).toEqual({ step: 4, calculated: true, at: 3 });
    expect(calculatorProgress({ calculatorEdits: null })).toEqual({ step: 1, calculated: false });
  });
});

describe('picksFromScene', () => {
  it('turns placed items into room furniture and each room’s floor and walls into that room’s picks', () => {
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
        // A strip of paint says nothing about the room's walls.
        { roomId: 'r2', surface: 'wall', wallIndex: 0, span: { from: 0, to: 1 }, product: product(5, 'paint', 2) },
      ],
    } as unknown as DesignScene;
    const picks = picksFromScene(scene);
    expect(Object.keys(picks.selectedFurniture)).toEqual(['r1', 'r2']);
    expect(picks.selectedFurniture.r1.map((p) => p.productId)).toEqual([1]);
    // Keyed the way the catalogue step keys a room's floor and walls.
    expect(Object.keys(picks.selectedProducts)).toEqual(['laminate_room:r1', 'laminate_room:r2']);
    expect(picks.selectedProducts['laminate_room:r1']).toMatchObject({ productId: 3, categorySlug: 'laminate', roomId: 'r1', surface: 'floor' });
  });
});
