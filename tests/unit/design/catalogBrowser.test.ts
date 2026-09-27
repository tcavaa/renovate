import { describe, expect, it } from 'vitest';
import { browseCatalog, hasCatalogFilters, initialCatalogBrowserState, isFurnitureProduct, type CatalogBrowserState } from '@/lib/design/catalogBrowser';
import { archetypeLabel } from '@/lib/design/catalog';
import { RADIATOR_PRODUCT_KIND } from '@/lib/design/radiators';
import { shelfIndex, type ShelfCategory, type ShelfData } from '@/lib/design/shelf';
import type { CatalogProduct } from '@/lib/design/matcher';
import type { SceneStore } from '@/lib/design/types';

/** Furniture › Sofas › (Three-seat, Corner), Furniture › Beds, and a category no room lists. */
const cat = (id: number, parentId: number | null, nameEn: string): ShelfCategory => ({ id, parentId, slug: nameEn.toLowerCase().replace(/ /g, '-'), nameKa: nameEn, nameEn, nameRu: null, icon: null, sortOrder: id });
const SHELF: ShelfData = {
  categories: [cat(1, null, 'Furniture'), cat(2, 1, 'Sofas'), cat(3, 2, 'Three-seat sofas'), cat(4, 2, 'Corner sofas'), cat(5, 1, 'Beds'), cat(6, null, 'Odds')],
  rooms: [
    { id: 100, slug: 'living', nameKa: 'Living', nameEn: 'Living', nameRu: null, icon: null, roomTypes: ['living_room'], categoryIds: [2] },
    { id: 200, slug: 'bedroom', nameKa: 'Bedroom', nameEn: 'Bedroom', nameRu: null, icon: null, roomTypes: ['bedroom'], categoryIds: [5] },
  ],
};
const shelf = shelfIndex(SHELF);

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
    categoryId: 3,
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
  product(2, { nameEn: 'Velvet sofa', pricePerUnit: 1500, colorHex: '#C8372D', styleTags: ['vintage'], store: NORDIC, model3dKind: 'sofa_corner', categoryId: 4 }),
  product(3, { nameEn: 'Oak bed', model3dKind: 'bed_double', pricePerUnit: 700, colorHex: '#E3D3B8', styleTags: ['scandinavian'], categoryId: 5 }),
  product(4, { nameEn: 'Black bed', model3dKind: 'bed_double', pricePerUnit: 1200, colorHex: '#1F1F1F', styleTags: ['industrial'], store: NORDIC, categoryId: 5 }),
  product(5, { nameEn: 'Mystery piece', model3dKind: 'mystery_kind', pricePerUnit: 50, store: null, categoryId: 6 }),
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
    const b = browseCatalog(CATALOG, state(), { focusRoom: null, locale: 'ka', shelf });
    expect(b.total).toBe(5);
    expect(ids(b.results)).toEqual([5, 3, 1, 4, 2]);
  });

  it('opens on the room admin made for the type in focus until a room is chosen, and "all rooms" overrides it', () => {
    const followed = browseCatalog(CATALOG, state(), { focusRoom: 'bedroom', locale: 'ka', shelf });
    expect(followed.openRoom).toBe(200);
    expect(ids(followed.results)).toEqual([3, 4]);
    expect(followed.categories).toEqual([{ id: 5, count: 2, depth: 0, opens: false }]);
    const all = browseCatalog(CATALOG, state({ room: null }), { focusRoom: 'bedroom', locale: 'ka', shelf });
    expect(all.openRoom).toBeNull();
    expect(all.results).toHaveLength(5);
    // A plan room type no studio room is for opens nothing.
    expect(browseCatalog(CATALOG, state(), { focusRoom: 'kitchen', locale: 'ka', shelf }).openRoom).toBeNull();
  });

  it('counts each room before the room narrows the list, and keeps what no room lists under "other"', () => {
    const b = browseCatalog(CATALOG, state(), { focusRoom: null, locale: 'ka', shelf });
    expect(b.all).toBe(5);
    expect(b.rooms).toEqual([
      { id: 100, count: 2 },
      { id: 200, count: 2 },
      { id: 'other', count: 1 },
    ]);
    const other = browseCatalog(CATALOG, state({ room: 'other' }), { focusRoom: null, locale: 'ka', shelf });
    expect(ids(other.results)).toEqual([5]);
    expect(other.categories.map((c) => c.id)).toEqual([6]);
  });

  it('lists a room\'s categories, and a chosen one opens onto its subcategories', () => {
    const room = browseCatalog(CATALOG, state({ room: 100 }), { focusRoom: null, locale: 'ka', shelf });
    expect(room.categories).toEqual([{ id: 2, count: 2, depth: 0, opens: true }]);
    const sofas = browseCatalog(CATALOG, state({ room: 100, category: 2 }), { focusRoom: null, locale: 'ka', shelf });
    expect(sofas.categories).toEqual([
      { id: 2, count: 2, depth: 0, opens: true },
      { id: 3, count: 1, depth: 1, opens: false },
      { id: 4, count: 1, depth: 1, opens: false },
    ]);
    expect(ids(sofas.results)).toEqual([1, 2]);
    const corner = browseCatalog(CATALOG, state({ room: 100, category: 4 }), { focusRoom: null, locale: 'ka', shelf });
    expect(corner.openCategory).toBe(4);
    expect(ids(corner.results)).toEqual([2]);
    // A category left over from another room stands aside.
    const stray = browseCatalog(CATALOG, state({ room: 100, category: 5 }), { focusRoom: null, locale: 'ka', shelf });
    expect(stray.openCategory).toBeNull();
    expect(ids(stray.results)).toEqual([1, 2]);
  });

  it('searches names, shops and the kind in any language', () => {
    expect(ids(browseCatalog(CATALOG, state({ query: 'velvet' }), { focusRoom: null, locale: 'ka', shelf }).results)).toEqual([2]);
    expect(ids(browseCatalog(CATALOG, state({ query: 'nordic' }), { focusRoom: null, locale: 'ka', shelf }).results)).toEqual([4, 2]);
    const kindLabel = archetypeLabel('bed_double', 'en').toLowerCase();
    expect(ids(browseCatalog(CATALOG, state({ query: kindLabel }), { focusRoom: null, locale: 'ka', shelf }).results)).toEqual([3, 4]);
    // …and the product's categories: "corner" finds what is filed under "Corner sofas".
    expect(ids(browseCatalog(CATALOG, state({ query: 'corner' }), { focusRoom: null, locale: 'ka', shelf }).results)).toEqual([2]);
  });

  it('narrows by style, price band and shop, and a shop that the rest of the filters emptied stands aside', () => {
    expect(ids(browseCatalog(CATALOG, state({ styles: ['scandinavian'] }), { focusRoom: null, locale: 'ka', shelf }).results)).toEqual([3, 1]);
    expect(ids(browseCatalog(CATALOG, state({ priceMin: 800, priceMax: 1300 }), { focusRoom: null, locale: 'ka', shelf }).results)).toEqual([1, 4]);
    const nordic = browseCatalog(CATALOG, state({ storeId: 2 }), { focusRoom: null, locale: 'ka', shelf });
    expect(ids(nordic.results)).toEqual([4, 2]);
    expect(nordic.stores.map((s) => [s.store.id, s.count])).toEqual([
      [1, 2],
      [2, 2],
    ]);
    // Nordic sells nothing scandinavian: the shop filter stands aside rather than emptying the list.
    const aside = browseCatalog(CATALOG, state({ storeId: 2, styles: ['scandinavian'] }), { focusRoom: null, locale: 'ka', shelf });
    expect(aside.storeId).toBeNull();
    expect(ids(aside.results)).toEqual([3, 1]);
  });

  it('offers the colours on the list as it stands, and a colour the list has none of stands aside', () => {
    const b = browseCatalog(CATALOG, state({ colors: ['red'] }), { focusRoom: 'living_room', locale: 'ka', shelf });
    expect(b.swatches.map((s) => [s.id, s.count])).toEqual([
      ['brown', 1],
      ['red', 1],
    ]);
    expect(ids(b.results)).toEqual([2]);
    const bedroom = browseCatalog(CATALOG, state({ colors: ['red'] }), { focusRoom: 'bedroom', locale: 'ka', shelf });
    expect(bedroom.wantedColors).toEqual([]);
    expect(ids(bedroom.results)).toEqual([3, 4]);
  });

  it('sorts by price either way or by name', () => {
    expect(ids(browseCatalog(CATALOG, state({ sort: 'priceDesc' }), { focusRoom: null, locale: 'ka', shelf }).results)).toEqual([2, 4, 1, 3, 5]);
    expect(ids(browseCatalog(CATALOG, state({ sort: 'name' }), { focusRoom: null, locale: 'en', shelf }).results)).toEqual([4, 1, 5, 3, 2]);
  });

  it('knows when nothing narrows the list', () => {
    expect(hasCatalogFilters(state())).toBe(false);
    expect(hasCatalogFilters(state({ room: null }))).toBe(true);
    expect(hasCatalogFilters(state({ query: ' ' }))).toBe(false);
    expect(hasCatalogFilters(state({ priceMax: 500 }))).toBe(true);
    expect(hasCatalogFilters(state({ category: 2 }))).toBe(true);
  });
});

describe('a person’s own pieces', () => {
  const withOwn: CatalogProduct[] = [
    ...CATALOG,
    product(20, { nameEn: 'My dresser', model3dKind: 'dresser', pricePerUnit: 0, store: null, own: true, pending: false, categoryId: 5 }),
    product(21, { nameEn: 'My armchair (photo)', model3dKind: 'armchair', pricePerUnit: 0, store: null, model3dUrl: null, own: true, pending: true, categoryId: 3 }),
  ];

  it('lists them with the rest, a photo waiting for its model included, and can narrow to them alone', () => {
    const all = browseCatalog(withOwn, state(), { focusRoom: null, locale: 'ka', shelf });
    expect(all.total).toBe(7);
    expect(all.ownCount).toBe(2);
    expect(ids(all.results)).toContain(21);
    const mine = browseCatalog(withOwn, state({ mine: true }), { focusRoom: null, locale: 'ka', shelf });
    expect(ids(mine.results).sort()).toEqual([20, 21]);
    expect(hasCatalogFilters(state({ mine: true }))).toBe(true);
  });
});
