import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { checkouts, projectPayments, type Payment, type Project, type ProjectPayment } from '@/lib/db/schema';
import type { Room } from '@/lib/calculator/types';
import type { FloorPlan } from '@/lib/design/types';
import { cardLast4 } from '@/lib/payments/flitt';
import { feeAreaM2, feePerM2For, platformFee, type CheckoutKind } from './money';
import { loadPlatformSettings } from './settings';

/**
 * The platform's fee for one half of a project, paid before that half's hinge — "start the
 * calculation" in the calculator, the generation in the studio. The payment dialogue saves the
 * half first, so the area is read off the saved row (`feeAreaM2`) at the day's rate, never the
 * browser's figure. A half is paid once (`project_payments` is unique on project and half).
 *
 * The money goes through Flitt (`lib/payments/service.ts`, docs/payments.md): the card payment
 * is a `payments` row, and its approval writes the half's row here (`recordHalfPayment`). The
 * hinge itself is not refused without a payment by the save routes — see the known gaps in
 * docs/marketplace.md.
 */

/** A half's payment as the client sees it. */
export interface PaymentView {
  kind: CheckoutKind;
  amount: number;
  feePerM2: number;
  totalM2: number;
  method: string;
  cardLast4: string | null;
  reference: string;
  paidAt: string;
}

/** What a half would cost to pay now. */
export interface PaymentQuote {
  kind: CheckoutKind;
  feePerM2: number;
  totalM2: number;
  amount: number;
}

export function paymentView(row: ProjectPayment): PaymentView {
  return {
    kind: row.kind,
    amount: Number(row.amount),
    feePerM2: Number(row.feePerM2),
    totalM2: Number(row.totalM2),
    method: row.method,
    cardLast4: row.cardLast4 ?? null,
    reference: row.reference,
    paidAt: new Date(row.createdAt).toISOString(),
  };
}

/** The payments a project has, by half. */
export async function paymentsOf(projectId: number): Promise<Partial<Record<CheckoutKind, PaymentView>>> {
  const rows = await db.select().from(projectPayments).where(eq(projectPayments.projectId, projectId));
  const out: Partial<Record<CheckoutKind, PaymentView>> = {};
  for (const row of rows) out[row.kind] = paymentView(row);
  return out;
}

/** A fee a project paid, as its pages list it: at a hinge (a payment) or, before that, at a checkout. */
export interface RecordedFee {
  key: string;
  kind: CheckoutKind;
  amount: number;
  feePerM2: number;
  totalM2: number;
}

/**
 * Every fee a project paid: the payments made at its hinges, and the fees charged at checkout
 * before the fee moved there (a checkout carries one only then). The project pages show them
 * beside the orders.
 */
export async function projectFees(projectId: number): Promise<RecordedFee[]> {
  const [paid, charged] = await Promise.all([
    db.select().from(projectPayments).where(eq(projectPayments.projectId, projectId)),
    db
      .select({ id: checkouts.id, kind: checkouts.kind, platformFee: checkouts.platformFee, feePerM2: checkouts.feePerM2, totalM2: checkouts.totalM2 })
      .from(checkouts)
      .where(eq(checkouts.projectId, projectId)),
  ]);
  return [
    ...paid.map((p) => ({ key: `p${p.id}`, kind: p.kind, amount: Number(p.amount), feePerM2: Number(p.feePerM2), totalM2: Number(p.totalM2) })),
    ...charged.filter((c) => Number(c.platformFee) > 0).map((c) => ({ key: `c${c.id}`, kind: c.kind, amount: Number(c.platformFee), feePerM2: Number(c.feePerM2), totalM2: Number(c.totalM2) })),
  ];
}

/** The fee for a half of the project as it is saved now. */
export async function paymentQuote(project: Pick<Project, 'rooms' | 'plan'>, kind: CheckoutKind): Promise<PaymentQuote> {
  const settings = await loadPlatformSettings();
  const feePerM2 = feePerM2For(kind, settings);
  const totalM2 = feeAreaM2(kind, { rooms: (project.rooms as Room[] | null) ?? [], plan: (project.plan as FloorPlan | null) ?? null });
  return { kind, feePerM2, totalM2, amount: platformFee(totalM2, feePerM2) };
}

/**
 * Records a half as paid, from its approved Flitt payment (`lib/payments/service.ts` calls it
 * once per approval, in the approval's transaction `tx`): the quote the payment was made for,
 * the platform's fee alone — the bank's commission stays on the payment. A half already paid by
 * another payment keeps the first (the caller looks first and logs the second for a refund; the
 * unique key refuses one that slips past, which rolls that approval back to be settled again).
 */
export async function recordHalfPayment(payment: Payment, tx: Pick<typeof db, 'insert'> = db): Promise<void> {
  if (payment.purpose !== 'calculator' && payment.purpose !== 'design') return;
  if (!payment.projectId) return;
  await tx.insert(projectPayments).values({
    projectId: payment.projectId,
    userId: payment.userId,
    kind: payment.purpose,
    totalM2: payment.totalM2 ?? '0',
    feePerM2: payment.feePerM2 ?? '0',
    amount: payment.amount,
    method: 'flitt',
    cardLast4: cardLast4(payment.maskedCard),
    reference: payment.orderId,
  });
}

/** A half's payment, if it has one. */
export async function halfPayment(projectId: number, kind: CheckoutKind): Promise<PaymentView | null> {
  const [row] = await db
    .select()
    .from(projectPayments)
    .where(and(eq(projectPayments.projectId, projectId), eq(projectPayments.kind, kind)))
    .limit(1);
  return row ? paymentView(row) : null;
}
