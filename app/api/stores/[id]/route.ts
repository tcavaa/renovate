import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { products, stores } from '@/lib/db/schema';
import { storeSchema, toStoreRow } from '@/lib/validations/store.schema';
import { auth } from '@/auth';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ data: null, error: 'Invalid id' }, { status: 400 });
    }
    const rows = await db.select().from(stores).where(eq(stores.id, id)).limit(1);
    if (rows.length === 0) {
      return NextResponse.json({ data: null, error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ data: rows[0], error: null });
  } catch (e) {
    console.error('GET /api/stores/[id]', e);
    return NextResponse.json({ data: null, error: 'Failed to load store' }, { status: 500 });
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
    const parsed = storeSchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 });
    }

    await db.update(stores).set(toStoreRow(parsed.data)).where(eq(stores.id, id));
    return NextResponse.json({ data: { id }, error: null });
  } catch (e) {
    console.error('PUT /api/stores/[id]', e);
    return NextResponse.json({ data: null, error: 'Failed to update store' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }
    const id = Number(params.id);

    // Products carry a foreign key to the store, and a scene that has already been saved
    // references it by id — deleting underneath them would strand both.
    const linked = await db
      .select({ count: sql<number>`count(*)` })
      .from(products)
      .where(eq(products.storeId, id));

    if (Number(linked[0]?.count ?? 0) > 0) {
      return NextResponse.json(
        {
          data: null,
          error:
            'მაღაზიას აქვს პროდუქტები — ჯერ გადაიტანე ან წაშალე ისინი, ან უბრალოდ გამორთე მაღაზია.',
        },
        { status: 409 }
      );
    }

    await db.delete(stores).where(eq(stores.id, id));
    return NextResponse.json({ data: { id }, error: null });
  } catch (e) {
    console.error('DELETE /api/stores/[id]', e);
    return NextResponse.json({ data: null, error: 'Failed to delete store' }, { status: 500 });
  }
}
