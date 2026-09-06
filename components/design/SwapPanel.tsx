'use client';

/**
 * Side panel for the selected object: what it is, what it costs, who sells it, and every
 * alternative in the catalogue that could take its place.
 */

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Check, ChevronUp, RotateCcw, RotateCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ItemCard } from '@/components/design/ItemCard';
import { candidatesFor, type CatalogProduct } from '@/lib/design/matcher';
import { formatGEL, cn } from '@/lib/utils';
import { useLocale, useT } from '@/lib/i18n/client';
import { localizedName } from '@/lib/i18n/labels';
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
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  // A wheel over the closed drawer opens it; a wheel upwards while the open list is already at
  // its top closes it. Mid-list scrolling is left to the list itself. React registers wheel
  // listeners as passive, so this is a native one — the tick that opens or closes the drawer
  // must not also scroll the page behind the studio.
  useEffect(() => {
    const el = drawerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!open && e.deltaY > 0) {
        e.preventDefault();
        if (listRef.current) listRef.current.scrollTop = 0;
        setOpen(true);
      } else if (open && e.deltaY < 0 && (listRef.current?.scrollTop ?? 0) <= 0) {
        e.preventDefault();
        setOpen(false);
      } else if (!open) {
        e.preventDefault();
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [open]);

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
    <div className="relative h-full overflow-hidden">
      <div className="space-y-4 pb-32">
        <ItemCard item={item} variant="panel" />

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-muted">{t.design.rotate}</span>
            <Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label={t.design.rotateLeft} onClick={() => onRotate(-1)}>
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button type="button" variant="outline" size="icon" className="h-8 w-8" aria-label={t.design.rotateRight} onClick={() => onRotate(1)}>
              <RotateCw className="h-4 w-4" />
            </Button>
            <span className="ml-auto text-[11px] tabular-nums text-ink-muted">{Math.round(((item.rotation * 180) / Math.PI + 360) % 360)}°</span>
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
      </div>

      {/*
        The alternatives live in a drawer along the panel's bottom edge. Closed, it shows its
        title and the first product; scrolling down over it (or tapping the title) slides it up
        over the item card so the whole list gets the panel's height and scrolls inside.
        Scrolling back up from the top of the list closes it again.
      */}
      <section
        ref={drawerRef}
        aria-expanded={open}
        className={cn(
          'absolute inset-x-0 bottom-0 flex flex-col border-t border-line bg-white/95 shadow-[0_-12px_30px_-16px_rgba(22,21,19,0.25)] backdrop-blur transition-[top] duration-300 ease-out',
          open ? 'top-0' : 'top-[calc(100%-7.25rem)]'
        )}
      >
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 py-2.5 text-left">
          <span className="text-sm font-semibold text-ink">{t.design.swapTitle}</span>
          <span className="flex items-center gap-1 text-[11px] text-ink-muted">
            {alternatives.length > 0 && <span className="tabular-nums">{alternatives.length}</span>}
            {open ? t.design.swapClose : t.design.swapOpen}
            <ChevronUp className={cn('h-3.5 w-3.5 transition-transform duration-300', open && 'rotate-180')} />
          </span>
        </button>

        {alternatives.length === 0 ? (
          <p className="text-sm text-ink-muted">{t.design.noAlternatives}</p>
        ) : (
          <ul ref={listRef} className={cn('min-h-0 flex-1 space-y-2 overscroll-contain pb-1 pr-1', open ? 'overflow-y-auto' : 'overflow-hidden')}>
            {alternatives.map((product) => {
              const active = product.id === currentId;
              return (
                <li key={product.id}>
                  <button
                    type="button"
                    onClick={() => onSwap(product)}
                    className={cn(
                      'flex w-full items-center gap-3 border p-2 text-left transition-colors',
                      active ? 'border-ink bg-sand-light' : 'border-line bg-bg-surface hover:border-ink/40'
                    )}
                  >
                    <span className="relative h-11 w-11 shrink-0 overflow-hidden bg-bg-base">
                      {product.imageUrl ? (
                        <Image src={product.imageUrl} alt={localizedName(locale, product)} fill sizes="44px" className="object-cover" />
                      ) : (
                        <span className="block h-full w-full" style={{ backgroundColor: product.colorHex ?? '#DDD8CF' }} />
                      )}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-ink">{localizedName(locale, product)}</span>
                      <span className="block truncate text-[11px] text-ink-muted">{(product.store ? localizedName(locale, product.store) : null) ?? product.brand ?? ''}</span>
                    </span>

                    <span className="shrink-0 text-right">
                      <span className="block text-xs font-semibold tabular-nums text-ink">{formatGEL(product.pricePerUnit)}</span>
                      {active && <Check className="ml-auto mt-0.5 h-3.5 w-3.5 text-ink" />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
