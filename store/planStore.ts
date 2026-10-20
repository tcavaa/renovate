'use client';

import { create } from 'zustand';
import type { PaidPlanId, PlanFeature } from '@/lib/plans/plans';
import type { PlanState } from '@/lib/plans/server';

/**
 * The signed-in person's plan as the browser holds it (`GET /api/plan`, docs/subscriptions.md),
 * one copy for the whole page, and the upgrade dialogue it opens: a locked feature clicked, the
 * projects used up, or a plan chosen to buy. `UpgradeHost` (in the main layout) shows it.
 */
export type UpgradeRequest = { feature: PlanFeature } | { limit: 'projects' } | { plan: PaidPlanId };

interface PlanStore {
  /** Whose plan this is: a sign-in or sign-out loads it again. */
  userId: string | null;
  state: PlanState | null;
  loaded: boolean;
  upgrade: UpgradeRequest | null;
  load: (userId: string | null, force?: boolean) => Promise<void>;
  requestUpgrade: (request: UpgradeRequest) => void;
  closeUpgrade: () => void;
}

let inflight: Promise<void> | null = null;

export const usePlanStore = create<PlanStore>((set, get) => ({
  userId: null,
  state: null,
  loaded: false,
  upgrade: null,
  load: async (userId, force = false) => {
    if (!force && get().loaded && get().userId === userId) return;
    if (!userId) {
      set({ userId: null, state: null, loaded: true });
      return;
    }
    if (inflight && !force && get().userId === userId) return inflight;
    set({ userId });
    inflight = fetch('/api/plan', { cache: 'no-store' })
      .then(async (res) => (res.ok ? ((await res.json()) as { data: PlanState | null }).data : null))
      .then((state) => {
        if (get().userId === userId) set({ state, loaded: true });
      })
      .catch(() => {
        // An unreachable plan leaves the page as it was; the server still checks what it gates.
        if (get().userId === userId) set({ loaded: true });
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  },
  requestUpgrade: (upgrade) => set({ upgrade }),
  closeUpgrade: () => set({ upgrade: null }),
}));
