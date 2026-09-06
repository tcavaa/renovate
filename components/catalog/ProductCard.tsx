'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, Check, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLocale, useT } from '@/lib/i18n/client';
import { localizedName, unitLabel } from '@/lib/i18n/labels';
import { formatGEL, cn } from '@/lib/utils';
import type { Product } from '@/lib/db/schema';

/**
 * One product as a catalogue plate: the photo on sand, then a hairline, then the name, the
 * seller and the price. With `href` the whole plate is a link and an arrow appears on hover;
 * with `onAction` it ends in a select button (the calculator's picking steps).
 */
export function ProductCard({
  product,
  selected,
  onAction,
  qtyHint,
  href,
  storeName,
  priority,
}: {
  product: Product;
  selected?: boolean;
  onAction?: () => void;
  qtyHint?: string;
  href?: string;
  /** Partner name to print under the product; falls back to the brand. */
  storeName?: string | null;
  priority?: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const name = localizedName(locale, product);
  const imageUrl = product.imageUrl || `https://placehold.co/800x600/E9E2D8/6F6A63/png?text=${encodeURIComponent(name.split(' ')[0])}`;
  const seller = storeName ?? product.brand ?? null;

  const body = (
    <>
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-sand-light">
        <Image
          src={imageUrl}
          alt={name}
          fill
          priority={priority}
          sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
        />
        {product.isFeatured && <span className="absolute left-3 top-3 bg-ink px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">{t.calculator.bestSeller}</span>}
        {product.model3dUrl && <span className="absolute right-3 top-3 border border-ink/15 bg-white/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink backdrop-blur">3D</span>}
        {href && (
          <span className="absolute bottom-3 right-3 grid h-9 w-9 translate-y-2 place-items-center bg-ink text-white opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
            <ArrowUpRight className="h-4 w-4" />
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 border-t border-line p-4">
        {seller && <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{seller}</p>}
        <h4 className="line-clamp-2 font-serif text-base font-semibold leading-snug text-ink">{name}</h4>
        <div className="mt-auto flex items-baseline justify-between gap-2 pt-3">
          <span className="font-serif text-lg font-semibold tabular-nums text-ink">{formatGEL(Number(product.pricePerUnit))}</span>
          <span className="text-xs text-ink-muted">/ {unitLabel(t, product.unit)}</span>
        </div>
        {qtyHint && (
          <p className="text-xs text-ink-muted">
            {t.calculator.needRequiredQty}: <span className="tabular-nums text-ink">{qtyHint}</span>
          </p>
        )}
      </div>
    </>
  );

  const frame = cn(
    'group flex h-full flex-col overflow-hidden border bg-bg-surface transition-colors',
    selected ? 'border-ink ring-1 ring-ink' : 'border-line hover:border-ink/40'
  );

  if (href) {
    return (
      <Link href={href} className={frame}>
        {body}
      </Link>
    );
  }

  return (
    <article className={frame}>
      {body}
      {onAction && (
        <div className="border-t border-line p-3">
          <Button type="button" variant={selected ? 'ink' : 'outline'} className="w-full" onClick={onAction}>
            {selected ? (
              <>
                <Check className="h-4 w-4" /> {t.calculator.selected}
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" /> {t.calculator.selectProduct}
              </>
            )}
          </Button>
        </div>
      )}
    </article>
  );
}
