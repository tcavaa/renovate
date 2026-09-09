import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { stores } from '@/lib/db/schema';
import { storeSchema, toStoreRow } from '@/lib/validations/store.schema';
import { fail, handle, ok, requireAdmin } from '@/lib/api/route';
import { invalidateDesignCatalog } from '@/lib/api/designCatalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle('GET /api/stores', 'Failed to load stores', async (req) => {
  const { searchParams } = new URL(req.url);
  const activeOnly = searchParams.get('active') === 'true';

  const rows = activeOnly
    ? await db.select().from(stores).where(eq(stores.isActive, true)).orderBy(asc(stores.nameKa))
    : await db.select().from(stores).orderBy(asc(stores.nameKa));
  return ok(rows);
});

export const POST = handle('POST /api/stores', 'Failed to create store', async (req) => {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;

  const parsed = storeSchema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);

  const inserted = await db.insert(stores).values(toStoreRow(parsed.data));
  // The studio's cached catalogue must not outlive this write.
  invalidateDesignCatalog();
  return ok({ id: inserted[0].insertId });
});
