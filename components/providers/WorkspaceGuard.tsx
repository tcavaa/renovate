'use client';

import { useEffect } from 'react';
import { enterFreshWorkspace, isJourneyPath, watchFreshDrafts } from '@/lib/flow/workspace';

/**
 * Keeps the two workspaces apart (`store/workspace`, `lib/flow/workspace`).
 *
 * A link into the calculator or the studio followed from the header or the footer (wherever
 * the person is), or from any page outside the steps — the landing page, a profile link — is
 * a fresh start: the switch moves to the
 * person's own work *before* the navigation, in the capture phase of the click, so the page
 * never renders an opened project for a moment and its guards never act on one. Links inside
 * the steps keep whatever workspace is in force; "my projects" opens a project through its
 * own buttons, which set the switch themselves. It also watches the fresh journeys for a
 * draft let go of (one draft of each).
 */
export function WorkspaceGuard() {
  useEffect(() => watchFreshDrafts(), []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target === '_blank' || anchor.dataset.workspace === 'keep') return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin || !isJourneyPath(url.pathname)) return;
      // The site's own navigation — the header and the footer — always means the person's own
      // work, even from inside an opened project; a link within the steps keeps the workspace.
      const siteNav = !!anchor.closest('[data-site-nav]');
      if (!siteNav && isJourneyPath(window.location.pathname)) return;
      enterFreshWorkspace();
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  return null;
}
