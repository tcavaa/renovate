import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { products } from '@/lib/db/schema';
import { productSchema } from '@/lib/validations/product.schema';
import { API_ERRORS, fail, handle, ok, parseId, requireAdmin } from '@/lib/api/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle('GET /api/products/[id]', 'Failed to load product', async (_req, { params }) => {
  const { id, response } = parseId(params.id);
  if (response) return response;

  const rows = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (rows.length === 0) return fail(API_ERRORS.NOT_FOUND, 404);
  return ok(rows[0]);
});

export const PUT = handle('PUT /api/products/[id]', 'Failed to update product', async (req, { params }) => {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;
  const { id, response } = parseId(params.id);
  if (response) return response;

  const parsed = productSchema.partial().safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);

  const data = parsed.data;
  await db
    .update(products)
    .set({
      ...data,
      pricePerUnit: data.pricePerUnit != null ? String(data.pricePerUnit) : undefined,
      coveragePerUnit: data.coveragePerUnit != null ? String(data.coveragePerUnit) : undefined,
    })
    .where(eq(products.id, id));
  return ok({ id });
});

export const DELETE = handle('DELETE /api/products/[id]', 'Failed to delete product', async (_req, { params }) => {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;
  const { id, response } = parseId(params.id);
  if (response) return response;

  await db.delete(products).where(eq(products.id, id));
  return ok({ id });
});
