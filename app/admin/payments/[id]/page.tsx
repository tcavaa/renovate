import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { paymentEvents, payments, projects, users } from '@/lib/db/schema';
import { AdminPageHeader } from '@/components/admin/AdminList';
import { PaymentStatusBadge } from '@/components/admin/PaymentStatusBadge';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { sectionCrumb } from '@/lib/admin/crumbs';
import { fill } from '@/lib/admin/list';
import { requireAdminPage } from '@/lib/admin/guard';
import { getLocale, getT } from '@/lib/i18n/server';
import { dateLocaleFor } from '@/components/projects/ProjectDetail';
import { formatGEL, formatNumber } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** `additional_info` arrives as a JSON string: shown indented when it parses. */
function pretty(value: unknown): string {
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  return typeof value === 'object' && value !== null ? JSON.stringify(value, null, 2) : String(value);
}

/**
 * One card payment: everything the platform holds on it, and every answer Flitt gave about it —
 * each callback and each status the server asked for — whole, as it was received
 * (`payment_events`, docs/payments.md).
 */
export default async function AdminPaymentPage(props: { params: Promise<{ id: string }> }) {
  await requireAdminPage('payments');
  const { id } = await props.params;
  const paymentId = Number(id);
  if (!Number.isInteger(paymentId) || paymentId <= 0) notFound();
  const ka = await getT();
  const locale = await getLocale();
  const [[row], events] = await Promise.all([
    db
      .select({ payment: payments, userName: users.name, userEmail: users.email, projectName: projects.nameKa })
      .from(payments)
      .leftJoin(users, eq(payments.userId, users.id))
      .leftJoin(projects, eq(payments.projectId, projects.id))
      .where(eq(payments.id, paymentId))
      .limit(1),
    db.select().from(paymentEvents).where(eq(paymentEvents.paymentId, paymentId)).orderBy(asc(paymentEvents.createdAt), asc(paymentEvents.id)),
  ]);
  if (!row) notFound();
  const pay = row.payment;
  const s = ka.admin.paymentsPage;
  const dateLocale = dateLocaleFor(locale);
  const when = (d: Date | null) => (d ? new Date(d).toLocaleString(dateLocale) : '—');
  const money = (v: string | null) => (v == null ? '—' : formatGEL(Number(v), true));

  const facts: Array<[string, React.ReactNode]> = [
    [s.orderId, <span key="o" className="font-mono text-xs">{pay.orderId}</span>],
    [s.user, pay.userId ? <Link key="u" href={`/admin/users/${pay.userId}`} className="text-brand hover:underline">#{pay.userId} · {row.userName} · {row.userEmail}</Link> : '—'],
    [s.purpose, s.purposes[pay.purpose]],
    [s.project, pay.projectId ? <Link key="p" href={`/admin/projects/${pay.projectId}`} className="text-brand hover:underline">#{pay.projectId} · {row.projectName}</Link> : '—'],
    ...(pay.purpose === 'own_item' ? ([[s.product, pay.productId ? fill(s.productRef, { id: pay.productId }) : pay.status === 'approved' ? s.creditUnused : '—']] as Array<[string, React.ReactNode]>) : []),
    ...(pay.totalM2 ? ([[s.quote, `${formatGEL(Number(pay.feePerM2), true)} × ${formatNumber(Number(pay.totalM2))} მ²`]] as Array<[string, React.ReactNode]>) : []),
    [s.amount, money(pay.amount)],
    [fill(s.bankFee, { pct: `${formatNumber(Number(pay.bankFeePct))}%` }), money(pay.bankFee)],
    [s.total, <strong key="t">{money(pay.total)}</strong>],
    [s.actualAmount, `${money(pay.actualAmount)}${pay.actualCurrency ? ` (${pay.actualCurrency})` : ''}`],
    [s.reversalAmount, money(pay.reversalAmount)],
    [s.card, [pay.maskedCard, pay.cardType, pay.cardBin ? `BIN ${pay.cardBin}` : null].filter(Boolean).join(' · ') || '—'],
    [s.paymentSystem, pay.paymentSystem ?? '—'],
    [s.providerPaymentId, pay.providerPaymentId ?? '—'],
    [s.rrn, pay.rrn ?? '—'],
    [s.approvalCode, pay.approvalCode ?? '—'],
    [s.response, [pay.responseCode, pay.responseDescription].filter(Boolean).join(' · ') || '—'],
    [s.orderTime, pay.orderTime ?? '—'],
    [s.createdAt, when(pay.createdAt)],
    [s.paidAt, when(pay.paidAt)],
    [s.lastEventAt, when(pay.lastEventAt)],
  ];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        crumbs={[sectionCrumb(ka, 'payments'), { label: `#${pay.id}` }]}
        title={
          <>
            {s.transaction} <span className="text-ink-muted">#{pay.id}</span>
          </>
        }
        actions={<PaymentStatusBadge status={pay.status} testMode={pay.testMode} t={ka} />}
      />

      <Card>
        <CardContent className="p-0">
          <dl className="divide-y divide-line text-sm">
            {facts.map(([label, value]) => (
              <div key={label} className="grid gap-1 px-5 py-2.5 sm:grid-cols-[14rem_1fr]">
                <dt className="text-ink-muted">{label}</dt>
                <dd className="min-w-0 break-words">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="font-serif text-xl font-semibold">{s.events}</h2>
        <p className="text-sm text-ink-muted">{s.eventsHint}</p>
        {events.length === 0 && <p className="text-sm text-ink-muted">{s.eventsEmpty}</p>}
        {events.map((event) => (
          <Card key={event.id}>
            <CardHeader className="flex flex-row flex-wrap items-center gap-2 space-y-0 pb-3">
              <CardTitle className="text-base">{s.sources[event.source]}</CardTitle>
              {event.orderStatus && <Badge variant="outline">{event.orderStatus}</Badge>}
              <Badge variant={event.signatureValid ? 'success' : 'danger'}>{event.signatureValid ? s.signatureOk : s.signatureBad}</Badge>
              <span className="ml-auto text-xs text-ink-muted">{when(event.createdAt)}</span>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-4 gap-y-1 font-mono text-xs sm:grid-cols-[12rem_1fr]">
                {Object.keys(event.payload)
                  .sort()
                  .map((key) => (
                    <div key={key} className="contents">
                      <dt className="text-ink-muted">{key}</dt>
                      <dd className="min-w-0 whitespace-pre-wrap break-all">{event.payload[key] === '' || event.payload[key] == null ? '—' : pretty(event.payload[key])}</dd>
                    </div>
                  ))}
              </dl>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
