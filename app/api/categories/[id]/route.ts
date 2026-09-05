import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { categories, products } from '@/lib/db/schema';
import { categorySchema } from '@/lib/validations/category.schema';
import { API_ERRORS, fail, handle, ok, parseId, requireAdmin } from '@/lib/api/route';
import { invalidateDesignCatalog } from '@/lib/api/designCatalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle('GET /api/categories/[id]', 'Failed to load category', async (_req, { params }) => {
  const { id, response } = parseId(params.id);
  if (response) return response;

  const rows = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  if (rows.length === 0) return fail(API_ERRORS.NOT_FOUND, 404);
  return ok(rows[0]);
});

export const PUT = handle('PUT /api/categories/[id]', 'Failed to update category', async (req, { params }) => {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;
  const { id, response } = parseId(params.id);
  if (response) return response;

  const parsed = categorySchema.partial().safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);

  await db.update(categories).set(parsed.data).where(eq(categories.id, id));
  // The studio's cached catalogue must not outlive this write.
  invalidateDesignCatalog();
  return ok({ id });
});

export const DELETE = handle('DELETE /api/categories/[id]', 'Failed to delete category', async (_req, { params }) => {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;
  const { id, response } = parseId(params.id);
  if (response) return response;

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
