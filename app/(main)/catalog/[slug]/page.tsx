import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { ArrowUpRight, Box, ChevronRight, ExternalLink, MapPin, Phone, Truck } from 'lucide-react';
import { and, desc, eq, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { products, categories, stores } from '@/lib/db/schema';
import { ProductGrid } from '@/components/catalog/ProductGrid';
import { Button } from '@/components/ui/button';
import { getLocale, getT } from '@/lib/i18n/server';
import { localizedName, localizedText, pickLocalizedName, styleLabel, unitLabel } from '@/lib/i18n/labels';
import { fill } from '@/lib/admin/list';
import { formatGEL } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await props.params;
  const rows = await db
    .select({ nameKa: products.nameKa, nameEn: products.nameEn, nameRu: products.nameRu, descriptionKa: products.descriptionKa, descriptionEn: products.descriptionEn, descriptionRu: products.descriptionRu, imageUrl: products.imageUrl })
    .from(products)
    .where(eq(products.slug, params.slug))
    .limit(1);
  const product = rows[0];
  if (!product) return {};
  const locale = await getLocale();
  return {
    title: localizedName(locale, product),
    description: localizedText(locale, product.descriptionKa, product.descriptionEn, product.descriptionRu) ?? undefined,
    openGraph: product.imageUrl ? { images: [product.imageUrl] } : undefined,
  };
}

/**
 * One product, laid out like a catalogue spread: the photo large on the left, the facts in a
 * sticky column on the right — price, seller, delivery, specifications — and the rest of
 * its category underneath.
 */
