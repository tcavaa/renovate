'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ProductGrid } from '@/components/catalog/ProductGrid';
import { useCategories, useProducts } from '@/hooks/useProducts';
import { useT, useLocale } from '@/lib/i18n/client';
import { pickLocalizedName } from '@/lib/i18n/labels';

export default function PublicCatalogPage() {
  const ka = useT();
  const locale = useLocale();
  const { items: categories, loading: catLoading } = useCategories();
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const { items, loading } = useProducts(activeSlug, 1, 24);

  return (
    <div className="container py-10">
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-bold md:text-4xl">{ka.catalog.title}</h1>
        <p className="mt-2 text-ink-muted">{ka.catalog.subtitle}</p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => setActiveSlug(null)}
          className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
            activeSlug === null
              ? 'border-brand bg-brand text-white'
              : 'border-line bg-bg-surface hover:border-brand/40'
          }`}
        >
          {ka.common.all}
        </button>
        {catLoading ? (
          <div className="text-sm text-ink-muted">{ka.common.loading}</div>
        ) : (
          categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveSlug(c.slug)}
              className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                activeSlug === c.slug
                  ? 'border-brand bg-brand text-white'
                  : 'border-line bg-bg-surface hover:border-brand/40'
              }`}
            >
              {pickLocalizedName(locale, c.nameKa, c.nameEn)}
            </button>
          ))
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-brand" />
        </div>
      ) : (
        <ProductGrid products={items} />
      )}
    </div>
  );
}
