import { and, count, desc, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { categories, products, stores } from '@/lib/db/schema';
import { DESIGN_CATEGORY_SLUGS } from '@/lib/design/catalog';
import { getLocale, getT } from '@/lib/i18n/server';
import { localizedName } from '@/lib/i18n/labels';
import { Hero } from '@/components/landing/Hero';
import { Marquee } from '@/components/motion/Marquee';
import { DesignerSection } from '@/components/landing/DesignerSection';
import { ProductWall, type LandingProduct } from '@/components/landing/ProductWall';
import { StylesRow } from '@/components/landing/StylesRow';
import { StatsBand } from '@/components/landing/StatsBand';
import { FinalCta } from '@/components/landing/FinalCta';

export const dynamic = 'force-dynamic';

/**
 * Landing page. Everything shown is live data: the product wall is the studio's own
 * catalogue, the figures in the dark band are counts from the database.
 */
export default async function HomePage() {
  const [t, locale] = await Promise.all([getT(), getLocale()]);

  const designCategories = await db
    .select({ id: categories.id })
    .from(categories)
    .where(inArray(categories.slug, [...DESIGN_CATEGORY_SLUGS]));

  const [rows, [{ productCount }], [{ storeCount }]] = await Promise.all([
    designCategories.length
      ? db
          .select({
            id: products.id,
            nameKa: products.nameKa,
            nameEn: products.nameEn,
            nameRu: products.nameRu,
            slug: products.slug,
            pricePerUnit: products.pricePerUnit,
            imageUrl: products.imageUrl,
            brand: products.brand,
            storeKa: stores.nameKa,
            storeEn: stores.nameEn,
            storeRu: stores.nameRu,
          })
          .from(products)
          .leftJoin(stores, eq(products.storeId, stores.id))
          .where(
            and(
              eq(products.isActive, true),
              isNotNull(products.imageUrl),
              isNotNull(products.model3dUrl),
              inArray(products.categoryId, designCategories.map((c) => c.id)),
              // The stylised stock kit is a placeholder; the wall should show photographed products.
              ne(products.brand, 'Kenney')
            )
          )
          .orderBy(desc(products.isFeatured), sql`RAND()`)
          .limit(8)
      : Promise.resolve([]),
    db.select({ productCount: count() }).from(products).where(eq(products.isActive, true)),
    db.select({ storeCount: count() }).from(stores).where(eq(stores.isActive, true)),
  ]);

  const wall: LandingProduct[] = rows.map((r) => ({
    id: r.id,
    name: localizedName(locale, r),
    price: Number(r.pricePerUnit),
    imageUrl: r.imageUrl,
    slug: r.slug,
    store: r.storeKa ? localizedName(locale, { nameKa: r.storeKa, nameEn: r.storeEn, nameRu: r.storeRu }) : null,
    brand: r.brand,
  }));

  return (
    <>
      <Hero t={t} />
      <div className="border-y border-line bg-bg-surface/60 py-4">
        <Marquee items={t.landing.marquee} />
      </div>
      <DesignerSection t={t} products={wall} />
      <ProductWall t={t} products={wall} />
      <StylesRow t={t} />
      <StatsBand t={t} products={Number(productCount)} stores={Number(storeCount)} />
      <FinalCta t={t} />
    </>
  );
}
