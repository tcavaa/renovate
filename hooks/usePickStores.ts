'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SceneStore } from '@/lib/design/types';

interface StoreRow {
  id: number;
  nameKa: string;
  nameEn: string | null;
  nameRu: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  rating: string | number | null;
  deliveryDays: number | null;
  deliveryFeeGel: string | number | null;
}

/**
 * Who sells the calculator's picks.
 *
 * A calculator pick is a price and a name; it never recorded the shop, because nothing on
 * the calculator's pages needed it. The summary does: what a shop sells stands under that
 * shop. So the summary asks once for the products behind its picks (their `storeId`) and
 * for the shops, and hands back a lookup. Until it answers — and for a product nobody sells
 * — a pick simply stays under its kind.
 */
export function usePickStores(productIds: number[]): (productId: number) => SceneStore | null {
  const signature = useMemo(() => [...new Set(productIds)].sort((a, b) => a - b).join(','), [productIds]);
  const [lookup, setLookup] = useState<{ signature: string; byProduct: Map<number, SceneStore> }>({ signature: '', byProduct: new Map() });

  useEffect(() => {
    if (!signature) return;
    let cancelled = false;
    Promise.all([fetch(`/api/products?ids=${signature}`).then((r) => r.json()), fetch('/api/stores').then((r) => r.json())])
      .then(([products, stores]: [{ data: { items: Array<{ id: number; storeId: number | null }> } | null }, { data: StoreRow[] | null }]) => {
        if (cancelled) return;
        const shops = new Map(
          (stores.data ?? []).map((s): [number, SceneStore] => [
            s.id,
            { id: s.id, nameKa: s.nameKa, nameEn: s.nameEn, nameRu: s.nameRu, logoUrl: s.logoUrl, websiteUrl: s.websiteUrl, phone: s.phone, address: s.address, city: s.city, rating: s.rating == null ? null : Number(s.rating), deliveryDays: s.deliveryDays, deliveryFeeGel: s.deliveryFeeGel == null ? null : Number(s.deliveryFeeGel) },
          ])
        );
        const byProduct = new Map<number, SceneStore>();
        for (const product of products.data?.items ?? []) {
          const shop = product.storeId != null ? shops.get(product.storeId) : undefined;
          if (shop) byProduct.set(product.id, shop);
        }
        setLookup({ signature, byProduct });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [signature]);

  return useMemo(() => {
    const current = lookup.signature === signature ? lookup.byProduct : new Map<number, SceneStore>();
    return (productId: number) => current.get(productId) ?? null;
  }, [lookup, signature]);
}
