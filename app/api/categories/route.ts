import { db } from '@/lib/db';
import { categories } from '@/lib/db/schema';
import { categorySchema } from '@/lib/validations/category.schema';
import { API_ERRORS, fail, handle, ok, requireStaff } from '@/lib/api/route';
import { invalidateDesignCatalog } from '@/lib/api/designCatalog';
import { childrenOf, flattenTree, moveError, pathOf } from '@/lib/catalog/tree';
import { loadCategoryTree } from '@/lib/catalog/queries';
import { setCategoryRooms } from '@/lib/catalog/shelfRooms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The categories in the tree's reading order, each with its `depth` — the visible ones: a
 * category hidden from the catalogue hides everything under it. `isFurniture=true|false`
 * narrows to one kind; `calculator=true` to the calculator's tabs (`inCalculator`, whatever
 * the groups above them), which is what the calculator's steps ask for.
 */
export const GET = handle('GET /api/categories', 'Failed to load categories', async (req) => {
  const { searchParams } = new URL(req.url);
  const isFurniture = searchParams.get('isFurniture');
  const calculator = searchParams.get('calculator') === 'true';

  const tree = await loadCategoryTree();
  const data = flattenTree(tree)
    .filter(({ row }) => (calculator ? row.inCalculator && row.isVisible : pathOf(tree, row.id).every((c) => c.isVisible)))
    .filter(({ row }) => (isFurniture === 'true' ? row.isFurniture : isFurniture === 'false' ? !row.isFurniture : true))
    .map(({ row, depth }) => ({ ...row, depth }));
  return ok(data);
});

/** A new category goes last among its siblings; the rooms named list it last too. */
export const POST = handle('POST /api/categories', 'Failed to create category', async (req) => {
  const admin = await requireStaff('categories');
  if (admin.response) return admin.response;

  const parsed = categorySchema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);
  const { shelfRoomIds, parentId = null, ...fields } = parsed.data;

  const tree = await loadCategoryTree();
  const problem = moveError(tree, null, parentId);
  if (problem) return fail(API_ERRORS[problem], 400);
  if ([...tree.byId.values()].some((c) => c.slug === fields.slug)) return fail(API_ERRORS.SLUG_EXISTS, 409);
  const siblings = childrenOf(tree, parentId);
  const sortOrder = siblings.reduce((top, c) => Math.max(top, c.sortOrder ?? 0), 0) + 10;

  const inserted = await db.insert(categories).values({ ...fields, parentId, sortOrder });
  const id = Number(inserted[0].insertId);
  if (shelfRoomIds?.length) await setCategoryRooms(id, shelfRoomIds);
  // The studio's cached catalogue must not outlive this write.
  invalidateDesignCatalog();
  return ok({ id });
});
