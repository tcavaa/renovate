import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { products } from '@/lib/db/schema';
import { productSchema } from '@/lib/validations/product.schema';
import { API_ERRORS, fail, handle, ok, parseId, requireCatalogEditor } from '@/lib/api/route';
import { invalidateDesignCatalog } from '@/lib/api/designCatalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle('GET /api/products/[id]', 'Failed to load product', async (_req, { params }) => {
  const { id, response } = parseId(params.id);
  if (response) return response;

  const rows = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (rows.length === 0) return fail(API_ERRORS.NOT_FOUND, 404);
  return ok(rows[0]);
});

/** The product, when the caller may edit it: admin may edit any, a store only its own. */
async function editable(id: number, user: { role: string; storeId: number | null }) {
  const rows = await db.select({ id: products.id, storeId: products.storeId }).from(products).where(eq(products.id, id)).limit(1);
  const product = rows[0];
  if (!product) return { product: null, response: fail(API_ERRORS.NOT_FOUND, 404) };
  if (user.role !== 'admin' && product.storeId !== user.storeId) return { product: null, response: fail(API_ERRORS.FORBIDDEN, 403) };
  return { product, response: null };
}

export const PUT = handle('PUT /api/products/[id]', 'Failed to update product', async (req, { params }) => {
  const editor = await requireCatalogEditor();
  if (editor.response) return editor.response;
  const { id, response } = parseId(params.id);
  if (response) return response;
  const owned = await editable(id, editor.session.user);
  if (owned.response) return owned.response;

  const parsed = productSchema.partial().safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);

  const data = parsed.data;
  // A store cannot move a product to another store or feature it.
  const own = editor.session.user.role === 'store' ? { storeId: undefined, isFeatured: undefined, sortOrder: undefined } : {};
  await db
    .update(products)
    .set({
      ...data,
      ...own,
      pricePerUnit: data.pricePerUnit != null ? String(data.pricePerUnit) : undefined,
      coveragePerUnit: data.coveragePerUnit != null ? String(data.coveragePerUnit) : undefined,
      // A model URL arriving (or being cleared) moves the status with it; a payload that does
      // not mention the URL leaves the status alone.
      model3dUrl: data.model3dUrl !== undefined ? data.model3dUrl || null : undefined,
      model3dStatus: data.model3dUrl !== undefined ? (data.model3dUrl ? 'ready' : 'none') : undefined,
    })
    .where(eq(products.id, id));
  // The studio's cached catalogue must not outlive this write.
  invalidateDesignCatalog();
  return ok({ id });
});

export const DELETE = handle('DELETE /api/products/[id]', 'Failed to delete product', async (_req, { params }) => {
  const editor = await requireCatalogEditor();
  if (editor.response) return editor.response;
  const { id, response } = parseId(params.id);
  if (response) return response;
  const owned = await editable(id, editor.session.user);
  if (owned.response) return owned.response;

  await db.delete(products).where(eq(products.id, id));
  // The studio's cached catalogue must not outlive this write.
  invalidateDesignCatalog();
  return ok({ id });
});
