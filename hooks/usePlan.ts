'use client';

import { useCallback, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { usePlanStore } from '@/store/planStore';
import { requiredPlan, type PaidPlanId, type PlanFeature, type PlanId } from '@/lib/plans/plans';
import type { PlanState } from '@/lib/plans/server';

/**
 * The person's plan (docs/subscriptions.md), loaded once per page and per account. `refresh`
 * reads it again — after a purchase, a project made.
 */
export function usePlan(): { state: PlanState | null; plan: PlanId; loaded: boolean; refresh: () => Promise<void> } {
  const { data: session, status } = useSession();
  const userId = status === 'authenticated' ? (session?.user?.id ?? null) : null;
  const { state, loaded, load, userId: loadedFor } = usePlanStore();
  useEffect(() => {
    if (status === 'loading') return;
    void load(userId);
  }, [status, userId, load]);
  const refresh = useCallback(() => load(userId, true), [load, userId]);
  const current = loadedFor === userId;
  return { state: current ? state : null, plan: (current && state?.plan) || 'free', loaded: current && loaded && status !== 'loading', refresh };
}

/**
 * The locks: `can(feature)` for what a button shows, `gate(feature)` before doing it — false,
 * and the upgrade dialogue opens, when the plan has not got it. Until the plan has loaded
 * everything is allowed rather than flashing locks at a paying person; the server checks what it
 * can (uploads, renders, own items, new projects) either way.
 */
export function usePlanGate() {
  const { state, loaded } = usePlan();
  const requestUpgrade = usePlanStore((s) => s.requestUpgrade);
  const can = useCallback((feature: PlanFeature) => (!loaded ? true : !!state?.features[feature]), [loaded, state]);
  const gate = useCallback(
    (feature: PlanFeature) => {
      if (can(feature)) return true;
      requestUpgrade({ feature });
      return false;
    },
    [can, requestUpgrade]
  );
  /** The plan a locked feature asks for, for its badge. */
  const needs = useCallback((feature: PlanFeature): PaidPlanId | null => (can(feature) ? null : requiredPlan(feature)), [can]);
  return { can, gate, needs, loaded };
}
