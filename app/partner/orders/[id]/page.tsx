import { notFound } from 'next/navigation';
import { getT } from '@/lib/i18n/server';
import { loadPartnerContext, partnerHref } from '@/lib/partner/context';
import { loadOrderView, markOrderViewed, partnerOwnsOrder } from '@/lib/finance/orders';
import { orderData } from '@/lib/finance/view';
import { OrderEditor } from '@/components/orders/OrderEditor';
import { fill } from '@/lib/admin/list';

export const dynamic = 'force-dynamic';

export default async function PartnerOrderPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ store?: string; worker?: string }> }) {
  const [{ id }, search] = await Promise.all([props.params, props.searchParams]);
  const t = await getT();
  const ctx = await loadPartnerContext(search);
  if (!ctx) return null;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId <= 0) notFound();

  const view = await loadOrderView(orderId);
  if (!view) notFound();
  if (!ctx.isAdmin && !partnerOwnsOrder(ctx.ref, view.order)) notFound();

  // Opening the order is what clears the "new" badge — for the real partner, not admin.
  if (!ctx.isAdmin && !view.order.viewedAt) {
    await markOrderViewed(orderId);
    view.order.viewedAt = new Date();
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">{ctx.name ?? view.store?.nameKa ?? view.worker?.nameKa}</p>
        <h1 className="mt-2 font-serif text-3xl font-bold">{fill(t.partner.orderTitle, { id: view.order.id })}</h1>
      </div>
      <OrderEditor order={orderData(view)} mode={ctx.isAdmin ? 'admin' : 'partner'} backHref={partnerHref('/partner/orders', ctx)} />
    </div>
  );
}
