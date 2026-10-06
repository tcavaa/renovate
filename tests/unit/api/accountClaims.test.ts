import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * What a session says about the account behind it, however the person signed in — and that it
 * says what the account is *now*.
 *
 * With JWT sessions and no adapter, @auth/core (0.41) gives an OAuth sign-in's user an id of
 * its own making — `crypto.randomUUID()` in `getUserAndAccount` — and the provider's profile
 * has no role, so a Google or Facebook session used to carry that UUID as `session.user.id`
 * (every `Number(session.user.id)` NaN) and the role `user`. And a role was read once, at
 * sign-in: an agent demoted, an account switched off or deleted kept its session and its old
 * role for as long as it kept coming back. These tests drive the callbacks exactly as `auth.ts`
 * hands them to NextAuth, with the database mocked.
 */

type Row = Record<string, unknown>;
const users = vi.hoisted(() => ({ rows: [] as Row[], selects: 0, inserts: [] as Row[], updates: [] as Row[] }));

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            users.selects += 1;
            return users.rows;
          },
        }),
      }),
    }),
    // The social sign-in's first visit makes the row; the next read finds it.
    insert: () => ({
      values: async (values: Row) => {
        users.inserts.push(values);
        users.rows = [{ id: 44, storeId: null, workerId: null, teamId: null, isActive: true, ...values }];
        return [{ insertId: 44 }];
      },
    }),
    // `lastLoginAt`.
    update: () => ({ set: (values: Row) => ({ where: async () => void users.updates.push(values) }) }),
  },
}));

// NextAuth itself is not under test — our callbacks are — and next-auth's ESM build imports
// `next/server` in a way plain Node cannot resolve outside Next. `authOptions` is what it is
// given, so these stand-ins only have to take it.
vi.mock('next-auth', () => ({
  default: () => ({ handlers: {}, auth: async () => null, signIn: async () => undefined, signOut: async () => undefined }),
  CredentialsSignin: class CredentialsSignin extends Error {
    code = 'credentials';
  },
}));
vi.mock('next-auth/providers/credentials', () => ({ default: (options: object) => ({ id: 'credentials', type: 'credentials', ...options }) }));
vi.mock('next-auth/providers/google', () => ({ default: (options: object) => ({ id: 'google', type: 'oidc', ...options }) }));
vi.mock('next-auth/providers/facebook', () => ({ default: (options: object) => ({ id: 'facebook', type: 'oauth', ...options }) }));

import bcrypt from 'bcryptjs';
import { accountById, accountClaimsByEmail, CLAIMS_TTL_MS, claimsOf, currentAccount, forgetAccount, isSocialSignIn, refreshSessionToken, sessionTokenAfterSignIn } from '@/lib/auth/accountClaims';
import { authOptions } from '@/auth';

const row = (patch: Row = {}): Row => ({ id: 12, role: 'admin', storeId: null, workerId: null, teamId: null, isActive: true, name: 'Nino', email: 'nino@example.ge', ...patch });
const google = { provider: 'google', type: 'oidc', providerAccountId: '1098765432101234567890' } as const;
const credentials = { provider: 'credentials', type: 'credentials', providerAccountId: '12' } as const;
/** What @auth/core hands the callbacks for a Google sign-in: the profile, with a random id. */
const googleUser = (email = 'Nino@Example.ge') => ({ id: crypto.randomUUID(), name: 'Nino', email, image: null });

type JwtParams = Parameters<typeof authOptions.callbacks.jwt>[0];
type SessionParams = Parameters<typeof authOptions.callbacks.session>[0];
const jwt = (params: Record<string, unknown>) => authOptions.callbacks.jwt(params as unknown as JwtParams);
const session = (token: Record<string, unknown>) =>
  authOptions.callbacks.session({ session: { user: { email: 'x' }, expires: '2099-01-01' }, token } as unknown as SessionParams);

beforeEach(() => {
  users.rows = [];
  users.selects = 0;
  users.inserts.length = 0;
  users.updates.length = 0;
  // The per-process cache outlives a test; every id these tests use starts unknown.
  for (const id of [5, 12, 30, 44, 77]) forgetAccount(id);
});

