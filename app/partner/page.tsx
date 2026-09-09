import Link from 'next/link';
import { ArrowRight, Phone } from 'lucide-react';
import { asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { stores, workers } from '@/lib/db/schema';
import { getLocale, getT } from '@/lib/i18n/server';
import { loadPartnerContext, partnerHref } from '@/lib/partner/context';
import { partnerOrders, partnerStats } from '@/lib/finance/orders';
import { loadPlatformSettings } from '@/lib/finance/settings';
import { effectiveCommissionPct } from '@/lib/finance/money';
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';
import { Figure } from '@/components/calculator/MaterialsTable';
import { dateLocaleFor } from '@/components/projects/ProjectDetail';
import { fill } from '@/lib/admin/list';
import { formatGEL, formatNumber, cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function PartnerDashboardPage(props: { searchParams: Promise<{ store?: string; worker?: string }> }) {
  const search = await props.searchParams;
  const t = await getT();
  const locale = await getLocale();
  const ctx = await loadPartnerContext(search);
  if (!ctx) return null;

  if (!ctx.type) {
    // Admin without a target: offer the partners to preview.
    const [storeRows, workerRows] = await Promise.all([
      db.select({ id: stores.id, name: stores.nameKa }).from(stores).orderBy(asc(stores.nameKa)),
      db.select({ id: workers.id, name: workers.nameKa, specialty: workers.specialty }).from(workers).orderBy(asc(workers.nameKa)),
    ]);
    return (
      <div className="space-y-8">
        <div>
          <p className="eyebrow">{t.partner.title}</p>
          <h1 className="mt-2 font-serif text-3xl font-bold">{t.partner.adminPreview}</h1>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <PreviewList title={t.partner.storeAccount} items={storeRows.map((s) => ({ href: `/partner?store=${s.id}`, label: s.name }))} />
          <PreviewList title={t.partner.workerAccount} items={workerRows.map((w) => ({ href: `/partner?worker=${w.id}`, label: `${w.name} · ${w.specialty}` }))} />
        </div>
      </div>
    );
  }

  const [stats, recent, settings] = await Promise.all([partnerStats(ctx.ref), partnerOrders(ctx.ref, { limit: 8 }), loadPlatformSettings()]);
  const pct = effectiveCommissionPct(ctx.commissionRate, ctx.type === 'store' ? settings.storeCommissionPct : settings.workerCommissionPct);
  const dateLocale = dateLocaleFor(locale);

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
                      <OrderStatusBadge status={o.status} t={t} />
                    </Link>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-ink-muted">
                      <span>{o.customerName}</span>
                      <a href={`tel:${o.customerPhone}`} className="inline-flex items-center gap-1 hover:text-ink">
                        <Phone className="h-3 w-3" />
                        {o.customerPhone}
                      </a>
                      <span>{new Date(o.createdAt).toLocaleDateString(dateLocale)}</span>
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
