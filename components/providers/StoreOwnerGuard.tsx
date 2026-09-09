'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useDesignStore } from '@/store/designStore';

const OWNER_KEY = 'renovate-owner';

/**
 * The calculator and the studio keep their work in localStorage, which outlives a sign-out:
 * the next person to sign in on the same computer found the previous user's plan waiting.
 * This remembers whose work is in the browser and wipes both stores when it stops being
 * theirs — on sign-out, and when a different account signs in. A guest's work is kept when
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
      useCalculatorStore.getState().reset();
      useDesignStore.getState().reset();
    }
    try {
      localStorage.setItem(OWNER_KEY, owner);
    } catch {
      // Storage unavailable: nothing persisted, nothing to guard.
    }
  }, [status, userId]);

  return null;
}
