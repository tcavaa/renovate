import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { rates } from '@/lib/db/schema';
import { rateUpdateSchema } from '@/lib/validations/rate.schema';
import { API_ERRORS, fail, handle, ok, parseId, requireAdmin } from '@/lib/api/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PUT = handle('PUT /api/calculator/rates/[id]', 'Failed to update rate', async (req, { params }) => {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;
  const { id, response } = parseId(params.id);
  if (response) return response;

  const parsed = rateUpdateSchema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);

  const d = parsed.data;
  const patch: Partial<typeof rates.$inferInsert> = {};
  if (d.labelKa !== undefined) patch.labelKa = d.labelKa;
  if (d.phase !== undefined) patch.phase = d.phase;
  if (d.unit !== undefined) patch.unit = d.unit;
  if (d.basis !== undefined) patch.basis = d.basis ?? null;
  if (d.qtyPerM2 !== undefined) patch.qtyPerM2 = d.qtyPerM2 == null ? null : String(d.qtyPerM2);
  if (d.wasteFactorPct !== undefined) patch.wasteFactorPct = d.wasteFactorPct == null ? null : String(d.wasteFactorPct);
  if (d.pricePerUnit !== undefined) patch.pricePerUnit = String(d.pricePerUnit);
  if (d.linkedCategorySlug !== undefined) patch.linkedCategorySlug = d.linkedCategorySlug ?? null;
  if (d.sortOrder !== undefined) patch.sortOrder = d.sortOrder;
  if (d.isActive !== undefined) patch.isActive = d.isActive;

  await db.update(rates).set(patch).where(eq(rates.id, id));
  const row = await db.select().from(rates).where(eq(rates.id, id)).limit(1);
  if (row.length === 0) return fail(API_ERRORS.NOT_FOUND, 404);
  return ok(row[0]);
});

/** Deactivates rather than deletes: the estimate simply stops using the line. */
export const DELETE = handle('DELETE /api/calculator/rates/[id]', 'Failed to deactivate rate', async (_req, { params }) => {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;
  const { id, response } = parseId(params.id);
  if (response) return response;

  await db.update(rates).set({ isActive: false }).where(eq(rates.id, id));
  return ok({ id, isActive: false });
});
