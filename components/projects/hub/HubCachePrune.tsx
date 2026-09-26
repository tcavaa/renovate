'use client';

import { useEffect } from 'react';
import { claimBrowser } from '@/lib/flow/owner';
import { pruneCaches } from '@/lib/flow/projectSync';
import { activeProjectId } from '@/store/projectScope';

/**
 * Tidies this browser's project caches whenever a hub is opened: the hub knows every project
 * the person has, so the caches of projects deleted elsewhere (another tab, another computer)
 * go, and the clean ones nobody has opened for a while give way (`pruneCaches`). The browser is
 * claimed for the account first (`claimBrowser`, idempotent), so another account's leftovers
 * are never mistaken for this one's. Renders nothing.
 */
export function HubCachePrune({ userId, projectIds }: { userId: number; projectIds: number[] }) {
  const key = projectIds.join(',');
  useEffect(() => {
    claimBrowser(userId);
    // The project just left may still be sending its last save: it is never among those let go.
    pruneCaches(activeProjectId(), key ? key.split(',').map(Number) : []);
  }, [userId, key]);
  return null;
}
