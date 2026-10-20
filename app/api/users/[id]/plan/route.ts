import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { API_ERRORS, fail, handle, ok, parseId, requireAdmin } from '@/lib/api/route';
import { log } from '@/lib/log';
import { endSubscriptions, grantSubscription, planState } from '@/lib/plans/server';
import { grantPlanSchema } from '@/lib/validations/payment.schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin's hand on a person's plan (docs/subscriptions.md): grant Premium or Professional for so
 * many months at no charge, or `free` — every subscription ended now (a refund made in Flitt's
 * portal, a grant taken back). Answers the person's plan as it stands after. Admin only.
 */
export const POST = handle('POST /api/users/[id]/plan', 'Failed to change the plan', async (req, { params }) => {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;
  const { id, response } = parseId(params.id);
  if (response) return response;
  const parsed = grantPlanSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.message, 400);
  const [user] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, id)).limit(1);
  if (!user) return fail(API_ERRORS.NOT_FOUND, 404);
  const by = Number(admin.session.user.id);
  if (parsed.data.plan === 'free') {
    await endSubscriptions(id);
    log.info('subscriptions ended by admin', { userId: id, by });
  } else {
    await grantSubscription(id, parsed.data.plan, parsed.data.months, by);
  }
  return ok(await planState({ id, role: user.role }));
});
