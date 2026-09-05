import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { RATE_RULES, rateLimited } from '@/lib/api/rateLimit';

export const runtime = 'nodejs';

const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
});

export async function POST(req: Request) {
  try {
    const limited = rateLimited(req, RATE_RULES.register);
    if (limited) return limited;

    const body = await req.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { data: null, error: parsed.error.message },
        { status: 400 }
      );
    }
    const { name, email, password } = parsed.data;
    const lower = email.toLowerCase();

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, lower))
      .limit(1);
    if (existing.length > 0) {
      return NextResponse.json(
        { data: null, error: 'EMAIL_EXISTS' },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const inserted = await db.insert(users).values({
      name,
      email: lower,
      passwordHash,
      role: 'user',
    });

    return NextResponse.json({
      data: { id: inserted[0].insertId, email: lower },
      error: null,
    });
  } catch (e) {
    console.error('POST /api/auth/register', e);
    return NextResponse.json(
      { data: null, error: 'Registration failed' },
      { status: 500 }
    );
  }
}
