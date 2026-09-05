import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { rates } from '@/lib/db/schema';
import { rateUpdateSchema } from '@/lib/validations/rate.schema';
import { auth } from '@/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const session = await auth();
  return !!session && session.user?.role === 'admin';
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }
    const id = Number(params.id);
    if (!Number.isFinite(id)) return NextResponse.json({ data: null, error: 'Bad id' }, { status: 400 });

    const parsed = rateUpdateSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 });
    }
    const d = parsed.data;
    const patch: Partial<typeof rates.$inferInsert> = {};
    if (d.labelKa !== undefined) patch.labelKa = d.labelKa;
    if (d.phase !== undefined) patch.phase = d.phase;
    if (d.unit !== undefined) patch.unit = d.unit;
    if (d.basis !== undefined) patch.basis = d.basis ?? null;
    if (d.qtyPerM2 !== undefined) patch.qtyPerM2 = d.qtyPerM2 == null ? null : String(d.qtyPerM2);
    if (d.wasteFactorPct !== undefined) patch.wasteFactorPct = d.wasteFactorPct == null ? null : String(d.wasteFactorPct);
    if (d.pricePerUnit !== undefined) patch.pricePerUnit = String(d.pricePerUnit);
    if (d.linkedCategorySlug !== undefined) patch.linkedCategorySlug = d.linkedCategorySlug ?? null;
    if (d.sortOrder !== undefined) patch.sortOrder = d.sortOrder;
    if (d.isActive !== undefined) patch.isActive = d.isActive;

    await db.update(rates).set(patch).where(eq(rates.id, id));
    const row = await db.select().from(rates).where(eq(rates.id, id)).limit(1);
    if (row.length === 0) return NextResponse.json({ data: null, error: 'Not found' }, { status: 404 });
    return NextResponse.json({ data: row[0], error: null });
  } catch (e) {
    console.error('PUT /api/calculator/rates/[id]', e);
    return NextResponse.json({ data: null, error: 'Failed to update rate' }, { status: 500 });
  }
}

/** Deactivates rather than deletes: the estimate simply stops using the line. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }
    const id = Number(params.id);
    if (!Number.isFinite(id)) return NextResponse.json({ data: null, error: 'Bad id' }, { status: 400 });
    await db.update(rates).set({ isActive: false }).where(eq(rates.id, id));
    return NextResponse.json({ data: { id, isActive: false }, error: null });
  } catch (e) {
    console.error('DELETE /api/calculator/rates/[id]', e);
    return NextResponse.json({ data: null, error: 'Failed to deactivate rate' }, { status: 500 });
  }
}
