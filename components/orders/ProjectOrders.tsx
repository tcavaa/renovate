import { ChevronDown, Phone } from 'lucide-react';
import { OrderStageBadge } from '@/components/orders/OrderStatusBadge';
import type { Dictionary, Locale } from '@/lib/i18n';
import { localizedName, unitLabel } from '@/lib/i18n/labels';
import { fill } from '@/lib/admin/list';
import { ordersForProject, type ProjectOrder } from '@/lib/finance/orders';
import { projectFees } from '@/lib/finance/payments';
import { FeeSummary } from '@/components/orders/FeeSummary';
import { lineDiff, orderStage } from '@/lib/finance/orderFlow';
import { dateLocaleFor } from '@/components/projects/ProjectDetail';
import { FoldSection } from '@/components/projects/FoldSection';
import { cn, formatGEL, formatNumber, TIME_ZONE } from '@/lib/utils';

/**
 * The orders a project turned into, for its owner: one card per partner with where the order
 * stands in plain words ("our manager is checking it", "confirmed and with the store"), what it
 * comes to with the delivery, whatever the partner wrote back — and every change the platform
 * made on the customer's behalf shown against what was ordered: a line struck out, a quantity
 * "3 → 2", a price, a line added, the delivery. Server component; sits in the project page as
 * one of its folding blocks, with the fees the project paid beside the title (`FeeSummary`).
 */
export async function ProjectOrders({ projectId, t, locale }: { projectId: number; t: Dictionary; locale: Locale }) {
  const [orders, fees] = await Promise.all([ordersForProject(projectId), projectFees(projectId)]);
  const feeSummary = fees.length > 0 ? <FeeSummary fees={fees} t={t} /> : undefined;

  return (
    <FoldSection title={t.market.ordersTitle} count={orders.length} aside={feeSummary} defaultOpen={orders.length > 0}>
      {orders.length === 0 ? (
        <p className="border border-dashed border-line p-8 text-center text-sm text-ink-muted">{t.market.ordersEmpty}</p>
      ) : (
        <OrderCards orders={orders} t={t} locale={locale} />
      )}
    </FoldSection>
  );
}

/**
 * A project's orders as cards, one per partner — the project page's list, and each project's
 * group on the hubs' "orders" (`HubOrders`).
 */
export function OrderCards({ orders, t, locale }: { orders: ProjectOrder[]; t: Dictionary; locale: Locale }) {
  const dateLocale = dateLocaleFor(locale);
  const r = t.orderReview;
  const partnerOf = (o: ProjectOrder) =>
    o.partnerType === 'store'
      ? { kind: t.admin.ordersPage.kindStore, nameKa: o.storeNameKa ?? '—', nameEn: o.storeNameEn, nameRu: o.storeNameRu, phone: o.storePhone }
      : o.partnerType === 'team'
        ? { kind: r.kindTeam, nameKa: o.teamNameKa ?? '—', nameEn: o.teamNameEn, nameRu: o.teamNameRu, phone: o.teamPhone }
        : { kind: t.admin.ordersPage.kindWorker, nameKa: o.workerNameKa ?? '—', nameEn: o.workerNameEn, nameRu: o.workerNameRu, phone: o.workerPhone };

  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {orders.map((o) => {
        const partner = partnerOf(o);
        const stage = orderStage(o);
        const delivery = Number(o.deliveryFee);
        const deliveryWas = o.originalDeliveryFee != null && Number(o.originalDeliveryFee) !== delivery ? Number(o.originalDeliveryFee) : null;
        const changed = o.items.some((i) => lineDiff(lineOf(i)).kind !== 'same');
        return (
          <li key={o.id} className="border border-line bg-bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="eyebrow">{partner.kind}</p>
                <p className="mt-1 truncate font-serif text-lg font-semibold text-ink">{localizedName(locale, partner)}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-ink-muted">
                  <span>{fill(t.market.orderNo, { id: o.id })}</span>
                  <span>
                    {t.market.orderedOn} {new Date(o.createdAt).toLocaleDateString(dateLocale, { timeZone: TIME_ZONE })}
                  </span>
                  <span>{fill(t.market.itemsCount, { n: o.itemCount })}</span>
                  {partner.phone && o.sentAt && (
                    <a href={`tel:${partner.phone}`} className="inline-flex items-center gap-1 hover:text-ink">
                      <Phone className="h-3 w-3" />
                      {partner.phone}
                    </a>
                  )}
                </p>
              </div>
              <div className="text-right">
                <p className="font-serif text-lg font-semibold tabular-nums text-ink">{formatGEL(Number(o.subtotal))}</p>
                {(delivery > 0 || deliveryWas != null) && (
                  <p className="text-xs text-ink-muted">
                    {t.market.delivery} {formatGEL(delivery)}
                    {deliveryWas != null && <span className="ml-1 text-warning">({fill(r.deliveryWas, { amount: formatGEL(deliveryWas) })})</span>}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <OrderStageBadge stage={stage} t={t} />
            </div>
            <p className="mt-2 text-xs text-ink-muted">{(r.customerHints as Record<string, string>)[stage]}</p>
            {o.partnerMessage && (
              <div className="mt-3 border-l-2 border-ink pl-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{t.market.partnerMessage}</p>
                <p className="mt-1 text-sm text-ink">{o.partnerMessage}</p>
              </div>
            )}
            {o.items.length > 0 && (
              <details className="group mt-3 border-t border-line pt-2" open={changed || undefined}>
                <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-ink hover:text-brand">
                  <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                  {fill(t.market.showItems, { n: o.items.length })}
                </summary>
                <ul className="mt-2 divide-y divide-line/70 text-sm">
                  {o.items.map((line) => {
                    const diff = lineDiff(lineOf(line));
                    return (
                      <li key={line.id} className={cn('flex items-baseline justify-between gap-3 py-1.5', diff.kind === 'removed' && 'text-ink-faint')}>
                        <span className="min-w-0">
                          <span className={cn('block truncate', diff.kind === 'removed' && 'line-through')}>{localizedName(locale, line)}</span>
                          <span className="block text-xs text-ink-muted">
                            {[line.roomName, `${formatNumber(Number(line.qty))} ${unitLabel(t, line.unit)} × ${formatGEL(Number(line.unitPrice))}`].filter(Boolean).join(' · ')}
                            {diff.kind === 'removed' && <span className="ml-2 text-danger">{r.removedByManager}</span>}
                            {diff.kind === 'added' && <span className="ml-2 text-success">{r.addedByManager}</span>}
                            {diff.kind === 'changed' && diff.qtyFrom != null && <span className="ml-2 text-warning">{fill(r.qtyWas, { qty: formatNumber(diff.qtyFrom) })}</span>}
                            {diff.kind === 'changed' && diff.priceFrom != null && <span className="ml-2 text-warning">{fill(r.priceWas, { price: formatGEL(diff.priceFrom) })}</span>}
                          </span>
                        </span>
                        <span className={cn('shrink-0 tabular-nums', diff.kind === 'removed' && 'line-through')}>{formatGEL(Number(line.total))}</span>
                      </li>
                    );
                  })}
                </ul>
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function lineOf(line: ProjectOrder['items'][number]) {
  return {
    qty: Number(line.qty),
    unitPrice: Number(line.unitPrice),
    removed: line.removed,
    originalQty: line.originalQty == null ? null : Number(line.originalQty),
    originalUnitPrice: line.originalUnitPrice == null ? null : Number(line.originalUnitPrice),
  };
}
