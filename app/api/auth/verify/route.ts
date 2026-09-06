import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { RATE_RULES, rateLimited } from '@/lib/api/rateLimit';
import { API_ERRORS, fail, handle, ok } from '@/lib/api/route';
import { consumeToken, markEmailVerified, sendVerificationMail } from '@/lib/auth/tokens';
import { env } from '@/lib/env';
import { getT } from '@/lib/i18n/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The link in the verification mail. Spends the token and lands on the profile with a flag. */
export const GET = handle('GET /api/auth/verify', 'Verification failed', async (req) => {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  const userId = await consumeToken(token, 'verify_email');
  if (userId) await markEmailVerified(userId);
  return NextResponse.redirect(new URL(`/profile?verified=${userId ? '1' : '0'}`, env.NEXT_PUBLIC_APP_URL));
});

/** Re-sends the verification mail to the signed-in user. */
export const POST = handle('POST /api/auth/verify', 'Failed to send verification mail', async (req) => {
  const limited = rateLimited(req, RATE_RULES.authMail);
  if (limited) return limited;

  const session = await auth();
  if (!session?.user?.id) return fail(API_ERRORS.UNAUTHORIZED, 401);

  const rows = await db
    .select({ id: users.id, email: users.email, emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, Number(session.user.id)))
    .limit(1);
  const user = rows[0];
  if (!user) return fail(API_ERRORS.NOT_FOUND, 404);
  if (user.emailVerifiedAt) return ok({ sent: false, alreadyVerified: true });

  await sendVerificationMail(user, await getT());
  return ok({ sent: true });
});
