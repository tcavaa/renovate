'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_PLATFORM_SETTINGS } from '@/lib/finance/money';

/**
 * The per-m² fees the summaries show. Same shape as `useRateBook`: the defaults until the
 * server answers, one fetch per page load, a failed request is not an error.
 */
export interface PlatformFees {
  calculatorFeePerM2: number;
  designFeePerM2: number;
}

const DEFAULTS: PlatformFees = { calculatorFeePerM2: DEFAULT_PLATFORM_SETTINGS.calculatorFeePerM2, designFeePerM2: DEFAULT_PLATFORM_SETTINGS.designFeePerM2 };

let cache: PlatformFees | null = null;
let inflight: Promise<PlatformFees> | null = null;

function fetchFees(): Promise<PlatformFees> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch('/api/settings')
      .then(async (res) => {
        const json = (await res.json()) as { data: PlatformFees | null };
        cache = json.data ?? DEFAULTS;
        return cache;
      })
      .catch(() => {
        cache = DEFAULTS;
        return cache;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function usePlatformFees(): PlatformFees & { loading: boolean } {
  const [state, setState] = useState<PlatformFees & { loading: boolean }>(() => ({ ...(cache ?? DEFAULTS), loading: !cache }));
  useEffect(() => {
    if (cache) return;
    let cancelled = false;
    fetchFees().then((fees) => {
      if (!cancelled) setState({ ...fees, loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
