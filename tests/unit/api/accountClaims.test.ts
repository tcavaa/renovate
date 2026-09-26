import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * What a session says about the account behind it, however the person signed in.
 *
 * With JWT sessions and no adapter, @auth/core (0.41) gives an OAuth sign-in's user an id of
 * its own making — `crypto.randomUUID()` in `getUserAndAccount` — and the provider's profile
 * has no role, so a Google or Facebook session used to carry that UUID as `session.user.id`
 * (every `Number(session.user.id)` NaN) and the role `user`. These tests drive the callbacks
 * exactly as `auth.ts` hands them to NextAuth, with the database mocked.
 */

type Row = Record<string, unknown>;
const users = vi.hoisted(() => ({ rows: [] as Row[], selects: 0, inserts: [] as Row[] }));

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
        users.rows = [{ id: 44, storeId: null, workerId: null, teamId: null, ...values }];
        return [{ insertId: 44 }];
      },
    }),
  },
}));

// NextAuth itself is not under test — our callbacks are — and next-auth's ESM build imports
// `next/server` in a way plain Node cannot resolve outside Next. `authOptions` is what it is
// given, so these stand-ins only have to take it.
vi.mock('next-auth', () => ({ default: () => ({ handlers: {}, auth: async () => null, signIn: async () => undefined, signOut: async () => undefined }) }));
vi.mock('next-auth/providers/credentials', () => ({ default: (options: object) => ({ id: 'credentials', type: 'credentials', ...options }) }));
vi.mock('next-auth/providers/google', () => ({ default: (options: object) => ({ id: 'google', type: 'oidc', ...options }) }));
vi.mock('next-auth/providers/facebook', () => ({ default: (options: object) => ({ id: 'facebook', type: 'oauth', ...options }) }));

import { accountClaimsByEmail, claimsOf, isSocialSignIn, sessionTokenAfterSignIn } from '@/lib/auth/accountClaims';
import { authOptions } from '@/auth';

const row = (patch: Row = {}): Row => ({ id: 12, role: 'admin', storeId: null, workerId: null, teamId: null, ...patch });
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
    expect(await accountClaimsByEmail('Nino@Example.ge')).toEqual({ id: '12', role: 'admin', storeId: null, workerId: null, teamId: null });
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
    expect(await sessionTokenAfterSignIn(token, { account: google, user: { email: 'nino@example.ge' } }, lookup)).toEqual({ ...token, ...claims, sub: '12' });
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

  it('does not touch the database when a signed-in session is merely read', async () => {
    const token = { id: '12', role: 'admin', storeId: null, workerId: null, teamId: null };
    expect(await jwt({ token, user: undefined, account: null })).toEqual(token);
    expect(users.selects).toBe(0);
  });
});
