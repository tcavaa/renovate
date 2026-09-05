import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { categories } from '@/lib/db/schema';
import { categorySchema } from '@/lib/validations/category.schema';
import { auth } from '@/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
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

    return NextResponse.json({ data, error: null });
  } catch (e) {
    console.error('GET /api/categories', e);
    return NextResponse.json(
      { data: null, error: 'Failed to load categories' },
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
    const parsed = categorySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: parsed.error.message },
        { status: 400 }
      );
    }
    const inserted = await db.insert(categories).values(parsed.data);
    return NextResponse.json({ data: { id: inserted[0].insertId }, error: null });
  } catch (e) {
    console.error('POST /api/categories', e);
    return NextResponse.json(
      { data: null, error: 'Failed to create category' },
      { status: 500 }
    );
  }
}
