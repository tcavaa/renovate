import { NextResponse } from 'next/server';
import { handle } from '@/lib/api/route';
import { log } from '@/lib/log';
import { flittResponseOf, verifyFlittSignature } from '@/lib/payments/flitt';
import { flittConfig } from '@/lib/payments/flittApi';
import { paymentByOrderId, recordFlittEvent, settleCardPayment } from '@/lib/payments/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A callback's body: JSON as Flitt sends it, or a form when the merchant's portal says so. */
async function readBody(req: Request): Promise<unknown> {
  const type = req.headers.get('content-type') ?? '';
  if (type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data')) {
    return Object.fromEntries((await req.formData()).entries());
  }
  return req.json().catch(() => null);
}

/**
 * Flitt's server-to-server result of a payment (`server_callback_url`, docs/payments.md). No
 * session — the signature is the proof: one that does not verify is refused and changes
 * nothing. A verified one settles the payment (once, whatever it repeats) and is answered 200,
 * which is what stops Flitt retrying — also for an answer that does not match its payment,
 * which is logged for a person to look at, since asking again would not change it.
 */
export const POST = handle('POST /api/payments/flitt/callback', 'Failed to handle the callback', async (req) => {
  const params = flittResponseOf(await readBody(req));
  if (!params || !verifyFlittSignature(flittConfig().secretKey, params)) {
    const orderId = typeof params?.order_id === 'string' ? params.order_id : null;
    log.warn('flitt callback with a bad signature', { orderId });
    // Kept for the transaction page when it names one of our orders: someone tried to settle it.
    const row = orderId ? await paymentByOrderId(orderId) : null;
    if (row && params) await recordFlittEvent({ paymentId: row.id, orderId: row.orderId, source: 'callback', signatureValid: false, params });
    return NextResponse.json({ data: null, error: 'INVALID_SIGNATURE' }, { status: 400 });
  }
  const result = await settleCardPayment(params, 'callback');
  return NextResponse.json({ data: { received: true, settled: result.ok }, error: null });
});
