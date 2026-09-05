import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { authTokens, users } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { sendMail } from '@/lib/email';
import type { Dictionary } from '@/lib/i18n';

export type TokenKind = 'verify_email' | 'reset_password';

const TTL_MS: Record<TokenKind, number> = {
  verify_email: 24 * 60 * 60_000,
  reset_password: 60 * 60_000,
};

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Issues a fresh single-use token for a user and retires any unused ones of the same kind,
 * so only the most recent link works. The raw token goes into the e-mail; only its hash is
 * stored.
 */
export async function issueToken(userId: number, kind: TokenKind): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(authTokens.userId, userId), eq(authTokens.kind, kind), isNull(authTokens.usedAt)));
  await db.insert(authTokens).values({
    userId,
    kind,
    tokenHash: hash(token),
    expiresAt: new Date(Date.now() + TTL_MS[kind]),
  });
  return token;
}

/** Spends a token. Returns the user id it belongs to, or `null` if it is unknown, used or expired. */
export async function consumeToken(token: string, kind: TokenKind): Promise<number | null> {
  if (!token || token.length > 128) return null;
  const rows = await db
    .select({ id: authTokens.id, userId: authTokens.userId })
    .from(authTokens)
    .where(
      and(
        eq(authTokens.tokenHash, hash(token)),
        eq(authTokens.kind, kind),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, new Date())
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  await db.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, row.id));
  return row.userId;
}

export async function sendPasswordResetMail(user: { id: number; email: string }, t: Dictionary): Promise<void> {
  const token = await issueToken(user.id, 'reset_password');
  const url = `${env.NEXT_PUBLIC_APP_URL}/reset-password?token=${token}`;
  await sendMail({
    to: user.email,
    subject: t.auth.mailResetSubject,
    text: `${t.auth.mailResetBody}\n\n${url}\n\n${t.auth.mailIgnore}`,
  });
}

export async function sendVerificationMail(user: { id: number; email: string }, t: Dictionary): Promise<void> {
  const token = await issueToken(user.id, 'verify_email');
  const url = `${env.NEXT_PUBLIC_APP_URL}/api/auth/verify?token=${token}`;
  await sendMail({
    to: user.email,
    subject: t.auth.mailVerifySubject,
    text: `${t.auth.mailVerifyBody}\n\n${url}\n\n${t.auth.mailIgnore}`,
  });
}

/** Marks the user's address as verified. */
export async function markEmailVerified(userId: number): Promise<void> {
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, userId));
}
