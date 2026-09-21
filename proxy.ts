import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/auth.config';
import { WORKERS_DIRECTORY } from '@/lib/features';

/**
 * Request proxy (Next 16's name for middleware): gates `/admin`, `/partner` and `/profile`
 * on the session cookie before the page renders. The page layouts check the role again server-side,
 * so this is the fast path, not the only guard. `authConfig` deliberately has no database
 * access — this runs on every matched request.
 *
 * It is also where a part of the site that is switched off (`lib/features`) sends its
 * visitors on with a real 307: a `redirect()` inside the page only fires after the layout
 * has begun to stream, which the browser sees as a 200 and a one-second meta refresh.
 */
const { auth } = NextAuth(authConfig);

export const proxy = auth((request) => {
  const path = request.nextUrl.pathname;
  if (!WORKERS_DIRECTORY && (path === '/workers' || path.startsWith('/workers/'))) return NextResponse.redirect(new URL('/teams', request.nextUrl));
  return undefined;
});

export const config = {
  matcher: ['/admin/:path*', '/partner/:path*', '/profile/:path*', '/workers/:path*'],
};
