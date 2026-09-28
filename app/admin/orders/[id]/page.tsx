import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { getLocale, getT } from '@/lib/i18n/server';
import { loadOrderView, orderEventsFor } from '@/lib/finance/orders';
import { orderData, orderEventData } from '@/lib/finance/view';
import { OrderEditor } from '@/components/orders/OrderEditor';
import { OrderTimeline } from '@/components/orders/OrderTimeline';
import { dateLocaleFor } from '@/components/projects/ProjectDetail';
import { fill } from '@/lib/admin/list';
import { canAdmin } from '@/lib/auth/roles';
import { formatGEL } from '@/lib/utils';
import { requireAdminPage } from '@/lib/admin/guard';
import { sectionCrumb } from '@/lib/admin/crumbs';
import { AdminCrumbs } from '@/components/admin/AdminCrumbs';

export const dynamic = 'force-dynamic';

export default async function AdminOrderPage(props: { params: Promise<{ id: string }> }) {
  const session = await requireAdminPage('orders');
  const { id } = await props.params;
  const ka = await getT();
  const locale = await getLocale();
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId <= 0) notFound();
  const [view, events] = await Promise.all([loadOrderView(orderId), orderEventsFor(orderId)]);
  if (!view) notFound();
  const data = orderData(view);
  const o = ka.admin.ordersPage;
  const role = session.user.role;
  // The partner's own admin page, when this account may open it (an orders agent may not).
  const partnerHref =
    view.store && canAdmin(role, 'stores') ? `/admin/stores/${view.store.id}` : view.team && canAdmin(role, 'teams') ? `/admin/teams/${view.team.id}` : view.worker && canAdmin(role, 'workers') ? `/admin/workers/${view.worker.id}` : null;
  const kind = data.partnerType === 'store' ? o.kindStore : data.partnerType === 'team' ? ka.orderReview.kindTeam : o.kindWorker;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <AdminCrumbs trail={[sectionCrumb(ka, 'orders'), { label: `#${data.id}` }]} />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="font-serif text-3xl font-bold">
            {fill(o.title, {})} <span className="text-ink-muted">#{data.id}</span>
          </h1>
          <div className="flex flex-wrap items-center gap-4 text-sm text-ink-muted">
            {data.partner &&
              (partnerHref ? (
                <Link href={partnerHref} className="text-brand hover:underline">
                  {kind}: {data.partner.nameKa}
                </Link>
              ) : (
                <span>
                  {kind}: <span className="text-ink">{data.partner.nameKa}</span>
                  {data.partner.phone && <a href={`tel:${data.partner.phone}`} className="ml-2 hover:text-ink">{data.partner.phone}</a>}
                </span>
              ))}
            {data.checkout && (
              <span>
                {fill(o.checkout, { id: data.checkout.id })} · {o.platformFee} {formatGEL(data.checkout.platformFee)}
              </span>
            )}
            {data.sentAt && (
              <span className="inline-flex items-center gap-1">
                {data.viewedAt ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                {data.viewedAt ? `${o.viewedAt} ${new Date(data.viewedAt).toLocaleString(dateLocaleFor(locale))}` : o.notViewed}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <OrderEditor order={data} backHref="/admin/orders" />
        <div className="xl:sticky xl:top-6 xl:self-start">
          <OrderTimeline orderId={data.id} events={orderEventData(events)} />
        </div>
      </div>
    </div>
  );
}
