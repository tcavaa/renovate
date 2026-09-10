import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { stores } from '@/lib/db/schema';
import { approvalDecisionSchema } from '@/lib/validations/partner.schema';
import { API_ERRORS, fail, handle, ok, parseId, requireAdmin } from '@/lib/api/route';
import { invalidateDesignCatalog } from '@/lib/api/designCatalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin's verdict on a store that registered itself. Approving makes it live — its products
 * appear in the catalogue and the studio; rejecting keeps it switched off.
 */
export const POST = handle('POST /api/stores/[id]/approval', 'Failed to update store', async (req, { params }) => {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;
  const { id, response } = parseId(params.id);
  if (response) return response;
  const parsed = approvalDecisionSchema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);

  const rows = await db.select({ id: stores.id }).from(stores).where(eq(stores.id, id)).limit(1);
  if (rows.length === 0) return fail(API_ERRORS.NOT_FOUND, 404);

  const approved = parsed.data.decision === 'approved';
  await db.update(stores).set({ approvalStatus: parsed.data.decision, isActive: approved }).where(eq(stores.id, id));
  invalidateDesignCatalog();
  return ok({ id, approvalStatus: parsed.data.decision, isActive: approved });
});
