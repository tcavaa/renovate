import { describe, expect, it } from 'vitest';
import { KITCHEN_RATES, drawnModelUrl, isCustomKitchenItem, isKitchenMaterial, kitchenFacadeM2, kitchenMaterialCandidates, kitchenMaterialSignature, kitchenTotals, measureKitchenItem, measureKitchens, withKitchenMaterial, withKitchenMaterials } from '@/lib/design/kitchen';
import { isFurnitureProduct } from '@/lib/design/catalogBrowser';
import { candidatesFor } from '@/lib/design/matcher';
import { priceScene } from '@/lib/design/pricing';
import { tickFor } from '@/lib/design/ticks';
import type { CatalogProduct } from '@/lib/design/matcher';
import type { DesignScene, FloorPlan, PlacedItem, SceneProduct, SceneStore } from '@/lib/design/types';

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

describe('the kitchen maker’s materials', () => {
  const maker: SceneStore = { id: 9, nameKa: 'სამზარეულოს ავეჯი — ინდივიდუალური დამზადება', logoUrl: null, websiteUrl: null, phone: null, address: null, city: null, rating: null, deliveryDays: 21, deliveryFeeGel: 0 };
  const material = (id: number, price: number, styles: string[]): CatalogProduct =>
    ({ id, nameKa: `m${id}`, slug: `m${id}`, brand: null, categorySlug: 'kitchen-custom', pricePerUnit: price, unit: 'm2', imageUrl: null, colorHex: null, textureUrl: null, model3dKind: null, model3dUrl: null, widthCm: null, depthCm: null, heightCm: null, styleTags: styles, tags: [], isFeatured: false, specs: null, coveragePerUnit: null, store: maker }) as unknown as CatalogProduct;
  const catalog = [material(31, 650, ['scandinavian', 'industrial']), material(32, 850, ['modern', 'scandinavian']), material(33, 1150, ['vintage', 'modern']), { ...material(34, 10, ['modern']), categorySlug: 'sofas' } as CatalogProduct];
  const plan: FloorPlan = { rooms: [{ id: 'r1', type: 'kitchen', name: 'Kitchen', polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }], heightM: 2.7, areaM2: 12, perimeterM: 14, openings: [] }], metresPerPixel: null, bounds: { width: 4, depth: 3 }, source: 'manual', wallThicknessM: 0.12, walls: [] };

  it('lists only the maker’s materials, the style’s own first, then the cheapest', () => {
    expect(kitchenMaterialCandidates(catalog, 'modern').map((p) => p.id)).toEqual([32, 33, 31]);
    expect(kitchenMaterialCandidates(catalog, 'industrial').map((p) => p.id)).toEqual([31, 32, 33]);
  });

  it('buys a piece’s material by the façade it measures, and again when it is stretched', () => {
    const run = item();
    expect(kitchenFacadeM2(run)).toBeCloseTo(measureKitchenItem(run).totalM2, 6);
    const [made] = withKitchenMaterials([run], catalog, 'modern');
    expect(made.kitchenMaterial).toMatchObject({ productId: 32, pricePerUnit: 850, qty: kitchenFacadeM2(run) });
    // Nothing to do: the same array comes back.
    const once = [made];
    expect(withKitchenMaterials(once, catalog, 'modern')).toBe(once);
    const stretched = { ...made, size: { ...made.size, width: 4 } };
    const [again] = withKitchenMaterials([stretched], catalog, 'modern');
    expect(again.kitchenMaterial!.qty).toBeCloseTo(kitchenFacadeM2(stretched), 6);
    expect(kitchenMaterialSignature([again])).not.toBe(kitchenMaterialSignature([made]));
    // A kitchen bought off the shelf is not made in anything.
    expect(withKitchenMaterials([item({ custom: false })], catalog, 'modern')[0].kitchenMaterial).toBeUndefined();
    expect(withKitchenMaterial(made, null).kitchenMaterial).toBeUndefined();
  });

  it('counts only what the maker sells by the square metre as a material', () => {
    const perPiece = { ...material(35, 4200, ['modern']), unit: 'piece' } as CatalogProduct;
    expect(isKitchenMaterial(catalog[0])).toBe(true);
    expect(isKitchenMaterial(perPiece)).toBe(false);
    expect(kitchenMaterialCandidates([...catalog, perPiece], 'modern').map((p) => p.id)).not.toContain(35);
    // A snapshot that is not sold by the m² prices nothing: the kitchen is the estimate.
    const odd = { ...item(), kitchenMaterial: { ...withKitchenMaterial(item(), catalog[0]).kitchenMaterial!, unit: 'piece' } };
    const cost = priceScene(plan, { styleId: 'modern', mode: 'design_only', budgetGel: null, items: [odd], finishes: [] });
    expect(cost.lines.some((l) => l.key === 'kitchen_run_custom')).toBe(true);
    expect(cost.lines.some((l) => l.key === 'product-31')).toBe(false);
  });

  it('draws a kitchen as its material’s own model when it has one of the piece’s kind', () => {
    const runModel = { ...material(36, 900, ['modern']), model3dKind: 'kitchen_run', model3dUrl: '/uploads/models/veneer-run.glb' } as CatalogProduct;
    const anyModel = { ...material(37, 950, ['modern']), model3dUrl: '/uploads/models/veneer.glb' } as CatalogProduct;
    const run = item();
    const island = item({ id: 'k2', slot: 'kitchen_island', kind: 'kitchen_island', size: { width: 1.8, depth: 0.9, height: 0.94 } });
    expect(drawnModelUrl(run)).toBe('/models/k.glb');
    expect(drawnModelUrl(withKitchenMaterial(run, runModel))).toBe('/uploads/models/veneer-run.glb');
    // A run's model is not stretched over an island: the island keeps its own.
    expect(drawnModelUrl(withKitchenMaterial(island, runModel))).toBe('/models/k.glb');
    // A model with no kind is drawn for either.
    expect(drawnModelUrl(withKitchenMaterial(island, anyModel))).toBe('/uploads/models/veneer.glb');
    // Nor is a material ever a piece of furniture on the shelf or in the swaps, model or not.
    expect(isFurnitureProduct(runModel)).toBe(false);
    expect(candidatesFor('kitchen_run', [runModel], 'modern')).toHaveLength(0);
  });

  it('keeps a chosen material as the catalogue has it: a model uploaded since, a unit changed', () => {
    const chosen = withKitchenMaterials([item()], catalog, 'modern');
    expect(chosen[0].kitchenMaterial!.model3dUrl).toBeNull();
    // Admin uploads the MDF kitchen's model: the kitchen already made in MDF is drawn as it.
    const uploaded = catalog.map((p) => (p.id === 32 ? ({ ...p, model3dUrl: '/uploads/models/mdf.glb' } as CatalogProduct) : p));
    const redrawn = withKitchenMaterials(chosen, uploaded, 'modern');
    expect(drawnModelUrl(redrawn[0])).toBe('/uploads/models/mdf.glb');
    // Sold by the piece now: no longer a material, so the style's next one takes its place.
    const perPiece = catalog.map((p) => (p.id === 32 ? ({ ...p, unit: 'piece' } as CatalogProduct) : p));
    expect(withKitchenMaterials(chosen, perPiece, 'modern')[0].kitchenMaterial!.productId).toBe(33);
    // Gone from the catalogue altogether: kept as it was, for the save to decide.
    expect(withKitchenMaterials(chosen, catalog.filter((p) => p.id !== 32), 'modern')).toBe(chosen);
  });

  it('prices a kitchen in a material as the maker’s product, a real line their shop is sent', () => {
    const run = withKitchenMaterial(item(), catalog[1]);
    const scene: DesignScene = { styleId: 'modern', mode: 'design_only', budgetGel: null, items: [run], finishes: [] };
    const cost = priceScene(plan, scene);
    const measure = measureKitchenItem(run);
    expect(measure.totalGel).toBeCloseTo(measure.totalM2 * 850, 2);
    const line = cost.lines.find((l) => l.key === 'product-32')!;
    expect(line).toMatchObject({ section: 'furniture', bucket: 'furniture', unit: 'm2', unitPrice: 850, estimated: false, tick: tickFor.kitchen('k1'), item: 'სამზარეულოს ავეჯი — ინდივიდუალური დამზადება' });
    expect(line.qty).toBeCloseTo(measure.totalM2, 6);
    expect(line.total).toBeCloseTo(measure.totalGel, 2);
    expect(line.product?.store?.id).toBe(maker.id);
    expect(cost.lines.some((l) => l.key === 'kitchen_run_custom')).toBe(false);
    // The model placed is only what is drawn: its own price is in no line.
    expect(cost.lines.some((l) => l.key === 'product-7')).toBe(false);
    expect(cost.furnitureTotal).toBeCloseTo(measure.totalGel, 2);
  });
});
