import type { Product } from '@/lib/db/schema';
import { ProductCard } from './ProductCard';

export function ProductGrid({
  products,
  selectedIds,
  onSelect,
  emptyText,
  hrefFor,
  storeNames,
  columns = 4,
}: {
  products: Product[];
  selectedIds?: Set<number>;
  onSelect?: (p: Product) => void;
  /** Shown when there is nothing to list. Comes from the caller so it is translated. */
  emptyText: string;
  /** Makes each plate a link. */
  hrefFor?: (p: Product) => string;
  /** Partner name per product id, printed under the product. */
  storeNames?: Record<number, string>;
  columns?: 3 | 4;
}) {
  if (products.length === 0) {
    return <div className="border border-dashed border-line p-16 text-center text-sm text-ink-muted">{emptyText}</div>;
  }

  return (
    <div className={columns === 4 ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3'}>
      {products.map((p, i) => (
        <ProductCard
          key={p.id}
          product={p}
          selected={selectedIds?.has(p.id)}
          onAction={onSelect ? () => onSelect(p) : undefined}
          href={hrefFor?.(p)}
          storeName={storeNames?.[p.id]}
          priority={i < 4}
        />
      ))}
    </div>
  );
}
