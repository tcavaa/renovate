'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useCalculatorPlanStore, useDesignStore } from '@/store/designStore';
import { useWorkspace } from '@/store/workspace';

const OWNER_KEY = 'renovate-owner';

/**
 * The calculator and the studio keep their work in localStorage, which outlives a sign-out:
 * the next person to sign in on the same computer found the previous user's plan waiting.
 * This remembers whose work is in the browser and wipes all three stores — the calculator,
 * its own drawing board, and the studio — when it stops being theirs — on sign-out, and when a different account signs in. A guest's work is kept when
 * they sign in: that is the "log in to save" path, not a hand-over.
 */
export function StoreOwnerGuard() {
  const { data, status } = useSession();
  const userId = data?.user?.id ?? null;

  useEffect(() => {
    if (status === 'loading') return;
    const owner = userId ? `user:${userId}` : 'guest';
    let previous: string | null = null;
    try {
      previous = localStorage.getItem(OWNER_KEY);
    } catch {
      return;
    }
    if (previous && previous !== owner && previous !== 'guest') {
      // Both workspaces: the person's own work and a project opened from their profile.
      for (const store of [useCalculatorStore, useCalculatorPlanStore, useDesignStore]) {
        store.fresh.getState().reset();
        store.project.getState().reset();
      }
      useWorkspace.getState().enterFresh();
    }
    try {
      localStorage.setItem(OWNER_KEY, owner);
    } catch {
      // Storage unavailable: nothing persisted, nothing to guard.
    }
  }, [status, userId]);

  return null;
}
