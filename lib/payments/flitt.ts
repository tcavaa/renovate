import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Flitt's protocol, without the network: the signature every request and every answer carries,
 * and how an answer is read. Server only (`node:crypto`). Source: Flitt's
 * `api/building-signature.md`, `api/callbacks.md` and `api/order-parameters.md`
 * (docs.flitt.com) — see docs/payments.md.
 */

/** Flitt's public test merchant and its payment key (`api/testing.md`): the sandbox. */
export const FLITT_TEST_MERCHANT_ID = 1549901;

/** Where every API request goes, and where the embedded form's script and styles come from. */
export const FLITT_ORIGIN = 'https://pay.flitt.com';

/** The values an answer carries: strings mostly, a few numbers (`merchant_id`, `payment_id`, `card_bin`). */
export type FlittParams = Record<string, unknown>;

/** Never part of the string that is signed: the signature itself, and the test mode's hint of how it was built. */
const UNSIGNED = new Set(['signature', 'response_signature_string']);

/**
 * The string Flitt signs: the payment key, then every parameter that has a value, in the
 * alphabetical order of their names, joined by `|`. An empty parameter adds nothing — not
 * even its `|` — but a zero is a value.
 */
export function signatureString(secret: string, params: FlittParams): string {
  const values = Object.keys(params)
    .filter((key) => !UNSIGNED.has(key))
    .sort()
    .map((key) => params[key])
    .filter((value) => value !== undefined && value !== null && value !== '')
    .map((value) => String(value));
  return [secret, ...values].join('|');
}

/** SHA-1 of the signature string, lower-case hex — what goes in `signature`. */
export function flittSignature(secret: string, params: FlittParams): string {
  return createHash('sha1').update(signatureString(secret, params), 'utf8').digest('hex');
}

/** Whether an answer — a callback, a status — was signed with our key. */
export function verifyFlittSignature(secret: string, params: FlittParams): boolean {
  const given = params.signature;
  if (typeof given !== 'string' || !/^[0-9a-f]{40}$/i.test(given)) return false;
  // Compared in constant time: how long a wrong guess took says nothing about how close it was.
  return timingSafeEqual(Buffer.from(flittSignature(secret, params), 'hex'), Buffer.from(given.toLowerCase(), 'hex'));
}

/**
 * An answer's parameters: the API wraps them in `response`, a callback posts them bare (as
 * JSON, or as a form when the merchant asked for one).
 */
export function flittResponseOf(body: unknown): FlittParams | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const wrapped = (body as { response?: unknown }).response;
  if (wrapped && typeof wrapped === 'object' && !Array.isArray(wrapped)) return wrapped as FlittParams;
  return body as FlittParams;
}

/** Our record of a payment, as Flitt's `order_status` puts it. */
export type PaymentStatus = 'created' | 'processing' | 'approved' | 'declined' | 'expired' | 'reversed';

const STATUSES: readonly PaymentStatus[] = ['created', 'processing', 'approved', 'declined', 'expired', 'reversed'];

/** A status that will not change by itself: `approved` can still be reversed, but only by someone. */
export function isFinalStatus(status: PaymentStatus): boolean {
  return status !== 'created' && status !== 'processing';
}

/**
 * What a signed answer about our payment does to it, from the status it has to the one Flitt
 * reports (docs/payments.md#settling):
 *
 * - `approve` — not approved before: approved now, and what it paid for unlocked, in one
 *   transaction. Never out of `reversed`: a reversed payment's money went back, and a replayed
 *   (or late) "approved" once re-approved it and unlocked it again.
 * - `reverse` — the money went back: the status, and what it unlocked taken back.
 * - `status` — still on its way (created, processing) or ended without money (declined,
 *   expired): the status is written — only over a payment that is neither approved nor reversed.
 * - `facts` — nothing changes but the card's and the money's facts (a partial refund's
 *   `reversal_amount` on an approved payment, a late answer about a settled one).
 */
export type Settlement = 'approve' | 'reverse' | 'status' | 'facts';

export function settlementFor(current: PaymentStatus, next: PaymentStatus): Settlement {
  if (next === 'reversed') return current === 'reversed' ? 'facts' : 'reverse';
  if (current === 'approved' || current === 'reversed') return 'facts';
  return next === 'approved' ? 'approve' : 'status';
}

