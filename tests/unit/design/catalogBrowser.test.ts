import { describe, expect, it } from 'vitest';
import { browseCatalog, hasCatalogFilters, initialCatalogBrowserState, isFurnitureProduct, type CatalogBrowserState } from '@/lib/design/catalogBrowser';
import { archetypeLabel } from '@/lib/design/catalog';
import { RADIATOR_PRODUCT_KIND } from '@/lib/design/radiators';
import type { CatalogProduct } from '@/lib/design/matcher';
import type { SceneStore } from '@/lib/design/types';

const store = (id: number, nameKa: string): SceneStore => ({ id, nameKa, nameEn: nameKa, nameRu: null, logoUrl: null, websiteUrl: null, phone: null, address: null, city: null, rating: null, deliveryDays: 3, deliveryFeeGel: null });
const DOMUS = store(1, 'Domus');
const NORDIC = store(2, 'Nordic');

function product(id: number, over: Partial<CatalogProduct>): CatalogProduct {
  return {
    id,
    nameKa: `ნივთი ${id}`,
    nameEn: `Item ${id}`,
    nameRu: null,
    slug: `item-${id}`,
    brand: null,
    categorySlug: 'furniture',
    pricePerUnit: 100,
    unit: 'piece',
    imageUrl: null,
    colorHex: null,
    textureUrl: null,
    model3dKind: 'sofa_3seat',
    model3dUrl: '/models/x.glb',
    widthCm: 200,
    depthCm: 90,
    heightCm: 80,
    styleTags: ['modern'],
    tags: null,
    isFeatured: false,
    specs: null,
    coveragePerUnit: null,
    store: DOMUS,
    ...over,
  };
}

const CATALOG: CatalogProduct[] = [
  product(1, { nameEn: 'Lounge sofa', pricePerUnit: 900, colorHex: '#7A5230', styleTags: ['scandinavian'] }),
  product(2, { nameEn: 'Velvet sofa', pricePerUnit: 1500, colorHex: '#C8372D', styleTags: ['vintage'], store: NORDIC }),
  product(3, { nameEn: 'Oak bed', model3dKind: 'bed_double', pricePerUnit: 700, colorHex: '#E3D3B8', styleTags: ['scandinavian'] }),
  product(4, { nameEn: 'Black bed', model3dKind: 'bed_double', pricePerUnit: 1200, colorHex: '#1F1F1F', styleTags: ['industrial'], store: NORDIC }),
  product(5, { nameEn: 'Mystery piece', model3dKind: 'mystery_kind', pricePerUnit: 50, store: null }),
  // None of these is furniture, whatever their price.
  product(6, { nameEn: 'Socket', model3dKind: 'socket', pricePerUnit: 5 }),
  product(7, { nameEn: 'Door', model3dKind: 'door', pricePerUnit: 300 }),
  product(8, { nameEn: 'Radiator section', model3dKind: RADIATOR_PRODUCT_KIND, pricePerUnit: 40 }),
  product(9, { nameEn: 'No model', model3dUrl: null, pricePerUnit: 10 }),
];

const state = (over: Partial<CatalogBrowserState> = {}): CatalogBrowserState => ({ ...initialCatalogBrowserState(), ...over });
const ids = (list: CatalogProduct[]) => list.map((p) => p.id);

