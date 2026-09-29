import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { checkouts, projectPayments, type Project, type ProjectPayment } from '@/lib/db/schema';
import type { Room } from '@/lib/calculator/types';
import type { FloorPlan } from '@/lib/design/types';
import { log } from '@/lib/log';
import { feeAreaM2, feePerM2For, platformFee, type CheckoutKind } from './money';
import { loadPlatformSettings } from './settings';

/**
 * The platform's fee for one half of a project, paid before that half's hinge — "start the
 * calculation" in the calculator, the generation in the studio. The payment dialogue saves the
 * half first, so the area is read off the saved row (`feeAreaM2`) at the day's rate, never the
 * browser's figure. A half is paid once (`project_payments` is unique on project and half);
 * paying again answers the payment already made.
 *
 * There is no payment provider yet: the dialogue's card is a test card, nothing is charged,
 * and the row's `method` is `test`. The hinge itself is not refused without a payment by the
 * save routes — see the known gaps in docs/marketplace.md.
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

/** A made-up reference for a test payment: never mistaken for a provider's. */
function testReference(): string {
  return `TEST-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

export type PayResult = { ok: true; payment: PaymentView; alreadyPaid: boolean } | { ok: false; error: 'NOTHING_TO_PAY' };

/**
 * Records the payment of a half: the quote of the saved row, once. A second payment of the
 * same half — a double click, a second tab — finds the first and returns it.
 */
export async function payProjectHalf(project: Project, kind: CheckoutKind, userId: number, cardLast4: string | null): Promise<PayResult> {
  const existing = await db
    .select()
    .from(projectPayments)
    .where(and(eq(projectPayments.projectId, project.id), eq(projectPayments.kind, kind)))
    .limit(1);
  if (existing[0]) return { ok: true, payment: paymentView(existing[0]), alreadyPaid: true };

  const quote = await paymentQuote(project, kind);
  if (quote.totalM2 <= 0) return { ok: false, error: 'NOTHING_TO_PAY' };
  try {
    await db.insert(projectPayments).values({
      projectId: project.id,
      userId,
      kind,
      totalM2: String(quote.totalM2),
      feePerM2: String(quote.feePerM2),
      amount: String(quote.amount),
      method: 'test',
      cardLast4: cardLast4?.slice(-4) ?? null,
      reference: testReference(),
    });
  } catch (e) {
    // Two payments of one half racing each other: the unique key lets one in; the other reads it back.
    const again = await db
      .select()
      .from(projectPayments)
      .where(and(eq(projectPayments.projectId, project.id), eq(projectPayments.kind, kind)))
      .limit(1);
    if (again[0]) return { ok: true, payment: paymentView(again[0]), alreadyPaid: true };
    throw e;
  }
  const [row] = await db
    .select()
    .from(projectPayments)
    .where(and(eq(projectPayments.projectId, project.id), eq(projectPayments.kind, kind)))
    .limit(1);
  log.info('project half paid', { projectId: project.id, kind, amount: quote.amount, totalM2: quote.totalM2, method: 'test' });
  return { ok: true, payment: paymentView(row), alreadyPaid: false };
}
