'use client';

import { useEffect } from 'react';
import { useDesignCatalog } from '@/hooks/useDesignCatalog';
import { useDesignStore } from '@/store/designStore';

/**
 * Keeps every room's floor and walls the partner products the flat is shown in, on every step
 * of a generated design, so the budget buys what the studio shows (`withStyleFinishes`).
 *
 * Generation and a change of style lay the style's products themselves; this is for the rest:
 * a design generated before the style's finishes were products, a room drawn, split or
 * retyped since (a bedroom made a bathroom gets the style's tiles), the empty start, and a
 * version brought back from before. Nothing a person chose is touched, and a catalogue that
 * has no finish for a surface leaves the style's look as it is. Renders nothing.
 */
export function DesignFinishProducts() {
  const { products } = useDesignCatalog();
  const plan = useDesignStore((s) => s.plan);
  const styleId = useDesignStore((s) => s.styleId);
  const finishes = useDesignStore((s) => s.finishes);
  const generated = useDesignStore((s) => s.generated);
  const ensureFinishProducts = useDesignStore((s) => s.ensureFinishProducts);

  useEffect(() => {
    // Before the flat is laid out its finishes are about to be laid again anyway.
    if (generated && plan && products.length > 0) ensureFinishProducts(products);
  }, [generated, plan, styleId, finishes, products, ensureFinishProducts]);

  return null;
}
