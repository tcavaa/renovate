import { describe, expect, it } from 'vitest';
import { KITCHEN_RATES, isCustomKitchenItem, kitchenTotals, measureKitchenItem, measureKitchens } from '@/lib/design/kitchen';
import { priceScene } from '@/lib/design/pricing';
import type { DesignScene, FloorPlan, PlacedItem, SceneProduct } from '@/lib/design/types';

const product = (price: number): SceneProduct => ({ productId: 7, nameKa: 'kitchen', slug: 'k', brand: null, pricePerUnit: price, unit: 'piece', qty: 1, totalPrice: price, imageUrl: null, colorHex: null, textureUrl: null, model3dUrl: '/models/k.glb', categorySlug: 'kitchen-furniture', store: null });
const item = (over: Partial<PlacedItem> = {}): PlacedItem => ({ id: 'k1', roomId: 'r1', slot: 'kitchen_run', position: { x: 1, z: 1 }, elevationM: 0, rotation: 0, size: { width: 3, depth: 0.62, height: 0.92 }, kind: 'kitchen_run', product: product(1800), ...over });

describe('made-to-measure kitchens', () => {
  it('measures a run by its façade — the lower units, the upper ones and the worktop', () => {
    const measure = measureKitchenItem(item());
    expect(measure.lengthM).toBe(3);
    expect(measure.lowerM2).toBeCloseTo(3 * 0.9, 2);
    expect(measure.upperM2).toBeCloseTo(3 * 0.7 * 0.72, 2);
    expect(measure.worktopM).toBe(3);
    expect(measure.totalM2).toBeCloseTo(measure.lowerM2 + measure.upperM2, 6);
    expect(measure.totalGel).toBeCloseTo(measure.lowerM2 * KITCHEN_RATES.lowerPerM2 + measure.upperM2 * KITCHEN_RATES.upperPerM2 + 3 * KITCHEN_RATES.worktopPerM + 3 * KITCHEN_RATES.fittingPerM, 1);
  });

  it('works an island from both sides and hangs nothing above it', () => {
    const island = measureKitchenItem(item({ id: 'k2', slot: 'kitchen_island', kind: 'kitchen_island', size: { width: 1.8, depth: 0.9, height: 0.94 } }));
    expect(island.upperM2).toBe(0);
    expect(island.lowerM2).toBeCloseTo(1.8 * 0.9 * 2, 2);
  });

  it('leaves the rest of the furniture alone, and a kitchen the person buys off the shelf', () => {
    expect(isCustomKitchenItem(item())).toBe(true);
    expect(isCustomKitchenItem(item({ custom: false }))).toBe(false);
    expect(isCustomKitchenItem(item({ slot: 'sofa' }))).toBe(false);
    expect(measureKitchens([item(), item({ id: 's', slot: 'sofa' })])).toHaveLength(1);
    expect(kitchenTotals(measureKitchens([item(), item({ id: 'k2' })])).lengthM).toBe(6);
  });

  it('replaces the model’s price in the budget with the measurement, and says so', () => {
    const plan: FloorPlan = { rooms: [{ id: 'r1', type: 'kitchen', name: 'Kitchen', polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }], heightM: 2.7, areaM2: 12, perimeterM: 14, openings: [] }], metresPerPixel: null, bounds: { width: 4, depth: 3 }, source: 'manual', wallThicknessM: 0.12, walls: [] };
    const scene: DesignScene = { styleId: 'modern', mode: 'design_only', budgetGel: null, items: [item()], finishes: [] };
    const cost = priceScene(plan, scene);
    const line = cost.lines.find((l) => l.key === 'kitchen_run_custom');
    expect(line).toBeDefined();
    expect(line!.unit).toBe('m2');
    expect(line!.estimated).toBe(true);
    expect(cost.kitchens).toHaveLength(1);
    // The model's own 1800 ₾ is not in the total; the measurement is.
    expect(cost.furnitureTotal).toBeCloseTo(cost.kitchens[0].totalGel, 2);
    expect(cost.lines.some((l) => l.key === 'product-7')).toBe(false);

    // Off the shelf, it is an ordinary product again.
    const stock = priceScene(plan, { ...scene, items: [item({ custom: false })] });
    expect(stock.furnitureTotal).toBeCloseTo(1800, 2);
    expect(stock.kitchens).toHaveLength(0);
  });
});
