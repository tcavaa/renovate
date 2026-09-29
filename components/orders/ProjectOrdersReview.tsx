import type { Dictionary, Locale } from '@/lib/i18n';
import { ordersForProject } from '@/lib/finance/orders';
import { projectFees } from '@/lib/finance/payments';
import { FeeSummary } from '@/components/orders/FeeSummary';
import { awaitsConfirmation, orderStage } from '@/lib/finance/orderFlow';
import { localizedName } from '@/lib/i18n/labels';
import { FoldSection } from '@/components/projects/FoldSection';
import { OrderReviewCard, type ReviewOrder } from '@/components/orders/OrderReviewCard';

/**
 * A project's orders on the admin's project page — the orders agent's workbench: every store's
 * order waiting to be confirmed first, each one confirmable right here (lines kept or struck,
 * quantities, delivery, "confirm and send"), then the ones already sent and the bookings.
 * Server component; the cards are client ones.
 */
export async function ProjectOrdersReview({ projectId, t, locale }: { projectId: number; t: Dictionary; locale: Locale }) {
  const [rows, fees] = await Promise.all([ordersForProject(projectId), projectFees(projectId)]);
  const orders: Array<ReviewOrder & { waiting: boolean }> = rows.map((o) => {
    const partnerName =
      o.partnerType === 'store'
        ? localizedName(locale, { nameKa: o.storeNameKa ?? '—', nameEn: o.storeNameEn, nameRu: o.storeNameRu })
        : o.partnerType === 'team'
          ? localizedName(locale, { nameKa: o.teamNameKa ?? '—', nameEn: o.teamNameEn, nameRu: o.teamNameRu })
          : localizedName(locale, { nameKa: o.workerNameKa ?? '—', nameEn: o.workerNameEn, nameRu: o.workerNameRu });
    return {
      id: o.id,
      partnerType: o.partnerType,
      stage: orderStage(o),
      waiting: awaitsConfirmation(o),
      partnerName,
      deliveryFee: Number(o.deliveryFee),
      originalDeliveryFee: o.originalDeliveryFee == null ? null : Number(o.originalDeliveryFee),
      sentAt: o.sentAt ? o.sentAt.toISOString() : null,
      confirmedAt: o.confirmedAt ? o.confirmedAt.toISOString() : null,
      items: o.items.map((i) => ({
        id: i.id,
        nameKa: i.nameKa,
        nameEn: i.nameEn,
        nameRu: i.nameRu,
        roomName: i.roomName,
        unit: i.unit,
        qty: Number(i.qty),
        unitPrice: Number(i.unitPrice),
        removed: i.removed,
        originalQty: i.originalQty == null ? null : Number(i.originalQty),
        originalUnitPrice: i.originalUnitPrice == null ? null : Number(i.originalUnitPrice),
      })),
    };
  });
  orders.sort((a, b) => Number(b.waiting) - Number(a.waiting));
  const waiting = orders.filter((o) => o.waiting).length;

  const feeSummary = fees.length > 0 ? <FeeSummary fees={fees} t={t} /> : undefined;

  return (
    <FoldSection title={t.market.ordersTitle} count={orders.length} aside={feeSummary} defaultOpen={orders.length > 0}>
      {orders.length === 0 ? (
        <p className="border border-dashed border-line p-8 text-center text-sm text-ink-muted">{t.market.ordersEmpty}</p>
      ) : (
        <div className="space-y-3">
          {waiting > 0 && <p className="border border-warning/50 bg-warning/5 px-4 py-2.5 text-sm text-ink-soft">{t.orderReview.projectOrdersHint}</p>}
          <ul className="grid gap-4 xl:grid-cols-2">
            {orders.map((o) => (
              <OrderReviewCard key={o.id} order={o} />
            ))}
          </ul>
        </div>
      )}
    </FoldSection>
  );
}
