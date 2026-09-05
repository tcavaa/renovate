import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { rates } from '@/lib/db/schema';
import { rateSchema, toRateRow } from '@/lib/validations/rate.schema';
import { auth } from '@/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Every rate, active or not — the calculator filters on the client, admin needs them all. */
export async function GET() {
  try {
    const rows = await db.select().from(rates).orderBy(asc(rates.phase), asc(rates.sortOrder), asc(rates.id));
    return NextResponse.json({ data: rows, error: null });
  } catch (e) {
    console.error('GET /api/calculator/rates', e);
    return NextResponse.json({ data: null, error: 'Failed to load rates' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }
    const parsed = rateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 });
    }
    const existing = await db.select({ id: rates.id }).from(rates).where(eq(rates.key, parsed.data.key)).limit(1);
    if (existing.length) {
      return NextResponse.json({ data: null, error: 'A rate with this key already exists' }, { status: 409 });
    }
    const inserted = await db.insert(rates).values(toRateRow(parsed.data));
    const id = Number(inserted[0].insertId);
    const row = await db.select().from(rates).where(eq(rates.id, id)).limit(1);
    return NextResponse.json({ data: row[0], error: null }, { status: 201 });
  } catch (e) {
    console.error('POST /api/calculator/rates', e);
    return NextResponse.json({ data: null, error: 'Failed to create rate' }, { status: 500 });
  }
}