describe('claimsOf / isSocialSignIn', () => {
  it('turns a users row into the claims a session carries', () => {
    expect(claimsOf({ id: 7, role: 'store', storeId: 3, workerId: null, teamId: null })).toEqual({ id: '7', role: 'store', storeId: 3, workerId: null, teamId: null });
  });

  it('knows a social sign-in from the password form and from a later read of the session', () => {
    expect(isSocialSignIn(google)).toBe(true);
    expect(isSocialSignIn({ provider: 'facebook' })).toBe(true);
    expect(isSocialSignIn(credentials)).toBe(false);
    expect(isSocialSignIn(null)).toBe(false);
    expect(isSocialSignIn(undefined)).toBe(false);
  });
});

describe('accountClaimsByEmail', () => {
  it('finds the account behind an e-mail', async () => {
    users.rows = [row()];
    expect(await accountClaimsByEmail('Nino@Example.ge')).toEqual({ id: '12', role: 'admin', storeId: null, workerId: null, teamId: null, sessionVersion: 0 });
  });

  it('is nobody for a deactivated account', async () => {
    users.rows = [row({ isActive: false })];
    expect(await accountClaimsByEmail('nino@example.ge')).toBeNull();
  });

  it('is nobody without an e-mail or without a row, and asks the database only when it has an e-mail', async () => {
    expect(await accountClaimsByEmail(undefined)).toBeNull();
    expect(await accountClaimsByEmail('')).toBeNull();
    expect(users.selects).toBe(0);
    expect(await accountClaimsByEmail('nobody@example.ge')).toBeNull();
    expect(users.selects).toBe(1);
  });
});

