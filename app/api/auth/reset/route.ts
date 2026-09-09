import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { RATE_RULES, rateLimited } from '@/lib/api/rateLimit';
import { API_ERRORS, fail, handle, ok } from '@/lib/api/route';
import { consumeToken, markEmailVerified } from '@/lib/auth/tokens';
import { clearFailures } from '@/lib/auth/lockout';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  token: z.string().min(16).max(128),
  password: z.string().min(8).max(100),
});

/** Finishes a password reset: spends the token, stores the new hash, clears any lockout. */
export const POST = handle('POST /api/auth/reset', 'Failed to reset password', async (req) => {
  const limited = rateLimited(req, RATE_RULES.login);
  if (limited) return limited;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);

  const userId = await consumeToken(parsed.data.token, 'reset_password');
  if (!userId) return fail(API_ERRORS.INVALID_TOKEN, 400);

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
  // Proving control of the inbox verifies the address as a side effect.
  await markEmailVerified(userId);

  const user = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (user[0]) clearFailures(user[0].email);

  log.info('password reset completed', { userId });
  return ok({ reset: true });
});
