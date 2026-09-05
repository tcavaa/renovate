import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { categories } from '@/lib/db/schema';
import { categorySchema } from '@/lib/validations/category.schema';
import { fail, handle, ok, requireAdmin } from '@/lib/api/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle('GET /api/categories', 'Failed to load categories', async (req) => {
  const { searchParams } = new URL(req.url);
  const isFurnitureParam = searchParams.get('isFurniture');

  const conditions = [eq(categories.isVisible, true)];
  if (isFurnitureParam === 'true') conditions.push(eq(categories.isFurniture, true));
  if (isFurnitureParam === 'false') conditions.push(eq(categories.isFurniture, false));

  const data = await db
    .select()
    .from(categories)
    .where(and(...conditions))
    .orderBy(asc(categories.phase), asc(categories.sortOrder));
  return ok(data);
});

export const POST = handle('POST /api/categories', 'Failed to create category', async (req) => {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;

  const parsed = categorySchema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);

  const inserted = await db.insert(categories).values(parsed.data);
  return ok({ id: inserted[0].insertId });
});
