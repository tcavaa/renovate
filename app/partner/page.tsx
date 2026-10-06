import Image from '@/components/ui/image';
import Link from 'next/link';
import { ArrowRight, Box, Phone } from 'lucide-react';
import { asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { stores, teams, workers } from '@/lib/db/schema';
import { getLocale, getT } from '@/lib/i18n/server';
import { loadPartnerContext, partnerHref } from '@/lib/partner/context';
import { partnerOrders, partnerStats } from '@/lib/finance/orders';
import { partnerMonthlySales, partnerStageCounts, storeCatalogueHealth, storeTopProducts } from '@/lib/partner/analytics';
import { loadPlatformSettings } from '@/lib/finance/settings';
import { effectiveCommissionPct } from '@/lib/finance/money';
import { orderStage, ORDER_STAGES } from '@/lib/finance/orderFlow';
import { OrderStageBadge } from '@/components/orders/OrderStatusBadge';
import { Figure } from '@/components/calculator/MaterialsTable';
import { dateLocaleFor } from '@/components/projects/ProjectDetail';
import { localizedName } from '@/lib/i18n/labels';
import { fill } from '@/lib/admin/list';
import { formatGEL, formatNumber, cn, TIME_ZONE } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * A partner's first page: what is new, what is open, what the month brought and what the
 * platform keeps of it — then how sales went month by month, where its orders stand, and for
 * a store what sells best and what its shelf is missing (photos, 3D models), each a link to the
 * filtered list. A brigade or a worker sees how many of its bookings it took.
 */
export default async function PartnerDashboardPage(props: { searchParams: Promise<{ store?: string; worker?: string; team?: string }> }) {
  const search = await props.searchParams;
  const t = await getT();
  const locale = await getLocale();
  const ctx = await loadPartnerContext(search);
  if (!ctx) return null;

  if (!ctx.type) {
    // Admin without a target: offer the partners to preview.
    const [storeRows, workerRows, teamRows] = await Promise.all([
      db.select({ id: stores.id, name: stores.nameKa }).from(stores).orderBy(asc(stores.nameKa)),
      db.select({ id: workers.id, name: workers.nameKa, specialty: workers.specialty }).from(workers).orderBy(asc(workers.nameKa)),
      db.select({ id: teams.id, name: teams.nameKa }).from(teams).orderBy(asc(teams.nameKa)),
    ]);
    return (
      <div className="space-y-8">
        <div>
          <p className="eyebrow">{t.partner.title}</p>
          <h1 className="mt-2 font-serif text-3xl font-bold">{t.partner.adminPreview}</h1>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <PreviewList title={t.partner.storeAccount} items={storeRows.map((s) => ({ href: `/partner?store=${s.id}`, label: s.name }))} />
          <PreviewList title={t.partner.teamAccount} items={teamRows.map((g) => ({ href: `/partner?team=${g.id}`, label: g.name }))} />
          <PreviewList title={t.partner.workerAccount} items={workerRows.map((w) => ({ href: `/partner?worker=${w.id}`, label: `${w.name} · ${w.specialty}` }))} />
        </div>
      </div>
    );
  }

  const isStore = ctx.type === 'store' && ctx.ref.storeId != null;
  const [stats, recent, settings, months, stages, top, health] = await Promise.all([
    partnerStats(ctx.ref),
    partnerOrders(ctx.ref, { limit: 8 }),
    loadPlatformSettings(),
    partnerMonthlySales(ctx.ref),
    partnerStageCounts(ctx.ref),
    isStore ? storeTopProducts(ctx.ref.storeId!) : Promise.resolve([]),
    isStore ? storeCatalogueHealth(ctx.ref.storeId!) : Promise.resolve(null),
  ]);
  const pct = effectiveCommissionPct(ctx.commissionRate, ctx.type === 'store' ? settings.storeCommissionPct : settings.workerCommissionPct);
  const dateLocale = dateLocaleFor(locale);
  const s = t.partnerStats;
  const counted = ORDER_STAGES.filter((st) => st !== 'cancelled').reduce((sum, st) => sum + stages[st], 0);
  const avgOrder = counted > 0 ? stats.allTimeGoods / counted : 0;
  const accepted = stages.accepted + stages.in_progress + stages.done;
  const maxMonth = Math.max(1, ...months.map((m) => m.goods));
  const monthLabel = (key: string) => {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(dateLocale, { month: 'short' });
  };
  const productsHref = (query: string) => `${partnerHref('/partner/products', ctx)}${partnerHref('/partner/products', ctx).includes('?') ? '&' : '?'}${query}`;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{t.partner.title}</p>
          <h1 className="mt-2 font-serif text-3xl font-bold">{ctx.name}</h1>
        </div>
        <p className="text-sm text-ink-muted">
          {t.partner.commissionRateLabel}: <span className="font-semibold text-ink">{formatNumber(pct)}%</span>
        </p>
      </div>

      <div className="grid border-l border-t border-line sm:grid-cols-2 lg:grid-cols-4">
        <Figure label={t.partner.newOrders} value={String(stats.unread)} emphasis />
        <Figure label={t.partner.openOrders} value={String(stats.open)} />
        <Figure label={t.partner.monthSales} value={formatGEL(stats.monthGoods)} />
        <Figure label={t.partner.monthNet} value={formatGEL(Math.max(0, stats.monthGoods - stats.monthCommission))} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Sales by month: bars, no chart library — the height is the share of the best month. */}
        <section className="border border-line bg-bg-surface p-5">
          <p className="eyebrow">{s.salesByMonth}</p>
          <p className="mt-1 text-xs text-ink-muted">{s.salesByMonthHint}</p>
          <div className="mt-5 grid h-44 grid-cols-6 items-end gap-3">
            {months.map((m) => (
              <div key={m.month} className="flex h-full flex-col justify-end text-center">
                <span className="mb-1 text-[11px] tabular-nums text-ink-muted">{m.goods > 0 ? formatGEL(m.goods) : ''}</span>
                <div className={cn('w-full', m.goods > 0 ? 'bg-ink' : 'bg-line')} style={{ height: `${Math.max(2, Math.round((m.goods / maxMonth) * 100))}%` }} title={`${formatGEL(m.goods)} · ${fill(s.ordersCount, { n: m.orders })}`} />
                <span className="mt-1.5 text-[11px] uppercase tracking-wide text-ink-muted">{monthLabel(m.month)}</span>
              </div>
            ))}
          </div>
        </section>

        <aside className="space-y-4">
          <div className="border border-line bg-bg-surface p-5">
            <p className="eyebrow">{s.ordersByStage}</p>
            <ul className="mt-3 space-y-1.5 text-sm">
              {ORDER_STAGES.filter((st) => st !== 'review').map((st) => (
                <li key={st} className="flex items-center justify-between gap-2">
                  <OrderStageBadge stage={st} t={t} />
                  <span className="tabular-nums text-ink">{stages[st]}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 space-y-1 border-t border-line pt-3 text-sm text-ink-muted">
              <div className="flex justify-between">
                <dt>{s.avgOrder}</dt>
                <dd className="tabular-nums text-ink">{formatGEL(avgOrder)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>{t.partner.allTimeSales}</dt>
                <dd className="tabular-nums text-ink">{formatGEL(stats.allTimeGoods)}</dd>
              </div>
              {!isStore && (
                <div className="flex justify-between" title={fill(s.acceptanceHint, { accepted, declined: stages.cancelled })}>
                  <dt>{s.acceptance}</dt>
                  <dd className="tabular-nums text-ink">
                    {accepted} / {accepted + stages.cancelled}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </aside>
      </div>

      {isStore && health && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="border border-line bg-bg-surface">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <p className="eyebrow">{s.topProducts}</p>
              <Link href={productsHref('sort=revenue')} className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
                {t.partner.viewAll}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            {top.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-ink-muted">{s.topProductsEmpty}</p>
            ) : (
              <ol className="divide-y divide-line/70">
                {top.map((p, i) => (
                  <li key={p.productId} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="w-5 text-right text-xs tabular-nums text-ink-faint">{i + 1}</span>
                    <span className="relative h-10 w-10 shrink-0 overflow-hidden border border-line bg-bg-base">
                      {p.imageUrl ? <Image src={p.imageUrl} alt="" fill sizes="40px" className="object-cover" /> : <Box className="absolute inset-0 m-auto h-4 w-4 text-ink-muted" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{localizedName(locale, p)}</span>
                      <span className="text-xs text-ink-muted">
                        {fill(t.partnerProducts.soldUnits, { n: formatNumber(p.units) })} · {fill(t.partnerProducts.soldOrders, { n: p.orders })}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-ink">{formatGEL(p.revenue)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="border border-line bg-bg-surface p-5">
            <p className="eyebrow">{s.catalogHealth}</p>
            <p className="mt-1 text-xs text-ink-muted">{s.catalogHealthHint}</p>
            <ul className="mt-3 space-y-1 text-sm">
              {[
                { label: s.productsShown, n: health.shown, query: 'status=shown' },
                { label: s.productsHidden, n: health.hidden, query: 'status=hidden' },
                { label: s.productsNoPhoto, n: health.noPhoto, query: 'photo=none', warn: true },
                { label: s.productsNo3d, n: health.no3d, query: 'model=none', warn: true },
              ].map((row) => (
                <li key={row.query}>
                  <Link href={productsHref(row.query)} className="flex items-center justify-between gap-2 px-1 py-1 hover:bg-bg-base">
                    <span className="text-ink-soft">{row.label}</span>
                    <span className={cn('tabular-nums', row.warn && row.n > 0 ? 'font-semibold text-warning' : 'text-ink')}>{row.n}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link href={partnerHref('/partner/products', ctx)} className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-ink hover:text-brand">
              {s.manageProducts}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </section>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section>
          <div className="flex items-center justify-between">
            <p className="eyebrow">{t.partner.recentOrders}</p>
            <Link href={partnerHref('/partner/orders', ctx)} className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
              {t.partner.viewAll}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="mt-3 border border-dashed border-line p-10 text-center text-sm text-ink-muted">{t.partner.noOrders}</p>
          ) : (
            <ul className="mt-3 border border-line bg-bg-surface">
              {recent.map((o) => (
                <li key={o.id} className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-line px-4 py-3 last:border-b-0', !o.viewedAt && 'bg-brand/5')}>
                  <div className="min-w-0">
                    <Link href={partnerHref(`/partner/orders/${o.id}`, ctx)} className="flex flex-wrap items-center gap-2 font-serif text-base font-semibold text-ink hover:text-brand">
                      {fill(t.partner.orderTitle, { id: o.id })}
                      {!o.viewedAt && <span className="bg-brand px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">{t.partner.unread}</span>}
                      <OrderStageBadge stage={orderStage(o)} t={t} />
                    </Link>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-ink-muted">
                      <span>{o.customerName}</span>
                      <a href={`tel:${o.customerPhone}`} className="inline-flex items-center gap-1 hover:text-ink">
                        <Phone className="h-3 w-3" />
                        {o.customerPhone}
                      </a>
                      <span>{new Date(o.sentAt ?? o.createdAt).toLocaleDateString(dateLocale, { timeZone: TIME_ZONE })}</span>
                      <span>{fill(t.market.itemsCount, { n: o.itemCount })}</span>
                    </p>
                  </div>
                  <span className="font-serif text-base font-semibold tabular-nums text-ink">{formatGEL(Number(o.subtotal))}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="space-y-4">
          <div className="border border-line bg-bg-surface p-5">
            <p className="eyebrow">{t.partner.allTimeSales}</p>
            <p className="mt-2 font-serif text-2xl font-semibold tabular-nums text-ink">{formatGEL(stats.allTimeGoods)}</p>
            <dl className="mt-3 space-y-1 text-sm text-ink-muted">
              <div className="flex justify-between">
                <dt>{t.partner.doneOrders}</dt>
                <dd className="tabular-nums text-ink">{stats.done}</dd>
              </div>
              <div className="flex justify-between">
                <dt>{t.partner.monthCommission}</dt>
                <dd className="tabular-nums text-ink">{formatGEL(stats.monthCommission)}</dd>
              </div>
            </dl>
          </div>
          <div className="border border-line bg-bg-surface p-5">
            <p className="eyebrow">{t.partner.helpTitle}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{t.partner.helpText}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function PreviewList({ title, items }: { title: string; items: Array<{ href: string; label: string }> }) {
  return (
    <section className="border border-line bg-bg-surface">
      <p className="eyebrow border-b border-line px-4 py-3">{title}</p>
      <ul className="max-h-[60vh] overflow-y-auto">
        {items.map((i) => (
          <li key={i.href} className="border-b border-line/70 last:border-b-0">
            <Link href={i.href} className="flex items-center justify-between px-4 py-2.5 text-sm text-ink hover:bg-bg-base">
              {i.label}
              <ArrowRight className="h-3.5 w-3.5 text-ink-faint" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
