import { API_ERRORS, fail, handle, ok, parseId, requirePartner } from '@/lib/api/route';
import { actorOf, addOrderComment, loadOrderView, partnerOwnsOrder } from '@/lib/finance/orders';
import { orderCommentSchema } from '@/lib/validations/checkout.schema';
import { canAdmin } from '@/lib/auth/roles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A comment on an order, between the platform's people and the partner — "the tiles come in a
 * week", "the customer wants the delivery after six". The customer never sees these; what the
 * customer is told is the partner's message. A partner comments only on an order it has.
 */
export const POST = handle('POST /api/orders/[id]/comments', 'Failed to add the comment', async (req, { params }) => {
  const { id, response } = parseId(params.id);
  if (response) return response;
  const partner = await requirePartner();
  if (partner.response) return partner.response;

  const parsed = orderCommentSchema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);

  const view = await loadOrderView(id);
  if (!view) return fail(API_ERRORS.NOT_FOUND, 404);
  const user = partner.session.user;
  const staff = canAdmin(user.role, 'orders');
  if (!staff && !partnerOwnsOrder({ storeId: user.storeId, workerId: user.workerId, teamId: user.teamId }, view.order)) return fail(API_ERRORS.FORBIDDEN, 403);

  await addOrderComment(id, actorOf(user), parsed.data.body, staff);
  return ok({ id });
});
