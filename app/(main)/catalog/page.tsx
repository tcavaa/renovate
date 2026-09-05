import type { Metadata } from 'next';
import Link from 'next/link';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { categories, products } from '@/lib/db/schema';
import { ProductGrid } from '@/components/catalog/ProductGrid';
import { getLocale, getT } from '@/lib/i18n/server';
import { pickLocalizedName } from '@/lib/i18n/labels';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 24;

export function generateMetadata(): Metadata {
  const t = getT();
  return { title: t.catalog.title, description: t.catalog.subtitle };
}

/**
 * Public product catalogue.
 *
 * Server-rendered: this is a landing surface for search engines and for visitors arriving
 * from a partner's link, so the first paint is the products themselves rather than a spinner
 * waiting on `/api/products`. The category filter is a query parameter so every filtered view
 * has a URL.
 */
export default async function PublicCatalogPage({
  searchParams,
}: {
  searchParams: { category?: string };
}) {
  const ka = getT();
  const locale = getLocale();
  const activeSlug = searchParams.category ?? null;

  const visibleCategories = await db
    .select()
    .from(categories)
    .where(eq(categories.isVisible, true))
    .orderBy(asc(categories.phase), asc(categories.sortOrder));

  const active = activeSlug ? visibleCategories.find((c) => c.slug === activeSlug) : null;
  const conditions = [eq(products.isActive, true)];
  if (active) conditions.push(eq(products.categoryId, active.id));

  const items =
    activeSlug && !active
      ? []
      : await db
          .select()
          .from(products)
          .where(and(...conditions))
          .orderBy(desc(products.isFeatured), asc(products.sortOrder), desc(products.id))
          .limit(PAGE_SIZE);

  return (
    <div className="container py-10">
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-bold md:text-4xl">{ka.catalog.title}</h1>
        <p className="mt-2 text-ink-muted">{ka.catalog.subtitle}</p>
      </div>

      <nav className="mb-6 flex flex-wrap gap-2" aria-label={ka.catalog.filterByCategory}>
        <Chip href="/catalog" active={activeSlug === null}>
          {ka.common.all}
        </Chip>
        {visibleCategories.map((c) => (
          <Chip key={c.id} href={`/catalog?category=${encodeURIComponent(c.slug)}`} active={activeSlug === c.slug}>
            {pickLocalizedName(locale, c.nameKa, c.nameEn, c.nameRu)}
          </Chip>
        ))}
      </nav>

      <ProductGrid products={items} emptyText={ka.catalog.noProducts} />
    </div>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'rounded-full border px-4 py-1.5 text-sm transition-colors',
        active ? 'border-brand bg-brand text-white' : 'border-line bg-bg-surface hover:border-brand/40'
      )}
    >
      {children}
    </Link>
  );
}
