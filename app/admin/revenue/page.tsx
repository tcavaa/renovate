import Link from 'next/link';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminPageHeader } from '@/components/admin/AdminList';
import { Figure } from '@/components/calculator/MaterialsTable';
import { RevenueChart } from '@/components/admin/RevenueChart';
import { getLocale, getT } from '@/lib/i18n/server';
import { revenueReport } from '@/lib/finance/report';
import { ORDER_STATUSES, REPORT_PERIODS, periodRange, type ReportPeriod } from '@/lib/finance/money';
import { localizedName, orderStatusLabel } from '@/lib/i18n/labels';
import { fill } from '@/lib/admin/list';
import { formatGEL, formatNumber, cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const PERIOD_KEY: Record<ReportPeriod, 'today' | 'd7' | 'd30' | 'month' | 'year' | 'custom'> = { today: 'today', '7d': 'd7', '30d': 'd30', month: 'month', year: 'year', custom: 'custom' };

/**
 * What the platform earned in a period and where it came from: the per-m² fees split by
 * product, the commissions split by partner type, then the partners and products behind
 * them. Every figure is a URL (period, from, to), so a month can be bookmarked.
 */
export default async function AdminRevenuePage(props: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const search = await props.searchParams;
  const ka = await getT();
  const locale = await getLocale();
  const r = ka.admin.revenue;
  const period: ReportPeriod = (REPORT_PERIODS as readonly string[]).includes(search.period ?? '') ? (search.period as ReportPeriod) : '30d';
  const range = periodRange(period, { from: search.from, to: search.to });
  const report = await revenueReport(range);
  const dateLocale = locale === 'ka' ? 'ka-GE' : locale === 'ru' ? 'ru-RU' : 'en-GB';
  const fmtDay = (d: Date) => d.toLocaleDateString(dateLocale, { day: 'numeric', month: 'short', year: 'numeric' });
  const rangeLabel = `${fmtDay(range.from)} — ${fmtDay(new Date(range.to.getTime() - 1))}`;
  const exportHref = `/api/admin/revenue/export?period=${period}${search.from ? `&from=${search.from}` : ''}${search.to ? `&to=${search.to}` : ''}`;
  const share = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—');

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={r.title}
        subtitle={`${r.subtitle} · ${rangeLabel}`}
        actions={
          <Button asChild variant="outline" size="sm">
            <a href={exportHref}>
              <Download className="h-4 w-4" /> {r.exportCsv}
            </a>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <nav className="flex flex-wrap gap-1.5">
          {(['today', '7d', '30d', 'month', 'year'] as ReportPeriod[]).map((p) => (
            <Link key={p} href={`/admin/revenue?period=${p}`} className={cn('border px-3 py-1.5 text-xs font-medium transition-colors', period === p ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink-soft hover:border-ink')}>
              {r.periods[PERIOD_KEY[p]]}
            </Link>
          ))}
        </nav>
        <form action="/admin/revenue" className="flex flex-wrap items-center gap-2 text-xs">
          <input type="hidden" name="period" value="custom" />
          <label className="flex items-center gap-1.5 text-ink-muted">
            {r.from}
            <input type="date" name="from" defaultValue={period === 'custom' ? search.from : undefined} className="h-8 border border-line bg-white px-2 text-xs text-ink focus:border-ink focus:outline-none" />
          </label>
          <label className="flex items-center gap-1.5 text-ink-muted">
            {r.to}
            <input type="date" name="to" defaultValue={period === 'custom' ? search.to : undefined} className="h-8 border border-line bg-white px-2 text-xs text-ink focus:border-ink focus:outline-none" />
          </label>
          <button type="submit" className={cn('border px-3 py-1.5 text-xs font-medium transition-colors', period === 'custom' ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink-soft hover:border-ink')}>
            {r.apply}
          </button>
        </form>
      </div>

      {/* headline */}
      <div className="grid border-l border-t border-line sm:grid-cols-2 lg:grid-cols-4">
        <Figure label={r.revenue} value={formatGEL(report.revenue)} emphasis />
        <Figure label={r.fees} value={formatGEL(report.fees.total)} />
        <Figure label={r.commissions} value={formatGEL(report.commissions.total)} />
        <Figure label={r.gmv} value={formatGEL(report.gmv.total)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Breakdown
          title={r.fees}
          total={report.fees.total}
          rows={[
            { label: r.feesCalculator, value: report.fees.calculator, hint: fill(r.checkoutsCount, { n: report.fees.calculatorCount }) },
            { label: r.feesDesign, value: report.fees.design, hint: fill(r.checkoutsCount, { n: report.fees.designCount }) },
          ]}
          foot={fill(r.m2Total, { n: formatNumber(report.fees.m2) })}
          share={share}
        />
        <Breakdown
          title={r.commissions}
          total={report.commissions.total}
          rows={[
            { label: r.commissionStores, value: report.commissions.stores, hint: fill(r.ordersCount, { n: report.commissions.storeOrders }) },
            { label: r.commissionWorkers, value: report.commissions.workers, hint: fill(r.ordersCount, { n: report.commissions.workerOrders }) },
          ]}
          foot={fill(r.cancelledCount, { n: report.commissions.cancelledOrders })}
          share={share}
        />
        <Breakdown
          title={r.gmv}
          total={report.gmv.total}
          rows={[
            { label: r.gmvGoods, value: report.gmv.goods },
            { label: r.gmvLabour, value: report.gmv.labour },
            { label: r.gmvDelivery, value: report.gmv.delivery },
          ]}
          share={share}
        />
      </div>

      {/* daily chart */}
      <section className="border border-line bg-bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="eyebrow">{r.daily}</p>
          <p className="flex items-center gap-4 text-xs text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 bg-ink" /> {r.legendFees}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 bg-brand" /> {r.legendCommissions}
            </span>
          </p>
        </div>
        <RevenueChart days={report.days} locale={locale} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <RankTable
          title={r.byStore}
          head={[r.colPartner, r.colOrders, r.colSales, r.colRate, r.colCommission]}
          empty={r.empty}
          rows={report.byStore.map((s) => ({
            key: `s${s.storeId}`,
            href: `/admin/orders?store=${s.storeId}`,
            cells: [localizedName(locale, s), String(s.orders), formatGEL(s.goods), s.pct == null ? r.defaultRate : `${formatNumber(s.pct)}%`, formatGEL(s.commission)],
          }))}
        />
        <RankTable
          title={r.byWorker}
          head={[r.colPartner, r.colOrders, r.colSales, r.colRate, r.colCommission]}
          empty={r.empty}
          rows={report.byWorker.map((w) => ({
            key: `w${w.workerId}`,
            href: `/admin/orders?worker=${w.workerId}`,
            cells: [`${localizedName(locale, w)} · ${w.specialty}`, String(w.orders), formatGEL(w.labour), w.pct == null ? r.defaultRate : `${formatNumber(w.pct)}%`, formatGEL(w.commission)],
          }))}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <RankTable
          title={r.topProducts}
          head={[r.colProduct, r.colStore, r.colQty, r.colOrders, r.colTotal]}
          empty={r.empty}
          rows={report.topProducts.map((p, i) => ({
            key: `p${p.productId ?? 'x'}-${i}`,
            href: p.productId ? `/admin/products/${p.productId}` : undefined,
            cells: [localizedName(locale, p), p.storeNameKa ?? '—', formatNumber(p.qty), String(p.orders), formatGEL(p.total)],
          }))}
        />
        <section className="border border-line bg-bg-surface">
          <p className="eyebrow border-b border-line px-4 py-3">{r.statuses}</p>
          <ul>
            {ORDER_STATUSES.map((s) => (
              <li key={s} className="flex items-center justify-between border-b border-line/70 px-4 py-2.5 text-sm last:border-b-0">
                <Link href={`/admin/orders?status=${s}`} className="hover:text-brand">
                  {orderStatusLabel(ka, s)}
                </Link>
                <span className="font-semibold tabular-nums">{report.statuses[s]}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Breakdown({ title, total, rows, foot, share }: { title: string; total: number; rows: Array<{ label: string; value: number; hint?: string }>; foot?: string; share: (part: number, whole: number) => string }) {
  return (
    <section className="border border-line bg-bg-surface p-5">
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">{title}</p>
        <p className="font-serif text-lg font-semibold tabular-nums text-ink">{formatGEL(total)}</p>
      </div>
      <ul className="mt-3 space-y-2">
        {rows.map((row) => (
          <li key={row.label}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-ink">
                {row.label}
                {row.hint && <span className="ml-2 text-xs text-ink-muted">{row.hint}</span>}
              </span>
              <span className="tabular-nums">
                {formatGEL(row.value)} <span className="text-xs text-ink-muted">{share(row.value, total)}</span>
              </span>
            </div>
            <div className="mt-1 h-1 bg-line/60">
              <div className="h-1 bg-ink" style={{ width: total > 0 ? `${Math.min(100, (row.value / total) * 100)}%` : 0 }} />
            </div>
          </li>
        ))}
      </ul>
      {foot && <p className="mt-3 text-xs text-ink-muted">{foot}</p>}
    </section>
  );
}

function RankTable({ title, head, rows, empty }: { title: string; head: string[]; rows: Array<{ key: string; href?: string; cells: string[] }>; empty: string }) {
  return (
    <section className="border border-line bg-bg-surface">
      <p className="eyebrow border-b border-line px-4 py-3">{title}</p>
      {rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-ink-muted">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                {head.map((h, i) => (
                  <th key={h} className={cn('px-4 py-2', i > 0 && 'text-right')}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-line/70 last:border-b-0 hover:bg-bg-base/60">
                  {row.cells.map((c, i) => (
                    <td key={i} className={cn('px-4 py-2.5', i === 0 ? 'font-medium text-ink' : 'text-right tabular-nums', i === row.cells.length - 1 && 'font-semibold')}>
                      {i === 0 && row.href ? (
                        <Link href={row.href} className="hover:text-brand">
                          {c}
                        </Link>
                      ) : (
                        c
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
