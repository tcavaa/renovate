import { NextResponse } from 'next/server';
import { RATE_RULES, rateLimited } from '@/lib/api/rateLimit';
import { handle } from '@/lib/api/route';
import { log } from '@/lib/log';
import { flittResponseOf, verifyFlittSignature } from '@/lib/payments/flitt';
import { flittConfig } from '@/lib/payments/flittApi';
import { paymentByOrderId, recordFlittEvent, settleCardPayment } from '@/lib/payments/service';
import { orderIdSchema } from '@/lib/validations/payment.schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A callback is a few dozen short parameters; anything this large is not Flitt's. */
const MAX_BYTES = 32_000;

/** A callback's body: JSON as Flitt sends it, or a form when the merchant's portal says so. Null when it is too large or unreadable. */
async function readBody(req: Request): Promise<unknown> {
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BYTES) return null;
  const raw = await req.text().catch(() => '');
  if (!raw || raw.length > MAX_BYTES) return null;
  const type = req.headers.get('content-type') ?? '';
  if (type.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(raw).entries());
  if (type.includes('multipart/form-data')) {
    return Object.fromEntries((await new Response(raw, { headers: { 'content-type': type } }).formData().catch(() => new FormData())).entries());
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/**
 * Flitt's server-to-server result of a payment (`server_callback_url`, docs/payments.md). No
 * session — the signature is the proof: one that does not verify is refused and changes
 * nothing. A verified one settles the payment (once, whatever it repeats) and is answered 200,
 * which is what stops Flitt retrying — also for an answer that does not match its payment,
 * which is logged for a person to look at, since asking again would not change it.
 */
export const POST = handle('POST /api/payments/flitt/callback', 'Failed to handle the callback', async (req) => {
  const limited = rateLimited(req, RATE_RULES.paymentCallback);
  if (limited) return limited;
  const params = flittResponseOf(await readBody(req));
  if (!params || !verifyFlittSignature(flittConfig().secretKey, params)) {
    const orderId = typeof params?.order_id === 'string' ? params.order_id : null;
    log.warn('flitt callback with a bad signature', { orderId });
    // Kept for the transaction page when it names one of our orders: someone tried to settle it.
    const row = orderId && orderIdSchema.safeParse(orderId).success ? await paymentByOrderId(orderId) : null;
    if (row && params) await recordFlittEvent({ paymentId: row.id, orderId: row.orderId, source: 'callback', signatureValid: false, params });
    return NextResponse.json({ data: null, error: 'INVALID_SIGNATURE' }, { status: 400 });
  }
  const result = await settleCardPayment(params, 'callback');
  return NextResponse.json({ data: { received: true, settled: result.ok }, error: null });
});
