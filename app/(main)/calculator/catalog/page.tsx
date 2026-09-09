'use client';

import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { StepIndicator } from '@/components/calculator/StepIndicator';
import { ProductCard } from '@/components/catalog/ProductCard';
import { StepHeader } from '@/components/flow/StepHeader';
import { StepNav } from '@/components/flow/StepNav';
import { SideList } from '@/components/flow/SideList';
import { EmptyStep } from '@/components/flow/EmptyStep';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useCategories, useProducts } from '@/hooks/useProducts';
import { aggregateRoomTotals } from '@/lib/calculator/materials';
import { useT, useLocale } from '@/lib/i18n/client';
import { localizedName, pickLocalizedName } from '@/lib/i18n/labels';
import { formatGEL } from '@/lib/utils';
import type { Product } from '@/lib/db/schema';
import type { SelectedProduct } from '@/lib/calculator/types';
import { suggestedQuantity } from '@/lib/calculator/quantities';

export default function CatalogStepPage() {
  const t = useT();
  const locale = useLocale();
  const { rooms, homeState, selectedProducts, selectProduct, removeProduct } = useCalculatorStore();
  const { items: categories, loading: catLoading } = useCategories(false);

  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const currentSlug = activeSlug ?? categories[0]?.slug ?? null;
  const current = categories.find((c) => c.slug === currentSlug) ?? null;
  const { items: products, loading } = useProducts(currentSlug, 1, 24);

  const totals = useMemo(() => aggregateRoomTotals(rooms), [rooms]);
  const selectionCount = Object.keys(selectedProducts).length;
  const totalSelected = useMemo(() => Object.values(selectedProducts).reduce((s, p) => s + p.totalPrice, 0), [selectedProducts]);

  if (rooms.length === 0 || !homeState) {
    return (
      <>
        <StepIndicator current={3} />
        <EmptyStep message={t.calculator.needRoomsFirst} back={t.common.back} />
      </>
    );
  }

  const handleSelect = (p: Product) => {
    if (!currentSlug) return;
    const key = `${currentSlug}_global`;
    if (selectedProducts[key]?.productId === p.id) {
      removeProduct(key);
      return;
    }
    const qty = suggestedQuantity(currentSlug, totals) || 1;
    const sel: SelectedProduct = {
      productId: p.id,
      nameKa: p.nameKa,
      nameEn: p.nameEn,
      nameRu: p.nameRu,
      pricePerUnit: Number(p.pricePerUnit),
      unit: p.unit,
      qty,
      totalPrice: Number(p.pricePerUnit) * qty,
      imageUrl: p.imageUrl,
      categorySlug: currentSlug,
    };
    selectProduct(key, sel);
  };

  return (
    <>
      <StepIndicator current={3} />
      <div className="container py-10 md:py-14">
        <StepHeader step={3} total={5} title={t.calculator.step3} subtitle={t.calculator.chooseProduct} />

        <div className="mt-8 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)_280px]">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            {catLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-9 animate-pulse bg-line/50" />
                ))}
              </div>
            ) : (
              <SideList
                title={t.catalog.filterByCategory}
                activeId={currentSlug}
                onSelect={setActiveSlug}
                items={categories.map((c) => ({
                  id: c.slug,
                  label: pickLocalizedName(locale, c.nameKa, c.nameEn, c.nameRu),
                  count: selectedProducts[`${c.slug}_global`] ? '✓' : undefined,
                }))}
              />
            )}
          </aside>

          <section>
            <div className="mb-4 flex items-baseline justify-between border-b border-line pb-3">
              <h2 className="font-serif text-xl font-semibold text-ink">{current ? pickLocalizedName(locale, current.nameKa, current.nameEn, current.nameRu) : '…'}</h2>
              {currentSlug && (
                <p className="text-sm text-ink-muted">
                  {t.calculator.needRequiredQty}: <span className="tabular-nums text-ink">{suggestedQuantity(currentSlug, totals)}</span>
                </p>
              )}
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="h-6 w-6 animate-spin text-ink-muted" />
              </div>
            ) : products.length === 0 ? (
              <div className="border border-dashed border-line p-16 text-center text-sm text-ink-muted">{t.catalog.noProducts}</div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {products.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    selected={currentSlug ? selectedProducts[`${currentSlug}_global`]?.productId === p.id : false}
                    onAction={() => handleSelect(p)}
                    qtyHint={currentSlug ? String(suggestedQuantity(currentSlug, totals)) : undefined}
                  />
                ))}
              </div>
            )}
          </section>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="border border-line bg-bg-surface">
              <div className="border-b border-line px-4 py-3">
                <p className="eyebrow">
                  {t.calculator.selected} <span className="text-ink">{selectionCount}</span>
                </p>
              </div>
              {selectionCount === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-ink-muted">{t.calculator.nothingSelected}</p>
              ) : (
                <ul>
                  {Object.entries(selectedProducts).map(([key, p]) => (
                    <li key={key} className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 text-sm">
                      <div className="min-w-0">
                        <p className="line-clamp-2 font-medium text-ink">{localizedName(locale, p)}</p>
                        <p className="mt-0.5 text-xs tabular-nums text-ink-muted">
                          {p.qty} × {formatGEL(p.pricePerUnit)}
                        </p>
                      </div>
                      <span className="shrink-0 font-semibold tabular-nums">{formatGEL(p.totalPrice)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-baseline justify-between px-4 py-3">
                <span className="text-sm text-ink-muted">{t.calculator.total}</span>
                <span className="font-serif text-xl font-semibold tabular-nums text-ink">{formatGEL(totalSelected)}</span>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <StepNav back={{ href: '/calculator/materials', label: t.calculator.backButton }} next={{ href: '/calculator/furniture', label: t.calculator.nextButton }}>
        <p className="text-sm text-ink-muted sm:text-right">
          {t.calculator.selected} {selectionCount} · <span className="font-serif text-base font-semibold text-ink">{formatGEL(totalSelected)}</span>
        </p>
      </StepNav>
    </>
  );
}
