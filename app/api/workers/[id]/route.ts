import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { workers } from '@/lib/db/schema';
import { workerSchema } from '@/lib/validations/worker.schema';
import { auth } from '@/auth';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ data: null, error: 'Invalid id' }, { status: 400 });
    }
    const rows = await db.select().from(workers).where(eq(workers.id, id)).limit(1);
    if (rows.length === 0) {
      return NextResponse.json({ data: null, error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ data: rows[0], error: null });
  } catch (e) {
    console.error('GET /api/workers/[id]', e);
    return NextResponse.json(
      { data: null, error: 'Failed to load worker' },
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
    const parsed = workerSchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: parsed.error.message },
        { status: 400 }
      );
    }
    const d = parsed.data;
    await db
      .update(workers)
      .set({
        ...d,
        pricePerM2:
          d.pricePerM2 !== undefined
            ? d.pricePerM2 == null
              ? null
              : String(d.pricePerM2)
            : undefined,
        pricePerUnit:
          d.pricePerUnit !== undefined
            ? d.pricePerUnit == null
              ? null
              : String(d.pricePerUnit)
            : undefined,
        rating: d.rating != null ? String(d.rating) : undefined,
        avatarUrl: d.avatarUrl !== undefined ? d.avatarUrl || null : undefined,
      })
      .where(eq(workers.id, id));
    return NextResponse.json({ data: { id }, error: null });
  } catch (e) {
    console.error('PUT /api/workers/[id]', e);
    return NextResponse.json(
      { data: null, error: 'Failed to update worker' },
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
    await db.delete(workers).where(eq(workers.id, id));
    return NextResponse.json({ data: { id }, error: null });
  } catch (e) {
    console.error('DELETE /api/workers/[id]', e);
    return NextResponse.json(
      { data: null, error: 'Failed to delete worker' },
      { status: 500 }
    );
  }
}
