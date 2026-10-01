import { randomBytes } from 'node:crypto';
import { and, asc, desc, eq, gte, inArray, isNull, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { paymentEvents, payments, type Payment } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { log } from '@/lib/log';
import { toTetri, withBankFee, type CardCharge } from '@/lib/finance/money';
import { recordHalfPayment } from '@/lib/finance/payments';
import { cardLast4, flittOutcome, isFinalStatus, storedPayload, type FlittParams, type PaymentStatus } from './flitt';
import { createCheckoutToken, fetchOrderStatus, flittConfig, FlittError } from './flittApi';

/**
 * Card payments through Flitt, as the platform records them (docs/payments.md). A payment is
 * a `payments` row made before Flitt is asked for a token, and settled by Flitt's signed
 * answer — the callback, or the status the server asks for when the embedded form reports it
 * is done. Whichever comes first approves it, once; the other finds it approved. Only then is
 * anything unlocked: a half's `project_payments` row, an own item's credit.
 */

export type PaymentPurpose = Payment['purpose'];

/** A payment as the payment dialogue sees it. */
export interface CardPaymentView {
  orderId: string;
  purpose: PaymentPurpose;
  status: PaymentStatus;
  amount: number;
  bankFeePct: number;
  bankFee: number;
  total: number;
  testMode: boolean;
  cardLast4: string | null;
  responseDescription: string | null;
}

export function cardPaymentView(row: Payment): CardPaymentView {
  return {
    orderId: row.orderId,
    purpose: row.purpose,
    status: row.status,
    amount: Number(row.amount),
    bankFeePct: Number(row.bankFeePct),
    bankFee: Number(row.bankFee),
    total: Number(row.total),
    testMode: row.testMode,
    cardLast4: cardLast4(row.maskedCard),
    responseDescription: row.responseDescription ?? null,
  };
}

/** An order id Flitt has never seen: the test merchant is shared by everyone who tries it. */
function newOrderId(purpose: PaymentPurpose): string {
  const tag = purpose === 'own_item' ? 'own' : purpose === 'design' ? 'des' : 'calc';
  return `remonti-${tag}-${Date.now().toString(36)}-${randomBytes(5).toString('hex')}`;
}

/**
 * Where Flitt posts each result. Flitt cannot reach a machine's own localhost, so there is no
 * callback in development — the status check after the form settles the payment instead.
 */
function callbackUrl(): string | undefined {
  try {
    const url = new URL('/api/payments/flitt/callback', env.NEXT_PUBLIC_APP_URL);
    if (/^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(url.hostname) || url.hostname.endsWith('.localhost') || url.hostname.endsWith('.test')) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

/** How long a payment stays payable: the dialogue makes a new one when the person comes back. */
const ORDER_LIFETIME_S = 60 * 60;

export interface StartPaymentInput {
  userId: number;
  email?: string | null;
  purpose: PaymentPurpose;
  projectId?: number | null;
  /** The price before the bank's commission. */
  amount: number;
  bankFeePct: number;
  /** A half's quote, kept with the payment. */
  totalM2?: number | null;
  feePerM2?: number | null;
  description: string;
  lang: string;
}

export interface StartedPayment {
  payment: CardPaymentView;
  /** What the embedded form is opened with. */
  token: string;
  charge: CardCharge;
}

/**
 * Makes the payment and asks Flitt for the embedded form's token. The amount is the server's
 * — the price and the bank's commission on top — so the form can only charge what was quoted.
 */
export async function startCardPayment(input: StartPaymentInput): Promise<StartedPayment> {
  const config = flittConfig();
  const charge = withBankFee(input.amount, input.bankFeePct);
  const orderId = newOrderId(input.purpose);
  await db.insert(payments).values({
    orderId,
    userId: input.userId,
    purpose: input.purpose,
    projectId: input.projectId ?? null,
    totalM2: input.totalM2 != null ? String(input.totalM2) : null,
    feePerM2: input.feePerM2 != null ? String(input.feePerM2) : null,
    amount: String(charge.amount),
    bankFeePct: String(charge.bankFeePct),
    bankFee: String(charge.bankFee),
    total: String(charge.total),
    currency: 'GEL',
    status: 'created',
    provider: 'flitt',
    testMode: config.testMode,
  });
  try {
    const token = await createCheckoutToken({
      orderId,
      amount: toTetri(charge.total),
      description: input.description.slice(0, 1024),
      lang: input.lang,
      callbackUrl: callbackUrl(),
      email: input.email ?? undefined,
      lifetime: ORDER_LIFETIME_S,
    });
    const row = await paymentByOrderId(orderId);
    log.info('card payment started', { orderId, purpose: input.purpose, projectId: input.projectId ?? null, total: charge.total, testMode: config.testMode });
    return { payment: cardPaymentView(row!), token, charge };
  } catch (e) {
    // The order never reached Flitt: it is closed here, with Flitt's reason.
    await db
      .update(payments)
      .set({ status: 'declined', responseCode: e instanceof FlittError && e.code ? String(e.code) : null, responseDescription: (e as Error).message.slice(0, 255) })
      .where(eq(payments.orderId, orderId));
    throw e;
  }
}

export async function paymentByOrderId(orderId: string): Promise<Payment | null> {
  const [row] = await db.select().from(payments).where(eq(payments.orderId, orderId)).limit(1);
  return row ?? null;
}

export type SettleResult = { ok: true; payment: Payment } | { ok: false; reason: 'unknown' | 'order' | 'merchant' | 'amount' | 'currency' | 'status' };

/**
 * Keeps an answer of Flitt's whole (`payment_events`), for the admin's transaction page. Never
 * fatal: a payment is settled whether or not its log line could be written.
 */
export async function recordFlittEvent(input: { paymentId: number | null; orderId: string; source: 'callback' | 'status'; signatureValid: boolean; params: FlittParams }): Promise<void> {
  try {
    await db.insert(paymentEvents).values({
      paymentId: input.paymentId,
      orderId: input.orderId.slice(0, 64),
      source: input.source,
      signatureValid: input.signatureValid,
      orderStatus: typeof input.params.order_status === 'string' ? input.params.order_status.slice(0, 20) : null,
      payload: storedPayload(input.params),
    });
  } catch (e) {
    log.warn('flitt answer not logged', { orderId: input.orderId, err: e });
  }
}

/**
 * Settles a payment by Flitt's signed answer (the caller has checked the signature). The answer
 * is kept whole, then it must be about this order, this merchant, this amount and currency;
 * then the status and the card's facts are written, and an approval unlocks what was paid for —
 * once, however many answers arrive: the update to `approved` matches only a row that is not
 * approved yet. Later answers about an approved payment (a partial refund) still update its facts.
 */
export async function settleCardPayment(params: FlittParams, source: 'callback' | 'status'): Promise<SettleResult> {
  const orderId = String(params.order_id ?? '');
  const row = orderId ? await paymentByOrderId(orderId) : null;
  if (!row) {
    log.warn('flitt answer for an unknown order', { orderId, source });
    return { ok: false, reason: 'unknown' };
  }
  await recordFlittEvent({ paymentId: row.id, orderId, source, signatureValid: true, params });
  const outcome = flittOutcome(params, { orderId, merchantId: flittConfig().merchantId, amount: toTetri(Number(row.total)), currency: row.currency });
  if (!outcome.ok) {
    log.error('flitt answer does not match the payment', { orderId, source, reason: outcome.reason, status: params.order_status, amount: params.amount, expected: toTetri(Number(row.total)) });
    return { ok: false, reason: outcome.reason };
  }

  const now = new Date();
  const facts = {
    providerPaymentId: outcome.paymentId ?? row.providerPaymentId,
    maskedCard: outcome.maskedCard ?? row.maskedCard,
    cardType: outcome.cardType ?? row.cardType,
    cardBin: outcome.cardBin ?? row.cardBin,
    paymentSystem: outcome.paymentSystem ?? row.paymentSystem,
    actualAmount: outcome.actualAmount != null ? String(outcome.actualAmount) : row.actualAmount,
    actualCurrency: outcome.actualCurrency ?? row.actualCurrency,
    reversalAmount: String(outcome.reversalAmount),
    rrn: outcome.rrn ?? row.rrn,
    approvalCode: outcome.approvalCode ?? row.approvalCode,
    orderTime: outcome.orderTime ?? row.orderTime,
    responseCode: outcome.responseCode,
    responseDescription: outcome.responseDescription,
    lastEventAt: now,
  };

  if (outcome.status === 'approved') {
    const [result] = await db
      .update(payments)
      .set({ ...facts, status: 'approved', paidAt: now })
      .where(and(eq(payments.id, row.id), ne(payments.status, 'approved')));
    if (!result.affectedRows) await db.update(payments).set(facts).where(eq(payments.id, row.id));
    const updated = (await paymentByOrderId(orderId))!;
    if (result.affectedRows) {
      log.info('card payment approved', { orderId, purpose: row.purpose, projectId: row.projectId, total: Number(row.total), source, testMode: row.testMode });
      await fulfil(updated);
    }
    return { ok: true, payment: updated };
  }

  // Never back from approved to "still paying"; a reversal of an approved payment is recorded.
  if (row.status === 'approved' && outcome.status !== 'reversed') return { ok: true, payment: row };
  await db.update(payments).set({ ...facts, status: outcome.status }).where(eq(payments.id, row.id));
  if (outcome.status === 'reversed') log.warn('card payment reversed', { orderId, purpose: row.purpose, projectId: row.projectId });
  return { ok: true, payment: (await paymentByOrderId(orderId))! };
}

/** What an approved payment unlocks: a half's fee is recorded; an own item's credit simply exists. */
async function fulfil(payment: Payment): Promise<void> {
  if (payment.purpose !== 'calculator' && payment.purpose !== 'design') return;
  try {
    await recordHalfPayment(payment);
  } catch (e) {
    // A half paid twice (two tabs, two cards): the first stands, the second needs a refund.
    log.error('half payment could not be recorded — refund it in the Flitt portal', { orderId: payment.orderId, projectId: payment.projectId, err: e });
  }
}

/**
 * A payment as Flitt has it now: asked for when it is not settled yet — the form said it is
 * done, or the person came back. A payment Flitt cannot be asked about stays as it was.
 */
export async function refreshCardPayment(row: Payment): Promise<Payment> {
  if (isFinalStatus(row.status)) return row;
  try {
    const result = await settleCardPayment(await fetchOrderStatus(row.orderId), 'status');
    return result.ok ? result.payment : row;
  } catch (e) {
    log.warn('flitt status unavailable', { orderId: row.orderId, err: e });
    return row;
  }
}

/** How far back an unsettled payment is worth asking Flitt about: past its lifetime it has expired. */
const RECENT_MS = 2 * ORDER_LIFETIME_S * 1000;

/**
 * Asks Flitt about this person's unsettled payments for the same thing before a new one is
 * started: one paid in a tab that closed before the form said so — with no callback to tell us,
 * as on a developer's machine — is found approved instead of being paid a second time.
 */
export async function settleRecentPayments(where: { userId: number; purpose: PaymentPurpose; projectId?: number | null }): Promise<void> {
  const since = new Date(Date.now() - RECENT_MS);
  const rows = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.userId, where.userId),
        eq(payments.purpose, where.purpose),
        where.projectId ? eq(payments.projectId, where.projectId) : isNull(payments.projectId),
        inArray(payments.status, ['created', 'processing']),
        gte(payments.createdAt, since),
      ),
    )
    .orderBy(desc(payments.id))
    .limit(5);
  for (const row of rows) await refreshCardPayment(row);
}

