import NextAuth from 'next-auth';
import { authConfig } from '@/auth.config';

/**
 * Request proxy (Next 16's name for middleware): gates `/admin` and `/profile` on the
 * session cookie before the page renders. The page layouts check the role again server-side,
 * so this is the fast path, not the only guard. `authConfig` deliberately has no database
 * access — this runs on every matched request.
 */
const { auth } = NextAuth(authConfig);

export const proxy = auth;

export const config = {
  matcher: ['/admin/:path*', '/profile/:path*'],
};
