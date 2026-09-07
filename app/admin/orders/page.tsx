import Link from 'next/link';
import { and, asc, count, desc, eq, gte, like, lte, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { orders, stores, workers } from '@/lib/db/schema';
import { FilterBar } from '@/components/admin/FilterBar';
import { AdminPageHeader, AdminTable, EmptyRow, Pager, THead, Th, Tr } from '@/components/admin/AdminList';
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';
import { Badge } from '@/components/ui/badge';
import { getLocale, getT } from '@/lib/i18n/server';
import { parseListParams, type SearchParams } from '@/lib/admin/list';
import { ORDER_STATUSES, type OrderStatus } from '@/lib/finance/money';
import { orderStatusLabel } from '@/lib/i18n/labels';
import { dateLocaleFor } from '@/components/projects/ProjectDetail';
import { formatGEL, formatNumber } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const PATH = '/admin/orders';
type Sort = 'newest' | 'subtotal' | 'commission';

/**
 * Every partner order on the platform. Filters live in the URL like the other admin lists,
 * so "new store orders this week" is a link the dashboard can point at.
 */
export default async function AdminOrdersPage(props: { searchParams: Promise<SearchParams> }) {
  const ka = await getT();
  const locale = await getLocale();
  const p = parseListParams<Sort>(await props.searchParams, { sorts: ['newest', 'subtotal', 'commission'], defaultSort: 'newest', defaultDir: 'desc' });

  const where: SQL[] = [];
  const q = p.get('q');
  if (q) where.push(or(like(orders.customerName, `%${q}%`), like(orders.customerPhone, `%${q}%`), like(stores.nameKa, `%${q}%`), like(workers.nameKa, `%${q}%`), sql`CAST(${orders.id} AS CHAR) LIKE ${`%${q}%`}`)!);
  const status = p.get('status');
  if (status && (ORDER_STATUSES as readonly string[]).includes(status)) where.push(eq(orders.status, status as OrderStatus));
  const type = p.get('type');
  if (type === 'store' || type === 'worker') where.push(eq(orders.partnerType, type));
  const storeId = Number(p.get('store'));
  if (Number.isInteger(storeId) && storeId > 0) where.push(eq(orders.storeId, storeId));
  const workerId = Number(p.get('worker'));
  if (Number.isInteger(workerId) && workerId > 0) where.push(eq(orders.workerId, workerId));
  if (p.get('unread') === 'yes') where.push(sql`${orders.viewedAt} IS NULL`);
  const dateFrom = p.get('dateFrom');
  if (dateFrom) where.push(gte(orders.createdAt, new Date(dateFrom)));
  const dateTo = p.get('dateTo');
  if (dateTo) where.push(lte(orders.createdAt, new Date(`${dateTo}T23:59:59`)));

  const sortColumn = p.sort === 'subtotal' ? orders.subtotal : p.sort === 'commission' ? orders.commissionAmount : orders.createdAt;
  const orderBy = p.dir === 'asc' ? asc(sortColumn) : desc(sortColumn);
  const condition = where.length ? and(...where) : undefined;

  const [rows, [{ total }], storeOptions, workerOptions] = await Promise.all([
    db
      .select({
        id: orders.id,
        partnerType: orders.partnerType,
        status: orders.status,
        subtotal: orders.subtotal,
        deliveryFee: orders.deliveryFee,
        commissionPct: orders.commissionPct,
        commissionAmount: orders.commissionAmount,
        customerName: orders.customerName,
        customerPhone: orders.customerPhone,
        createdAt: orders.createdAt,
        viewedAt: orders.viewedAt,
        storeName: stores.nameKa,
        workerName: workers.nameKa,
      })
      .from(orders)
      .leftJoin(stores, eq(orders.storeId, stores.id))
      .leftJoin(workers, eq(orders.workerId, workers.id))
      .where(condition)
      .orderBy(orderBy, desc(orders.id))
      .limit(p.pageSize)
      .offset((p.page - 1) * p.pageSize),
    db.select({ total: count() }).from(orders).leftJoin(stores, eq(orders.storeId, stores.id)).leftJoin(workers, eq(orders.workerId, workers.id)).where(condition),
    db.select({ id: stores.id, name: stores.nameKa }).from(stores).orderBy(asc(stores.nameKa)),
    db.select({ id: workers.id, name: workers.nameKa }).from(workers).orderBy(asc(workers.nameKa)),
  ]);

  const f = ka.admin.filters;
  const o = ka.admin.ordersPage;
  const dateLocale = dateLocaleFor(locale);

  return (
    <div className="space-y-6">
      <AdminPageHeader title={o.title} subtitle={o.subtitle} />

      <FilterBar
        fields={[
          { name: 'q', type: 'search', className: 'w-72' },
          { name: 'status', type: 'select', label: f.status, options: ORDER_STATUSES.map((s) => ({ value: s, label: orderStatusLabel(ka, s) })) },
          { name: 'type', type: 'select', label: o.partnerFilter, options: [{ value: 'store', label: o.kindStore }, { value: 'worker', label: o.kindWorker }] },
          { name: 'store', type: 'select', label: f.store, options: storeOptions.map((s) => ({ value: String(s.id), label: s.name })) },
          { name: 'worker', type: 'select', label: o.kindWorker, options: workerOptions.map((w) => ({ value: String(w.id), label: w.name })) },
          { name: 'unread', type: 'select', label: o.unread, options: [{ value: 'yes', label: o.notViewed }] },
          { name: 'dateFrom', type: 'date', label: f.dateFrom },
          { name: 'dateTo', type: 'date', label: f.dateTo },
        ]}
        sorts={[
          { value: 'newest', label: f.sortNewest },
          { value: 'newest:asc', label: f.sortOldest },
          { value: 'subtotal', label: f.sortCost },
          { value: 'commission', label: o.commission },
        ]}
        defaultSort="newest"
      />

      <AdminTable>
        <THead>
          <Th>{ka.admin.table.id}</Th>
          <Th>{o.partner}</Th>
          <Th>{o.customer}</Th>
          <Th right>{o.subtotal}</Th>
          <Th right>{o.commission}</Th>
          <Th>{ka.admin.table.status}</Th>
          <Th>{ka.admin.table.date}</Th>
        </THead>
        <tbody>
          {rows.map((r) => (
            <Tr key={r.id} className={r.viewedAt ? undefined : 'bg-brand/5'}>
              <td className="px-4 py-2.5">
                <Link href={`/admin/orders/${r.id}`} className="font-medium text-brand hover:underline">
                  #{r.id}
                </Link>
              </td>
              <td className="px-4 py-2.5">
                <p className="font-medium">{r.storeName ?? r.workerName ?? '—'}</p>
                <Badge variant={r.partnerType === 'store' ? 'outline' : 'secondary'}>{r.partnerType === 'store' ? o.kindStore : o.kindWorker}</Badge>
              </td>
              <td className="px-4 py-2.5">
                <p>{r.customerName}</p>
                <p className="text-xs text-ink-muted">{r.customerPhone}</p>
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {formatGEL(Number(r.subtotal))}
                {Number(r.deliveryFee) > 0 && <span className="block text-xs text-ink-muted">+ {formatGEL(Number(r.deliveryFee))}</span>}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {formatGEL(Number(r.commissionAmount))}
                <span className="block text-xs text-ink-muted">{formatNumber(Number(r.commissionPct))}%</span>
              </td>
              <td className="px-4 py-2.5">
                <OrderStatusBadge status={r.status} t={ka} />
                {!r.viewedAt && r.status !== 'cancelled' && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-brand">{o.unread}</span>}
              </td>
              <td className="px-4 py-2.5 text-ink-muted">{new Date(r.createdAt).toLocaleDateString(dateLocale)}</td>
            </Tr>
          ))}
          {rows.length === 0 && <EmptyRow colSpan={7} text={where.length ? f.noResults : o.empty} />}
        </tbody>
      </AdminTable>

      <Pager t={ka} pathname={PATH} raw={p.raw} page={p.page} pageSize={p.pageSize} total={Number(total)} />
    </div>
  );
}
