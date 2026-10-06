import Link from 'next/link';
import { Phone } from 'lucide-react';
import { getLocale, getT } from '@/lib/i18n/server';
import { loadPartnerContext, partnerHref } from '@/lib/partner/context';
import { partnerOrders } from '@/lib/finance/orders';
import { ORDER_STATUSES, type OrderStatus } from '@/lib/finance/money';
import { orderStage } from '@/lib/finance/orderFlow';
import { OrderStageBadge } from '@/components/orders/OrderStatusBadge';
import { FilterBar } from '@/components/admin/FilterBar';
import { dateLocaleFor } from '@/components/projects/ProjectDetail';
import { orderStatusLabel } from '@/lib/i18n/labels';
import { fill } from '@/lib/admin/list';
import { formatGEL, cn, TIME_ZONE } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * The partner's orders — the ones it has been sent. Search by customer, phone or number;
 * filter by status or by what is still unread; a booking still waiting for the partner's
 * answer is marked as such.
 */
export default async function PartnerOrdersPage(props: { searchParams: Promise<{ store?: string; worker?: string; team?: string; status?: string; unread?: string; q?: string }> }) {
  const search = await props.searchParams;
  const t = await getT();
  const locale = await getLocale();
  const ctx = await loadPartnerContext(search);
  if (!ctx || !ctx.type) return null;

  const status = (ORDER_STATUSES as readonly string[]).includes(search.status ?? '') ? (search.status as OrderStatus) : undefined;
  const q = (search.q ?? '').trim().slice(0, 100);
  const rows = await partnerOrders(ctx.ref, { status, unread: search.unread === 'yes', q: q || undefined });
  const dateLocale = dateLocaleFor(locale);
  const f = t.admin.filters;

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">{ctx.name}</p>
        <h1 className="mt-2 font-serif text-3xl font-bold">{t.partner.orders}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t.partner.ordersSubtitle}</p>
      </div>

      <FilterBar
        fields={[
          { name: 'q', type: 'search' },
          { name: 'status', type: 'select', label: f.status, options: ORDER_STATUSES.map((s) => ({ value: s, label: orderStatusLabel(t, s) })) },
          { name: 'unread', type: 'select', label: t.partner.unread, options: [{ value: 'yes', label: t.partner.unread }] },
        ]}
      />

      {rows.length === 0 ? (
        <p className="border border-dashed border-line p-12 text-center text-sm text-ink-muted">{status || q || search.unread ? t.partner.emptyFiltered : t.partner.noOrders}</p>
      ) : (
        <div className="overflow-x-auto border border-line bg-bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">{t.partner.customer}</th>
                <th className="px-4 py-3">{t.partner.project}</th>
                <th className="px-4 py-3 text-right">{t.partner.items}</th>
                <th className="px-4 py-3 text-right">{t.partner.total}</th>
                <th className="px-4 py-3">{t.partner.statusLabel}</th>
                <th className="px-4 py-3">{t.partner.placedOn}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className={cn('border-b border-line/70 transition-colors last:border-b-0 hover:bg-bg-base/60', !o.viewedAt && 'bg-brand/5')}>
                  <td className="px-4 py-3">
                    <Link href={partnerHref(`/partner/orders/${o.id}`, ctx)} className="inline-flex items-center gap-2 font-semibold text-ink hover:text-brand">
                      #{o.id}
                      {!o.viewedAt && <span className="bg-brand px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">{t.partner.unread}</span>}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{o.customerName}</p>
                    <a href={`tel:${o.customerPhone}`} className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink">
                      <Phone className="h-3 w-3" />
                      {o.customerPhone}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {/* A brigade opens the project it is hired for; other partners see its name. */}
                    {ctx.type === 'team' && o.projectId && o.status !== 'cancelled' ? (
                      <Link href={partnerHref(`/partner/projects/${o.projectId}`, ctx)} className="text-ink underline-offset-4 hover:text-brand hover:underline">
                        {o.projectName ?? `#${o.projectId}`}
                      </Link>
                    ) : (
                      (o.projectName ?? '—')
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{o.itemCount}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {formatGEL(Number(o.subtotal))}
                    {Number(o.deliveryFee) > 0 && <span className="block text-xs font-normal text-ink-muted">+ {formatGEL(Number(o.deliveryFee))}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <OrderStageBadge stage={orderStage(o)} t={t} />
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{new Date(o.sentAt ?? o.createdAt).toLocaleDateString(dateLocale, { timeZone: TIME_ZONE })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-ink-muted">{fill(t.partner.unreadCount, { n: rows.filter((r) => !r.viewedAt).length })}</p>
    </div>
  );
}
