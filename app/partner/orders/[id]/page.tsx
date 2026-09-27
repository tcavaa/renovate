import { notFound } from 'next/navigation';
import { getT } from '@/lib/i18n/server';
import { loadPartnerContext, partnerHref } from '@/lib/partner/context';
import { loadOrderView, markOrderViewed, orderEventsFor, partnerNameOf, partnerOwnsOrder, redactForPartner } from '@/lib/finance/orders';
import { orderData, orderEventData } from '@/lib/finance/view';
import { PartnerOrderView } from '@/components/orders/PartnerOrderView';
import { OrderTimeline } from '@/components/orders/OrderTimeline';
import { fill } from '@/lib/admin/list';

export const dynamic = 'force-dynamic';

/**
 * One of the partner's orders: the partner's view of it (`PartnerOrderView`) and the thread
 * with the platform (`OrderTimeline`). An order that is not theirs — or a store's order the
 * platform has not sent yet — is simply not found. Admin previewing the portal sees it as the
 * partner does.
 */
export default async function PartnerOrderPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ store?: string; worker?: string; team?: string }> }) {
  const [{ id }, search] = await Promise.all([props.params, props.searchParams]);
  const t = await getT();
  const ctx = await loadPartnerContext(search);
  if (!ctx) return null;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId <= 0) notFound();

  const [view, events] = await Promise.all([loadOrderView(orderId), orderEventsFor(orderId)]);
  if (!view) notFound();
  if (!ctx.isAdmin && !partnerOwnsOrder(ctx.ref, view.order)) notFound();

  // Opening the order is what clears the "new" badge — for the real partner, not admin.
  if (!ctx.isAdmin && !view.order.viewedAt) {
    await markOrderViewed(orderId);
    view.order.viewedAt = new Date();
  }

  // A brigade does the whole job: its booking opens the project to look at (a turned-down one does not).
  const projectHref = ctx.type === 'team' && view.order.partnerType === 'team' && view.order.projectId && view.order.status !== 'cancelled' ? partnerHref(`/partner/projects/${view.order.projectId}`, ctx) : null;

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">{ctx.name ?? partnerNameOf(view)}</p>
        <h1 className="mt-2 font-serif text-3xl font-bold">{fill(t.partner.orderTitle, { id: view.order.id })}</h1>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <PartnerOrderView order={orderData(redactForPartner(view))} backHref={partnerHref('/partner/orders', ctx)} projectHref={projectHref} />
        <div className="xl:sticky xl:top-6 xl:self-start">
          <OrderTimeline orderId={view.order.id} events={orderEventData(events)} />
        </div>
      </div>
    </div>
  );
}
