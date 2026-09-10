import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal, X } from 'lucide-react';
import { and, asc, count, desc, eq, gte, isNull, like, lte, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { categories, products, stores } from '@/lib/db/schema';
import { ProductGrid } from '@/components/catalog/ProductGrid';
import { CatalogSidebar } from '@/components/catalog/CatalogSidebar';
import { SortSelect } from '@/components/catalog/SortSelect';
import { StyleFilter } from '@/components/catalog/StyleFilter';
import { getLocale, getT } from '@/lib/i18n/server';
import { localizedName, pickLocalizedName, styleLabel } from '@/lib/i18n/labels';
import { STYLE_IDS } from '@/lib/design/styles';
import { fill, hrefWith, pageWindow, parseListParams, type SearchParams } from '@/lib/admin/list';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 24;
const SORTS = ['featured', 'price_asc', 'price_desc', 'new'] as const;
type Sort = (typeof SORTS)[number];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.catalog.title, description: t.catalog.subtitle };
}

/**
 * Public product catalogue.
 *
 * Server-rendered: this is a landing surface for search engines and for visitors arriving
 * from a partner's link, so the first paint is the products themselves. Every filter —
 * category, store, style, price band, search, sort, page — is a query parameter, so any
 * view has a URL that can be shared, and the sidebar works without JavaScript.
 */
