'use client';

import { useEffect, useState } from 'react';
import type { CheckoutKind } from '@/lib/finance/money';
import type { PaymentView } from '@/lib/finance/payments';

/**
 * What each half of a project has paid (`GET /api/payments`) — the summaries say the fee was
 * paid instead of adding it to the total. Empty until the server answers, or for a project
 * whose halves passed their hinge before the fee was taken there.
 */
export function useProjectPayments(projectId: number | null): Partial<Record<CheckoutKind, PaymentView>> {
  const [paid, setPaid] = useState<Partial<Record<CheckoutKind, PaymentView>>>({});
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    fetch(`/api/payments?projectId=${projectId}`)
      .then(async (res) => (res.ok ? ((await res.json()) as { data: { paid: Partial<Record<CheckoutKind, PaymentView>> } | null }).data : null))
      .then((data) => {
        if (!cancelled && data) setPaid(data.paid);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [projectId]);
  return paid;
}
