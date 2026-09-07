import { and, eq, desc, asc, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { products, categories } from '@/lib/db/schema';
import { productSchema } from '@/lib/validations/product.schema';
import { fail, handle, ok, requireAdmin } from '@/lib/api/route';
import { invalidateDesignCatalog } from '@/lib/api/designCatalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle('GET /api/products', 'Failed to load products', async (req) => {
  const { searchParams } = new URL(req.url);
  const categorySlug = searchParams.get('category');
  const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1);
  const limit = Math.min(60, Math.max(1, Number(searchParams.get('limit') ?? 12) || 12));
  const featured = searchParams.get('featured') === 'true';

  const conditions = [eq(products.isActive, true)];
  if (featured) conditions.push(eq(products.isFeatured, true));

  if (categorySlug) {
    const c = await db.select().from(categories).where(eq(categories.slug, categorySlug)).limit(1);
    if (c.length === 0) return ok({ items: [], total: 0, page, limit, totalPages: 0 });
    conditions.push(eq(products.categoryId, c[0].id));
  }

  const where = and(...conditions);
  const [items, totalRow] = await Promise.all([
    db
      .select()
      .from(products)
      .where(where)
      .orderBy(desc(products.isFeatured), asc(products.sortOrder), desc(products.id))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ count: sql<number>`count(*)` }).from(products).where(where),
  ]);

  const total = Number(totalRow[0]?.count ?? 0);
  return ok({ items, total, page, limit, totalPages: Math.ceil(total / limit) });
});

export const POST = handle('POST /api/products', 'Failed to create product', async (req) => {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;

  const parsed = productSchema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);

  const inserted = await db.insert(products).values({
    ...parsed.data,
    pricePerUnit: String(parsed.data.pricePerUnit),
    coveragePerUnit: parsed.data.coveragePerUnit != null ? String(parsed.data.coveragePerUnit) : null,
    imageUrl: parsed.data.imageUrl || null,
    model3dUrl: parsed.data.model3dUrl || null,
    // The studio only places a model whose status is `ready`; a URL saved here is one.
    model3dStatus: parsed.data.model3dUrl ? 'ready' : 'none',
  });
  // The studio's cached catalogue must not outlive this write.
  invalidateDesignCatalog();
  return ok({ id: inserted[0].insertId });
});
