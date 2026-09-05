import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { authConfig } from '@/auth.config';
import { env } from '@/lib/env';
import { clearFailures, isLockedOut, recordFailure } from '@/lib/auth/lockout';
import { log } from '@/lib/log';

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
        };
      },
    }),
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? [
          Google({
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      if (account?.provider === 'google' && user.email) {
        const existing = await db
          .select()
          .from(users)
          .where(eq(users.email, user.email))
          .limit(1);
        if (existing.length === 0) {
          await db.insert(users).values({
            email: user.email,
            name: user.name ?? user.email.split('@')[0],
            role: 'user',
            // Google has already verified the address.
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
      role: 'user' | 'admin';
    };
  }
  interface User {
    role?: 'user' | 'admin';
  }
}
