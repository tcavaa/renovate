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
    // Nothing recorded about their progress: both done.
    expect(projectKind({ plan: {}, selectedProducts: {}, mode: 'full' })).toMatchObject({ calculatorPending: false, designPending: false });
    expect(projectKind({ plan: null, selectedProducts: {}, mode: 'full' })).toMatchObject({ hasCalculator: true, hasDesign: false });
  });
});

describe('calculatorProgress', () => {
  it('reads progress recorded in the seven steps the calculator had before the placement went into the catalogue', () => {
    const edits = (progress: object) => ({ calculatorEdits: { progress }, status: 'draft' as const, selectedProducts: {}, selectedFurniture: {} });
    // The old summary (7), left on the placement (5): the summary is 6 now, the placement the catalogue.
    expect(calculatorProgress(edits({ step: 7, calculated: true, at: 5 }))).toMatchObject({ step: 6, at: 4, steps: 6 });
    expect(calculatorProgress(edits({ step: 6, calculated: true, at: 6 }))).toMatchObject({ step: 5, at: 5 });
    expect(calculatorProgress(edits({ step: 2, calculated: false, at: 1 }))).toMatchObject({ step: 2, at: 1 });
    // Recorded in the six steps: read as it is.
    expect(calculatorProgress(edits({ step: 6, calculated: true, at: 5, steps: 6 }))).toEqual({ step: 6, calculated: true, at: 5, steps: 6 });
    // Nothing recorded, and saved: finished, on the summary.
    expect(calculatorProgress({ calculatorEdits: null, status: 'saved', selectedProducts: {}, selectedFurniture: {} })).toEqual({ step: 6, calculated: true });
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
