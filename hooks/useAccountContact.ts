'use client';

import { useEffect, useState } from 'react';
import type { AccountContact } from '@/lib/account/contact';

/**
 * The signed-in person's contact — name, e-mail, phone, default address — read from
 * `/api/profile` whenever `enabled` turns on (a dialogue opening), so a phone or an address
 * kept at the last checkout is there at the next one. `ready` is false until the first answer;
 * a guest, or a failed request, is `account: null`.
 */
export function useAccountContact(enabled: boolean): { account: AccountContact | null; ready: boolean } {
  const [state, setState] = useState<{ account: AccountContact | null; ready: boolean }>({ account: null, ready: false });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch('/api/profile')
      .then(async (res) => (res.ok ? ((await res.json()) as { data: AccountContact | null }).data : null))
      .then((account) => {
        if (!cancelled) setState({ account: account ?? null, ready: true });
      })
      .catch(() => {
        if (!cancelled) setState({ account: null, ready: true });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return state;
}
