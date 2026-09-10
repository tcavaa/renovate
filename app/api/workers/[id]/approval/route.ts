import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { workers } from '@/lib/db/schema';
import { approvalDecisionSchema } from '@/lib/validations/partner.schema';
import { API_ERRORS, fail, handle, ok, parseId, requireAdmin } from '@/lib/api/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin's verdict on a worker who registered themselves. Approving lists them in the
 * directory as verified; rejecting keeps them switched off.
 */
export const POST = handle('POST /api/workers/[id]/approval', 'Failed to update worker', async (req, { params }) => {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;
  const { id, response } = parseId(params.id);
  if (response) return response;
  const parsed = approvalDecisionSchema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);

  const rows = await db.select({ id: workers.id }).from(workers).where(eq(workers.id, id)).limit(1);
  if (rows.length === 0) return fail(API_ERRORS.NOT_FOUND, 404);

  const approved = parsed.data.decision === 'approved';
  await db.update(workers).set({ approvalStatus: parsed.data.decision, isActive: approved, ...(approved ? { isVerified: true } : {}) }).where(eq(workers.id, id));
  return ok({ id, approvalStatus: parsed.data.decision, isActive: approved });
});
