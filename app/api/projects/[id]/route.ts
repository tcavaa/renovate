import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';

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
    const rows = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (rows.length === 0) {
      return NextResponse.json({ data: null, error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ data: rows[0], error: null });
  } catch (e) {
    console.error('GET /api/projects/[id]', e);
    return NextResponse.json(
      { data: null, error: 'Failed to load project' },
      { status: 500 }
    );
  }
}
