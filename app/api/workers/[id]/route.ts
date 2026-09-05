import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { workers } from '@/lib/db/schema';
import { workerSchema } from '@/lib/validations/worker.schema';
import { API_ERRORS, fail, handle, ok, parseId, requireAdmin } from '@/lib/api/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle('GET /api/workers/[id]', 'Failed to load worker', async (_req, { params }) => {
  const { id, response } = parseId(params.id);
  if (response) return response;

  const rows = await db.select().from(workers).where(eq(workers.id, id)).limit(1);
  if (rows.length === 0) return fail(API_ERRORS.NOT_FOUND, 404);
  return ok(rows[0]);
});

export const PUT = handle('PUT /api/workers/[id]', 'Failed to update worker', async (req, { params }) => {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;
  const { id, response } = parseId(params.id);
  if (response) return response;

  const parsed = workerSchema.partial().safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);

  const d = parsed.data;
  await db
    .update(workers)
    .set({
      ...d,
      pricePerM2:
        d.pricePerM2 !== undefined ? (d.pricePerM2 == null ? null : String(d.pricePerM2)) : undefined,
      pricePerUnit:
        d.pricePerUnit !== undefined ? (d.pricePerUnit == null ? null : String(d.pricePerUnit)) : undefined,
      rating: d.rating != null ? String(d.rating) : undefined,
      avatarUrl: d.avatarUrl !== undefined ? d.avatarUrl || null : undefined,
    })
    .where(eq(workers.id, id));
  return ok({ id });
});

export const DELETE = handle('DELETE /api/workers/[id]', 'Failed to delete worker', async (_req, { params }) => {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;
  const { id, response } = parseId(params.id);
  if (response) return response;

  await db.delete(workers).where(eq(workers.id, id));
  return ok({ id });
});
