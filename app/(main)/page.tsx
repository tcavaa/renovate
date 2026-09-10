import { and, count, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { categories, products, stores } from '@/lib/db/schema';
import { DESIGN_CATEGORY_SLUGS } from '@/lib/design/catalog';
import { getLocale, getT } from '@/lib/i18n/server';
import { localizedName } from '@/lib/i18n/labels';
import { buildProjectSummary, computeRoomAreas } from '@/lib/calculator/materials';
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
              // Only approved partners' products on the wall.
              or(isNull(products.storeId), eq(stores.isActive, true)),
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

  // The invoice in the "no designer" section is the real engine on a typical 2-bedroom flat,
  // so the figures move with the rate book rather than being typed into the copy.
  const sampleRooms = [
    computeRoomAreas({ id: 'living', type: 'living_room', nameKa: 'living', width: 6.7, length: 3.5, height: 2.8 }),
    computeRoomAreas({ id: 'bed1', type: 'bedroom', nameKa: 'bed1', width: 4.8, length: 3.75, height: 2.8 }),
    computeRoomAreas({ id: 'bed2', type: 'bedroom', nameKa: 'bed2', width: 4.8, length: 3.75, height: 2.8 }),
    computeRoomAreas({ id: 'kitchen', type: 'kitchen', nameKa: 'kitchen', width: 4.0, length: 4.0, height: 2.7 }),
    computeRoomAreas({ id: 'bath', type: 'bathroom', nameKa: 'bath', width: 2.55, length: 4.0, height: 2.7 }),
  ];
  const sample = buildProjectSummary(sampleRooms, 'white_frame', [], []);
  const estimate = {
    rooms: sampleRooms.length,
    floorM2: Math.round(sampleRooms.reduce((s, r) => s + r.floorM2, 0)),
    wallM2: Math.round(sampleRooms.reduce((s, r) => s + r.wallM2, 0)),
    materials: Math.round(sample.subtotalMaterials),
    workers: Math.round(sample.subtotalWorkers),
    total: Math.round(sample.grandTotalWithMargin),
  };

  return (
    <>
      <Hero t={t} />
      <div className="border-y border-line bg-bg-surface/60 py-4">
        <Marquee items={t.landing.marquee} />
      </div>
      <DesignerSection t={t} products={wall} estimate={estimate} />
      <ProductWall t={t} products={wall} />
      <StylesRow t={t} />
      <StatsBand t={t} products={Number(productCount)} stores={Number(storeCount)} />
      <FinalCta t={t} />
    </>
  );
}