/** An own item paid for and not yet added: the next upload uses it. */
export async function ownItemCredit(userId: number): Promise<Payment | null> {
  const [row] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.userId, userId), eq(payments.purpose, 'own_item'), eq(payments.status, 'approved'), isNull(payments.consumedAt)))
    .orderBy(asc(payments.id))
    .limit(1);
  return row ?? null;
}

/**
 * Takes one credit for an upload, before anything is stored: two uploads racing for one credit
 * get it once (the update matches only an unclaimed row). Null when there is none.
 */
export async function claimOwnItemCredit(userId: number): Promise<number | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const credit = await ownItemCredit(userId);
    if (!credit) return null;
    const [result] = await db
      .update(payments)
      .set({ consumedAt: new Date() })
      .where(and(eq(payments.id, credit.id), isNull(payments.consumedAt)));
    if (result.affectedRows) return credit.id;
  }
  return null;
}

/** An upload that failed after taking its credit gives it back. */
export async function releaseOwnItemCredit(paymentId: number): Promise<void> {
  await db.update(payments).set({ consumedAt: null, productId: null }).where(eq(payments.id, paymentId));
}

/** The credit was spent on this product. */
export async function spendOwnItemCredit(paymentId: number, productId: number): Promise<void> {
  await db.update(payments).set({ productId }).where(eq(payments.id, paymentId));
}
