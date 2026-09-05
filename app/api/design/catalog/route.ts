import { NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { categories, products, stores } from '@/lib/db/schema';
import { DESIGN_CATEGORY_SLUGS } from '@/lib/design/catalog';
import { SURFACE_CATEGORY_SLUGS } from '@/lib/design/surfaces';
import type { CatalogProduct } from '@/lib/design/matcher';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The whole design catalogue in one response.
 *
 * The studio matches products to furniture slots on the client, so it needs the full set
 * rather than a page of it. That is a deliberate trade: it is a few dozen kilobytes, and in
 * exchange changing style, budget or an individual product is instant and needs no network.
 */
export async function GET() {
  try {
    const designCategories = await db
      .select()
      .from(categories)
      .where(inArray(categories.slug, [...DESIGN_CATEGORY_SLUGS, ...SURFACE_CATEGORY_SLUGS]));

    if (designCategories.length === 0) {
      return NextResponse.json({
        data: { products: [], stores: [] },
        error: null,
      });
    }

    const categoryNameById = new Map(designCategories.map((c) => [c.id, c.slug]));

    const rows = await db
      .select({
        product: products,
        store: stores,
      })
      .from(products)
      .leftJoin(stores, eq(products.storeId, stores.id))
      .where(
        and(
          eq(products.isActive, true),
          inArray(
            products.categoryId,
            designCategories.map((c) => c.id)
          )
        )
      );

    const items: CatalogProduct[] = rows.map(({ product, store }) => ({
      id: product.id,
      nameKa: product.nameKa,
      slug: product.slug,
      brand: product.brand,
      categorySlug: categoryNameById.get(product.categoryId) ?? '',
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

    return NextResponse.json({
      data: {
        products: items,
        stores: partnerStores.map((s) => ({
          id: s.id,
          nameKa: s.nameKa,
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
      },
      error: null,
    });
  } catch (e) {
    console.error('GET /api/design/catalog', e);
    return NextResponse.json(
      { data: null, error: 'Failed to load design catalogue' },
      { status: 500 }
    );
  }
}
