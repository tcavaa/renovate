import { auth } from '@/auth';
import { API_ERRORS, fail, handle, ok, parseId, requirePartner } from '@/lib/api/route';
import { actorOf, applyOrderEdit, loadOrderView, partnerOwnsOrder, redactForPartner } from '@/lib/finance/orders';
import { partnerMayMove } from '@/lib/finance/orderFlow';
import type { OrderStatus } from '@/lib/finance/money';
import { orderEditSchema } from '@/lib/validations/checkout.schema';
import { canAdmin } from '@/lib/auth/roles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The order, for whoever is on either end of it: the customer, the partner (once it is theirs), or the platform's people. */
export const GET = handle('GET /api/orders/[id]', 'Failed to load order', async (_req, { params }) => {
  const { id, response } = parseId(params.id);
  if (response) return response;
  const session = await auth();
  if (!session?.user?.id) return fail(API_ERRORS.UNAUTHORIZED, 401);

  const view = await loadOrderView(id);
  if (!view) return fail(API_ERRORS.NOT_FOUND, 404);

  const user = session.user;
  const isCustomer = view.order.userId != null && view.order.userId === Number(user.id);
  const isPartner = partnerOwnsOrder({ storeId: user.storeId, workerId: user.workerId, teamId: user.teamId }, view.order);
  const isStaff = canAdmin(user.role, 'orders');
  if (!isCustomer && !isPartner && !isStaff) return fail(API_ERRORS.FORBIDDEN, 403);
  return ok(isStaff ? view : redactForPartner(view));
});

/**
 * A change to an order.
 *
 * The platform's people (admin and the orders agent) change anything: lines kept or struck,
 * quantities and prices, lines added, the delivery, the status (a closed order reopened), the
 * message to the customer and their own note. A store's order still with the platform moves
 * only between `new` and `cancelled` here — it is sent on through `POST …/confirm`, never by
 * picking "confirmed" in a list.
 *
 * The partner on the other end moves its order along its own steps (`partnerNextStatuses`:
 * answer a booking, start, finish) and writes to the customer — and nothing else: lines, prices
 * and the delivery are locked for it (a partner who cannot supply something says so in a
 * comment), and a closed order is closed to it.
 */
export const PUT = handle('PUT /api/orders/[id]', 'Failed to update order', async (req, { params }) => {
  const { id, response } = parseId(params.id);
  if (response) return response;
  const partner = await requirePartner();
  if (partner.response) return partner.response;

  const parsed = orderEditSchema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);
  const input = parsed.data;
  const status = input.status as OrderStatus | undefined;

  const view = await loadOrderView(id);
  if (!view) return fail(API_ERRORS.NOT_FOUND, 404);
  const user = partner.session.user;
  const staff = canAdmin(user.role, 'orders');
  const { order } = view;

  if (staff) {
    if (order.partnerType === 'store' && !order.sentAt && status && status !== 'new' && status !== 'cancelled') return fail(API_ERRORS.ORDER_STATUS_NOT_ALLOWED, 409);
  } else {
    if (!partnerOwnsOrder({ storeId: user.storeId, workerId: user.workerId, teamId: user.teamId }, order)) return fail(API_ERRORS.FORBIDDEN, 403);
    if (input.items?.length || input.addItems?.length || input.deliveryFee !== undefined) return fail(API_ERRORS.ORDER_LINES_LOCKED, 403);
    if (order.status === 'done' || order.status === 'cancelled') return fail(API_ERRORS.ORDER_CLOSED, 409);
    if (status && status !== order.status && !partnerMayMove(order, status)) return fail(API_ERRORS.ORDER_STATUS_NOT_ALLOWED, 409);
  }

  // Only the platform's own people write the staff note, whatever was sent.
  const { staffNote, ...edit } = input;
  const updated = await applyOrderEdit(id, { ...edit, status, ...(staff ? { staffNote } : { items: undefined, addItems: undefined, deliveryFee: undefined }) }, actorOf(user));
  return ok(staff ? updated : updated && redactForPartner(updated));
});
