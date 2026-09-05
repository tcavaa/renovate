import type { Product } from '@/lib/db/schema';
import { ProductCard } from './ProductCard';

export function ProductGrid({
  products,
  selectedIds,
  onSelect,
  emptyText,
}: {
  products: Product[];
  selectedIds?: Set<number>;
  onSelect?: (p: Product) => void;
  /** Shown when there is nothing to list. Comes from the caller so it is translated. */
  emptyText: string;
}) {
  if (products.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line p-12 text-center text-ink-muted">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((p) => (
        <ProductCard
          key={p.id}
          product={p}
          selected={selectedIds?.has(p.id)}
          onAction={onSelect ? () => onSelect(p) : undefined}
        />
      ))}
    </div>
  );
}
