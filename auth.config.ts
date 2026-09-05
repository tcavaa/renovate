import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as { id: string }).id;
        token.role = (user as { role?: 'user' | 'admin' }).role ?? 'user';
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as 'user' | 'admin' | undefined) ?? 'user';
      }
      return session;
    },
    authorized({ auth, request }) {
      const path = request.nextUrl.pathname;
      const isAdminRoute = path.startsWith('/admin');
      const isProfileRoute = path.startsWith('/profile');
      if (!isAdminRoute && !isProfileRoute) return true;

      if (!auth?.user) {
        const loginUrl = new URL('/login', request.nextUrl);
        loginUrl.searchParams.set('callbackUrl', path);
        return Response.redirect(loginUrl);
      }
      if (isAdminRoute && auth.user.role !== 'admin') {
        return Response.redirect(new URL('/', request.nextUrl));
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
