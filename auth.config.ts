import type { NextAuthConfig } from 'next-auth';
import { canOpenPartnerPortal, type UserRole } from '@/lib/auth/roles';

/**
 * The part of the auth setup that runs in the proxy (edge-safe: no database). The role and
 * the partner link are copied from the user row into the JWT at sign-in and from the JWT
 * into the session on every request, so pages and routes read `session.user.role`,
 * `session.user.storeId` and `session.user.workerId` without touching the database.
 */
type SignedInUser = { id: string; role?: UserRole; storeId?: number | null; workerId?: number | null };

export const authConfig = {
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as SignedInUser;
        token.id = u.id;
        token.role = u.role ?? 'user';
        token.storeId = u.storeId ?? null;
        token.workerId = u.workerId ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as UserRole | undefined) ?? 'user';
        session.user.storeId = (token.storeId as number | null | undefined) ?? null;
        session.user.workerId = (token.workerId as number | null | undefined) ?? null;
      }
      return session;
    },
    authorized({ auth, request }) {
      const path = request.nextUrl.pathname;
      const isAdminRoute = path.startsWith('/admin');
      const isPartnerRoute = path.startsWith('/partner');
      const isProfileRoute = path.startsWith('/profile');
      if (!isAdminRoute && !isPartnerRoute && !isProfileRoute) return true;

      if (!auth?.user) {
        const loginUrl = new URL('/login', request.nextUrl);
        loginUrl.searchParams.set('callbackUrl', path);
        return Response.redirect(loginUrl);
      }
      if (isAdminRoute && auth.user.role !== 'admin') {
        return Response.redirect(new URL('/', request.nextUrl));
      }
      if (isPartnerRoute && !canOpenPartnerPortal(auth.user.role)) {
        return Response.redirect(new URL('/', request.nextUrl));
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
