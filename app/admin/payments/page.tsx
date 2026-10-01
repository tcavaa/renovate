import Link from 'next/link';
import { and, asc, count, desc, eq, gte, like, lte, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { payments, users } from '@/lib/db/schema';
import { FilterBar } from '@/components/admin/FilterBar';
import { AdminPageHeader, AdminTable, EmptyRow, Pager, THead, Th, Tr } from '@/components/admin/AdminList';
import { PaymentStatusBadge } from '@/components/admin/PaymentStatusBadge';
import { sectionCrumb } from '@/lib/admin/crumbs';
import { fill, parseListParams, type SearchParams } from '@/lib/admin/list';
import { requireAdminPage } from '@/lib/admin/guard';
import { getLocale, getT } from '@/lib/i18n/server';
import { dateLocaleFor } from '@/components/projects/ProjectDetail';
import { formatGEL } from '@/lib/utils';
import type { PaymentStatus } from '@/lib/payments/flitt';

export const dynamic = 'force-dynamic';

const PATH = '/admin/payments';
type Sort = 'newest' | 'total';
const STATUSES: readonly PaymentStatus[] = ['approved', 'created', 'processing', 'declined', 'expired', 'reversed'];
const PURPOSES = ['calculator', 'design', 'own_item'] as const;

/**
 * Every card payment through Flitt (docs/payments.md): who paid, for what, with which card,
 * what Flitt took and gave back, its status and Flitt's own time of the order — the facts of
 * the last answer Flitt gave, each one kept whole on the transaction's page. Filters in the URL
 * like the other admin lists; the line above the table sums what the filter shows.
 */
export default async function AdminPaymentsPage(props: { searchParams: Promise<SearchParams> }) {
  await requireAdminPage('payments');
  const ka = await getT();
  const locale = await getLocale();
  const p = parseListParams<Sort>(await props.searchParams, { sorts: ['newest', 'total'], defaultSort: 'newest', defaultDir: 'desc' });

  const where: SQL[] = [];
  const q = p.get('q');
  if (q) where.push(or(like(payments.orderId, `%${q}%`), like(users.email, `%${q}%`), like(users.name, `%${q}%`), like(payments.maskedCard, `%${q}%`), like(payments.rrn, `%${q}%`), like(payments.providerPaymentId, `%${q}%`), sql`CAST(${payments.projectId} AS CHAR) = ${q}`)!);
  const status = p.get('status');
  if ((STATUSES as readonly string[]).includes(status)) where.push(eq(payments.status, status as PaymentStatus));
  const purpose = p.get('purpose');
  if ((PURPOSES as readonly string[]).includes(purpose)) where.push(eq(payments.purpose, purpose as (typeof PURPOSES)[number]));
  const mode = p.get('mode');
  if (mode === 'test' || mode === 'live') where.push(eq(payments.testMode, mode === 'test'));
  const userId = p.num('user');
  if (userId && userId > 0) where.push(eq(payments.userId, userId));
  const projectId = p.num('project');
  if (projectId && projectId > 0) where.push(eq(payments.projectId, projectId));
  const dateFrom = p.get('dateFrom');
  if (dateFrom) where.push(gte(payments.createdAt, new Date(dateFrom)));
  const dateTo = p.get('dateTo');
  if (dateTo) where.push(lte(payments.createdAt, new Date(`${dateTo}T23:59:59`)));

  const condition = where.length ? and(...where) : undefined;
  const sortColumn = p.sort === 'total' ? payments.total : payments.createdAt;
  const orderBy = p.dir === 'asc' ? asc(sortColumn) : desc(sortColumn);

  const [rows, [{ total }], [sums]] = await Promise.all([
    db
      .select({
        id: payments.id,
        orderId: payments.orderId,
        purpose: payments.purpose,
        projectId: payments.projectId,
        productId: payments.productId,
        status: payments.status,
        testMode: payments.testMode,
        amount: payments.amount,
        bankFee: payments.bankFee,
        total: payments.total,
        actualAmount: payments.actualAmount,
        reversalAmount: payments.reversalAmount,
        maskedCard: payments.maskedCard,
        cardType: payments.cardType,
        paymentSystem: payments.paymentSystem,
        orderTime: payments.orderTime,
        createdAt: payments.createdAt,
        userId: payments.userId,
        userName: users.name,
        userEmail: users.email,
      })
      .from(payments)
      .leftJoin(users, eq(payments.userId, users.id))
      .where(condition)
      .orderBy(orderBy, desc(payments.id))
      .limit(p.pageSize)
      .offset((p.page - 1) * p.pageSize),
    db.select({ total: count() }).from(payments).leftJoin(users, eq(payments.userId, users.id)).where(condition),
    // What the filtered view took: approved payments only, less what was given back.
    db
      .select({
        approved: sql<number>`COALESCE(SUM(CASE WHEN ${payments.status} = 'approved' THEN 1 ELSE 0 END), 0)`,
        charged: sql<number>`COALESCE(SUM(CASE WHEN ${payments.status} = 'approved' THEN ${payments.total} ELSE 0 END), 0)`,
        bankFees: sql<number>`COALESCE(SUM(CASE WHEN ${payments.status} = 'approved' THEN ${payments.bankFee} ELSE 0 END), 0)`,
        reversed: sql<number>`COALESCE(SUM(${payments.reversalAmount}), 0)`,
      })
      .from(payments)
      .leftJoin(users, eq(payments.userId, users.id))
      .where(condition),
  ]);

  const f = ka.admin.filters;
  const s = ka.admin.paymentsPage;
  const dateLocale = dateLocaleFor(locale);

  return (
    <div className="space-y-6">
      <AdminPageHeader crumbs={[sectionCrumb(ka, 'payments', true)]} title={s.title} subtitle={s.subtitle} />

      <FilterBar
        fields={[
          { name: 'q', type: 'search', placeholder: s.searchPlaceholder },
          { name: 'status', type: 'select', label: f.status, options: STATUSES.map((v) => ({ value: v, label: s.statuses[v] })) },
          { name: 'purpose', type: 'select', label: s.purpose, options: PURPOSES.map((v) => ({ value: v, label: s.purposes[v] })) },
          { name: 'mode', type: 'select', label: s.mode, options: [{ value: 'live', label: s.live }, { value: 'test', label: s.test }] },
          { type: 'dateRange', label: f.date, from: 'dateFrom', to: 'dateTo' },
        ]}
        sorts={[
          { value: 'newest', label: f.sortNewest },
          { value: 'newest:asc', label: f.sortOldest },
          { value: 'total', label: s.sortTotal },
        ]}
        defaultSort="newest"
      />

      <p className="border-l-2 border-ink pl-4 text-sm text-ink-soft">
        {fill(s.summary, { n: Number(sums.approved), charged: formatGEL(Number(sums.charged), true), bank: formatGEL(Number(sums.bankFees), true), reversed: formatGEL(Number(sums.reversed), true) })}
      </p>

      <AdminTable>
        <THead>
          <Th>{s.order}</Th>
          <Th>{s.user}</Th>
          <Th>{s.purpose}</Th>
          <Th>{s.card}</Th>
          <Th right>{s.total}</Th>
          <Th right>{s.actualAmount}</Th>
          <Th right>{s.reversalAmount}</Th>
          <Th>{ka.admin.table.status}</Th>
          <Th>{s.orderTime}</Th>
        </THead>
        <tbody>
          {rows.map((r) => (
            <Tr key={r.id}>
              <td className="px-4 py-2.5">
                <Link href={`${PATH}/${r.id}`} className="font-medium text-brand hover:underline">
                  #{r.id}
                </Link>
                <span className="block max-w-[11rem] truncate font-mono text-[11px] text-ink-muted" title={r.orderId}>
                  {r.orderId}
                </span>
              </td>
              <td className="px-4 py-2.5">
                {r.userId ? (
                  <Link href={`/admin/users/${r.userId}`} className="hover:text-brand">
                    <span className="block">{r.userName ?? '—'}</span>
                    <span className="block text-xs text-ink-muted">
                      #{r.userId} · {r.userEmail}
                    </span>
                  </Link>
                ) : (
                  '—'
                )}
              </td>
              <td className="px-4 py-2.5">
                <span className="block">{s.purposes[r.purpose]}</span>
                {r.projectId && (
                  <Link href={`/admin/projects/${r.projectId}`} className="text-xs text-ink-muted hover:text-brand">
                    {fill(s.projectRef, { id: r.projectId })}
                  </Link>
                )}
                {r.purpose === 'own_item' && <span className="block text-xs text-ink-muted">{r.productId ? fill(s.productRef, { id: r.productId }) : r.status === 'approved' ? s.creditUnused : ''}</span>}
              </td>
              <td className="px-4 py-2.5">
                {r.maskedCard ? (
                  <>
                    <span className="block font-mono text-xs">{r.maskedCard}</span>
                    <span className="block text-xs text-ink-muted">{[r.cardType, r.paymentSystem].filter(Boolean).join(' · ')}</span>
                  </>
                ) : (
                  <span className="text-ink-muted">—</span>
                )}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {formatGEL(Number(r.total), true)}
                <span className="block text-xs text-ink-muted">
                  {formatGEL(Number(r.amount), true)} + {formatGEL(Number(r.bankFee), true)}
                </span>
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">{r.actualAmount != null ? formatGEL(Number(r.actualAmount), true) : '—'}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{Number(r.reversalAmount) > 0 ? formatGEL(Number(r.reversalAmount), true) : '—'}</td>
              <td className="px-4 py-2.5">
                <PaymentStatusBadge status={r.status} testMode={r.testMode} t={ka} />
              </td>
              <td className="px-4 py-2.5 text-xs text-ink-muted">
                {r.orderTime ?? '—'}
                <span className="block">{new Date(r.createdAt).toLocaleString(dateLocale)}</span>
              </td>
            </Tr>
          ))}
          {rows.length === 0 && <EmptyRow colSpan={9} text={where.length ? f.noResults : s.empty} />}
        </tbody>
      </AdminTable>

      <Pager t={ka} pathname={PATH} raw={p.raw} page={p.page} pageSize={p.pageSize} total={Number(total)} />
    </div>
  );
}
