import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { stores } from '@/lib/db/schema';
import { storeSchema, toStoreRow } from '@/lib/validations/store.schema';
import { auth } from '@/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get('active') === 'true';

    const rows = activeOnly
      ? await db.select().from(stores).where(eq(stores.isActive, true)).orderBy(asc(stores.nameKa))
      : await db.select().from(stores).orderBy(asc(stores.nameKa));

    return NextResponse.json({ data: rows, error: null });
  } catch (e) {
    console.error('GET /api/stores', e);
    return NextResponse.json({ data: null, error: 'Failed to load stores' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const parsed = storeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 });
    }

    const inserted = await db.insert(stores).values(toStoreRow(parsed.data));
    return NextResponse.json({ data: { id: inserted[0].insertId }, error: null });
  } catch (e) {
    console.error('POST /api/stores', e);
    return NextResponse.json({ data: null, error: 'Failed to create store' }, { status: 500 });
  }
}
