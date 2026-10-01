import { env } from '@/lib/env';
import { log } from '@/lib/log';
import { FLITT_ORIGIN, FLITT_TEST_MERCHANT_ID, flittResponseOf, flittSignature, verifyFlittSignature, type FlittParams } from './flitt';

/**
 * Flitt's API, the two calls the platform makes (docs/payments.md): a checkout token for the
 * embedded form (`POST /api/checkout/token`) and an order's status (`POST /api/status/order_id`).
 * Server only — the payment key never leaves it.
 */

export interface FlittConfig {
  merchantId: number;
  secretKey: string;
  /** A merchant in test mode: nothing is charged, Flitt's test cards pay. */
  testMode: boolean;
  /** Flitt's own public test merchant — the sandbox anyone can pay into. */
  sandbox: boolean;
}

export function flittConfig(): FlittConfig {
  const merchantId = env.FLITT_MERCHANT_ID;
  const sandbox = merchantId === FLITT_TEST_MERCHANT_ID;
  return { merchantId, secretKey: env.FLITT_SECRET_KEY, testMode: sandbox || env.FLITT_TEST_MODE === 'true', sandbox };
}

/** A request Flitt refused, with its code and words (`error_code` 1014 is a bad signature). */
export class FlittError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
  ) {
    super(message);
    this.name = 'FlittError';
  }
}

/** How long Flitt waits for an answer: a payment dialogue cannot hang on it. */
const TIMEOUT_MS = 15_000;

async function post(path: string, request: FlittParams): Promise<FlittParams> {
  const { secretKey } = flittConfig();
  const body = { request: { ...request, signature: flittSignature(secretKey, request) } };
  const res = await fetch(`${FLITT_ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  });
  const json: unknown = await res.json().catch(() => null);
  const response = flittResponseOf(json);
  if (!res.ok || !response) throw new FlittError(`Flitt ${path} answered ${res.status}`, null);
  if (response.response_status !== 'success') {
    const code = Number(response.error_code) || null;
    // In test mode a refused signature comes back with the string Flitt expected (the key masked).
    log.warn('flitt request refused', { path, code, message: response.error_message, expected: response.response_signature_string });
    throw new FlittError(String(response.error_message ?? 'Flitt refused the request'), code);
  }
  return response;
}

export interface CheckoutTokenRequest {
  orderId: string;
  /** In tetri. */
  amount: number;
  description: string;
  /** The form's language: `ka`, `en`, `ru`. */
  lang: string;
  /** Where Flitt posts the result; omitted when Flitt cannot reach the app (localhost). */
  callbackUrl?: string;
  email?: string;
  /** Seconds the order stays payable. */
  lifetime: number;
}

/** A token the embedded form is opened with: the order is made, the amount fixed by the server. */
export async function createCheckoutToken(input: CheckoutTokenRequest): Promise<string> {
  const { merchantId } = flittConfig();
  const response = await post('/api/checkout/token', {
    version: '1.0.1',
    merchant_id: merchantId,
    order_id: input.orderId,
    order_desc: input.description,
    amount: input.amount,
    currency: 'GEL',
    lang: input.lang,
    lifetime: input.lifetime,
    server_callback_url: input.callbackUrl,
    sender_email: input.email,
  });
  const token = typeof response.token === 'string' ? response.token : '';
  if (!token) throw new FlittError('Flitt gave no token', null);
  return token;
}

/**
 * An order as Flitt has it now, signature checked. What the browser's "success" is worth
 * nothing until this (or the callback) says `approved`.
 */
export async function fetchOrderStatus(orderId: string): Promise<FlittParams> {
  const { merchantId, secretKey } = flittConfig();
  const response = await post('/api/status/order_id', { version: '1.0.1', merchant_id: merchantId, order_id: orderId });
  if (!verifyFlittSignature(secretKey, response)) throw new FlittError('Flitt status signature mismatch', null);
  return response;
}
