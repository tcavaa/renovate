import { API_ERRORS, fail, handle, ok, requireSession } from '@/lib/api/route';
import { halfPayment } from '@/lib/finance/payments';
import { cardPaymentView, paymentByOrderId, refreshCardPayment } from '@/lib/payments/service';
import { orderIdSchema } from '@/lib/validations/payment.schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A payment as it stands, asked of Flitt when it is not settled yet — what the payment dialogue
 * reads once the embedded form says it is done (the form's word is not proof; Flitt's signed
 * status is). An approved half answers with its recorded fee too. The payer (or admin) only.
 */
export const GET = handle('GET /api/payments/flitt/[orderId]', 'Failed to load the payment', async (_req, { params }) => {
  const { session, response } = await requireSession();
  if (response) return response;
  const orderId = orderIdSchema.safeParse(params.orderId);
  if (!orderId.success) return fail(API_ERRORS.INVALID_ID, 400);
  const row = await paymentByOrderId(orderId.data);
  if (!row) return fail(API_ERRORS.NOT_FOUND, 404);
  if (row.userId !== Number(session.user.id) && session.user.role !== 'admin') return fail(API_ERRORS.FORBIDDEN, 403);
  const current = await refreshCardPayment(row);
  const half = current.status === 'approved' && current.projectId && (current.purpose === 'calculator' || current.purpose === 'design') ? await halfPayment(current.projectId, current.purpose) : null;
  return ok({ payment: cardPaymentView(current), half });
});
