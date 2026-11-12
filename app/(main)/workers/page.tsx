import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { WORKERS_DIRECTORY } from '@/lib/features';
import { BadgeCheck, ChevronLeft, ChevronRight, Search, SlidersHorizontal, X } from 'lucide-react';
import { and, count, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { asc, desc } from '@/lib/db/order';
import { db } from '@/lib/db';
import { workers } from '@/lib/db/schema';
import { WorkerList } from '@/components/workers/WorkerList';
import { SortSelect } from '@/components/catalog/SortSelect';
import { getT } from '@/lib/i18n/server';
import { workerSpecialtyLabel } from '@/lib/i18n/labels';
import { fill, hrefWith, pageWindow, parseListParams, type SearchParams } from '@/lib/admin/list';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const PATH = '/workers';
const PAGE_SIZE = 24;
const SORTS = ['rating', 'reviews', 'price_asc', 'price_desc'] as const;
type Sort = (typeof SORTS)[number];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.workers.title, description: t.workers.subtitle };
}

/**
 * Public worker directory, laid out like the catalogue: specialties with live counts and
 * the cities in the sidebar, search, a verified toggle, the result count and sort in the
 * toolbar, plates in the grid. Every filter is a query parameter, so any view has a URL.
 */
export default async function WorkersPage(props: { searchParams: Promise<SearchParams> }) {
  // Switched off (`lib/features`): whoever still has the address is sent to the brigades.
  if (!WORKERS_DIRECTORY) redirect('/teams');
  const searchParams = await props.searchParams;
  const t = await getT();
  const params = parseListParams<Sort>(searchParams, { sorts: SORTS, defaultSort: 'rating', pageSize: PAGE_SIZE });
  const specialty = params.get('specialty');
  const city = params.get('city');
  const verified = params.get('verified') === '1';

  const [specialtyRows, cityRows] = await Promise.all([
    db.select({ slug: workers.specialtySlug, n: count() }).from(workers).where(eq(workers.isActive, true)).groupBy(workers.specialtySlug),
    db.select({ city: workers.city, n: count() }).from(workers).where(eq(workers.isActive, true)).groupBy(workers.city),
  ]);
  const specialties = specialtyRows.sort((a, b) => b.n - a.n);
  const cities = cityRows.filter((r): r is { city: string; n: number } => !!r.city).sort((a, b) => b.n - a.n);
  const total = specialtyRows.reduce((s, r) => s + r.n, 0);

  const where: SQL[] = [eq(workers.isActive, true)];
  if (specialty) where.push(eq(workers.specialtySlug, specialty));
  if (city) where.push(eq(workers.city, city));
  if (verified) where.push(eq(workers.isVerified, true));
  if (params.q) {
    const needle = `%${params.q}%`;
    where.push(or(ilike(workers.nameKa, needle), ilike(workers.nameEn, needle), ilike(workers.nameRu, needle), ilike(workers.specialty, needle), ilike(workers.bio, needle))!);
  }

  // Price is stored in two columns depending on the unit; sort by whichever is set.
  const priceExpr = sql`COALESCE(${workers.pricePerM2}, ${workers.pricePerUnit})`;
  const orderBy = {
    rating: [desc(workers.isVerified), desc(workers.rating), desc(workers.reviewCount)],
    reviews: [desc(workers.reviewCount), desc(workers.rating)],
    price_asc: [asc(priceExpr), desc(workers.rating)],
    price_desc: [desc(priceExpr), desc(workers.rating)],
  }[params.sort];

  const [[{ matched }], items] = await Promise.all([
    db.select({ matched: count() }).from(workers).where(and(...where)),
    db
      .select()
      .from(workers)
      .where(and(...where))
      .orderBy(...orderBy)
      .limit(PAGE_SIZE)
      .offset((params.page - 1) * PAGE_SIZE),
  ]);
  const pageCount = Math.max(1, Math.ceil(matched / PAGE_SIZE));
  const href = (patch: Record<string, string | number | undefined>) => hrefWith(PATH, params.raw, { ...patch, page: undefined });
  const sortLabels: Record<Sort, string> = { rating: t.workers.sortRating, reviews: t.workers.sortReviews, price_asc: t.workers.sortPriceAsc, price_desc: t.workers.sortPriceDesc };
  const hidden = Object.entries(params.raw)
    .filter(([k]) => k !== 'q' && k !== 'page')
    .map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />);

  const chips: Array<{ label: string; href: string }> = [];
  if (specialty) chips.push({ label: workerSpecialtyLabel(t, specialty), href: href({ specialty: undefined }) });
  if (city) chips.push({ label: city, href: href({ city: undefined }) });
  if (verified) chips.push({ label: t.workers.verifiedOnly, href: href({ verified: undefined }) });
  if (params.q) chips.push({ label: `“${params.q}”`, href: href({ q: undefined }) });

  return (
    <div className="container py-10 md:py-14">
      <header className="relative overflow-hidden rounded-3xl bg-mist-light px-6 py-8 md:px-10 md:py-10">
        <div className="relative z-10 max-w-2xl">
          <p className="inline-flex items-center gap-2 rounded-full bg-bg-surface px-3 py-1.5 text-xs font-semibold text-ink">
            <span className="h-2 w-2 bg-lime" aria-hidden />
            {t.nav.workers}
          </p>
          <h1 className="mt-4 font-display text-4xl leading-[1] text-ink md:text-[3.25rem]">{specialty ? workerSpecialtyLabel(t, specialty) : t.workers.title}</h1>
          <p className="mt-3 max-w-xl text-base text-ink-muted">{t.workers.subtitle}</p>
        </div>
        {/* The brand corner: a sun slab, a lilac half circle, a cobalt square and a coral disc. */}
        <span className="pointer-events-none absolute inset-y-0 right-0 hidden w-72 lg:block" aria-hidden>
          <span className="absolute bottom-0 left-4 h-[72%] w-20 bg-sun" />
          <span className="absolute bottom-0 right-8 h-[58%] w-32 rounded-t-full bg-lilac" />
          <span className="absolute bottom-0 left-16 h-16 w-16 bg-cobalt" />
          <span className="absolute right-6 top-6 h-9 w-9 rounded-full bg-coral" />
        </span>
      </header>

      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[240px_minmax(0,1fr)]">
        <input type="checkbox" id="worker-filters" className="peer sr-only" />
        <label htmlFor="worker-filters" className="inline-flex h-10 cursor-pointer items-center gap-2 self-start rounded-full bg-ink px-4 text-sm font-semibold text-white transition-colors hover:bg-lime hover:text-ink lg:hidden">
          <SlidersHorizontal className="h-4 w-4" />
          {t.common.filter}
        </label>
        <aside className="hidden min-w-0 space-y-8 text-sm peer-checked:block lg:block lg:sticky lg:top-24 lg:self-start">
          <nav aria-label={t.workers.specialty}>
            <p className="eyebrow mb-2 px-3">{t.workers.specialty}</p>
            <ul className="space-y-0.5">
              <SideLink href={href({ specialty: undefined })} active={!specialty} label={t.common.all} count={total} current />
              {specialties.map((s) => (
                <SideLink key={s.slug} href={href({ specialty: s.slug })} active={specialty === s.slug} label={workerSpecialtyLabel(t, s.slug)} count={s.n} current />
              ))}
            </ul>
          </nav>
          {cities.length > 0 && (
            <div>
              <p className="eyebrow mb-2 px-3">{t.workers.city}</p>
              <ul className="space-y-0.5">
                <SideLink href={href({ city: undefined })} active={!city} label={t.workers.allCities} />
                {cities.map((c) => (
                  <SideLink key={c.city} href={href({ city: city === c.city ? undefined : c.city })} active={city === c.city} label={c.city} count={c.n} />
                ))}
              </ul>
            </div>
          )}
          {params.hasFilters && (
            <Link href={PATH} className="inline-flex h-9 items-center rounded-full bg-mist-light px-4 text-sm font-semibold text-ink transition-colors hover:bg-ink hover:text-white">
              {t.catalog.clearFilters}
            </Link>
          )}
        </aside>

        <section className="min-w-0">
          <div className="mb-6">
            <div className="flex flex-wrap items-center gap-3">
              <form action={PATH} method="get" className="relative">
                {hidden}
                <Search className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                <input type="search" name="q" defaultValue={params.q} placeholder={t.workers.searchPlaceholder} aria-label={t.common.search} className="h-10 w-56 rounded-full border border-transparent bg-mist-light pl-9 pr-4 text-sm text-ink placeholder:text-ink-muted transition-colors hover:bg-mist focus:border-ink focus:bg-bg-surface focus:outline-none focus:ring-[3px] focus:ring-lime" />
              </form>
              <Link
                href={href({ verified: verified ? undefined : '1' })}
                scroll={false}
                className={cn('inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors', verified ? 'bg-ink text-white' : 'bg-mist-light text-ink hover:bg-mist')}
              >
                <BadgeCheck className={cn('h-4 w-4', verified ? 'text-lime' : 'text-ink-muted')} />
                {t.workers.verifiedOnly}
              </Link>
              <div className="ml-auto flex items-center gap-4">
                <p className="text-sm font-medium text-ink-muted">{fill(t.workers.results, { n: matched })}</p>
                <SortSelect label={t.workers.sort} value={params.sort} options={SORTS.map((s) => ({ value: s, label: sortLabels[s], href: href({ sort: s === 'rating' ? undefined : s }) }))} />
              </div>
            </div>
            {chips.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {chips.map((chip) => (
                  <Link key={chip.href} href={chip.href} scroll={false} className="inline-flex items-center gap-1.5 rounded-full bg-ink py-1 pl-3 pr-2 text-xs font-semibold text-white transition-colors hover:bg-ink-soft">
                    {chip.label}
                    <X className="h-3 w-3 text-white/70" />
                  </Link>
                ))}
              </div>
            )}
          </div>

          <WorkerList workers={items} emptyText={t.workers.noWorkers} />

          {pageCount > 1 && (
            <div className="mt-10 flex items-center justify-between border-t border-line pt-4 text-sm">
              <Pager href={hrefWith(PATH, params.raw, { page: params.page > 2 ? params.page - 1 : undefined })} disabled={params.page <= 1}>
                <ChevronLeft className="h-4 w-4" /> {t.catalog.prevPage}
              </Pager>
              <div className="flex items-center gap-1">
                {pageWindow(params.page, pageCount).map((p) => (
                  <Link key={p} href={hrefWith(PATH, params.raw, { page: p > 1 ? p : undefined })} className={cn('grid h-9 w-9 place-items-center rounded-full text-sm font-semibold tabular-nums transition-colors', p === params.page ? 'bg-lime text-ink' : 'text-ink-soft hover:bg-mist hover:text-ink')}>
                    {p}
                  </Link>
                ))}
              </div>
              <Pager href={hrefWith(PATH, params.raw, { page: params.page + 1 })} disabled={params.page >= pageCount}>
                {t.catalog.nextPage} <ChevronRight className="h-4 w-4" />
              </Pager>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/** Sidebar row. Only specialty rows (`current`) carry aria-current — the e2e test counts exactly one. */
function SideLink({ href, active, label, count, current }: { href: string; active: boolean; label: string; count?: number; current?: boolean }) {
  return (
    <li>
      <Link
        href={href}
        scroll={false}
        aria-current={current && active ? 'page' : undefined}
        className={cn('relative flex items-center justify-between gap-3 rounded-full py-2 pl-4 pr-3 transition-colors', active ? (current ? 'bg-lime font-semibold text-ink' : 'bg-ink font-semibold text-white') : 'text-ink-soft hover:bg-mist-light hover:text-ink')}
      >
        <span className="truncate">{label}</span>
        {count !== undefined && <span className={cn('shrink-0 text-xs tabular-nums', active ? 'font-semibold opacity-70' : 'text-ink-faint')}>{count}</span>}
      </Link>
    </li>
  );
}

function Pager({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) {
  const className = 'inline-flex h-9 items-center gap-1 rounded-full px-3 font-semibold transition-colors';
  if (disabled) return <span className={cn(className, 'text-ink-faint')}>{children}</span>;
  return (
    <Link href={href} className={cn(className, 'text-ink hover:bg-mist')}>
      {children}
    </Link>
  );
}
