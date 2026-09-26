import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { products, stores } from '@/lib/db/schema';
import { productSchema } from '@/lib/validations/product.schema';
import { API_ERRORS, fail, handle, ok, parseId, requireCatalogEditor } from '@/lib/api/route';
import { invalidateDesignCatalog } from '@/lib/api/designCatalog';
import { canEditProduct, canReadProduct, isPublicProduct, productViewer, visibilityOf } from '@/lib/api/productAccess';
import type { UserRole } from '@/lib/auth/roles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One product. A public one (`lib/api/productAccess`) to anybody; an inactive one, one of a
 * store not approved yet, or a person's own furniture only to whoever may see it — staff, the
 * product's store, the owner — and a 404 to everyone else, as if it did not exist.
 */
export const GET = handle('GET /api/products/[id]', 'Failed to load product', async (_req, { params }) => {
  const { id, response } = parseId(params.id);
  if (response) return response;

  const rows = await db
    .select({ product: products, storeActive: stores.isActive })
    .from(products)
    .leftJoin(stores, eq(products.storeId, stores.id))
    .where(eq(products.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return fail(API_ERRORS.NOT_FOUND, 404);
  const visibility = visibilityOf(row.product, row.storeActive);
  // Only a product the public may not see needs to know who is asking.
  if (!isPublicProduct(visibility)) {
    const session = await auth();
    if (!canReadProduct(visibility, productViewer(session?.user))) return fail(API_ERRORS.NOT_FOUND, 404);
  }
  return ok(row.product);
});

/**
 * The product, when the caller may change it (`canEditProduct`): staff whose job covers the
 * products — admin and catalogue agents — any product, a store only its own.
 */
async function editable(id: number, user: { role: UserRole; storeId: number | null }) {
  const rows = await db.select({ id: products.id, storeId: products.storeId }).from(products).where(eq(products.id, id)).limit(1);
  const product = rows[0];
  if (!product) return { product: null, response: fail(API_ERRORS.NOT_FOUND, 404) };
  if (!canEditProduct(product, user)) return { product: null, response: fail(API_ERRORS.FORBIDDEN, 403) };
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
