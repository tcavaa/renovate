import { and, asc, eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { stores } from '@/lib/db/schema';
import { storeSchema, toStoreRow } from '@/lib/validations/store.schema';
import { fail, handle, ok, requireStaff } from '@/lib/api/route';
import { invalidateDesignCatalog } from '@/lib/api/designCatalog';
import { publicStore } from '@/lib/api/publicPartners';
import { canAdmin } from '@/lib/auth/roles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The stores. Staff with the stores section get every row, whole (`?active=true` for the live
 * ones); everybody else the stores the platform lists — approved and active — with the fields a
 * customer needs (`lib/api/publicPartners`), never the commission or the private e-mail.
 */
export const GET = handle('GET /api/stores', 'Failed to load stores', async (req) => {
  const session = await auth();
  if (!canAdmin(session?.user?.role, 'stores')) {
    const rows = await db.select().from(stores).where(and(eq(stores.isActive, true), eq(stores.approvalStatus, 'approved'))).orderBy(asc(stores.nameKa));
    return ok(rows.map(publicStore));
  }
  const { searchParams } = new URL(req.url);
  const activeOnly = searchParams.get('active') === 'true';
  const rows = activeOnly
    ? await db.select().from(stores).where(eq(stores.isActive, true)).orderBy(asc(stores.nameKa))
    : await db.select().from(stores).orderBy(asc(stores.nameKa));
  return ok(rows);
});

export const POST = handle('POST /api/stores', 'Failed to create store', async (req) => {
  const admin = await requireStaff('stores');
  if (admin.response) return admin.response;

  const parsed = storeSchema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);
  // The commission is money, and money is admin's: a catalogue agent's new store gets the
  // default rate, whatever the form sent.
  const { commissionRate, ...fields } = parsed.data;
  const data = admin.session.user.role === 'admin' ? { ...fields, commissionRate } : fields;

  const inserted = await db.insert(stores).values(toStoreRow(data));
  // The studio's cached catalogue must not outlive this write.
  invalidateDesignCatalog();
  return ok({ id: inserted[0].insertId });
});
