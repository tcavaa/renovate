'use client';

import { useEffect, useState } from 'react';
import type { CatalogProduct } from '@/lib/design/matcher';

export interface PartnerStore {
  id: number;
  nameKa: string;
  nameEn: string | null;
  nameRu: string | null;
  descriptionKa: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  rating: number | null;
  reviewCount: number | null;
  deliveryDays: number | null;
  deliveryFeeGel: number | null;
}

interface CatalogState {
  products: CatalogProduct[];
  stores: PartnerStore[];
  loading: boolean;
  error: string | null;
}

/**
 * The design catalogue, fetched once per session.
 *
 * Cached at module scope rather than in React state so moving between the style page and the
 * studio does not refetch — and so the studio can match products the instant it mounts.
 */
let cache: { products: CatalogProduct[]; stores: PartnerStore[] } | null = null;
let inflight: Promise<{ products: CatalogProduct[]; stores: PartnerStore[] }> | null = null;
/** Every mounted hook, told when the catalogue is fetched again. */
const listeners = new Set<(data: { products: CatalogProduct[]; stores: PartnerStore[] }) => void>();

/**
 * Fetches the catalogue again and hands it to every component holding it — after a person
 * adds a piece of their own, which the server lists for them alone.
 */
export async function refreshDesignCatalog(): Promise<void> {
  cache = null;
  const data = await fetchCatalog();
  for (const listener of listeners) listener(data);
}

async function fetchCatalog() {
  if (cache) return cache;
  if (!inflight) {
    // Never the browser's copy: the route answers with a minute of `max-age`, and a piece of
    // the person's own added a moment ago would be missing from it for that minute. The
    // server's own cache (`getDesignCatalog`) is what saves the work; this fetch is cheap.
    inflight = fetch('/api/design/catalog', { cache: 'no-store' })
      .then(async (res) => {
        const json = (await res.json()) as {
          data: { products: CatalogProduct[]; stores: PartnerStore[] } | null;
          error: string | null;
        };
        if (json.error || !json.data) throw new Error(json.error ?? 'catalog-failed');
        cache = json.data;
        return json.data;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function useDesignCatalog(): CatalogState {
  const [state, setState] = useState<CatalogState>(() => ({
    products: cache?.products ?? [],
    stores: cache?.stores ?? [],
    loading: !cache,
    error: null,
  }));

  useEffect(() => {
    let cancelled = false;
    const onData = (data: { products: CatalogProduct[]; stores: PartnerStore[] }) => {
      if (!cancelled) setState({ products: data.products, stores: data.stores, loading: false, error: null });
    };
    listeners.add(onData);
    if (!cache) {
      fetchCatalog()
        .then(onData)
        .catch((e: Error) => {
          if (cancelled) return;
          setState({ products: [], stores: [], loading: false, error: e.message });
        });
    }
    return () => {
      cancelled = true;
      listeners.delete(onData);
    };
  }, []);

  return state;
}
