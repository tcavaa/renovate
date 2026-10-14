import { revalidateTag, unstable_cache } from 'next/cache';
import { and, eq, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import { desc } from '@/lib/db/order';
import { db } from '@/lib/db';
import { products, stores, type Category } from '@/lib/db/schema';
import { DESIGN_CATEGORY_SLUGS, KITCHEN_MATERIAL_CATEGORY } from '@/lib/design/catalog';
import { SURFACE_CATEGORY_SLUGS } from '@/lib/design/surfaces';
import type { CatalogProduct } from '@/lib/design/matcher';
import { EMPTY_SHELF, type ShelfData } from '@/lib/design/shelf';
import { nearestSlug, subtreeOfSlugs, type CategoryTree } from '@/lib/catalog/tree';
import { loadCategoryTree, loadShelf } from '@/lib/catalog/queries';
import type { PartnerStore } from '@/hooks/useDesignCatalog';

export interface DesignCatalog {
  products: CatalogProduct[];
  stores: PartnerStore[];
  /** The furniture shelf's rooms and the category tree (`lib/design/shelf.ts`). */
  shelf: ShelfData;
}

/** The categories the studio's code names: its furniture, fittings, openings, radiators, mouldings, finishes and the kitchen maker's materials. */
const KNOWN_SLUGS: ReadonlySet<string> = new Set([...DESIGN_CATEGORY_SLUGS, ...SURFACE_CATEGORY_SLUGS, KITCHEN_MATERIAL_CATEGORY]);

/**
 * Cache tag for the design catalogue. Admin writes to products, stores, categories or the studio's rooms call
 * `invalidateDesignCatalog()`, so the studio never sees a stale price for longer than one
 * request; the daily expiry below is only a safety net for writes that bypass the API (seed
 * scripts run from a laptop — those reach the studio within a day or at the next admin edit).
 */
export const DESIGN_CATALOG_TAG = 'design-catalog';

/**
 * The whole design catalogue — ~200 products with their stores and the shelf — assembled once
 * and served from the server cache. Every studio visit used to run the queries below.
 */
export async function getDesignCatalog(): Promise<DesignCatalog> {
  const first = await cachedPart(0);
  const rest = await Promise.all(Array.from({ length: first.parts - 1 }, (_, i) => cachedPart(i + 1)));
  // Parts revalidate one by one, so for a moment two may come from different loads: no product twice.
  const seen = new Set<number>();
  const products = [first, ...rest].flatMap((p) => p.products).filter((p) => !seen.has(p.id) && seen.add(p.id));
  return { stores: first.stores, shelf: first.shelf, products };
}

/**
 * Products per cached part. Next's data cache refuses an entry over 2 MB, and the whole
 * catalogue passed that with the 3D library (~1.2 KB a product, its files' long storage URLs) —
 * the refusal kept serving the last copy that fitted. Part 0 also carries the stores and the shelf.
 */
const PRODUCTS_PER_PART = 600;

const cachedPart = unstable_cache(
  async (part: number): Promise<DesignCatalog & { parts: number }> => {
    const catalog = await loadShared();
    const parts = Math.max(1, Math.ceil(catalog.products.length / PRODUCTS_PER_PART));
    const products = catalog.products.slice(part * PRODUCTS_PER_PART, (part + 1) * PRODUCTS_PER_PART);
    return part === 0 ? { ...catalog, products, parts } : { products, stores: [], shelf: EMPTY_SHELF, parts };
  },
  // Per deployment: a deploy runs `models:seed`, and Vercel's data cache outlives deployments.
  [DESIGN_CATALOG_TAG, 'parts', process.env.VERCEL_DEPLOYMENT_ID ?? ''],
  // A day: admin writes invalidate the tag at once, so expiry only catches writes that bypass the
  // API (a script run from a laptop). Every rebuild reads ~2–3 MB of rows from Supabase, which
  // counts against its monthly egress — every 5 minutes, that alone came to gigabytes.
  { tags: [DESIGN_CATALOG_TAG], revalidate: 86_400 },
);

/** One load for the parts that miss together on this instance, instead of one per part. */
let shared: { at: number; load: Promise<DesignCatalog> } | null = null;
function loadShared(): Promise<DesignCatalog> {
  if (!shared || Date.now() - shared.at > 10_000) {
    const load = loadDesignCatalog().catch((err: unknown) => {
      shared = null;
      throw err;
    });
    shared = { at: Date.now(), load };
  }
  return shared.load;
}

export function invalidateDesignCatalog(): void {
  revalidateTag(DESIGN_CATALOG_TAG, 'max');
}

/**
 * What the studio can use: every product with a 3D kind (furniture, fittings, doors, radiators,
 * the technical points' equipment — wherever admin filed it), and everything under the
 * categories its code names (the finishes, the mouldings and the kitchen maker's materials,
 * which have no kind). Each product carries its own category, for the
 * shelf's rooms, and the category the code knows it by (`nearestSlug`).
 */
async function loadDesignCatalog(): Promise<DesignCatalog> {
  const tree = await loadCategoryTree();
  const known = [...subtreeOfSlugs(tree, KNOWN_SLUGS)];

  const rows = await db
    .select({ product: products, store: stores })
    .from(products)
    .leftJoin(stores, eq(products.storeId, stores.id))
    .where(
      and(
        eq(products.isActive, true),
        // A store that registered itself is inactive until admin approves it; its products
        // stay out of the studio until then, whatever their own flag says.
        or(isNull(products.storeId), eq(stores.isActive, true)),
        // A person's own uploads are theirs alone: `loadOwnProducts` adds them for their owner.
        isNull(products.ownerUserId),
        known.length ? or(isNotNull(products.model3dKind), inArray(products.categoryId, known)) : isNotNull(products.model3dKind)
      )
    );

  const items: CatalogProduct[] = rows.map(({ product, store }) => mapProduct(product, store, tree));

  const [partnerStores, shelf] = await Promise.all([db.select().from(stores).where(eq(stores.isActive, true)), loadShelf(tree)]);

  return {
    shelf,
    products: items,
    stores: partnerStores.map((s) => ({
      id: s.id,
      nameKa: s.nameKa,
      nameEn: s.nameEn,
      nameRu: s.nameRu,
      descriptionKa: s.descriptionKa,
      logoUrl: s.logoUrl,
      websiteUrl: s.websiteUrl,
      phone: s.phone,
      address: s.address,
      city: s.city,
      rating: s.rating != null ? Number(s.rating) : null,
      reviewCount: s.reviewCount,
      deliveryDays: s.deliveryDays,
      deliveryFeeGel: s.deliveryFeeGel != null ? Number(s.deliveryFeeGel) : null,
    })),
  };
}

type ProductRow = typeof products.$inferSelect;
type StoreRow = typeof stores.$inferSelect;

/** A product row as the studio reads it. */
function mapProduct(product: ProductRow, store: StoreRow | null, tree: CategoryTree<Category>): CatalogProduct {
  return {
    id: product.id,
    nameKa: product.nameKa,
    nameEn: product.nameEn,
    nameRu: product.nameRu,
    slug: product.slug,
    brand: product.brand,
    // The category the studio's code knows it by: a toilet in "Toilets" is "sanitary" to it.
    categorySlug: nearestSlug(tree, product.categoryId, KNOWN_SLUGS) ?? tree.byId.get(product.categoryId)?.slug ?? '',
    categoryId: product.categoryId,
    pricePerUnit: Number(product.pricePerUnit),
    unit: product.unit,
    imageUrl: product.imageUrl,
    colorHex: product.colorHex,
    textureUrl: product.textureUrl,
    model3dKind: product.model3dKind,
    model3dUrl: product.model3dStatus === 'ready' ? product.model3dUrl : null,
    widthCm: product.widthCm,
    depthCm: product.depthCm,
    heightCm: product.heightCm,
    styleTags: product.styleTags,
    tags: product.tags,
    isFeatured: product.isFeatured,
    specs: product.specs ?? null,
    coveragePerUnit: product.coveragePerUnit ? Number(product.coveragePerUnit) : null,
    store: store
      ? {
          id: store.id,
          nameKa: store.nameKa,
          nameEn: store.nameEn,
          nameRu: store.nameRu,
          logoUrl: store.logoUrl,
          websiteUrl: store.websiteUrl,
          phone: store.phone,
          address: store.address,
          city: store.city,
          rating: store.rating != null ? Number(store.rating) : null,
          deliveryDays: store.deliveryDays,
          deliveryFeeGel: store.deliveryFeeGel != null ? Number(store.deliveryFeeGel) : null,
        }
      : null,
    ...(product.ownerUserId != null ? { own: true, pending: product.model3dStatus !== 'ready' } : {}),
  };
}

/**
 * A person's own uploads — a model of their own, or a photo waiting to become one — read
 * fresh every time (they are one person's, so nothing to share in a cache). The studio's
 * catalogue is the shared list plus these.
 */
export async function loadOwnProducts(userId: number): Promise<CatalogProduct[]> {
  const [rows, tree] = await Promise.all([
    db
      .select()
      .from(products)
      .where(and(eq(products.ownerUserId, userId), eq(products.isActive, true)))
      .orderBy(desc(products.id)),
    loadCategoryTree(),
  ]);
  return rows.map((product) => mapProduct(product, null, tree));
}
