import { and, eq, desc, asc, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { products, categories, stores } from '@/lib/db/schema';
import { productSchema } from '@/lib/validations/product.schema';
import { fail, handle, ok, requireCatalogEditor } from '@/lib/api/route';
import { invalidateDesignCatalog } from '@/lib/api/designCatalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public products: active, and either without a store or from an active store. A store
 * that registered itself is inactive until admin approves it, and so are its products —
 * whatever their own flag says.
 */
export const publicProductCondition = () => and(eq(products.isActive, true), or(isNull(products.storeId), eq(stores.isActive, true)));

export const GET = handle('GET /api/products', 'Failed to load products', async (req) => {
  const { searchParams } = new URL(req.url);
  const categorySlug = searchParams.get('category');
  const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1);
  const limit = Math.min(60, Math.max(1, Number(searchParams.get('limit') ?? 12) || 12));
  const featured = searchParams.get('featured') === 'true';

  const conditions = [publicProductCondition()!];
  if (featured) conditions.push(eq(products.isFeatured, true));

  if (categorySlug) {
    const c = await db.select().from(categories).where(eq(categories.slug, categorySlug)).limit(1);
    if (c.length === 0) return ok({ items: [], total: 0, page, limit, totalPages: 0 });
    conditions.push(eq(products.categoryId, c[0].id));
  }

  const where = and(...conditions);
  const [rows, totalRow] = await Promise.all([
    db
      .select({ product: products })
      .from(products)
      .leftJoin(stores, eq(products.storeId, stores.id))
      .where(where)
      .orderBy(desc(products.isFeatured), asc(products.sortOrder), desc(products.id))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ count: sql<number>`count(*)` }).from(products).leftJoin(stores, eq(products.storeId, stores.id)).where(where),
  ]);

  const total = Number(totalRow[0]?.count ?? 0);
  return ok({ items: rows.map((r) => r.product), total, page, limit, totalPages: Math.ceil(total / limit) });
});

export const POST = handle('POST /api/products', 'Failed to create product', async (req) => {
  const editor = await requireCatalogEditor();
  if (editor.response) return editor.response;

  const parsed = productSchema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);

  // A store writes into its own shelf and cannot promote itself to "featured".
  const own = editor.session.user.role === 'store' ? { storeId: editor.session.user.storeId, isFeatured: false, sortOrder: 0 } : {};

  const inserted = await db.insert(products).values({
    ...parsed.data,
    ...own,
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
