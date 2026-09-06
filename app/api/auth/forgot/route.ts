import { z } from 'zod';
import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { RATE_RULES, rateLimited } from '@/lib/api/rateLimit';
import { fail, handle, ok } from '@/lib/api/route';
import { sendPasswordResetMail } from '@/lib/auth/tokens';
import { getT } from '@/lib/i18n/server';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({ email: z.string().email() });

/**
 * Starts a password reset. Always answers 200 whether or not the address exists — the reply
 * must not tell an attacker which e-mails have accounts. Accounts without a password (Google
 * sign-in) get no mail: there is nothing to reset.
 */
export const POST = handle('POST /api/auth/forgot', 'Failed to start password reset', async (req) => {
  const limited = rateLimited(req, RATE_RULES.authMail);
  if (limited) return limited;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);

  const email = parsed.data.email.toLowerCase();
  const rows = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(and(eq(users.email, email), isNotNull(users.passwordHash)))
    .limit(1);

  if (rows[0]) {
    await sendPasswordResetMail(rows[0], await getT());
    log.info('password reset requested', { userId: rows[0].id });
  }
  return ok({ sent: true });
});
