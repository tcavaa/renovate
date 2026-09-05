'use client';

/**
 * Side panel for the selected object: what it is, what it costs, who sells it, and every
 * alternative in the catalogue that could take its place.
 */

import Image from 'next/image';
import { Check, RotateCcw, RotateCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ItemCard } from '@/components/design/ItemCard';
import { candidatesFor, type CatalogProduct } from '@/lib/design/matcher';
import { formatGEL, cn } from '@/lib/utils';
import { useT } from '@/lib/i18n/client';
import type { PlacedItem, StyleId } from '@/lib/design/types';

interface SwapPanelProps {
  item: PlacedItem | null;
  catalog: CatalogProduct[];
  styleId: StyleId;
  onSwap: (product: CatalogProduct) => void;
  onRotate: (steps: number) => void;
  onRemove: () => void;
  /** Set when the last rotation was refused because the item no longer fits. */
  rotateBlocked?: boolean;
}

export function SwapPanel({
  item,
  catalog,
  styleId,
  onSwap,
  onRotate,
  onRemove,
  rotateBlocked,
}: SwapPanelProps) {
  const t = useT();

  if (!item) {
    return (
      <div className="grid h-full place-items-center rounded-lg border border-dashed border-line bg-bg-surface p-8 text-center">
        <p className="max-w-[200px] text-sm text-ink-muted">{t.design.noSelection}</p>
      </div>
    );
  }

  const alternatives = candidatesFor(item.kind, catalog, styleId);
  const currentId = item.product?.productId;

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      <ItemCard item={item} variant="panel" />

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-muted">{t.design.rotate}</span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label={t.design.rotateLeft}
            onClick={() => onRotate(-1)}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            aria-label={t.design.rotateRight}
            onClick={() => onRotate(1)}
          >
            <RotateCw className="h-4 w-4" />
          </Button>
          <span className="ml-auto text-[11px] text-ink-muted">
            {Math.round(((item.rotation * 180) / Math.PI + 360) % 360)}°
          </span>
        </div>

        {rotateBlocked && (
          <p role="alert" className="text-xs text-danger">
            {t.design.rotateBlocked}
          </p>
        )}

        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" className="flex-1" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
            {t.design.removeItem}
          </Button>
          {item.product?.store?.websiteUrl && (
            <Button type="button" variant="ghost" size="sm" asChild className="flex-1">
              <a href={item.product.store.websiteUrl} target="_blank" rel="noopener noreferrer">
                {t.design.viewInStore}
              </a>
            </Button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <h3 className="mb-2 text-sm font-semibold">{t.design.swapTitle}</h3>

        {alternatives.length === 0 ? (
          <p className="text-sm text-ink-muted">{t.design.noAlternatives}</p>
        ) : (
          <ul className="max-h-full space-y-2 overflow-y-auto pr-1">
            {alternatives.map((product) => {
              const active = product.id === currentId;
              return (
                <li key={product.id}>
                  <button
                    type="button"
                    onClick={() => onSwap(product)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-md border p-2 text-left transition-colors',
                      active
                        ? 'border-brand bg-brand/5'
                        : 'border-line bg-bg-surface hover:border-brand/40 hover:bg-bg-base'
                    )}
                  >
                    <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded bg-bg-base">
                      {product.imageUrl ? (
                        <Image
                          src={product.imageUrl}
                          alt={product.nameKa}
                          fill
                          sizes="44px"
                          className="object-cover"
                        />
                      ) : (
                        <span
                          className="block h-full w-full"
                          style={{ backgroundColor: product.colorHex ?? '#DDD8CF' }}
                        />
                      )}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-ink">
                        {product.nameKa}
                      </span>
                      <span className="block truncate text-[11px] text-ink-muted">
                        {product.store?.nameKa ?? product.brand ?? ''}
                      </span>
                    </span>

                    <span className="shrink-0 text-right">
                      <span className="block text-xs font-semibold text-brand-dark">
                        {formatGEL(product.pricePerUnit)}
                      </span>
                      {active && <Check className="ml-auto mt-0.5 h-3.5 w-3.5 text-brand" />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
