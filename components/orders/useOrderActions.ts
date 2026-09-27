'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useT } from '@/lib/i18n/client';
import { apiErrorMessage } from '@/lib/i18n/labels';

export interface OrderNotice {
  ok: boolean;
  text: string;
}

/**
 * Saving and confirming one order, shared by the full order page and the project page's cards:
 * `save` sends a change (`PUT /api/orders/[id]`), `confirm` sends a store's order on
 * (`POST …/confirm`) — after saving whatever is still unsaved, so what is confirmed is what is
 * on screen. The page is refreshed after either, so every figure comes back from the server.
 */
export function useOrderActions(orderId: number) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<OrderNotice | null>(null);

  const request = async (url: string, method: 'PUT' | 'POST', body?: unknown): Promise<boolean> => {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = (await res.json().catch(() => ({ error: null }))) as { error: string | null };
    if (!res.ok) {
      setNotice({ ok: false, text: apiErrorMessage(t, json.error) });
      return false;
    }
    return true;
  };

  const run = async (steps: () => Promise<boolean>): Promise<boolean> => {
    setBusy(true);
    setNotice(null);
    try {
      const done = await steps();
      if (done) {
        setNotice({ ok: true, text: t.partner.saved });
        router.refresh();
      }
      return done;
    } catch {
      setNotice({ ok: false, text: t.partner.saveError });
      return false;
    } finally {
      setBusy(false);
    }
  };

  return {
    busy,
    notice,
    setNotice,
    save: (body: Record<string, unknown>) => run(() => request(`/api/orders/${orderId}`, 'PUT', body)),
    confirm: (pending?: Record<string, unknown> | null) =>
      run(async () => {
        if (pending && !(await request(`/api/orders/${orderId}`, 'PUT', pending))) return false;
        return request(`/api/orders/${orderId}/confirm`, 'POST');
      }),
  };
}
