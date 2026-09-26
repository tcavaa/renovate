import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/auth.config';
import { WORKERS_DIRECTORY } from '@/lib/features';

/**
 * Request proxy (Next 16's name for middleware): gates `/admin`, `/partner`, `/profile` and a
 * project's steps (`/calculator/<id>/…`, `/design/<id>/…`) on the session cookie before the
 * page renders. The page layouts check the role again server-side,
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
  // A step URL from before projects (`/calculator/plan`, `/design/studio`): the steps live inside
  // a project now (`/calculator/<id>/plan`), so an old bookmark goes to the hub, with a real 307.
  const journey = /^\/(calculator|design)\/([^/]+)/.exec(path);
  if (journey && !/^\d+$/.test(journey[2])) return NextResponse.redirect(new URL(`/${journey[1]}`, request.nextUrl));
  // The calculator's placement step went into the catalogue (September 2026): each room's floor
  // and walls are chosen, and counted, there.
  const placement = /^\/calculator\/(\d+)\/placement\/?$/.exec(path);
  if (placement) return NextResponse.redirect(new URL(`/calculator/${placement[1]}/catalog`, request.nextUrl));
  return undefined;
});

export const config = {
  // `:path+` — one segment or more: a project's steps, never the hubs `/calculator` and `/design`.
  matcher: ['/admin/:path*', '/partner/:path*', '/profile/:path*', '/workers/:path*', '/calculator/:path+', '/design/:path+'],
};
