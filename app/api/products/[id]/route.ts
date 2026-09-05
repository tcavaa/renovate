import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { products } from '@/lib/db/schema';
import { productSchema } from '@/lib/validations/product.schema';
import { auth } from '@/auth';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = Number(params.id);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ data: null, error: 'Invalid id' }, { status: 400 });
    }
    const rows = await db.select().from(products).where(eq(products.id, id)).limit(1);
    if (rows.length === 0) {
      return NextResponse.json({ data: null, error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ data: rows[0], error: null });
  } catch (e) {
    console.error('GET /api/products/[id]', e);
    return NextResponse.json(
      { data: null, error: 'Failed to load product' },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }
    const id = Number(params.id);
    const body = await req.json();
    const parsed = productSchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: parsed.error.message },
        { status: 400 }
      );
    }
    const data = parsed.data;
    await db
      .update(products)
      .set({
        ...data,
        pricePerUnit:
          data.pricePerUnit != null ? String(data.pricePerUnit) : undefined,
        coveragePerUnit:
          data.coveragePerUnit != null ? String(data.coveragePerUnit) : undefined,
      })
      .where(eq(products.id, id));
    return NextResponse.json({ data: { id }, error: null });
  } catch (e) {
    console.error('PUT /api/products/[id]', e);
    return NextResponse.json(
      { data: null, error: 'Failed to update product' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }
    const id = Number(params.id);
    await db.delete(products).where(eq(products.id, id));
    return NextResponse.json({ data: { id }, error: null });
  } catch (e) {
    console.error('DELETE /api/products/[id]', e);
    return NextResponse.json(
      { data: null, error: 'Failed to delete product' },
      { status: 500 }
    );
  }
}
