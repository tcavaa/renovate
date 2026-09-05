import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { API_ERRORS, fail, handle, ok, parseId, requireAdmin } from '@/lib/api/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  role: z.enum(['user', 'admin']).optional(),
});

export const GET = handle('GET /api/users/[id]', 'Failed to load user', async (_req, { params }) => {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;
  const { id, response } = parseId(params.id);
  if (response) return response;

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
      hasPassword: sql<number>`CASE WHEN ${users.passwordHash} IS NULL THEN 0 ELSE 1 END`,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (rows.length === 0) return fail(API_ERRORS.NOT_FOUND, 404);
  return ok(rows[0]);
});

export const PUT = handle('PUT /api/users/[id]', 'Failed to update user', async (req, { params }) => {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;
  const { id, response } = parseId(params.id);
  if (response) return response;

  const parsed = updateSchema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);

  // Demoting yourself would lock the last admin out of the admin area.
  if (Number(admin.session.user.id) === id && parsed.data.role && parsed.data.role !== 'admin') {
    return fail(API_ERRORS.CANNOT_CHANGE_OWN_ROLE, 400);
  }

  await db.update(users).set(parsed.data).where(eq(users.id, id));
  return ok({ id });
});

export const DELETE = handle('DELETE /api/users/[id]', 'Failed to delete user', async (_req, { params }) => {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;
  const { id, response } = parseId(params.id);
  if (response) return response;

  if (Number(admin.session.user.id) === id) return fail(API_ERRORS.CANNOT_DELETE_SELF, 400);

  await db.delete(users).where(eq(users.id, id));
  return ok({ id });
});
