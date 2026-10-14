/**
 * The design catalogue as it crosses the network (`/api/design/catalog` → `useDesignCatalog`).
 *
 * With the 3D library the catalogue is ~2 000 products, and as plain JSON 2.3 MB: a quarter of it
 * was every product repeating its whole store (11 stores, sent beside the products anyway), a
 * fifth the same storage origin at the head of every picture, model and texture URL, and much of
 * the rest `null`s. Packed, a product names its store by id, a storage URL drops the shared
 * prefix (`base`) for a leading `~`, and a field that is `null` is left out; `unpackCatalog`
 * puts all three back, so everything past the hook sees the catalogue exactly as the server built it.
 */

import type { CatalogProduct } from './matcher';
import type { SceneStore } from './types';
import type { ShelfData } from './shelf';
import type { PartnerStore } from '@/hooks/useDesignCatalog';

export interface DesignCatalogData {
  products: CatalogProduct[];
  stores: PartnerStore[];
  shelf: ShelfData;
}

/** A product on the wire: its store by id (or inline, for one not in the list), `null` fields left out. */
export type PackedProduct = Partial<Omit<CatalogProduct, 'store'>> & { storeId?: number; store?: SceneStore };

export interface PackedCatalog {
  packed: 1;
  /** The prefix a `~` at the head of a string stands for (the storage's public URL), or null. */
  base: string | null;
  products: PackedProduct[];
  stores: PartnerStore[];
  shelf: ShelfData;
}

/** Fields a product always has, `null` when empty: what an unpacked product gets back. */
const NULLABLE: ReadonlyArray<keyof CatalogProduct> = [
  'nameEn', 'nameRu', 'brand', 'categoryId', 'imageUrl', 'colorHex', 'textureUrl', 'model3dKind', 'model3dUrl',
  'widthCm', 'depthCm', 'heightCm', 'styleTags', 'tags', 'specs', 'coveragePerUnit', 'store',
];

const MARK = '~';

function mapStrings(value: unknown, fn: (s: string) => string): unknown {
  if (typeof value === 'string') return fn(value);
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, fn));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = mapStrings(v, fn);
    return out;
  }
  return value;
}

/** The store as a product carries it: the catalogue's store less what only the store list shows. */
function sceneStore(store: PartnerStore): SceneStore {
  return {
    id: store.id,
    nameKa: store.nameKa,
    nameEn: store.nameEn,
    nameRu: store.nameRu,
    logoUrl: store.logoUrl,
    websiteUrl: store.websiteUrl,
    phone: store.phone,
    address: store.address,
    city: store.city,
    rating: store.rating,
    deliveryDays: store.deliveryDays,
    deliveryFeeGel: store.deliveryFeeGel,
  };
}

const same = (a: SceneStore, b: SceneStore) => JSON.stringify(a) === JSON.stringify(b);

export function packCatalog(catalog: DesignCatalogData, base: string | null): PackedCatalog {
  const listed = new Map(catalog.stores.map((s) => [s.id, sceneStore(s)]));
  // A string of the data's own that starts with the mark gets a second one, which unpacking drops.
  const shorten = base ? (s: string) => (s.startsWith(base) ? MARK + s.slice(base.length) : s.startsWith(MARK) ? MARK + s : s) : (s: string) => s;
  const products = catalog.products.map((product) => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(product)) {
      if (value === null || value === undefined) continue;
      if (key === 'store') {
        const store = value as SceneStore;
        const inList = listed.get(store.id);
        if (inList && same(inList, store)) out.storeId = store.id;
        else out.store = store;
        continue;
      }
      out[key] = mapStrings(value, shorten);
    }
    return out as PackedProduct;
  });
  return { packed: 1, base, products, stores: catalog.stores, shelf: catalog.shelf };
}

/** The catalogue as `packCatalog` was given it; an unpacked one (an older server) passes through. */
export function unpackCatalog(data: PackedCatalog | DesignCatalogData): DesignCatalogData {
  if (!('packed' in data)) return data;
  const base = data.base;
  const expand = base ? (s: string) => (s.startsWith(MARK + MARK) ? s.slice(MARK.length) : s.startsWith(MARK) ? base + s.slice(MARK.length) : s) : (s: string) => s;
  const listed = new Map(data.stores.map((s) => [s.id, sceneStore(s)]));
  const products = data.products.map((packed) => {
    const { storeId, store, ...rest } = packed;
    const product = mapStrings(rest, expand) as Record<string, unknown>;
    for (const key of NULLABLE) if (!(key in product)) product[key] = null;
    product.store = store ?? (storeId != null ? listed.get(storeId) ?? null : null);
    return product as unknown as CatalogProduct;
  });
  return { products, stores: data.stores, shelf: data.shelf };
}
