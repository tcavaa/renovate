import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { products, stores } from '@/lib/db/schema';
import { storeSchema, toStoreRow } from '@/lib/validations/store.schema';
import { API_ERRORS, fail, handle, ok, parseId, requireAdmin } from '@/lib/api/route';
import { invalidateDesignCatalog } from '@/lib/api/designCatalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle('GET /api/stores/[id]', 'Failed to load store', async (_req, { params }) => {
  const { id, response } = parseId(params.id);
  if (response) return response;

  const rows = await db.select().from(stores).where(eq(stores.id, id)).limit(1);
  if (rows.length === 0) return fail(API_ERRORS.NOT_FOUND, 404);
  return ok(rows[0]);
});

export const PUT = handle('PUT /api/stores/[id]', 'Failed to update store', async (req, { params }) => {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;
  const { id, response } = parseId(params.id);
  if (response) return response;

  const parsed = storeSchema.partial().safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);

  await db.update(stores).set(toStoreRow(parsed.data)).where(eq(stores.id, id));
  // The studio's cached catalogue must not outlive this write.
  invalidateDesignCatalog();
  return ok({ id });
});

export const DELETE = handle('DELETE /api/stores/[id]', 'Failed to delete store', async (_req, { params }) => {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;
  const { id, response } = parseId(params.id);
  if (response) return response;

  // Products carry a foreign key to the store, and a scene that has already been saved
  // references it by id — deleting underneath them would strand both.
  const linked = await db
    .select({ count: sql<number>`count(*)` })
    .from(products)
    .where(eq(products.storeId, id));
  if (Number(linked[0]?.count ?? 0) > 0) return fail(API_ERRORS.STORE_HAS_PRODUCTS, 409);

  await db.delete(stores).where(eq(stores.id, id));
  // The studio's cached catalogue must not outlive this write.
  invalidateDesignCatalog();
  return ok({ id });
});
