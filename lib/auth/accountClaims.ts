import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import type { UserRole } from '@/lib/auth/roles';

/**
 * What a session says about the account behind it — the same claims however the person signed
 * in, and the account as it is *now*, not as it was at sign-in. Server only (it reads the
 * database); the edge half of the auth setup, `auth.config.ts`, never imports it.
 *
 * **Sign-in.** A password sign-in needs nothing from here: `authorize` in `auth.ts` returns our
 * `users` row, and `authConfig`'s `jwt` callback copies it onto the token. A Google or Facebook
 * sign-in is different. With JWT sessions and no adapter, `@auth/core` hands the callbacks the
 * provider's profile with an id of its own making (`crypto.randomUUID()`) and no role, and
 * nothing ties it to our row — so the token carried that UUID as `session.user.id`, every
 * `Number(user.id)` came out as NaN, and an admin who signed in with Google was a `user`. The
 * `signIn` callback has made the row by the time the token is written, so
 * `sessionTokenAfterSignIn` finds it by e-mail and puts its claims on the token instead.
 *
 * **Every later read.** The role and the partner link used to be read once, at sign-in, and
 * trusted for the token's thirty days — renewed on every visit, so for as long as the person
 * kept coming back. Demoting an agent, unlinking a partner, deactivating or deleting an
 * account changed nothing until they signed out themselves. `refreshSessionToken` re-reads the
 * account on every server-side read of the session (`auth()` in a page or a route, the
 * client's `/api/auth/session`): a changed role or link is on the next request, and a missing
 * or deactivated account has no session at all (a null token signs the person out). Reads are
 * cached per process for `CLAIMS_TTL_MS`, and the admin routes that change an account call
 * `forgetAccount` so this process sees the change at once. The edge proxy still reads the
 * cookie as it was last written — it is the fast path; every page and route checks again here.
 */
export interface AccountClaims {
  /** `users.id` as a string — what `session.user.id` is everywhere. */
  id: string;
  role: UserRole;
  storeId: number | null;
  workerId: number | null;
  teamId: number | null;
}

/** The account as a session needs it: its claims, and the name and e-mail the menus show. */
export interface CurrentAccount extends AccountClaims {
  name: string;
  email: string;
  /** `users.sessionVersion`; absent counts as 0. */
  sessionVersion?: number;
}

/** The session version a token was signed in under (`sv`); a token from before there was one is 0. */
export function tokenSessionVersion(token: Record<string, unknown>): number {
  const sv = Number(token.sv ?? 0);
  return Number.isFinite(sv) ? sv : 0;
}

interface AccountRow {
  id: number;
  role: UserRole;
  storeId: number | null;
  workerId: number | null;
  teamId: number | null;
}

/** A `users` row's claims. */
export function claimsOf(row: AccountRow): AccountClaims {
  return { id: String(row.id), role: row.role, storeId: row.storeId ?? null, workerId: row.workerId ?? null, teamId: row.teamId ?? null };
}

/** A sign-in through a provider other than the password form. */
export function isSocialSignIn(account: { provider: string } | null | undefined): boolean {
  return account != null && account.provider !== 'credentials';
}

/**
 * The claims of the account with this e-mail (compared lower-cased, as it is stored), or null —
 * also for a deactivated account, which has no session to be given.
 */
export async function accountClaimsByEmail(email: string | null | undefined): Promise<(AccountClaims & { sessionVersion?: number }) | null> {
  if (!email) return null;
  const rows = await db
    .select({ id: users.id, role: users.role, storeId: users.storeId, workerId: users.workerId, teamId: users.teamId, isActive: users.isActive, sessionVersion: users.sessionVersion })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  const row = rows[0];
  return row && row.isActive !== false ? { ...claimsOf(row), sessionVersion: row.sessionVersion ?? 0 } : null;
}

/**
 * The token a sign-in ends with, given the one `authConfig`'s `jwt` callback made of it. A
 * password sign-in keeps it as it is. A social sign-in gets its account's claims — and `sub`
 * with them — in place of the provider's; with no account behind the e-mail it gets no token at
 * all (null signs the person out), rather than a session that belongs to nobody.
 */
export async function sessionTokenAfterSignIn<T extends Record<string, unknown>>(
  token: T,
  signIn: { account?: { provider: string } | null; user?: { email?: string | null } | null },
  lookup: (email: string | null | undefined) => Promise<(AccountClaims & { sessionVersion?: number }) | null> = accountClaimsByEmail
): Promise<(T & AccountClaims & { sub: string; sv: number }) | T | null> {
  if (!isSocialSignIn(signIn.account)) return token;
  const found = await lookup(signIn.user?.email);
  if (!found) return null;
  const { sessionVersion, ...claims } = found;
  return { ...token, ...claims, sub: claims.id, sv: sessionVersion ?? 0 };
}

// ---------------------------------------------------------------------------
// The account as it is now
// ---------------------------------------------------------------------------

/** How long one process trusts an account it has read. Admin's own changes skip the wait. */
export const CLAIMS_TTL_MS = 30_000;

interface Cached {
  at: number;
  account: CurrentAccount | null;
}

const globalForClaims = globalThis as unknown as { __accountClaims?: Map<number, Cached> };
const cache: Map<number, Cached> = globalForClaims.__accountClaims ?? new Map();
globalForClaims.__accountClaims = cache;

/** The account with this id if it may be signed in: null when it is gone or deactivated. */
export async function accountById(id: number): Promise<CurrentAccount | null> {
  const rows = await db
    .select({ id: users.id, role: users.role, storeId: users.storeId, workerId: users.workerId, teamId: users.teamId, isActive: users.isActive, name: users.name, email: users.email, sessionVersion: users.sessionVersion })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  const row = rows[0];
  if (!row || row.isActive === false) return null;
  return { ...claimsOf(row), name: row.name, email: row.email, sessionVersion: row.sessionVersion ?? 0 };
}

/** `accountById` behind the per-process cache. */
export async function currentAccount(id: number, now = Date.now(), lookup: (id: number) => Promise<CurrentAccount | null> = accountById): Promise<CurrentAccount | null> {
  const hit = cache.get(id);
  if (hit && now - hit.at < CLAIMS_TTL_MS) return hit.account;
  const account = await lookup(id);
  cache.set(id, { at: now, account });
  return account;
}

/** Drops what this process remembers of an account — after admin changed or removed it. */
export function forgetAccount(id: number): void {
  cache.delete(id);
}

/**
 * A signed-in token brought up to date with its account: the role, the partner link, the name
 * and the e-mail as they are now. Null — no session — when the token names no account, or one
 * that was deleted or deactivated since, or whose password was set anew after this token was
 * signed in (`sessionVersion`: a reset once left every older session — the attacker's with the
 * old password too — signed in for its thirty days).
 */
export async function refreshSessionToken<T extends Record<string, unknown>>(
  token: T,
  lookup: (id: number) => Promise<CurrentAccount | null> = (id) => currentAccount(id)
): Promise<(T & AccountClaims) | null> {
  const id = Number(token.id ?? token.sub);
  if (!Number.isInteger(id) || id <= 0) return null;
  const account = await lookup(id);
  if (!account) return null;
  if ((account.sessionVersion ?? 0) !== tokenSessionVersion(token)) return null;
  return { ...token, id: account.id, sub: account.id, role: account.role, storeId: account.storeId, workerId: account.workerId, teamId: account.teamId, name: account.name, email: account.email };
}
