'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_RATE_BOOK, rateBookFromRows, type RateBook, type RateRow } from '@/lib/calculator/rates';

interface RateBookState {
  book: RateBook;
  rows: RateRow[];
  loading: boolean;
}

// One fetch per page load: every calculator step reads the same book, and a price admin
// changes mid-session is not worth a request per step.
let cache: { book: RateBook; rows: RateRow[] } | null = null;
let inflight: Promise<{ book: RateBook; rows: RateRow[] }> | null = null;

async function fetchRateBook(): Promise<{ book: RateBook; rows: RateRow[] }> {
  if (cache) return cache;
  if (!inflight) {
    inflight = fetch('/api/calculator/rates')
      .then(async (res) => {
        const json = (await res.json()) as { data: RateRow[] | null };
        const rows = json.data ?? [];
        cache = { book: rateBookFromRows(rows), rows };
        return cache;
      })
      .catch(() => {
        // The defaults are a perfectly good estimate; a failed request must not blank the page.
        cache = { book: DEFAULT_RATE_BOOK, rows: [] };
        return cache;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** The current rate book — the defaults until the server answers, then whatever admin set. */
export function useRateBook(): RateBookState {
  const [state, setState] = useState<RateBookState>(() => ({
    book: cache?.book ?? DEFAULT_RATE_BOOK,
    rows: cache?.rows ?? [],
    loading: !cache,
  }));

  useEffect(() => {
    if (cache) return;
    let cancelled = false;
    fetchRateBook().then((result) => {
      if (!cancelled) setState({ book: result.book, rows: result.rows, loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

/** Forget the cached book — after admin saves a rate. */
export function invalidateRateBook(): void {
  cache = null;
}
