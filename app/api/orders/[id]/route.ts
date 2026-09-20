import { auth } from '@/auth';
import { API_ERRORS, fail, handle, ok, parseId, requirePartner } from '@/lib/api/route';
import { applyOrderEdit, loadOrderView, partnerOwnsOrder, redactForPartner } from '@/lib/finance/orders';
import type { OrderStatus } from '@/lib/finance/money';
import { orderEditSchema } from '@/lib/validations/checkout.schema';
import { canAdmin } from '@/lib/auth/roles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The order, for whoever is on either end of it: the customer, the partner, or admin. */
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
 * A partner adjusting their order — items, message, status — or the platform's own people
 * (admin, or the agent who works the orders) overriding it.
 * A cancelled or done order is closed to partners; admin can still reopen it.
 */
export const PUT = handle('PUT /api/orders/[id]', 'Failed to update order', async (req, { params }) => {
  const { id, response } = parseId(params.id);
  if (response) return response;
  const partner = await requirePartner();
  if (partner.response) return partner.response;

  const parsed = orderEditSchema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);

  const view = await loadOrderView(id);
  if (!view) return fail(API_ERRORS.NOT_FOUND, 404);
  const user = partner.session.user;
  // Admin and the orders agent both work every order and may reopen a closed one; the
  // partner on the other end of it may not.
  const isAdmin = canAdmin(user.role, 'orders');
  if (!isAdmin && !partnerOwnsOrder({ storeId: user.storeId, workerId: user.workerId, teamId: user.teamId }, view.order)) return fail(API_ERRORS.FORBIDDEN, 403);
  if (!isAdmin && (view.order.status === 'cancelled' || view.order.status === 'done') && parsed.data.status !== 'in_progress' && parsed.data.status !== 'confirmed') {
    return fail(API_ERRORS.ORDER_CLOSED, 409);
  }

  // Only the platform's own people write the staff note, whatever was sent.
  const { staffNote, ...edit } = parsed.data;
  const updated = await applyOrderEdit(id, { ...edit, status: parsed.data.status as OrderStatus | undefined, ...(isAdmin ? { staffNote } : {}) });
  return ok(isAdmin ? updated : updated && redactForPartner(updated));
});
