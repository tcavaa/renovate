import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { rates } from '@/lib/db/schema';
import { rateSchema, toRateRow } from '@/lib/validations/rate.schema';
import { API_ERRORS, fail, handle, ok, requireAdmin } from '@/lib/api/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Every rate, active or not — the calculator filters on the client, admin needs them all. */
export const GET = handle('GET /api/calculator/rates', 'Failed to load rates', async () => {
  const rows = await db
    .select()
    .from(rates)
    .orderBy(asc(rates.phase), asc(rates.sortOrder), asc(rates.id));
  return ok(rows);
});

export const POST = handle('POST /api/calculator/rates', 'Failed to create rate', async (req) => {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;

  const parsed = rateSchema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);

  const existing = await db.select({ id: rates.id }).from(rates).where(eq(rates.key, parsed.data.key)).limit(1);
  if (existing.length) return fail(API_ERRORS.RATE_KEY_EXISTS, 409);

  const inserted = await db.insert(rates).values(toRateRow(parsed.data));
  const row = await db.select().from(rates).where(eq(rates.id, Number(inserted[0].insertId))).limit(1);
  return ok(row[0], { status: 201 });
});
