import NextAuth from 'next-auth';
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
import { SOCIAL_NO_EMAIL } from '@/lib/auth/social';
import { log } from '@/lib/log';
import type { UserRole } from '@/lib/auth/roles';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
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

        return {
          id: String(user.id),
          email: user.email,
          name: user.name,
          role: user.role,
          storeId: user.storeId ?? null,
          workerId: user.workerId ?? null,
          teamId: user.teamId ?? null,
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
    async signIn({ user, account }) {
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
            // Google and Facebook have both verified the address before handing it over.
            emailVerifiedAt: new Date(),
          });
        }
      }
      return true;
    },
  },
});

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
