import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { categories, products } from '@/lib/db/schema';
import { categorySchema } from '@/lib/validations/category.schema';
import { API_ERRORS, fail, handle, ok, parseId, requireStaff } from '@/lib/api/route';
import { invalidateDesignCatalog } from '@/lib/api/designCatalog';
import { canDeleteIn } from '@/lib/auth/roles';
import { childrenOf, moveError } from '@/lib/catalog/tree';
import { loadCategoryTree } from '@/lib/catalog/queries';
import { setCategoryRooms } from '@/lib/catalog/shelfRooms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle('GET /api/categories/[id]', 'Failed to load category', async (_req, { params }) => {
  const { id, response } = parseId(params.id);
  if (response) return response;

  const rows = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  if (rows.length === 0) return fail(API_ERRORS.NOT_FOUND, 404);
  return ok(rows[0]);
});

/**
 * Changes a category — moved under another parent too, where the tree allows it (no loops,
 * three levels at most; `moveError`): a category moved goes last among its new siblings.
 */
export const PUT = handle('PUT /api/categories/[id]', 'Failed to update category', async (req, { params }) => {
  const admin = await requireStaff('categories');
  if (admin.response) return admin.response;
  const { id, response } = parseId(params.id);
  if (response) return response;

  const parsed = categorySchema.partial().safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);
  const { shelfRoomIds, parentId, ...fields } = parsed.data;

  const tree = await loadCategoryTree();
  const current = tree.byId.get(id);
  if (!current) return fail(API_ERRORS.NOT_FOUND, 404);
  if (fields.slug && fields.slug !== current.slug && [...tree.byId.values()].some((c) => c.slug === fields.slug)) return fail(API_ERRORS.SLUG_EXISTS, 409);

  const move: { parentId?: number | null; sortOrder?: number } = {};
  if (parentId !== undefined && (parentId ?? null) !== current.parentId) {
    const problem = moveError(tree, id, parentId ?? null);
    if (problem) return fail(API_ERRORS[problem], 400);
    move.parentId = parentId ?? null;
    move.sortOrder = childrenOf(tree, move.parentId).reduce((top, c) => Math.max(top, c.sortOrder ?? 0), 0) + 10;
  }

  await db.update(categories).set({ ...fields, ...move }).where(eq(categories.id, id));
  if (shelfRoomIds !== undefined) await setCategoryRooms(id, shelfRoomIds);
  // The studio's cached catalogue must not outlive this write.
  invalidateDesignCatalog();
  return ok({ id });
});

/**
 * Deletes an empty category — admin only. One with subcategories or with products is kept
 * (409): they are moved first. The studio rooms that listed it simply list one fewer.
 */
export const DELETE = handle('DELETE /api/categories/[id]', 'Failed to delete category', async (_req, { params }) => {
  const admin = await requireStaff('categories');
  if (admin.response) return admin.response;
  // Deleting is admin's: a catalogue agent sorts and renames the categories but removes none (`canDeleteIn`).
  if (!canDeleteIn(admin.session.user.role, 'categories')) return fail(API_ERRORS.FORBIDDEN, 403);
  const { id, response } = parseId(params.id);
  if (response) return response;

  const [children] = await db.select({ c: sql<number>`count(*)` }).from(categories).where(eq(categories.parentId, id));
  if (Number(children?.c ?? 0) > 0) return fail(API_ERRORS.CATEGORY_HAS_CHILDREN, 409);
  const productCount = await db
    .select({ c: sql<number>`count(*)` })
    .from(products)
    .where(eq(products.categoryId, id));
  if (Number(productCount[0]?.c ?? 0) > 0) return fail(API_ERRORS.CATEGORY_HAS_PRODUCTS, 409);

  await db.delete(categories).where(eq(categories.id, id));
  // The studio's cached catalogue must not outlive this write.
  invalidateDesignCatalog();
  return ok({ id });
});
