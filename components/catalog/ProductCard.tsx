'use client';

import Image from 'next/image';
import { Check, Plus, Tag } from 'lucide-react';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useT } from '@/lib/i18n/client';
import { unitLabel } from '@/lib/i18n/labels';
import { formatGEL, cn } from '@/lib/utils';
import type { Product } from '@/lib/db/schema';

export function ProductCard({
  product,
  selected,
  onAction,
  qtyHint,
}: {
  product: Product;
  selected?: boolean;
  onAction?: () => void;
  qtyHint?: string;
}) {
  const ka = useT();
  const imageUrl =
    product.imageUrl ||
    `https://placehold.co/600x400/E85D26/FFFFFF/png?text=${encodeURIComponent(
      product.nameKa.split(' ')[0]
    )}`;

  return (
    <Card
      className={cn(
        'flex flex-col overflow-hidden transition-all',
        selected ? 'border-brand ring-2 ring-brand/20' : 'hover:shadow-cardHover'
      )}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-bg-base">
        <Image
          src={imageUrl}
          alt={product.nameKa}
          fill
          sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover"
        />
        {product.isFeatured && (
          <Badge variant="default" className="absolute left-2 top-2 shadow-sm">
            <Tag className="mr-1 h-3 w-3" /> {ka.calculator.bestSeller}
          </Badge>
        )}
      </div>
      <CardContent className="flex flex-1 flex-col gap-2 p-4">
        {product.brand && (
          <p className="text-xs uppercase tracking-wide text-ink-muted">{product.brand}</p>
        )}
        <h4 className="line-clamp-2 font-serif text-base font-semibold leading-snug">
          {product.nameKa}
        </h4>
        <div className="mt-auto flex items-baseline gap-1.5">
          <span className="font-serif text-xl font-bold text-brand">
            {formatGEL(Number(product.pricePerUnit))}
          </span>
          <span className="text-xs text-ink-muted">/ {unitLabel(ka, product.unit)}</span>
        </div>
        {qtyHint && (
          <p className="text-xs text-ink-muted">{ka.calculator.needRequiredQty}: {qtyHint}</p>
        )}
      </CardContent>
      {onAction && (
        <CardFooter className="p-4 pt-0">
          <Button
            type="button"
            variant={selected ? 'secondary' : 'default'}
            className="w-full"
            onClick={onAction}
          >
            {selected ? (
              <>
                <Check className="h-4 w-4" /> {ka.calculator.selected}
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" /> {ka.calculator.selectProduct}
              </>
            )}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
