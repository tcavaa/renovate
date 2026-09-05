import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { auth } from '@/auth';

export const runtime = 'nodejs';

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  role: z.enum(['user', 'admin']).optional(),
});

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json(
        { data: null, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    const id = Number(params.id);
    if (!Number.isFinite(id)) {
      return NextResponse.json(
        { data: null, error: 'Invalid id' },
        { status: 400 }
      );
    }
    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
        hasPassword: sql<number>`CASE WHEN ${users.passwordHash} IS NULL THEN 0 ELSE 1 END`,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json(
        { data: null, error: 'Not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ data: rows[0], error: null });
  } catch (e) {
    console.error('GET /api/users/[id]', e);
    return NextResponse.json(
      { data: null, error: 'Failed to load user' },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await auth();
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json(
        { data: null, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    const id = Number(params.id);
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: parsed.error.message },
        { status: 400 }
      );
    }

    if (
      Number(session.user.id) === id &&
      parsed.data.role &&
      parsed.data.role !== 'admin'
    ) {
      return NextResponse.json(
        { data: null, error: 'საკუთარი თავის როლის შეცვლა შეუძლებელია' },
        { status: 400 }
      );
    }

    await db.update(users).set(parsed.data).where(eq(users.id, id));
    return NextResponse.json({ data: { id }, error: null });
  } catch (e) {
    console.error('PUT /api/users/[id]', e);
    return NextResponse.json(
      { data: null, error: 'Failed to update user' },
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
      return NextResponse.json(
        { data: null, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    const id = Number(params.id);
    if (Number(session.user.id) === id) {
      return NextResponse.json(
        { data: null, error: 'საკუთარი ანგარიშის წაშლა შეუძლებელია' },
        { status: 400 }
      );
    }
    await db.delete(users).where(eq(users.id, id));
    return NextResponse.json({ data: { id }, error: null });
  } catch (e) {
    console.error('DELETE /api/users/[id]', e);
    return NextResponse.json(
      { data: null, error: 'Failed to delete user' },
      { status: 500 }
    );
  }
}
