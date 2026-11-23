import { describe, expect, it } from 'vitest';
import { isPlausibleForGeneration, KIND_BOUNDS, kindProblems } from '@/lib/design/plausibility';
import { candidatesFor, kindPool, type CatalogProduct } from '@/lib/design/matcher';
import { STYLE_IDS } from '@/lib/design/styles';
import { fixtureCatalog } from '../../helpers/generationFixtures';

const product = (kind: string, widthCm: number | null, depthCm: number | null, heightCm: number | null, nameEn = 'Product'): CatalogProduct =>
  ({ id: 1, nameKa: nameEn, nameEn, slug: 'p', categorySlug: 'c', pricePerUnit: 100, unit: 'piece', model3dKind: kind, model3dUrl: '/m.glb', widthCm, depthCm, heightCm, styleTags: ['modern'] }) as CatalogProduct;

describe('what a product of a kind can be (decision 9)', () => {
  it('refuses for generation what cannot be its kind', () => {
    // A table lamp filed as a floor lamp, and a real one.
    expect(isPlausibleForGeneration(product('floor_lamp', 30, 30, 45))).toBe(false);
    expect(isPlausibleForGeneration(product('floor_lamp', 50, 50, 160))).toBe(true);
    // A cabinet filed as a wardrobe, a 6.88 m "system", a wardrobe; a shallow wardrobe is one.
    expect(isPlausibleForGeneration(product('wardrobe', 120, 58, 135))).toBe(false);
    expect(isPlausibleForGeneration(product('wardrobe', 688, 49, 199))).toBe(false);
    expect(isPlausibleForGeneration(product('wardrobe', 100, 60, 210))).toBe(true);
    expect(isPlausibleForGeneration(product('wardrobe', 80, 38, 198))).toBe(true);
    // A door mat of 2 m; one of 80 cm.
    expect(isPlausibleForGeneration(product('door_mat', 203, 127, 1))).toBe(false);
    expect(isPlausibleForGeneration(product('door_mat', 80, 50, 1))).toBe(true);
    // An under-counter cooler is not the kitchen's fridge.
    expect(isPlausibleForGeneration(product('fridge', 61, 68, 87))).toBe(false);
    expect(isPlausibleForGeneration(product('fridge', 70, 70, 190))).toBe(true);
    // A vase hung as a print; a framed print.
    expect(isPlausibleForGeneration(product('artwork', 14, 14, 16))).toBe(false);
    expect(isPlausibleForGeneration(product('artwork', 60, 3, 80))).toBe(true);
    // A rug entered in the wrong unit.
    expect(isPlausibleForGeneration(product('rug', 964, 1208, 1))).toBe(false);
    // A kitchen run: an oven, tall units alone; a run, and a run with tall units.
    expect(isPlausibleForGeneration(product('kitchen_run', 60, 49, 60, 'Built-in stainless oven'))).toBe(false);
    expect(isPlausibleForGeneration(product('kitchen_run', 300, 63, 220, 'Grey kitchen tall units with built-in ovens'))).toBe(false);
    expect(isPlausibleForGeneration(product('kitchen_run', 300, 62, 220, 'Grey kitchen run with chimney hood'))).toBe(true);
    expect(isPlausibleForGeneration(product('kitchen_run', 480, 63, 224, 'Navarra kitchen run with tall units'))).toBe(true);
  });

  it('measures a table’s or a rug’s longer side, whichever way its width and depth were entered', () => {
    expect(kindProblems(product('door_mat', 50, 130, 1)).refused).toEqual(['longer side 1.30 m, over 1.2 m']);
    expect(kindProblems(product('dining_table', 90, 220, 77)).listed).toEqual([]);
  });

  it('only lists what refusing would cost rooms their piece — and refuses nothing of a kind with no bounds', () => {
    // A small dining table, a tiny pendant, a tall wine cooler: listed for the team, still generated.
    for (const p of [product('dining_table', 80, 80, 75), product('pendant', 4, 4, 30), product('fridge', 63, 67, 161, 'Tall glass-door wine cooler')]) {
      expect(isPlausibleForGeneration(p), p.model3dKind!).toBe(true);
      expect(kindProblems(p).listed.length, p.model3dKind!).toBeGreaterThan(0);
    }
    expect(kindProblems(product('fridge', 63, 67, 161, 'Tall glass-door wine cooler')).listed).toEqual(['its name says another kind']);
    expect(isPlausibleForGeneration(product('sofa_3seat', 10, 10, 10))).toBe(true);
    // A size not given fails nothing.
    expect(isPlausibleForGeneration(product('wardrobe', null, null, null))).toBe(true);
  });

  it('keeps products of every bounded kind for every style in the real catalogue, and leaves them in the swap list', () => {
    const catalog = fixtureCatalog();
    for (const kind of Object.keys(KIND_BOUNDS)) {
      const all = candidatesFor(kind, catalog, 'modern');
      if (all.length === 0) continue;
      for (const styleId of STYLE_IDS) expect(kindPool(kind, catalog, styleId).first.length, `${kind} ${styleId}`).toBeGreaterThan(0);
      // Generation's pool holds only what can be the kind; the swap list (`candidatesFor`) everything.
      expect(kindPool(kind, catalog, 'modern').first.every(isPlausibleForGeneration), kind).toBe(true);
    }
    expect(candidatesFor('door_mat', catalog, 'modern').some((p) => !isPlausibleForGeneration(p))).toBe(true);
  });
});
