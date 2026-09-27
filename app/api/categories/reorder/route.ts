import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { categories } from '@/lib/db/schema';
import { categoryReorderSchema } from '@/lib/validations/category.schema';
import { API_ERRORS, fail, handle, ok, requireStaff } from '@/lib/api/route';
import { invalidateDesignCatalog } from '@/lib/api/designCatalog';
import { childrenOf } from '@/lib/catalog/tree';
import { loadCategoryTree } from '@/lib/catalog/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A parent's children in a new order — the admin's arrows on the tree page. The list must be
 * exactly that parent's children (a stale page is told so rather than half-applied).
 */
export const POST = handle('POST /api/categories/reorder', 'Failed to reorder categories', async (req) => {
  const staff = await requireStaff('categories');
  if (staff.response) return staff.response;
  const parsed = categoryReorderSchema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);
  const { parentId, ids } = parsed.data;

  const tree = await loadCategoryTree();
  const children = childrenOf(tree, parentId).map((c) => c.id);
  if (children.length !== ids.length || new Set(ids).size !== ids.length || !ids.every((id) => children.includes(id))) return fail(API_ERRORS.STALE_ORDER, 409);

  for (const [i, id] of ids.entries()) await db.update(categories).set({ sortOrder: (i + 1) * 10 }).where(eq(categories.id, id));
  // The studio's cached catalogue must not outlive this write.
  invalidateDesignCatalog();
  return ok({ ids });
});
