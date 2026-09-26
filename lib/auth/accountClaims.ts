import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import type { UserRole } from '@/lib/auth/roles';

/**
 * What a session says about the account behind it — the same claims however the person signed
 * in. Server only (it reads the database); the edge half of the auth setup, `auth.config.ts`,
 * never imports it.
 *
 * A password sign-in needs nothing from here: `authorize` in `auth.ts` returns our `users` row,
 * and `authConfig`'s `jwt` callback copies it onto the token. A Google or Facebook sign-in is
 * different. With JWT sessions and no adapter, `@auth/core` hands the callbacks the provider's
 * profile with an id of its own making (`crypto.randomUUID()`) and no role, and nothing ties it
 * to our row — so the token carried that UUID as `session.user.id`, every `Number(user.id)`
 * came out as NaN, and an admin who signed in with Google was a `user`. The `signIn` callback
 * has made the row by the time the token is written, so `sessionTokenAfterSignIn` finds it by
 * e-mail and puts its claims on the token instead.
 */
export interface AccountClaims {
  /** `users.id` as a string — what `session.user.id` is everywhere. */
  id: string;
  role: UserRole;
  storeId: number | null;
  workerId: number | null;
  teamId: number | null;
}

/** A `users` row's claims. */
export function claimsOf(row: { id: number; role: UserRole; storeId: number | null; workerId: number | null; teamId: number | null }): AccountClaims {
  return { id: String(row.id), role: row.role, storeId: row.storeId ?? null, workerId: row.workerId ?? null, teamId: row.teamId ?? null };
}

/** A sign-in through a provider other than the password form. */
export function isSocialSignIn(account: { provider: string } | null | undefined): boolean {
  return account != null && account.provider !== 'credentials';
}

/** The claims of the account with this e-mail (compared lower-cased, as it is stored), or null. */
export async function accountClaimsByEmail(email: string | null | undefined): Promise<AccountClaims | null> {
  if (!email) return null;
  const rows = await db
    .select({ id: users.id, role: users.role, storeId: users.storeId, workerId: users.workerId, teamId: users.teamId })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  return rows[0] ? claimsOf(rows[0]) : null;
}

/**
 * The token a sign-in ends with, given the one `authConfig`'s `jwt` callback made of it. A
 * password sign-in, and every later read of the session (no `account` then), keep it as it is.
 * A social sign-in gets its account's claims — and `sub` with them — in place of the provider's;
 * with no account behind the e-mail it gets no token at all (null signs the person out), rather
 * than a session that belongs to nobody.
 */
export async function sessionTokenAfterSignIn<T extends Record<string, unknown>>(
  token: T,
  signIn: { account?: { provider: string } | null; user?: { email?: string | null } | null },
  lookup: (email: string | null | undefined) => Promise<AccountClaims | null> = accountClaimsByEmail
): Promise<(T & AccountClaims & { sub: string }) | T | null> {
  if (!isSocialSignIn(signIn.account)) return token;
  const claims = await lookup(signIn.user?.email);
  if (!claims) return null;
  return { ...token, ...claims, sub: claims.id };
}
