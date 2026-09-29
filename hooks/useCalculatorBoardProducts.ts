'use client';

import { useEffect, useMemo } from 'react';
import { useDesignCatalog } from '@/hooks/useDesignCatalog';
import { useCalculatorPlanStore } from '@/store/designStore';
import type { CatalogProduct } from '@/lib/design/matcher';

/**
 * The calculator's board dressed as a design is: once the design catalogue is in, every door,
 * window, radiator and fitting on it without a product is given the catalogue's best
 * (`ensureBoardProducts`) — the products a design of the same flat starts with — and a
 * radiator's sections are counted again when its room changes. Priced from those, the
 * calculation and the design of one flat are the same sheet. Returns the catalogue, for the
 * pages that place things on the board.
 */
export function useCalculatorBoardProducts(): CatalogProduct[] {
  const { products } = useDesignCatalog();
  const plan = useCalculatorPlanStore((s) => s.plan);
  const electrical = useCalculatorPlanStore((s) => s.electrical);
  const ensure = useCalculatorPlanStore((s) => s.ensureBoardProducts);
  // What would change what the board needs: an opening, a radiator or a fitting without a
  // product, and the rooms a radiator's sections are counted from.
  const signature = useMemo(() => {
    if (!plan) return '';
    const bare = plan.rooms.reduce((n, r) => n + r.openings.filter((o) => o.kind !== 'archway' && !o.product).length, 0);
    const radiators = (plan.technical?.points ?? []).filter((p) => p.kind === 'radiator').map((p) => `${p.id}:${p.product?.productId ?? ''}:${p.product?.qty ?? ''}:${p.roomId ?? ''}`).join('|');
    const fittings = electrical.filter((p) => !p.product).length;
    return `${bare}#${radiators}#${fittings}#${plan.rooms.map((r) => `${r.id}:${r.areaM2}`).join(',')}`;
  }, [plan, electrical]);
  useEffect(() => {
    if (products.length > 0 && signature) ensure(products);
    // The signature says when there is something to give a product to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, signature]);
  return products;
}
