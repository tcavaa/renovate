import { revalidateTag, unstable_cache } from 'next/cache';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { categories, products, stores } from '@/lib/db/schema';
import { DESIGN_CATEGORY_SLUGS } from '@/lib/design/catalog';
import { SURFACE_CATEGORY_SLUGS } from '@/lib/design/surfaces';
import type { CatalogProduct } from '@/lib/design/matcher';
import type { PartnerStore } from '@/hooks/useDesignCatalog';

export interface DesignCatalog {
  products: CatalogProduct[];
  stores: PartnerStore[];
}

/**
 * Cache tag for the design catalogue. Admin writes to products, stores or categories call
 * `invalidateDesignCatalog()`, so the studio never sees a stale price for longer than one
 * request; the time-based revalidation below is only a safety net for writes that bypass
 * the API (seed scripts).
 */
export const DESIGN_CATALOG_TAG = 'design-catalog';

/**
 * The whole design catalogue — ~200 products with their stores — assembled once and served
 * from the server cache. Every studio visit used to run the three queries below.
 */
export const getDesignCatalog = unstable_cache(loadDesignCatalog, [DESIGN_CATALOG_TAG], {
  tags: [DESIGN_CATALOG_TAG],
  revalidate: 300,
});

export function invalidateDesignCatalog(): void {
  revalidateTag(DESIGN_CATALOG_TAG, 'max');
}

async function loadDesignCatalog(): Promise<DesignCatalog> {
  const designCategories = await db
    .select()
    .from(categories)
    .where(inArray(categories.slug, [...DESIGN_CATEGORY_SLUGS, ...SURFACE_CATEGORY_SLUGS]));

  if (designCategories.length === 0) return { products: [], stores: [] };

  const categorySlugById = new Map(designCategories.map((c) => [c.id, c.slug]));

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
        inArray(
          products.categoryId,
          designCategories.map((c) => c.id)
        )
      )
    );

  const items: CatalogProduct[] = rows.map(({ product, store }) => ({
    id: product.id,
    nameKa: product.nameKa,
    nameEn: product.nameEn,
    nameRu: product.nameRu,
    slug: product.slug,
    brand: product.brand,
    categorySlug: categorySlugById.get(product.categoryId) ?? '',
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
  }));

  const partnerStores = await db.select().from(stores).where(eq(stores.isActive, true));

  return {
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
