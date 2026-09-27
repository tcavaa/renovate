import { API_ERRORS, fail, handle, ok, parseId, requireStaff } from '@/lib/api/route';
import { actorOf, confirmOrder } from '@/lib/finance/orders';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The platform confirms a store's order and sends it on (`confirmOrder`): admin or the orders
 * agent, once the lines, the quantities and the delivery have been agreed with the customer.
 * The store sees it from now on, with the lines still ticked; the customer is told.
 */
export const POST = handle('POST /api/orders/[id]/confirm', 'Failed to confirm the order', async (_req, { params }) => {
  const staff = await requireStaff('orders');
  if (staff.response) return staff.response;
  const { id, response } = parseId(params.id);
  if (response) return response;

  const result = await confirmOrder(id, actorOf(staff.session.user));
  if (!result.ok) {
    if (result.error === 'NOT_FOUND') return fail(API_ERRORS.NOT_FOUND, 404);
    log.info('order not confirmed', { orderId: id, reason: result.error });
    return fail(API_ERRORS[result.error], 409);
  }
  return ok({ id, status: result.view.order.status, sentAt: result.view.order.sentAt });
});
