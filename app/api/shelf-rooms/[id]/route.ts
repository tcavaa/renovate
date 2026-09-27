import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { shelfRooms } from '@/lib/db/schema';
import { shelfRoomSchema } from '@/lib/validations/category.schema';
import { API_ERRORS, fail, handle, ok, parseId, requireStaff } from '@/lib/api/route';
import { invalidateDesignCatalog } from '@/lib/api/designCatalog';
import { canDeleteIn } from '@/lib/auth/roles';
import { setRoomCategories } from '@/lib/catalog/shelfRooms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Changes a studio room; `categoryIds`, when sent, replaces the categories it lists, in that order. */
export const PUT = handle('PUT /api/shelf-rooms/[id]', 'Failed to update studio room', async (req, { params }) => {
  const staff = await requireStaff('categories');
  if (staff.response) return staff.response;
  const { id, response } = parseId(params.id);
  if (response) return response;
  const parsed = shelfRoomSchema.partial().safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);
  const { categoryIds, ...fields } = parsed.data;

  const rows = await db.select({ id: shelfRooms.id, slug: shelfRooms.slug }).from(shelfRooms);
  if (!rows.some((r) => r.id === id)) return fail(API_ERRORS.NOT_FOUND, 404);
  if (fields.slug && rows.some((r) => r.slug === fields.slug && r.id !== id)) return fail(API_ERRORS.SLUG_EXISTS, 409);

  if (Object.keys(fields).length) await db.update(shelfRooms).set(fields).where(eq(shelfRooms.id, id));
  if (categoryIds !== undefined) await setRoomCategories(id, categoryIds);
  // The studio's cached catalogue must not outlive this write.
  invalidateDesignCatalog();
  return ok({ id });
});

/** Deletes a studio room — admin's, like every delete in the catalogue; its categories stay. */
export const DELETE = handle('DELETE /api/shelf-rooms/[id]', 'Failed to delete studio room', async (_req, { params }) => {
  const staff = await requireStaff('categories');
  if (staff.response) return staff.response;
  if (!canDeleteIn(staff.session.user.role, 'categories')) return fail(API_ERRORS.FORBIDDEN, 403);
  const { id, response } = parseId(params.id);
  if (response) return response;
  await db.delete(shelfRooms).where(eq(shelfRooms.id, id));
  // The studio's cached catalogue must not outlive this write.
  invalidateDesignCatalog();
  return ok({ id });
});
