'use client';

import { useEffect, useState } from 'react';
import type { Worker } from '@/lib/db/schema';

export function useWorkers(specialty?: string) {
  const [items, setItems] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        if (specialty) qs.set('specialty', specialty);
        const res = await fetch(`/api/workers?${qs}`);
        const json = await res.json();
        if (cancelled) return;
        if (json.error) throw new Error(json.error);
        setItems(json.data);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [specialty]);

  return { items, loading, error };
}
