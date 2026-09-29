import { eq, sql } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { products, stores } from '@/lib/db/schema';
import { storeSchema, toStoreRow } from '@/lib/validations/store.schema';
import { API_ERRORS, fail, handle, ok, parseId, requireStaff } from '@/lib/api/route';
import { invalidateDesignCatalog } from '@/lib/api/designCatalog';
import { isListedPartner, publicStore } from '@/lib/api/publicPartners';
import { canAdmin, canDeleteIn } from '@/lib/auth/roles';
import { removeUnusedUploads } from '@/lib/storage/cleanup';
import { setMaterialsSupplier } from '@/lib/finance/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** One store: whole to staff with the stores section, its public face to anybody else — and a
 * store the platform does not list (pending, rejected, switched off) is not found for them. */
export const GET = handle('GET /api/stores/[id]', 'Failed to load store', async (_req, { params }) => {
  const { id, response } = parseId(params.id);
  if (response) return response;

  const rows = await db.select().from(stores).where(eq(stores.id, id)).limit(1);
  const row = rows[0];
  if (!row) return fail(API_ERRORS.NOT_FOUND, 404);
  const session = await auth();
  if (canAdmin(session?.user?.role, 'stores')) return ok(row);
  if (!isListedPartner(row)) return fail(API_ERRORS.NOT_FOUND, 404);
  return ok(publicStore(row));
});

export const PUT = handle('PUT /api/stores/[id]', 'Failed to update store', async (req, { params }) => {
  const admin = await requireStaff('stores');
  if (admin.response) return admin.response;
  const { id, response } = parseId(params.id);
  if (response) return response;

  const parsed = storeSchema.partial().safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);
  // The commission is money, and money is admin's: a catalogue agent edits everything else.
  const { commissionRate, suppliesMaterials, ...fields } = parsed.data;
  const isAdmin = admin.session.user.role === 'admin';
  const data = isAdmin ? { ...fields, commissionRate } : fields;
  const [before] = await db.select({ logoUrl: stores.logoUrl }).from(stores).where(eq(stores.id, id)).limit(1);
  if (!before) return fail(API_ERRORS.NOT_FOUND, 404);

  await db.update(stores).set(toStoreRow(data)).where(eq(stores.id, id));
  // The construction materials' supplier is a platform setting, and settings are admin's.
  if (isAdmin && suppliesMaterials !== undefined) await setMaterialsSupplier(id, suppliesMaterials);
  // A logo replaced is a file nobody shows any more.
  if (data.logoUrl !== undefined && before.logoUrl !== (data.logoUrl || null)) await removeUnusedUploads([before.logoUrl]);
  // The studio's cached catalogue must not outlive this write.
  invalidateDesignCatalog();
  return ok({ id });
});

export const DELETE = handle('DELETE /api/stores/[id]', 'Failed to delete store', async (_req, { params }) => {
  const admin = await requireStaff('stores');
  if (admin.response) return admin.response;
  // Deleting is admin's: a catalogue agent switches a store off rather than removing it (`canDeleteIn`).
  if (!canDeleteIn(admin.session.user.role, 'stores')) return fail(API_ERRORS.FORBIDDEN, 403);
  const { id, response } = parseId(params.id);
  if (response) return response;

  // Products carry a foreign key to the store, and a scene that has already been saved
  // references it by id — deleting underneath them would strand both.
  const linked = await db
    .select({ count: sql<number>`count(*)` })
    .from(products)
    .where(eq(products.storeId, id));
  if (Number(linked[0]?.count ?? 0) > 0) return fail(API_ERRORS.STORE_HAS_PRODUCTS, 409);

  const [store] = await db.select({ logoUrl: stores.logoUrl }).from(stores).where(eq(stores.id, id)).limit(1);
  await db.delete(stores).where(eq(stores.id, id));
  await removeUnusedUploads([store?.logoUrl]);
  // The studio's cached catalogue must not outlive this write.
  invalidateDesignCatalog();
  return ok({ id });
});
