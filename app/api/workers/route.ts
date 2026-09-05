import { NextResponse } from 'next/server';
import { and, eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { workers } from '@/lib/db/schema';
import { workerSchema } from '@/lib/validations/worker.schema';
import { auth } from '@/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const specialty = searchParams.get('specialty');

    const conditions = [eq(workers.isActive, true)];
    if (specialty) conditions.push(eq(workers.specialtySlug, specialty));

    const data = await db
      .select()
      .from(workers)
      .where(and(...conditions))
      .orderBy(desc(workers.isVerified), desc(workers.rating));

    return NextResponse.json({ data, error: null });
  } catch (e) {
    console.error('GET /api/workers', e);
    return NextResponse.json(
      { data: null, error: 'Failed to load workers' },
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
    const parsed = workerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: parsed.error.message },
        { status: 400 }
      );
    }
    const d = parsed.data;
    const inserted = await db.insert(workers).values({
      nameKa: d.nameKa,
      specialty: d.specialty,
      specialtySlug: d.specialtySlug,
      phone: d.phone ?? null,
      pricePerM2: d.pricePerM2 != null ? String(d.pricePerM2) : null,
      pricePerUnit: d.pricePerUnit != null ? String(d.pricePerUnit) : null,
      priceUnit: d.priceUnit,
      rating: d.rating != null ? String(d.rating) : '5.00',
      reviewCount: d.reviewCount ?? 0,
      bio: d.bio ?? null,
      avatarUrl: d.avatarUrl || null,
      isVerified: d.isVerified,
      isActive: d.isActive,
    });
    return NextResponse.json({ data: { id: inserted[0].insertId }, error: null });
  } catch (e) {
    console.error('POST /api/workers', e);
    return NextResponse.json(
      { data: null, error: 'Failed to create worker' },
      { status: 500 }
    );
  }
}
