import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { categories, products } from '@/lib/db/schema';
import { categorySchema } from '@/lib/validations/category.schema';
import { auth } from '@/auth';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ data: null, error: 'Invalid id' }, { status: 400 });
    }
    const rows = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
    if (rows.length === 0) {
      return NextResponse.json({ data: null, error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ data: rows[0], error: null });
  } catch (e) {
    console.error('GET /api/categories/[id]', e);
    return NextResponse.json(
      { data: null, error: 'Failed to load category' },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }
    const id = Number(params.id);
    const body = await req.json();
    const parsed = categorySchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: parsed.error.message },
        { status: 400 }
      );
    }
    await db.update(categories).set(parsed.data).where(eq(categories.id, id));
    return NextResponse.json({ data: { id }, error: null });
  } catch (e) {
    console.error('PUT /api/categories/[id]', e);
    return NextResponse.json(
      { data: null, error: 'Failed to update category' },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }
    const id = Number(params.id);

    const productCount = await db
      .select({ c: sql<number>`count(*)` })
      .from(products)
      .where(eq(products.categoryId, id));
    if (Number(productCount[0]?.c ?? 0) > 0) {
      return NextResponse.json(
        {
          data: null,
          error: 'კატეგორია შეიცავს პროდუქტებს — ჯერ წაშალე ან გადაიტანე ისინი',
        },
        { status: 409 }
      );
    }

    await db.delete(categories).where(eq(categories.id, id));
    return NextResponse.json({ data: { id }, error: null });
  } catch (e) {
    console.error('DELETE /api/categories/[id]', e);
    return NextResponse.json(
      { data: null, error: 'Failed to delete category' },
      { status: 500 }
    );
  }
}
