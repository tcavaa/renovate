import { describe, expect, it } from 'vitest';
import { packCatalog, unpackCatalog, type DesignCatalogData } from '@/lib/design/catalogWire';
import type { CatalogProduct } from '@/lib/design/matcher';
import type { PartnerStore } from '@/hooks/useDesignCatalog';
import { EMPTY_SHELF } from '@/lib/design/shelf';

const BASE = 'https://example.supabase.co/storage/v1/object/public/uploads/';

const store: PartnerStore = {
  id: 3, nameKa: 'მაღაზია', nameEn: 'Store', nameRu: null, descriptionKa: 'long text only the list shows', logoUrl: `${BASE}logos/a.webp`,
  websiteUrl: null, phone: '555', address: null, city: 'Tbilisi', rating: 4.5, reviewCount: 10, deliveryDays: 3, deliveryFeeGel: 20,
};

function product(over: Partial<CatalogProduct>): CatalogProduct {
  return {
    id: 1, nameKa: 'სავარძელი', nameEn: 'Chair', nameRu: null, slug: 'chair', brand: null, categorySlug: 'chairs', categoryId: 7,
    pricePerUnit: 120, unit: 'piece', imageUrl: `${BASE}library/photos/chair.webp`, colorHex: null, textureUrl: null, model3dKind: 'chair',
    model3dUrl: `${BASE}library/models/chair.glb`, widthCm: 50, depthCm: 55, heightCm: 90, styleTags: ['modern'], tags: null, isFeatured: false,
    specs: { maps: { normal: `${BASE}textures/n.webp` }, note: '~ not a url' }, coveragePerUnit: null,
    store: { id: 3, nameKa: 'მაღაზია', nameEn: 'Store', nameRu: null, logoUrl: `${BASE}logos/a.webp`, websiteUrl: null, phone: '555', address: null, city: 'Tbilisi', rating: 4.5, deliveryDays: 3, deliveryFeeGel: 20 },
    ...over,
  };
}

const catalog: DesignCatalogData = {
  stores: [store],
  shelf: EMPTY_SHELF,
  products: [
    product({}),
    product({ id: 2, slug: 'own', store: null, own: true, pending: false, imageUrl: '/uploads/own.webp' }),
    // A store the list does not carry travels inline.
    product({ id: 3, slug: 'other', store: { ...product({}).store!, id: 9, nameKa: 'სხვა' } }),
  ],
};

describe('the design catalogue on the wire', () => {
  it('comes back exactly as the server built it', () => {
    const wire = JSON.parse(JSON.stringify(packCatalog(catalog, BASE)));
    expect(unpackCatalog(wire)).toEqual(catalog);
  });

  it('names a listed store by id, drops the storage prefix and leaves out empty fields', () => {
    const [first] = packCatalog(catalog, BASE).products;
    expect(first.storeId).toBe(3);
    expect(first.store).toBeUndefined();
    expect(first.model3dUrl).toBe('~library/models/chair.glb');
    expect('colorHex' in first).toBe(false);
    expect(JSON.stringify(packCatalog(catalog, BASE)).length).toBeLessThan(JSON.stringify(catalog).length * 0.7);
  });

  it('passes an unpacked catalogue through, and works without a base', () => {
    expect(unpackCatalog(catalog)).toBe(catalog);
    expect(unpackCatalog(JSON.parse(JSON.stringify(packCatalog(catalog, null))))).toEqual(catalog);
  });
});