export default async function PublicCatalogPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const t = await getT();
  const locale = await getLocale();
  const params = parseListParams<Sort>(searchParams, { sorts: SORTS, defaultSort: 'featured', pageSize: PAGE_SIZE });
  const styles = params
    .get('style')
    .split(',')
    .filter((s): s is (typeof STYLE_IDS)[number] => (STYLE_IDS as readonly string[]).includes(s));
  const state = {
    raw: params.raw,
    category: params.get('category'),
    store: params.get('store'),
    hasFilters: params.hasFilters,
  };

  // A product is public when it is active and its store (if any) is — a store that registered
  // itself is inactive until admin approves it, and its shelf stays out of sight until then.
  const publicProduct = and(eq(products.isActive, true), or(isNull(products.storeId), eq(stores.isActive, true)))!;

  const [visibleCategories, activeStores, countRows] = await Promise.all([
    db.select().from(categories).where(eq(categories.isVisible, true)).orderBy(asc(categories.phase), asc(categories.sortOrder)),
    db.select().from(stores).where(eq(stores.isActive, true)).orderBy(asc(stores.nameKa)),
    db.select({ categoryId: products.categoryId, n: count() }).from(products).leftJoin(stores, eq(products.storeId, stores.id)).where(publicProduct).groupBy(products.categoryId),
  ]);
  const counts = Object.fromEntries(countRows.map((r) => [r.categoryId, r.n])) as Record<number, number>;

  const activeCategory = state.category ? visibleCategories.find((c) => c.slug === state.category) ?? null : null;
  const activeStore = state.store ? activeStores.find((s) => String(s.id) === state.store) ?? null : null;

  const where: SQL[] = [publicProduct];
  if (state.category) where.push(eq(products.categoryId, activeCategory?.id ?? -1));
  if (state.store) where.push(eq(products.storeId, activeStore?.id ?? -1));
  if (styles.length) where.push(or(...styles.map((s) => sql`JSON_CONTAINS(${products.styleTags}, ${JSON.stringify(s)})`))!);
  const min = params.num('min');
  const max = params.num('max');
  if (min != null) where.push(gte(products.pricePerUnit, String(min)));
  if (max != null) where.push(lte(products.pricePerUnit, String(max)));
  if (params.q) {
    const needle = `%${params.q}%`;
    where.push(or(like(products.nameKa, needle), like(products.nameEn, needle), like(products.nameRu, needle), like(products.brand, needle), like(products.sku, needle))!);
  }

  const orderBy = {
    featured: [desc(products.isFeatured), asc(products.sortOrder), desc(products.id)],
    price_asc: [asc(products.pricePerUnit), desc(products.id)],
    price_desc: [desc(products.pricePerUnit), desc(products.id)],
    new: [desc(products.id)],
  }[params.sort];

  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(products).leftJoin(stores, eq(products.storeId, stores.id)).where(and(...where)),
    db
      .select({ product: products, store: stores })
      .from(products)
      .leftJoin(stores, eq(products.storeId, stores.id))
      .where(and(...where))
      .orderBy(...orderBy)
      .limit(PAGE_SIZE)
      .offset((params.page - 1) * PAGE_SIZE),
  ]);
  const items = rows.map((r) => r.product);
  const storeNames = Object.fromEntries(rows.filter((r) => r.store).map((r) => [r.product.id, localizedName(locale, r.store!)])) as Record<number, string>;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (page: number) => hrefWith('/catalog', params.raw, { page: page > 1 ? page : undefined });
  const sortLabels: Record<Sort, string> = { featured: t.catalog.sortFeatured, price_asc: t.catalog.sortPriceAsc, price_desc: t.catalog.sortPriceDesc, new: t.catalog.sortNewest };

  const chips: Array<{ label: string; href: string }> = [];
  if (activeCategory) chips.push({ label: pickLocalizedName(locale, activeCategory.nameKa, activeCategory.nameEn, activeCategory.nameRu), href: hrefWith('/catalog', params.raw, { category: undefined, page: undefined }) });
  if (activeStore) chips.push({ label: localizedName(locale, activeStore), href: hrefWith('/catalog', params.raw, { store: undefined, page: undefined }) });
  for (const s of styles) chips.push({ label: styleLabel(t, s), href: hrefWith('/catalog', params.raw, { style: styles.filter((x) => x !== s).join(',') || undefined, page: undefined }) });
  if (min != null || max != null) chips.push({ label: `₾ ${min ?? 0} – ${max ?? '∞'}`, href: hrefWith('/catalog', params.raw, { min: undefined, max: undefined, page: undefined }) });
  if (params.q) chips.push({ label: `“${params.q}”`, href: hrefWith('/catalog', params.raw, { q: undefined, page: undefined }) });
  const hidden = (omit: string[]) =>
    Object.entries(params.raw)
      .filter(([k]) => !omit.includes(k) && k !== 'page')
      .map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />);

  return (
    <div className="container py-10 md:py-14">
      <header className="border-b border-line pb-8">
        <p className="eyebrow">{t.nav.catalog}</p>
        <h1 className="mt-3 font-serif text-3xl font-bold leading-[1.05] tracking-tight text-ink md:text-[2.75rem]">
          {activeCategory ? pickLocalizedName(locale, activeCategory.nameKa, activeCategory.nameEn, activeCategory.nameRu) : t.catalog.title}
        </h1>
        <p className="mt-3 max-w-xl text-base text-ink-muted">{t.catalog.subtitle}</p>
      </header>

      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[240px_minmax(0,1fr)]">
        {/* The sidebar renders once; on small screens a checkbox toggles it (no JS). */}
        <input type="checkbox" id="catalog-filters" className="peer sr-only" />
        <label htmlFor="catalog-filters" className="inline-flex h-10 cursor-pointer items-center gap-2 self-start border border-line bg-bg-surface px-4 text-sm font-medium lg:hidden">
          <SlidersHorizontal className="h-4 w-4" />
          {t.catalog.filters}
        </label>
        <aside className="hidden min-w-0 peer-checked:block lg:block lg:sticky lg:top-24 lg:self-start">
          <CatalogSidebar t={t} locale={locale} categories={visibleCategories} counts={counts} stores={activeStores} state={state} />
        </aside>

        <section className="min-w-0">
          <div className="mb-5 border-b border-line pb-4">
            <div className="flex flex-wrap items-center gap-3">
              <form action="/catalog" method="get" className="relative">
                {hidden(['q'])}
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                <input type="search" name="q" defaultValue={params.q} placeholder={t.catalog.searchPlaceholder} aria-label={t.catalog.search} className="h-10 w-56 border border-line bg-bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none" />
              </form>
              <StyleFilter label={t.catalog.style} allLabel={t.catalog.allStyles} options={STYLE_IDS.map((id) => ({ id, label: styleLabel(t, id) }))} selected={styles} raw={params.raw} />
              <form action="/catalog" method="get" className="flex h-10 items-stretch border border-line bg-bg-surface">
                {hidden(['min', 'max'])}
                <span className="eyebrow flex items-center pl-3 pr-2">{t.catalog.price}</span>
                <input type="number" name="min" min={0} step={1} defaultValue={params.get('min')} placeholder={t.catalog.priceFrom} aria-label={t.catalog.priceFrom} className="w-20 min-w-0 border-l border-line bg-transparent px-2 text-sm tabular-nums text-ink placeholder:text-ink-faint focus:outline-none" />
                <input type="number" name="max" min={0} step={1} defaultValue={params.get('max')} placeholder={t.catalog.priceTo} aria-label={t.catalog.priceTo} className="w-20 min-w-0 border-l border-line bg-transparent px-2 text-sm tabular-nums text-ink placeholder:text-ink-faint focus:outline-none" />
                <button type="submit" className="border-l border-line px-3 text-xs font-semibold uppercase tracking-wide text-ink transition-colors hover:bg-ink hover:text-white">
                  {t.catalog.apply}
                </button>
              </form>
              <div className="ml-auto flex items-center gap-4">
                <p className="text-sm text-ink-muted">{fill(t.catalog.results, { n: total })}</p>
                <SortSelect label={t.catalog.sort} value={params.sort} options={SORTS.map((s) => ({ value: s, label: sortLabels[s], href: hrefWith('/catalog', params.raw, { sort: s === 'featured' ? undefined : s, page: undefined }) }))} />
              </div>
            </div>
            {chips.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {chips.map((chip) => (
                  <Link key={chip.href} href={chip.href} scroll={false} className="inline-flex items-center gap-1 border border-line bg-bg-surface px-2 py-1 text-xs text-ink hover:border-ink">
                    {chip.label}
                    <X className="h-3 w-3 text-ink-faint" />
                  </Link>
                ))}
              </div>
            )}
          </div>

          <ProductGrid products={items} emptyText={t.catalog.noProducts} hrefFor={(p) => `/catalog/${p.slug}`} storeNames={storeNames} columns={items.length > 0 && !activeCategory ? 4 : 3} />

          {pageCount > 1 && (
            <div className="mt-10 flex items-center justify-between border-t border-line pt-4 text-sm">
              <PagerLink href={pageHref(params.page - 1)} disabled={params.page <= 1}>
                <ChevronLeft className="h-4 w-4" /> {t.catalog.prevPage}
              </PagerLink>
              <div className="flex items-center gap-1">
                {pageWindow(params.page, pageCount).map((p) => (
                  <Link key={p} href={pageHref(p)} className={cn('grid h-9 w-9 place-items-center border text-sm tabular-nums transition-colors', p === params.page ? 'border-ink bg-ink text-white' : 'border-line hover:border-ink')}>
                    {p}
                  </Link>
                ))}
              </div>
              <PagerLink href={pageHref(params.page + 1)} disabled={params.page >= pageCount}>
                {t.catalog.nextPage} <ChevronRight className="h-4 w-4" />
              </PagerLink>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function PagerLink({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) {
  const className = 'inline-flex h-9 items-center gap-1 px-2 font-medium';
  if (disabled) return <span className={cn(className, 'text-ink-faint')}>{children}</span>;
  return (
    <Link href={href} className={cn(className, 'text-ink-soft hover:text-ink')}>
      {children}
    </Link>
  );
}
