import { describe, expect, it } from 'vitest';
import { browseFinishes, finishOptions, finishUnitPrice, hasFinishFilters, initialFinishBrowserState, narrowFinishShelf, type FinishBrowserState, type FinishSurface } from '@/lib/design/finishBrowser';
import { shelfIndex, type ShelfCategory } from '@/lib/design/shelf';
import type { CatalogProduct } from '@/lib/design/matcher';
import type { PlanRoom, SceneStore, StyleId } from '@/lib/design/types';

/** Materials › Laminate › Oak laminate, Materials › Floor tiles, Wall tiles, Paint, Skirting. */
const cat = (id: number, parentId: number | null, nameEn: string, slug: string): ShelfCategory => ({ id, parentId, slug, nameKa: nameEn, nameEn, nameRu: null, icon: null, sortOrder: id });
const TREE = shelfIndex({
  rooms: [],
  categories: [cat(1, null, 'Materials', 'materials'), cat(2, 1, 'Laminate', 'laminate'), cat(3, 2, 'Oak laminate', 'oak-laminate'), cat(4, 1, 'Floor tiles', 'floor-tiles'), cat(5, 1, 'Wall tiles', 'wall-tiles'), cat(6, 1, 'Paint', 'paint'), cat(7, 1, 'Skirting', 'skirting'), cat(8, null, 'Furniture', 'furniture')],
}).tree;

const store = (id: number, nameKa: string): SceneStore => ({ id, nameKa, nameEn: nameKa, nameRu: null, logoUrl: null, websiteUrl: null, phone: null, address: null, city: null, rating: null, deliveryDays: 3, deliveryFeeGel: null });
const DOMUS = store(1, 'Domus');
const NORDIC = store(2, 'Nordic');

function product(id: number, over: Partial<CatalogProduct>): CatalogProduct {
  return {
    id,
    nameKa: `მასალა ${id}`,
    nameEn: `Finish ${id}`,
    nameRu: null,
    slug: `finish-${id}`,
    brand: null,
    categorySlug: 'laminate',
    categoryId: 2,
    pricePerUnit: 20,
    unit: 'm2',
    imageUrl: null,
    colorHex: null,
    textureUrl: `/textures/finish-${id}.webp`,
    model3dKind: null,
    model3dUrl: null,
    widthCm: null,
    depthCm: null,
    heightCm: null,
    styleTags: ['modern'],
    tags: null,
    isFeatured: false,
    specs: { surfaces: ['floor'] },
    coveragePerUnit: null,
    store: DOMUS,
    ...over,
  };
}

const CATALOG: CatalogProduct[] = [
  product(1, { nameEn: 'Oak laminate', categoryId: 3, pricePerUnit: 22, styleTags: ['scandinavian'], specs: { surfaces: ['floor'], colors: ['#8B5A2B'] } }),
  product(2, { nameEn: 'Grey laminate', pricePerUnit: 28, styleTags: ['modern', 'industrial'], store: NORDIC, specs: { surfaces: ['floor'], colors: ['#9B9B9B'] } }),
  product(3, { nameEn: 'Porcelain tile', categorySlug: 'floor-tiles', categoryId: 4, pricePerUnit: 18, specs: { surfaces: ['floor', 'wall'], wet: true, colors: ['#E3D3B8'] } }),
  product(4, { nameEn: 'White wall tile', categorySlug: 'wall-tiles', categoryId: 5, pricePerUnit: 14, styleTags: ['scandinavian', 'modern'], store: NORDIC, specs: { surfaces: ['wall'], wet: true, colors: ['#FFFFFF'] } }),
  // Sold by the litre: 18 ₾ a litre over 8 m² is 2.25 ₾/m².
  product(5, { nameEn: 'White paint', categorySlug: 'paint', categoryId: 6, pricePerUnit: 18, unit: 'liter', coveragePerUnit: 8, store: null, styleTags: ['modern', 'scandinavian', 'industrial', 'vintage'], specs: { surfaces: ['wall'], colors: ['#F7F7F5'] } }),
  product(6, { nameEn: 'White skirting', categorySlug: 'skirting', categoryId: 7, pricePerUnit: 9, unit: 'linear_m', textureUrl: null, colorHex: '#F4F4F2', specs: { profile: 'flat', heightCm: 8, depthCm: 1.6 } }),
  // Neither is a finish: a sofa, and a texture that says nowhere it goes.
  product(7, { nameEn: 'Sofa', categorySlug: 'furniture', categoryId: 8, textureUrl: null, model3dKind: 'sofa_3seat', model3dUrl: '/models/sofa.glb', specs: null }),
  product(8, { nameEn: 'Loose texture', specs: {} }),
];

const BATHROOM = { id: 'b', type: 'bathroom' } as PlanRoom;
const state = (over: Partial<FinishBrowserState> = {}): FinishBrowserState => ({ ...initialFinishBrowserState(), ...over });
const browse = (surface: FinishSurface, over: Partial<FinishBrowserState> = {}, styleId: StyleId = 'modern', room: PlanRoom | null = null) => browseFinishes(CATALOG, state(over), { surface, room, styleId, locale: 'en', tree: TREE });
const ids = (list: CatalogProduct[]) => list.map((p) => p.id);

