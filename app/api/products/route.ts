import { NextResponse } from 'next/server';
import { and, eq, desc, asc, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { products, categories } from '@/lib/db/schema';
import { productSchema } from '@/lib/validations/product.schema';
import { auth } from '@/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const categorySlug = searchParams.get('category');
    const page = Math.max(1, Number(searchParams.get('page') ?? 1));
    const limit = Math.min(60, Math.max(1, Number(searchParams.get('limit') ?? 12)));
    const featured = searchParams.get('featured') === 'true';

    const conditions = [eq(products.isActive, true)];
    if (featured) conditions.push(eq(products.isFeatured, true));

    let categoryId: number | null = null;
    if (categorySlug) {
      const c = await db
        .select()
        .from(categories)
        .where(eq(categories.slug, categorySlug))
        .limit(1);
      if (c.length === 0) {
        return NextResponse.json({
          data: { items: [], total: 0, page, limit, totalPages: 0 },
          error: null,
        });
      }
      categoryId = c[0].id;
      conditions.push(eq(products.categoryId, categoryId));
    }

    const offset = (page - 1) * limit;
    const where = and(...conditions);

    const [items, totalRow] = await Promise.all([
      db
        .select()
        .from(products)
        .where(where)
        .orderBy(desc(products.isFeatured), asc(products.sortOrder), desc(products.id))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(products)
        .where(where),
    ]);

    const total = Number(totalRow[0]?.count ?? 0);
    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      data: { items, total, page, limit, totalPages },
      error: null,
    });
  } catch (e) {
    console.error('GET /api/products', e);
    return NextResponse.json(
      { data: null, error: 'Failed to load products' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json(
        { data: null, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    const body = await req.json();
    const parsed = productSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: parsed.error.message },
        { status: 400 }
      );
    }
    const inserted = await db.insert(products).values({
      ...parsed.data,
      pricePerUnit: String(parsed.data.pricePerUnit),
      coveragePerUnit:
        parsed.data.coveragePerUnit != null ? String(parsed.data.coveragePerUnit) : null,
      imageUrl: parsed.data.imageUrl || null,
    });
    return NextResponse.json({ data: { id: inserted[0].insertId }, error: null });
  } catch (e) {
    console.error('POST /api/products', e);
    return NextResponse.json(
      { data: null, error: 'Failed to create product' },
      { status: 500 }
    );
  }
}
