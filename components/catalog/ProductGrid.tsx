import type { Product } from '@/lib/db/schema';
import { ProductCard } from './ProductCard';

export function ProductGrid({
  products,
  selectedIds,
  onSelect,
}: {
  products: Product[];
  selectedIds?: Set<number>;
  onSelect?: (p: Product) => void;
}) {
  if (products.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line p-12 text-center text-ink-muted">
        პროდუქტი ვერ მოიძებნა
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
