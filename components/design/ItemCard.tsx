'use client';

/**
 * The hover card — the point of the whole product.
 *
 * Every object in the 3D room is a real SKU, and this is what proves it: name, price, the
 * partner that stocks it, where their shop is, and how long delivery takes.
 */

import Image from 'next/image';
import { MapPin, Phone, Sparkles, Star, Truck, UserCheck } from 'lucide-react';
import { formatGEL } from '@/lib/utils';
import { useLocale, useT } from '@/lib/i18n/client';
import { localizedName } from '@/lib/i18n/labels';
import { archetypeLabel } from '@/lib/design/catalog';
import type { PlacedItem } from '@/lib/design/types';
import { cn } from '@/lib/utils';

interface ItemCardProps {
  item: PlacedItem;
  variant?: 'tooltip' | 'panel';
  className?: string;
}

export function ItemCard({ item, variant = 'tooltip', className }: ItemCardProps) {
  const t = useT();
  const locale = useLocale();
  const product = item.product;
  const compact = variant === 'tooltip';

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border border-line bg-bg-surface shadow-cardHover',
        compact ? 'w-72' : 'w-full',
        className
      )}
    >
      <div className={cn('flex gap-2', compact ? 'p-3' : 'p-2')}>
        <div className={cn('relative shrink-0 overflow-hidden rounded-md bg-bg-base', compact ? 'h-16 w-16' : 'h-11 w-11')}>
          {product?.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={localizedName(locale, product)}
              fill
              sizes={compact ? '64px' : '44px'}
              className="object-cover"
            />
          ) : (
            <div
              className="h-full w-full"
              style={{ backgroundColor: product?.colorHex ?? '#DDD8CF' }}
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className={cn('uppercase tracking-wide text-ink-muted', compact ? 'text-[11px]' : 'text-[10px]')}>
            {archetypeLabel(item.kind, locale)}
          </p>
          <p
            className={cn(
              'mb-0.5 flex items-center gap-1',
              compact ? 'text-[11px]' : 'text-[10px]',
              item.origin === 'calculator' || item.origin === 'studio' ? 'text-success' : 'text-ink-muted'
            )}
          >
            {item.origin === 'calculator' || item.origin === 'studio' ? (
              <UserCheck className="h-3 w-3" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            {item.origin === 'calculator'
              ? t.design.originCalculator
              : item.origin === 'studio'
                ? t.design.originStudio
                : t.design.originStyle}
          </p>
          <p className={cn('truncate font-semibold leading-snug text-ink', compact ? 'text-sm' : 'text-[13px]')}>
            {product ? localizedName(locale, product) : '—'}
          </p>
          {product && (
            <p className={cn('mt-0.5 font-serif font-bold text-brand-dark', compact ? 'text-base' : 'text-sm')}>
              {formatGEL(product.totalPrice)}
              {product.qty !== 1 && (
                <span className="ml-1 text-xs font-normal text-ink-muted">
                  ({product.qty} × {formatGEL(product.pricePerUnit)})
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      {/*
        In the side panel the shop is one line: the card sits above every control the piece
        has, and an address and a telephone number there pushed them all below the fold. The
        hover card — the moment that proves the sofa is a real sofa you can buy — keeps them.
      */}
      {product?.store && !compact && (
        <div className="flex items-center gap-1.5 border-t border-line bg-bg-base/70 px-2 py-1 text-[10px] text-ink-muted">
          <span className="min-w-0 flex-1 truncate font-semibold text-ink">{localizedName(locale, product.store)}</span>
          {product.store.rating != null && (
            <span className="flex shrink-0 items-center gap-0.5">
              <Star className="h-3 w-3 fill-accent text-accent" />
              {product.store.rating.toFixed(1)}
            </span>
          )}
          {product.store.deliveryDays != null && (
            <span className="flex shrink-0 items-center gap-1">
              <Truck className="h-3 w-3" />
              {product.store.deliveryDays} {t.design.deliveryDaysSuffix}
            </span>
          )}
        </div>
      )}

      {product?.store && compact && (
        <div className="border-t border-line bg-bg-base/70 px-3 py-2.5">
          <div className="flex items-center gap-2">
            {product.store.logoUrl && (
              <Image
                src={product.store.logoUrl}
                alt={localizedName(locale, product.store)}
                width={26}
                height={26}
                className="rounded-md"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wide text-ink-muted">
                {t.design.soldBy}
              </p>
              <p className="truncate text-xs font-semibold text-ink">{localizedName(locale, product.store)}</p>
            </div>
            {product.store.rating != null && (
              <span className="flex items-center gap-0.5 bg-bg-surface px-1.5 py-0.5 text-[11px] font-medium text-ink">
                <Star className="h-3 w-3 fill-accent text-accent" />
                {product.store.rating.toFixed(1)}
              </span>
            )}
          </div>

          <div className="mt-2 space-y-1 text-[11px] text-ink-muted">
            {product.store.address && (
              <p className="flex items-start gap-1.5">
                <MapPin className="mt-px h-3 w-3 shrink-0" />
                <span className="truncate">{product.store.address}</span>
              </p>
            )}
            {product.store.deliveryDays != null && (
              <p className="flex items-center gap-1.5">
                <Truck className="h-3 w-3 shrink-0" />
                {product.store.deliveryDays} {t.design.deliveryDaysSuffix}
              </p>
            )}
            {!compact && product.store.phone && (
              <p className="flex items-center gap-1.5">
                <Phone className="h-3 w-3 shrink-0" />
                <a href={`tel:${product.store.phone}`} className="hover:text-brand">
                  {product.store.phone}
                </a>
              </p>
            )}
          </div>
        </div>
      )}

      {compact && (
        <div className="border-t border-line px-3 py-1.5 text-center text-[11px] text-ink-muted">
          {t.design.clickToSwap}
        </div>
      )}
    </div>
  );
}