export default async function ProductDetailPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const t = await getT();
  const locale = await getLocale();

  const rows = await db
    .select({ product: products, category: categories, store: stores })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(stores, eq(products.storeId, stores.id))
    .where(eq(products.slug, params.slug))
    .limit(1);
  const row = rows[0];
  if (!row) notFound();
  const { product, category, store } = row;

  const name = localizedName(locale, product);
  const description = localizedText(locale, product.descriptionKa, product.descriptionEn, product.descriptionRu);
  const categoryName = category ? pickLocalizedName(locale, category.nameKa, category.nameEn, category.nameRu) : null;
  const imageUrl = product.imageUrl || `https://placehold.co/1200x900/E9E2D8/6F6A63/png?text=${encodeURIComponent(name.split(' ')[0])}`;
  const gallery = Array.isArray(product.images) ? (product.images as string[]).filter((u) => typeof u === 'string' && u && u !== product.imageUrl) : [];
  const specs = (product.specs ?? {}) as Record<string, unknown>;
  const specEntries = Object.entries(specs).filter(([, v]) => typeof v === 'string' || typeof v === 'number');
  const styleTags = Array.isArray(product.styleTags) ? (product.styleTags as string[]) : [];
  const dims = [product.widthCm, product.depthCm, product.heightCm];
  const hasDims = dims.some((d) => d != null);
  const deliveryFee = store ? Number(store.deliveryFeeGel ?? 0) : null;

  const relatedRows = await db
    .select({ product: products, store: stores })
    .from(products)
    .leftJoin(stores, eq(products.storeId, stores.id))
    .where(and(eq(products.isActive, true), eq(products.categoryId, product.categoryId), ne(products.id, product.id)))
    .orderBy(desc(products.isFeatured), desc(products.id))
    .limit(4);
  const related = relatedRows.map((r) => r.product);
  const relatedStores = Object.fromEntries(relatedRows.filter((r) => r.store).map((r) => [r.product.id, localizedName(locale, r.store!)])) as Record<number, string>;

  return (
    <div className="container py-8 md:py-12">
      <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
        <Link href="/catalog" className="hover:text-ink">
          {t.nav.catalog}
        </Link>
        {category && (
          <>
            <ChevronRight className="h-3 w-3 text-ink-faint" />
            <Link href={`/catalog?category=${encodeURIComponent(category.slug)}`} className="hover:text-ink">
              {categoryName}
            </Link>
          </>
        )}
        <ChevronRight className="h-3 w-3 text-ink-faint" />
        <span className="truncate text-ink">{name}</span>
      </nav>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-12">
        <div className="space-y-3">
          <div className="relative aspect-[4/3] w-full overflow-hidden border border-line bg-sand-light">
            <Image src={imageUrl} alt={name} fill priority sizes="(min-width: 1024px) 58vw, 100vw" className="object-cover" />
            {product.isFeatured && <span className="absolute left-4 top-4 bg-ink px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">{t.calculator.bestSeller}</span>}
          </div>
          {gallery.length > 0 && (
            <div className="grid grid-cols-4 gap-3">
              {gallery.slice(0, 4).map((src) => (
                <div key={src} className="relative aspect-square overflow-hidden border border-line bg-sand-light">
                  <Image src={src} alt="" fill sizes="20vw" className="object-cover" />
                </div>
              ))}
            </div>
          )}
          {description && (
            <div className="border-t border-line pt-6">
              <p className="eyebrow">{t.catalog.viewDetails}</p>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-soft">{description}</p>
            </div>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="flex flex-wrap items-center gap-2">
            {categoryName && <span className="eyebrow">{categoryName}</span>}
            {product.model3dUrl && (
              <span className="inline-flex items-center gap-1 border border-line px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink">
                <Box className="h-3 w-3" /> {t.catalog.in3d}
              </span>
            )}
          </div>
          <h1 className="mt-3 font-serif text-3xl font-bold leading-[1.05] tracking-tight text-ink md:text-4xl">{name}</h1>
          {product.brand && <p className="mt-2 text-sm text-ink-muted">{product.brand}</p>}

          <div className="mt-6 flex items-baseline gap-2 border-y border-line py-5">
            <span className="font-serif text-4xl font-semibold tabular-nums text-ink">{formatGEL(Number(product.pricePerUnit))}</span>
            <span className="text-sm text-ink-muted">/ {unitLabel(t, product.unit)}</span>
          </div>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Button asChild variant="ink" size="lg" className="group flex-1">
              <Link href="/calculator">
                {t.catalog.addToProject}
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
            </Button>
            {product.model3dUrl && (
              <Button asChild variant="outline" size="lg" className="flex-1">
                <Link href="/design">
                  <Box className="h-4 w-4" />
                  {t.catalog.seeIn3d}
                </Link>
              </Button>
            )}
          </div>

          {store && (
            <div className="mt-8 border border-line bg-bg-surface">
              <div className="flex items-center gap-3 border-b border-line p-4">
                {store.logoUrl ? (
                  <Image src={store.logoUrl} alt={localizedName(locale, store)} width={40} height={40} className="border border-line" />
                ) : (
                  <span className="grid h-10 w-10 place-items-center border border-line font-serif text-base font-semibold">{localizedName(locale, store).slice(0, 1)}</span>
                )}
                <div className="min-w-0">
                  <p className="eyebrow">{t.catalog.soldBy}</p>
                  <p className="truncate font-serif text-lg font-semibold text-ink">{localizedName(locale, store)}</p>
                </div>
              </div>
              <dl className="divide-y divide-line text-sm">
                {(store.address || store.city) && (
                  <Row icon={<MapPin className="h-3.5 w-3.5" />} label={[store.address, store.city].filter(Boolean).join(', ')} />
                )}
                {store.phone && <Row icon={<Phone className="h-3.5 w-3.5" />} label={store.phone} href={`tel:${store.phone}`} />}
                <Row
                  icon={<Truck className="h-3.5 w-3.5" />}
                  label={`${fill(t.catalog.deliveryDays, { n: store.deliveryDays ?? 3 })} · ${deliveryFee ? fill(t.catalog.deliveryFee, { fee: formatGEL(deliveryFee) }) : t.catalog.freeDelivery}`}
                />
                {store.websiteUrl && <Row icon={<ExternalLink className="h-3.5 w-3.5" />} label={t.catalog.website} href={store.websiteUrl} external />}
              </dl>
            </div>
          )}

          {(specEntries.length > 0 || hasDims || styleTags.length > 0 || product.sku) && (
            <div className="mt-8">
              <p className="eyebrow">{t.catalog.specs}</p>
              <dl className="mt-3 border-t border-line text-sm">
                {hasDims && <Spec label={t.catalog.dimensions} value={`${dims.map((d) => (d != null ? d : '—')).join(' × ')} cm`} />}
                {styleTags.length > 0 && <Spec label={t.catalog.styles} value={styleTags.map((s) => styleLabel(t, s)).join(', ')} />}
                {product.sku && <Spec label={t.catalog.sku} value={product.sku} />}
                {specEntries.map(([k, v]) => (
                  <Spec key={k} label={k} value={String(v)} />
                ))}
              </dl>
            </div>
          )}
        </aside>
      </div>

      {related.length > 0 && (
        <section className="mt-16 border-t border-line pt-10">
          <div className="mb-6 flex items-end justify-between">
            <h2 className="font-serif text-2xl font-semibold text-ink">{t.catalog.moreFrom}</h2>
            {category && (
              <Link href={`/catalog?category=${encodeURIComponent(category.slug)}`} className="bracket-link text-sm font-medium text-ink-soft hover:text-ink">
                {categoryName}
              </Link>
            )}
          </div>
          <ProductGrid products={related} emptyText={t.catalog.noProducts} hrefFor={(p) => `/catalog/${p.slug}`} storeNames={relatedStores} />
        </section>
      )}
    </div>
  );
}

function Row({ icon, label, href, external }: { icon: React.ReactNode; label: string; href?: string; external?: boolean }) {
  const inner = (
    <>
      <span className="text-ink-faint">{icon}</span>
      <span className="min-w-0 truncate">{label}</span>
    </>
  );
  return (
    <div className="px-4 py-2.5">
      {href ? (
        <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined} className="flex items-center gap-2 text-ink-soft hover:text-ink">
          {inner}
        </a>
      ) : (
        <span className="flex items-center gap-2 text-ink-soft">{inner}</span>
      )}
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-4 border-b border-line py-2.5">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  );
}