describe('sessionTokenAfterSignIn', () => {
  const claims = { id: '12', role: 'admin' as const, storeId: null, workerId: null, teamId: null };

  it('leaves a password sign-in and every later read of the session alone, without a lookup', async () => {
    const lookup = vi.fn(async () => claims);
    const token = { id: '5', role: 'user' };
    expect(await sessionTokenAfterSignIn(token, { account: credentials, user: { email: 'a@b.ge' } }, lookup)).toBe(token);
    expect(await sessionTokenAfterSignIn(token, {}, lookup)).toBe(token);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('puts the account\'s own claims on a social sign-in\'s token, `sub` included', async () => {
    const lookup = vi.fn(async () => claims);
    const token = { id: 'e3b0c442-uuid', sub: 'e3b0c442-uuid', role: 'user', email: 'nino@example.ge' };
    expect(await sessionTokenAfterSignIn(token, { account: google, user: { email: 'nino@example.ge' } }, lookup)).toEqual({ ...token, ...claims, sub: '12', sv: 0 });
    expect(lookup).toHaveBeenCalledWith('nino@example.ge');
  });

  it('gives no token to a social sign-in with no account behind it', async () => {
    expect(await sessionTokenAfterSignIn({ id: 'uuid' }, { account: google, user: { email: 'x@y.ge' } }, async () => null)).toBeNull();
  });
});

describe('the callbacks auth.ts gives NextAuth', () => {
  it('signs a Google user in as their own account — its id and role, not the provider\'s', async () => {
    users.rows = [row({ role: 'admin' })];
    const user = googleUser();
    const token = await jwt({ token: { sub: user.id, email: user.email }, user, account: google, trigger: 'signIn' });
    expect(token).toMatchObject({ id: '12', sub: '12', role: 'admin', storeId: null });
    const s = await session(token!);
    expect(s.user).toMatchObject({ id: '12', role: 'admin' });
    expect(Number(s.user.id)).toBe(12);
  });

  it('carries a partner\'s link through a social sign-in too', async () => {
    users.rows = [row({ id: 30, role: 'store', storeId: 7 })];
    const token = await jwt({ token: {}, user: googleUser(), account: { ...google, provider: 'facebook' }, trigger: 'signIn' });
    expect(token).toMatchObject({ id: '30', role: 'store', storeId: 7 });
  });

  it('finds the row the signIn callback has just made for a first-time Google user', async () => {
    const user = googleUser('new.person@example.ge');
    expect(await authOptions.callbacks.signIn({ user, account: google } as unknown as Parameters<typeof authOptions.callbacks.signIn>[0])).toBe(true);
    expect(users.inserts).toEqual([expect.objectContaining({ email: 'new.person@example.ge', role: 'user' })]);
    const token = await jwt({ token: {}, user, account: google, trigger: 'signUp', isNewUser: true });
    expect(token).toMatchObject({ id: '44', role: 'user' });
  });

  it('refuses a social sign-in whose account cannot be found, rather than a session for nobody', async () => {
    users.rows = [];
    expect(await jwt({ token: {}, user: googleUser(), account: google, trigger: 'signIn' })).toBeNull();
  });

  it('keeps the password form as it was: the row from `authorize`, no second lookup', async () => {
    const token = await jwt({ token: {}, user: { id: '5', email: 'a@b.ge', role: 'user', storeId: null, workerId: null, teamId: null }, account: credentials, trigger: 'signIn' });
    expect(token).toMatchObject({ id: '5', role: 'user' });
    expect(users.selects).toBe(0);
  });

  it('re-reads the account when a signed-in session is read: a role changed by admin is on the next request', async () => {
    users.rows = [row({ role: 'agent_catalog', name: 'Nino B.' })];
    const token = await jwt({ token: { id: '12', sub: '12', role: 'admin', storeId: null, workerId: null, teamId: null }, user: undefined, account: null });
    expect(token).toMatchObject({ id: '12', role: 'agent_catalog', name: 'Nino B.' });
    expect(users.selects).toBe(1);
  });

  it('carries a partner link changed by admin — and drops one that was taken away', async () => {
    users.rows = [row({ id: 30, role: 'user', storeId: null })];
    expect(await jwt({ token: { id: '30', role: 'store', storeId: 7 }, user: undefined, account: null })).toMatchObject({ role: 'user', storeId: null });
  });

  it('ends the session of an account switched off or deleted since it signed in', async () => {
    users.rows = [row({ isActive: false })];
    expect(await jwt({ token: { id: '12', role: 'admin' }, user: undefined, account: null })).toBeNull();
    forgetAccount(12);
    users.rows = [];
    expect(await jwt({ token: { id: '12', role: 'admin' }, user: undefined, account: null })).toBeNull();
  });

  it('refuses a Google sign-in into a deactivated account, and stamps the last sign-in of an active one', async () => {
    const signIn = authOptions.callbacks.signIn as unknown as (p: unknown) => Promise<string | boolean>;
    users.rows = [row({ isActive: false })];
    expect(await signIn({ user: googleUser('nino@example.ge'), account: google })).toBe('/login?error=account_disabled');
    users.rows = [row()];
    expect(await signIn({ user: googleUser('nino@example.ge'), account: google, profile: { email_verified: true } })).toBe(true);
    expect(users.updates).toEqual([expect.objectContaining({ lastLoginAt: expect.any(Date) })]);
  });

  it('lets a social sign-in become a password account only when the provider vouches for the address', async () => {
    const signIn = authOptions.callbacks.signIn as unknown as (p: unknown) => Promise<string | boolean>;
    const facebook = { ...google, provider: 'facebook' };
    users.rows = [row({ passwordHash: 'x' })];
    // Facebook does not say it checked the address: an admin's password account is not its to take.
    expect(await signIn({ user: googleUser('nino@example.ge'), account: facebook })).toBe('/login?error=social_link_refused');
    // Google says it did not.
    expect(await signIn({ user: googleUser('nino@example.ge'), account: google, profile: { email_verified: false } })).toBe('/login?error=social_link_refused');
    expect(await signIn({ user: googleUser('nino@example.ge'), account: google, profile: { email_verified: true } })).toBe(true);
    // An account a social sign-in made (no password) is joined by either.
    users.rows = [row({ passwordHash: null })];
    expect(await signIn({ user: googleUser('nino@example.ge'), account: facebook })).toBe(true);
  });

  it('ends every session signed in before the password was set anew', async () => {
    // Signed in at version 0; a reset raised the account to 1.
    users.rows = [row({ sessionVersion: 1 })];
    expect(await jwt({ token: { id: '12', role: 'admin', sv: 0 }, user: undefined, account: null })).toBeNull();
    forgetAccount(12);
    // A token from before there were versions counts as 0.
    expect(await jwt({ token: { id: '12', role: 'admin' }, user: undefined, account: null })).toBeNull();
    forgetAccount(12);
    // The session signed in after the reset carries 1 and goes on.
    expect(await jwt({ token: { id: '12', role: 'admin', sv: 1 }, user: undefined, account: null })).toMatchObject({ id: '12', sv: 1 });
  });

  it('stamps a sign-in with the version it was made under', async () => {
    expect(await jwt({ token: {}, user: { id: '5', role: 'user', sessionVersion: 3 }, account: credentials, trigger: 'signIn' })).toMatchObject({ id: '5', sv: 3 });
    users.rows = [row({ sessionVersion: 2 })];
    expect(await jwt({ token: {}, user: googleUser(), account: google, trigger: 'signIn' })).toMatchObject({ id: '12', sv: 2 });
  });
});

describe('refreshSessionToken / currentAccount / accountById', () => {
  const account = { id: '12', role: 'agent_orders' as const, storeId: null, workerId: null, teamId: null, name: 'Nino', email: 'nino@example.ge' };

  it('brings a token up to date with its account: role, link, name and e-mail', async () => {
    const lookup = vi.fn(async () => account);
    const token = { id: '12', sub: '12', role: 'admin', name: 'Old', email: 'old@example.ge', picture: null };
    expect(await refreshSessionToken(token, lookup)).toEqual({ ...token, ...account, sub: '12' });
    expect(lookup).toHaveBeenCalledWith(12);
  });

  it('gives no session to a token that names no account, or one that is gone', async () => {
    const lookup = vi.fn(async () => null);
    expect(await refreshSessionToken({ role: 'admin' }, lookup)).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
    expect(await refreshSessionToken({ id: '12' }, lookup)).toBeNull();
    // `sub` is the id when `id` is missing.
    expect(await refreshSessionToken({ sub: '12' }, async () => account)).toMatchObject({ id: '12', role: 'agent_orders' });
  });

  it('reads an account once per window, and again at once after admin changed it', async () => {
    const lookup = vi.fn(async () => account);
    await currentAccount(77, 1_000, lookup);
    await currentAccount(77, 1_000 + CLAIMS_TTL_MS - 1, lookup);
    expect(lookup).toHaveBeenCalledTimes(1);
    await currentAccount(77, 1_000 + CLAIMS_TTL_MS, lookup);
    expect(lookup).toHaveBeenCalledTimes(2);
    forgetAccount(77);
    await currentAccount(77, 1_000 + CLAIMS_TTL_MS + 1, lookup);
    expect(lookup).toHaveBeenCalledTimes(3);
  });

  it('reads the row: the account when it is active, nobody when it is switched off or gone', async () => {
    users.rows = [row({ role: 'team', teamId: 3 })];
    expect(await accountById(12)).toEqual({ id: '12', role: 'team', storeId: null, workerId: null, teamId: 3, name: 'Nino', email: 'nino@example.ge', sessionVersion: 0 });
    users.rows = [row({ isActive: false })];
    expect(await accountById(12)).toBeNull();
    users.rows = [];
    expect(await accountById(12)).toBeNull();
  });
});

describe('the password form (`authorize`)', () => {
  type Authorize = (credentials: Record<string, string>) => Promise<unknown>;
  const authorize = (authOptions.providers[0] as unknown as { authorize: Authorize }).authorize;
  const hash = bcrypt.hashSync('right-password', 4);

  it('signs an active account in with the right password, and stamps its last sign-in', async () => {
    users.rows = [row({ email: 'active@example.ge', passwordHash: hash })];
    expect(await authorize({ email: 'Active@Example.ge', password: 'right-password' })).toMatchObject({ id: '12', role: 'admin' });
    expect(users.updates).toEqual([expect.objectContaining({ lastLoginAt: expect.any(Date) })]);
  });

  it('refuses a wrong password without saying whether the account is switched off', async () => {
    users.rows = [row({ email: 'off@example.ge', passwordHash: hash, isActive: false })];
    expect(await authorize({ email: 'off@example.ge', password: 'wrong-password' })).toBeNull();
  });

  it('tells a deactivated account with the right password that it is deactivated', async () => {
    users.rows = [row({ email: 'off2@example.ge', passwordHash: hash, isActive: false })];
    await expect(authorize({ email: 'off2@example.ge', password: 'right-password' })).rejects.toMatchObject({ code: 'account_disabled' });
    expect(users.updates).toHaveLength(0);
  });
});
