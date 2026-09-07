import Link from 'next/link';
import { Phone } from 'lucide-react';
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';
import type { Dictionary, Locale } from '@/lib/i18n';
import { localizedName } from '@/lib/i18n/labels';
import { fill } from '@/lib/admin/list';
import { checkoutForProject, ordersForProject } from '@/lib/finance/orders';
import { dateLocaleFor } from '@/components/projects/ProjectDetail';
import { formatGEL, formatM2 } from '@/lib/utils';

/**
 * The orders a project turned into, for its owner (and admin): one card per partner with
 * status, total and whatever the partner wrote back. Server component — reads the database.
 */
export async function ProjectOrders({ projectId, t, locale, orderHref }: { projectId: number; t: Dictionary; locale: Locale; orderHref?: (id: number) => string }) {
  const [orders, checkout] = await Promise.all([ordersForProject(projectId), checkoutForProject(projectId)]);
  const dateLocale = dateLocaleFor(locale);

  return (
    <section className="mt-12">
      <div className="flex items-baseline justify-between border-b border-line pb-3">
        <h2 className="font-serif text-2xl font-semibold text-ink">
          {t.market.ordersTitle} <span className="ml-2 text-base font-normal text-ink-muted">({orders.length})</span>
        </h2>
        {checkout && (
          <p className="text-sm text-ink-muted">
            {t.market.feeRecorded}: <span className="font-semibold text-ink">{formatGEL(Number(checkout.platformFee))}</span>
            <span className="ml-2 text-xs">{fill(t.market.platformFeeHint, { fee: formatGEL(Number(checkout.feePerM2)), m2: formatM2(Number(checkout.totalM2)) })}</span>
          </p>
        )}
      </div>
      {orders.length === 0 ? (
        <p className="mt-4 border border-dashed border-line p-8 text-center text-sm text-ink-muted">{t.market.ordersEmpty}</p>
      ) : (
        <ul className="mt-4 grid gap-4 md:grid-cols-2">
          {orders.map((o) => {
            const partner = o.partnerType === 'store' ? { nameKa: o.storeNameKa ?? '—', nameEn: o.storeNameEn, nameRu: o.storeNameRu, phone: o.storePhone } : { nameKa: o.workerNameKa ?? '—', nameEn: o.workerNameEn, nameRu: o.workerNameRu, phone: o.workerPhone };
            const title = fill(t.market.orderNo, { id: o.id });
            return (
              <li key={o.id} className="border border-line bg-bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="eyebrow">{o.partnerType === 'store' ? t.admin.ordersPage.kindStore : t.admin.ordersPage.kindWorker}</p>
                    <p className="mt-1 truncate font-serif text-lg font-semibold text-ink">{localizedName(locale, partner)}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-ink-muted">
                      {orderHref ? (
                        <Link href={orderHref(o.id)} className="text-brand hover:underline">
                          {title}
                        </Link>
                      ) : (
                        <span>{title}</span>
                      )}
                      <span>
                        {t.market.orderedOn} {new Date(o.createdAt).toLocaleDateString(dateLocale)}
                      </span>
                      <span>{fill(t.market.itemsCount, { n: o.itemCount })}</span>
                      {partner.phone && (
                        <a href={`tel:${partner.phone}`} className="inline-flex items-center gap-1 hover:text-ink">
                          <Phone className="h-3 w-3" />
                          {partner.phone}
                        </a>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-serif text-lg font-semibold tabular-nums text-ink">{formatGEL(Number(o.subtotal))}</p>
                    {Number(o.deliveryFee) > 0 && (
                      <p className="text-xs text-ink-muted">
                        {t.market.delivery} {formatGEL(Number(o.deliveryFee))}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <OrderStatusBadge status={o.status} t={t} />
                </div>
                {o.partnerMessage && (
                  <div className="mt-3 border-l-2 border-ink pl-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{t.market.partnerMessage}</p>
                    <p className="mt-1 text-sm text-ink">{o.partnerMessage}</p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