/** What the payment we hold looks like to Flitt's answer. */
export interface ExpectedPayment {
  orderId: string;
  merchantId: number;
  /** In tetri. */
  amount: number;
  currency: string;
}

/** The facts of an answer the payment keeps, beside the status. */
export interface FlittFacts {
  paymentId: string | null;
  maskedCard: string | null;
  cardType: string | null;
  cardBin: string | null;
  /** `card`, or the wallet the card came from (`googlepay`, `apple`). */
  paymentSystem: string | null;
  /** GEL, from Flitt's tetri; null until something was taken. */
  actualAmount: number | null;
  actualCurrency: string | null;
  /** GEL given back so far. */
  reversalAmount: number;
  rrn: string | null;
  approvalCode: string | null;
  orderTime: string | null;
  responseCode: string | null;
  responseDescription: string | null;
}

/** What an answer means for our payment. */
export type FlittOutcome = ({ ok: true; status: PaymentStatus } & FlittFacts) | { ok: false; reason: 'order' | 'merchant' | 'amount' | 'currency' | 'status' };

/**
 * Reads a signed answer against the payment it is about. The signature is checked by the
 * caller first; this makes sure it is *this* payment — the order, the merchant, the amount and
 * the currency asked for — before an `approved` unlocks anything. An approval for less than
 * was asked is not an approval.
 */
export function flittOutcome(params: FlittParams, expected: ExpectedPayment): FlittOutcome {
  if (String(params.order_id ?? '') !== expected.orderId) return { ok: false, reason: 'order' };
  if (Number(params.merchant_id) !== expected.merchantId) return { ok: false, reason: 'merchant' };
  const status = String(params.order_status ?? '') as PaymentStatus;
  if (!STATUSES.includes(status)) return { ok: false, reason: 'status' };
  if (status === 'approved') {
    if (Number(params.amount) !== expected.amount) return { ok: false, reason: 'amount' };
    if (String(params.currency ?? '').toUpperCase() !== expected.currency.toUpperCase()) return { ok: false, reason: 'currency' };
  }
  return { ok: true, status, ...flittFacts(params) };
}

/** An answer's value as text, or null when Flitt left it empty. */
function text(params: FlittParams, key: string, max: number): string | null {
  const value = params[key];
  return value === undefined || value === null || value === '' ? null : String(value).slice(0, max);
}

/** Tetri as GEL (`"1020"` → 10.2); null for an empty field. */
function gel(params: FlittParams, key: string): number | null {
  const value = text(params, key, 20);
  const tetri = value === null ? NaN : Number(value);
  return Number.isFinite(tetri) ? Math.round(tetri) / 100 : null;
}

/** `additional_info` is a JSON string inside the answer; what it says, or nothing. */
function additionalInfo(params: FlittParams): Record<string, unknown> {
  const raw = params.additional_info;
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw !== 'string' || !raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The facts of an answer worth a column: the card, the money, the bank's references. */
export function flittFacts(params: FlittParams): FlittFacts {
  const info = additionalInfo(params);
  const method = typeof info.payment_method === 'string' && info.payment_method ? info.payment_method : null;
  return {
    paymentId: text(params, 'payment_id', 32),
    maskedCard: text(params, 'masked_card', 19),
    cardType: text(params, 'card_type', 20),
    cardBin: text(params, 'card_bin', 8),
    paymentSystem: (method ?? text(params, 'payment_system', 30))?.slice(0, 30) ?? null,
    actualAmount: gel(params, 'actual_amount'),
    actualCurrency: text(params, 'actual_currency', 3),
    reversalAmount: gel(params, 'reversal_amount') ?? 0,
    rrn: text(params, 'rrn', 50),
    approvalCode: text(params, 'approval_code', 16),
    orderTime: text(params, 'order_time', 19),
    responseCode: text(params, 'response_code', 16),
    responseDescription: text(params, 'response_description', 255),
  };
}

/** An answer as it is kept: everything Flitt sent, less the test mode's hint of how it signed. */
export function storedPayload(params: FlittParams): Record<string, unknown> {
  const { response_signature_string: _hint, ...rest } = params;
  return rest;
}

/** The last four digits of a masked card (`444455XXXXXX1111` → `1111`). */
export function cardLast4(masked: string | null | undefined): string | null {
  const digits = /(\d{4})$/.exec(masked ?? '');
  return digits ? digits[1] : null;
}
