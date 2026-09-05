import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { RATE_RULES, rateLimited } from '@/lib/api/rateLimit';
import { API_ERRORS, fail, handle, ok } from '@/lib/api/route';
import { sendVerificationMail } from '@/lib/auth/tokens';
import { getT } from '@/lib/i18n/server';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
});

export const POST = handle('POST /api/auth/register', 'Registration failed', async (req) => {
  const limited = rateLimited(req, RATE_RULES.register);
  if (limited) return limited;

  const parsed = registerSchema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);

  const { name, password } = parsed.data;
  const email = parsed.data.email.toLowerCase();

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) return fail(API_ERRORS.EMAIL_EXISTS, 409);

  const passwordHash = await bcrypt.hash(password, 10);
  const inserted = await db.insert(users).values({ name, email, passwordHash, role: 'user' });
  const id = Number(inserted[0].insertId);

  // The account works before the address is verified; the mail is a nicety that must not
  // turn a mail-server hiccup into a failed registration.
  sendVerificationMail({ id, email }, getT()).catch((e) => log.warn('verification mail failed', { userId: id, err: e }));

  return ok({ id, email });
});
