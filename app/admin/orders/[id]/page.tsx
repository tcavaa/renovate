import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { getLocale, getT } from '@/lib/i18n/server';
import { loadOrderView } from '@/lib/finance/orders';
import { orderData } from '@/lib/finance/view';
import { OrderEditor } from '@/components/orders/OrderEditor';
import { dateLocaleFor } from '@/components/projects/ProjectDetail';
import { fill } from '@/lib/admin/list';
import { formatGEL } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function AdminOrderPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const ka = await getT();
  const locale = await getLocale();
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId <= 0) notFound();
  const view = await loadOrderView(orderId);
  if (!view) notFound();
  const data = orderData(view);
  const o = ka.admin.ordersPage;
  const partnerHref = view.store ? `/admin/stores/${view.store.id}` : view.worker ? `/admin/workers/${view.worker.id}` : null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/orders" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-brand">
          <ArrowLeft className="h-4 w-4" />
          {o.backToAll}
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <h1 className="font-serif text-3xl font-bold">
            {fill(o.title, {})} <span className="text-ink-muted">#{data.id}</span>
          </h1>
          <div className="flex flex-wrap items-center gap-4 text-sm text-ink-muted">
            {partnerHref && data.partner && (
              <Link href={partnerHref} className="text-brand hover:underline">
                {data.partnerType === 'store' ? o.kindStore : o.kindWorker}: {data.partner.nameKa}
              </Link>
            )}
            {data.checkout && (
              <span>
                {fill(o.checkout, { id: data.checkout.id })} · {o.platformFee} {formatGEL(data.checkout.platformFee)}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              {data.viewedAt ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {data.viewedAt ? `${o.viewedAt} ${new Date(data.viewedAt).toLocaleString(dateLocaleFor(locale))}` : o.notViewed}
            </span>
          </div>
        </div>
      </div>
      <OrderEditor order={data} mode="admin" backHref="/admin/orders" />
    </div>
  );
}
