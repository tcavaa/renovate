'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { claimBrowser, releaseBrowser } from '@/lib/flow/owner';

/**
 * The projects' caches live in localStorage, which outlives a sign-out: the next person to sign
 * in on the same computer would find the previous user's plans waiting. This keeps the browser
 * the signed-in account's (`lib/flow/owner`): another account's caches are forgotten when
 * somebody else signs in, and all of them when nobody is signed in.
 */
export function StoreOwnerGuard() {
  const { data, status } = useSession();
  const userId = data?.user?.id ?? null;

  useEffect(() => {
    if (status === 'loading') return;
    if (userId) claimBrowser(userId);
    else releaseBrowser();
  }, [status, userId]);

  return null;
}
