import { revalidateTag, unstable_cache } from 'next/cache';
import { and, desc, eq, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { products, stores, type Category } from '@/lib/db/schema';
import { DESIGN_CATEGORY_SLUGS, KITCHEN_MATERIAL_CATEGORY } from '@/lib/design/catalog';
import { SURFACE_CATEGORY_SLUGS } from '@/lib/design/surfaces';
import type { CatalogProduct } from '@/lib/design/matcher';
import type { ShelfData } from '@/lib/design/shelf';
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
 * request; the time-based revalidation below is only a safety net for writes that bypass
 * the API (seed scripts).
 */
export const DESIGN_CATALOG_TAG = 'design-catalog';

/**
 * The whole design catalogue — ~200 products with their stores and the shelf — assembled once
 * and served from the server cache. Every studio visit used to run the queries below.
 */
export const getDesignCatalog = unstable_cache(loadDesignCatalog, [DESIGN_CATALOG_TAG], {
  tags: [DESIGN_CATALOG_TAG],
  revalidate: 300,
});

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