describe('the catalogue browser', () => {
  it('lists furniture only: no fittings, doors, radiators or products without a model', () => {
    expect(CATALOG.filter(isFurnitureProduct).map((p) => p.id)).toEqual([1, 2, 3, 4, 5]);
    const b = browseCatalog(CATALOG, state(), { focusRoom: null, locale: 'ka' });
    expect(b.total).toBe(5);
    expect(ids(b.results)).toEqual([5, 3, 1, 4, 2]);
  });

  it('opens on the room the studio has in focus until a room is chosen, and "all rooms" overrides it', () => {
    const followed = browseCatalog(CATALOG, state(), { focusRoom: 'bedroom', locale: 'ka' });
    expect(followed.openRoom).toBe('bedroom');
    expect(ids(followed.results)).toEqual([3, 4]);
    expect(followed.kinds).toEqual([{ id: 'bed_double', count: 2 }]);
    const all = browseCatalog(CATALOG, state({ room: null }), { focusRoom: 'bedroom', locale: 'ka' });
    expect(all.openRoom).toBeNull();
    expect(all.results).toHaveLength(5);
  });

  it('counts each room before the room narrows the list, and keeps the unknown kind under "other"', () => {
    const b = browseCatalog(CATALOG, state(), { focusRoom: null, locale: 'ka' });
    expect(b.all).toBe(5);
    expect(b.rooms.find((r) => r.id === 'living_room')?.count).toBe(2);
    expect(b.rooms.find((r) => r.id === 'bedroom')?.count).toBe(2);
    expect(b.rooms.find((r) => r.id === 'other')?.count).toBe(1);
    const other = browseCatalog(CATALOG, state({ room: 'other' }), { focusRoom: null, locale: 'ka' });
    expect(ids(other.results)).toEqual([5]);
  });

  it('searches names, shops and the kind in any language', () => {
    expect(ids(browseCatalog(CATALOG, state({ query: 'velvet' }), { focusRoom: null, locale: 'ka' }).results)).toEqual([2]);
    expect(ids(browseCatalog(CATALOG, state({ query: 'nordic' }), { focusRoom: null, locale: 'ka' }).results)).toEqual([4, 2]);
    const kindLabel = archetypeLabel('bed_double', 'en').toLowerCase();
    expect(ids(browseCatalog(CATALOG, state({ query: kindLabel }), { focusRoom: null, locale: 'ka' }).results)).toEqual([3, 4]);
  });

  it('narrows by style, price band and shop, and a shop that the rest of the filters emptied stands aside', () => {
    expect(ids(browseCatalog(CATALOG, state({ styles: ['scandinavian'] }), { focusRoom: null, locale: 'ka' }).results)).toEqual([3, 1]);
    expect(ids(browseCatalog(CATALOG, state({ priceMin: 800, priceMax: 1300 }), { focusRoom: null, locale: 'ka' }).results)).toEqual([1, 4]);
    const nordic = browseCatalog(CATALOG, state({ storeId: 2 }), { focusRoom: null, locale: 'ka' });
    expect(ids(nordic.results)).toEqual([4, 2]);
    expect(nordic.stores.map((s) => [s.store.id, s.count])).toEqual([
      [1, 2],
      [2, 2],
    ]);
    // Nordic sells nothing scandinavian: the shop filter stands aside rather than emptying the list.
    const aside = browseCatalog(CATALOG, state({ storeId: 2, styles: ['scandinavian'] }), { focusRoom: null, locale: 'ka' });
    expect(aside.storeId).toBeNull();
    expect(ids(aside.results)).toEqual([3, 1]);
  });

  it('offers the colours on the list as it stands, and a colour the list has none of stands aside', () => {
    const b = browseCatalog(CATALOG, state({ colors: ['red'] }), { focusRoom: 'living_room', locale: 'ka' });
    expect(b.swatches.map((s) => [s.id, s.count])).toEqual([
      ['brown', 1],
      ['red', 1],
    ]);
    expect(ids(b.results)).toEqual([2]);
    const bedroom = browseCatalog(CATALOG, state({ colors: ['red'] }), { focusRoom: 'bedroom', locale: 'ka' });
    expect(bedroom.wantedColors).toEqual([]);
    expect(ids(bedroom.results)).toEqual([3, 4]);
  });

  it('sorts by price either way or by name', () => {
    expect(ids(browseCatalog(CATALOG, state({ sort: 'priceDesc' }), { focusRoom: null, locale: 'ka' }).results)).toEqual([2, 4, 1, 3, 5]);
    expect(ids(browseCatalog(CATALOG, state({ sort: 'name' }), { focusRoom: null, locale: 'en' }).results)).toEqual([4, 1, 5, 3, 2]);
  });

  it('knows when nothing narrows the list', () => {
    expect(hasCatalogFilters(state())).toBe(false);
    expect(hasCatalogFilters(state({ room: null }))).toBe(true);
    expect(hasCatalogFilters(state({ query: ' ' }))).toBe(false);
    expect(hasCatalogFilters(state({ priceMax: 500 }))).toBe(true);
  });
});

describe('a person’s own pieces', () => {
  const withOwn: CatalogProduct[] = [
    ...CATALOG,
    product(20, { nameEn: 'My dresser', model3dKind: 'dresser', pricePerUnit: 0, store: null, own: true, pending: false }),
    product(21, { nameEn: 'My armchair (photo)', model3dKind: 'armchair', pricePerUnit: 0, store: null, model3dUrl: null, own: true, pending: true }),
  ];

  it('lists them with the rest, a photo waiting for its model included, and can narrow to them alone', () => {
    const all = browseCatalog(withOwn, state(), { focusRoom: null, locale: 'ka' });
    expect(all.total).toBe(7);
    expect(all.ownCount).toBe(2);
    expect(ids(all.results)).toContain(21);
    const mine = browseCatalog(withOwn, state({ mine: true }), { focusRoom: null, locale: 'ka' });
    expect(ids(mine.results).sort()).toEqual([20, 21]);
    expect(hasCatalogFilters(state({ mine: true }))).toBe(true);
  });
});
