'use client';

/**
 * Whose work the browser holds. The projects' caches (`store/projectScope`) outlive a
 * sign-out, so the browser remembers the account they belong to (`renovate-owner`) and
 * forgets all of them when another account — or nobody — takes the computer over; then the
 * next person never finds the previous one's plans. Work from before projects existed is
 * moved into its project's keys on the way (`lib/flow/legacy`).
 */

import { forgetAllProjects } from '@/lib/flow/projectSync';
import { forgetLegacyCaches, migrateLegacyCaches } from '@/lib/flow/legacy';

const OWNER_KEY = 'renovate-owner';

function previousOwner(): string | null {
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}

function setOwner(owner: string): void {
  try {
    localStorage.setItem(OWNER_KEY, owner);
  } catch {
    // Storage unavailable: nothing persisted, nothing to guard.
  }
}

/**
 * The signed-in account takes the browser: another account's work is forgotten, a guest's is
 * kept (it is offered on the hub as a project), and old work is moved into its projects. Run
 * before a project is opened (`ProjectGate`) and whenever the session changes (`StoreOwnerGuard`).
 */
export function claimBrowser(userId: number | string): void {
  const owner = `user:${userId}`;
  const previous = previousOwner();
  if (previous && previous !== owner && previous !== 'guest') {
    forgetAllProjects();
    forgetLegacyCaches();
  }
  setOwner(owner);
  migrateLegacyCaches();
}

/**
 * Nobody is signed in — or the session could not be read for a moment (a network hiccup, an
 * expired token). Nothing is forgotten: a project cannot be opened without signing in, and
 * the next account to sign in either is the owner, who finds their unsaved work waiting, or
 * is somebody else, and `claimBrowser` forgets it all then.
 */
export function releaseBrowser(): void {
  // Deliberately nothing: see above.
}
