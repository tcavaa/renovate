import NextAuth, { CredentialsSignin, type NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Facebook from 'next-auth/providers/facebook';
import Google from 'next-auth/providers/google';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { authConfig } from '@/auth.config';
import { env } from '@/lib/env';
import { clearFailures, isLockedOut, recordFailure } from '@/lib/auth/lockout';
import { ACCOUNT_DISABLED, SOCIAL_LINK_REFUSED, SOCIAL_NO_EMAIL, maySocialJoin } from '@/lib/auth/social';
import { refreshSessionToken, sessionTokenAfterSignIn } from '@/lib/auth/accountClaims';
import { log } from '@/lib/log';
import type { UserRole } from '@/lib/auth/roles';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** The right password for an account admin has switched off: said as such (`?code=`). */
class AccountDisabled extends CredentialsSignin {
  code = ACCOUNT_DISABLED;
}

/** Stamps `lastLoginAt`. Never fatal — a sign-in is not refused over a bookkeeping write. */
async function recordLogin(userId: number): Promise<void> {
  try {
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
  } catch (e) {
    log.warn('last login not recorded', { userId, err: e });
  }
}

/**
 * The whole auth setup on the server: `authConfig` (what the edge proxy runs too) plus the
 * providers and the callbacks that need the database. Exported so the tests can run the
 * callbacks exactly as NextAuth is given them.
 */
export const authOptions = {
  ...authConfig,
  secret: env.AUTH_SECRET,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize: async (credentials) => {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        // Five wrong passwords lock the account for fifteen minutes, whatever the IP.
        if (isLockedOut(email)) {
          log.warn('login refused: account locked', { email: email.toLowerCase() });
          return null;
        }

        const found = await db
          .select()
          .from(users)
          .where(eq(users.email, email.toLowerCase()))
          .limit(1);
        const user = found[0];
        if (!user || !user.passwordHash) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) {
          if (recordFailure(email)) log.warn('login: account locked after repeated failures', { userId: user.id });
          return null;
        }
        clearFailures(email);
        // Only after the password: a stranger guessing addresses learns nothing about which
        // accounts exist and which were switched off.
        if (!user.isActive) {
          log.info('login refused: account deactivated', { userId: user.id });
          throw new AccountDisabled();
        }
        await recordLogin(user.id);

        return {
          id: String(user.id),
          email: user.email,
          name: user.name,
          role: user.role,
          storeId: user.storeId ?? null,
          workerId: user.workerId ?? null,
          teamId: user.teamId ?? null,
          sessionVersion: user.sessionVersion ?? 0,
        };
      },
    }),
    // Each social login appears only when its keys are set, so a deployment without them
    // simply has no such button (`NEXT_PUBLIC_*_ENABLED` is what the login page reads).
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? [
          Google({
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
    ...(env.FACEBOOK_CLIENT_ID && env.FACEBOOK_CLIENT_SECRET
      ? [
          Facebook({
            clientId: env.FACEBOOK_CLIENT_ID,
            clientSecret: env.FACEBOOK_CLIENT_SECRET,
          }),
        ]
      : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // `authConfig`'s copy of the signed-in user is the whole story for a password sign-in. A
    // Google or Facebook one hands over the provider's profile — a random id, no role — so the
    // account's own claims are looked up by e-mail and put on the token instead. Every later
    // read of the session re-reads the account, so a role changed, a partner unlinked or an
    // account switched off or deleted takes effect on the next request, not at the next
    // sign-in (`lib/auth/accountClaims`). Server only: the proxy runs `authConfig` as it is.
    async jwt(params) {
      const token = await authConfig.callbacks.jwt(params);
      if (params.user) {
        const signedIn = await sessionTokenAfterSignIn(token, params);
        if (signedIn === null) log.error('social sign-in refused: no account behind the e-mail', { provider: params.account?.provider });
        return signedIn;
      }
      const current = await refreshSessionToken(token);
      if (current === null) log.info('session ended: account deactivated or removed', { userId: token.id ?? token.sub ?? null });
      return current;
    },
    async signIn({ user, account, profile }) {
      // Every social login lands here: the first sign-in creates the account, later ones
      // find it by e-mail. Facebook is allowed to withhold the address (the person can
      // deny the permission, and an account signed up by telephone has none), and without
      // one there is nothing to key the user on — so refuse rather than make a nameless row.
      if (account && account.provider !== 'credentials') {
        if (!user.email) {
          log.warn('social login refused: no e-mail from the provider', { provider: account.provider });
          return `/login?error=${SOCIAL_NO_EMAIL}`;
        }
        const email = user.email.toLowerCase();
        const existing = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        if (existing.length === 0) {
          await db.insert(users).values({
            email,
            name: user.name ?? email.split('@')[0],
            role: 'user',
            // Google says whether it checked the address; Facebook hands over only a confirmed one.
            emailVerifiedAt: account.provider === 'google' && profile?.email_verified !== true ? null : new Date(),
            lastLoginAt: new Date(),
          });
        } else if (existing[0].isActive === false) {
          log.info('social login refused: account deactivated', { userId: existing[0].id, provider: account.provider });
          return `/login?error=${ACCOUNT_DISABLED}`;
        } else if (!maySocialJoin(account.provider, profile, existing[0])) {
          log.warn('social login refused: the provider does not vouch for the e-mail of a password account', { userId: existing[0].id, provider: account.provider });
          return `/login?error=${SOCIAL_LINK_REFUSED}`;
        } else {
          await recordLogin(existing[0].id);
        }
      }
      return true;
    },
  },
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authOptions);

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: UserRole;
      /** Set on `store` accounts: the store whose portal this is. */
      storeId: number | null;
      /** Set on `worker` accounts. */
      workerId: number | null;
      teamId: number | null;
    };
  }
  interface User {
    role?: UserRole;
    storeId?: number | null;
    workerId?: number | null;
    teamId?: number | null;
  }
}