describe('the finishes a surface can be given', () => {
  it('ranks a dry room\'s floor dry first, then the style, then the price — and a bathroom\'s wet first', () => {
    expect(ids(finishOptions(CATALOG, 'floor', null, 'modern'))).toEqual([2, 1, 3]);
    expect(ids(finishOptions(CATALOG, 'floor', BATHROOM, 'modern'))).toEqual([3, 2, 1]);
    expect(ids(finishOptions(CATALOG, 'wall', null, 'modern'))).toEqual([5, 4, 3]);
    expect(ids(finishOptions(CATALOG, 'skirting', null, 'modern'))).toEqual([6]);
  });

  it('compares a floor or a wall by the square metre and a moulding by the metre', () => {
    expect(finishUnitPrice(CATALOG[4], 'wall')).toBe(2.25);
    expect(finishUnitPrice(CATALOG[5], 'skirting')).toBe(9);
  });
});

describe('the finishes tray\'s shelf', () => {
  const floor = finishOptions(CATALOG, 'floor', null, 'modern');

  it('narrows to the styles ticked, and counts the colours after the style', () => {
    const shelf = narrowFinishShelf(floor, ['scandinavian'], []);
    expect(ids(shelf.results)).toEqual([1]);
    expect(shelf.swatches.map((s) => [s.id, s.count])).toEqual([['brown', 1]]);
    expect(ids(narrowFinishShelf(floor, [], []).results)).toEqual([2, 1, 3]);
  });

  it('narrows to the colours ticked, and a colour the style has emptied stands aside', () => {
    expect(ids(narrowFinishShelf(floor, [], ['grey', 'beige']).results)).toEqual([2, 3]);
    const aside = narrowFinishShelf(floor, ['scandinavian'], ['grey']);
    expect(aside.wantedColors).toEqual([]);
    expect(ids(aside.results)).toEqual([1]);
  });
});

describe('the finishes catalogue', () => {
  it('lists the surface\'s finishes only, and counts every surface', () => {
    const b = browse('floor');
    expect(b.total).toBe(3);
    expect(ids(b.results)).toEqual([2, 1, 3]);
    expect(b.surfaces).toEqual([
      { id: 'floor', count: 3 },
      { id: 'wall', count: 3 },
      { id: 'skirting', count: 1 },
      { id: 'cornice', count: 0 },
    ]);
  });

  it('lists the categories the finishes are filed under, and a chosen one\'s subcategories', () => {
    expect(browse('floor').categories).toEqual([
      { id: 2, count: 2, depth: 0, opens: true },
      { id: 4, count: 1, depth: 0, opens: false },
    ]);
    const laminate = browse('floor', { category: 2 });
    expect(laminate.openCategory).toBe(2);
    expect(ids(laminate.results)).toEqual([2, 1]);
    expect(laminate.categories).toEqual([
      { id: 2, count: 2, depth: 0, opens: true },
      { id: 3, count: 1, depth: 1, opens: false },
      { id: 4, count: 1, depth: 0, opens: false },
    ]);
    expect(ids(browse('floor', { category: 3 }).results)).toEqual([1]);
    // A wall is tiled from the floor tiles too.
    expect(browse('wall').categories.map((c) => c.id)).toEqual([4, 5, 6]);
  });

  it('lets a category the rest of the filters emptied stand aside', () => {
    const b = browse('floor', { category: 3, query: 'grey' });
    expect(b.openCategory).toBe(2);
    expect(ids(b.results)).toEqual([2]);
  });

  it('finds by name, shop and category, in any language', () => {
    expect(ids(browse('floor', { query: 'floor tiles' }).results)).toEqual([3]);
    expect(ids(browse('wall', { query: 'nordic' }).results)).toEqual([4]);
    expect(browse('floor', { query: 'nothing like it' }).results).toEqual([]);
  });

  it('keeps to the finishes made for bathrooms when asked, counted before', () => {
    const b = browse('wall', { wet: true });
    expect(b.wetCount).toBe(2);
    expect(b.wetOn).toBe(true);
    expect(ids(b.results)).toEqual([4, 3]);
    // A moulding is never wet: the filter stands aside.
    const trims = browse('skirting', { wet: true });
    expect(trims.wetCount).toBe(0);
    expect(ids(trims.results)).toEqual([6]);
  });

  it('bands and sorts by the price per square metre', () => {
    const b = browse('wall', { priceMax: 5 });
    expect(ids(b.results)).toEqual([5]);
    expect(browse('wall').price).toEqual({ min: 2.25, max: 18 });
    expect(ids(browse('wall', { sort: 'priceAsc' }).results)).toEqual([5, 4, 3]);
    expect(ids(browse('wall', { sort: 'priceDesc' }).results)).toEqual([3, 4, 5]);
    expect(ids(browse('wall', { sort: 'name' }).results)).toEqual([3, 5, 4]);
  });

  it('filters by style, colour and shop, each counted before it narrows', () => {
    const styled = browse('floor', { styles: ['scandinavian'] });
    expect(ids(styled.results)).toEqual([1]);
    const coloured = browse('floor', { colors: ['grey'] });
    expect(ids(coloured.results)).toEqual([2]);
    expect(coloured.swatches.map((s) => s.id)).toEqual(['beige', 'grey', 'brown']);
    const shop = browse('floor', { storeId: NORDIC.id });
    expect(ids(shop.results)).toEqual([2]);
    expect(shop.stores.map((s) => [s.store.id, s.count])).toEqual([[1, 2], [2, 1]]);
    // A shop the style has emptied stands aside.
    expect(browse('floor', { storeId: NORDIC.id, styles: ['scandinavian'] }).storeId).toBeNull();
  });

  it('knows when anything narrows the list', () => {
    expect(hasFinishFilters(state())).toBe(false);
    expect(hasFinishFilters(state({ wet: true }))).toBe(true);
    expect(hasFinishFilters(state({ sort: 'priceAsc', selectedId: 3 }))).toBe(false);
  });
});
