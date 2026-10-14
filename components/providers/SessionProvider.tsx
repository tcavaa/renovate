'use client';

import type { Session } from 'next-auth';
import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react';

/**
 * The session as the server read it for this page (`app/layout.tsx`), so the provider starts
 * with it: no `/api/auth/session` round trip on every page load — a function call each — and
 * no placeholder in the header's account corner, whose swap for the menu shifted the page.
 * It still asks again when the tab comes back into view.
 */
export function SessionProvider({ session, children }: { session: Session | null; children: React.ReactNode }) {
  return <NextAuthSessionProvider session={session}>{children}</NextAuthSessionProvider>;
}
