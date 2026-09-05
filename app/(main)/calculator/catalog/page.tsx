'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Loader2, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StepIndicator } from '@/components/calculator/StepIndicator';
import { ProductCard } from '@/components/catalog/ProductCard';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useCategories, useProducts } from '@/hooks/useProducts';
import { calculateMaterials, aggregateRoomTotals } from '@/lib/calculator/materials';
import { useT, useLocale } from '@/lib/i18n/client';
import { pickLocalizedName } from '@/lib/i18n/labels';
import { formatGEL } from '@/lib/utils';
import type { Product } from '@/lib/db/schema';
import type { SelectedProduct } from '@/lib/calculator/types';
import { suggestedQuantity } from '@/lib/calculator/quantities';

export default function CatalogStepPage() {
  const ka = useT();
  const locale = useLocale();
  const { rooms, homeState, selectedProducts, selectProduct, removeProduct } =
    useCalculatorStore();
  const { items: categories, loading: catLoading } = useCategories(false);

  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const currentSlug = activeSlug ?? categories[0]?.slug ?? null;
  const { items: products, loading } = useProducts(currentSlug, 1, 24);

  const totals = useMemo(() => aggregateRoomTotals(rooms), [rooms]);

  const selectionCount = Object.keys(selectedProducts).length;
  const totalSelected = useMemo(
    () => Object.values(selectedProducts).reduce((s, p) => s + p.totalPrice, 0),
    [selectedProducts]
  );

  if (rooms.length === 0 || !homeState) {
    return (
      <>
        <StepIndicator current={3} />
        <div className="container py-16 text-center">
          <p className="text-ink-muted">{ka.calculator.needRoomsFirst}</p>
          <Button asChild className="mt-4">
            <Link href="/calculator">{ka.common.back}</Link>
          </Button>
        </div>
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
      <div className="container py-10">
        <div className="grid gap-8 lg:grid-cols-[260px_1fr_280px]">
          {/* Categories sidebar */}
          <aside>
            <h2 className="mb-3 font-serif text-lg font-semibold">{ka.catalog.filterByCategory}</h2>
            <div className="space-y-1">
              {catLoading && (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-9 rounded-md bg-line/50" />
                  ))}
                </div>
              )}
              {categories.map((c) => {
                const active = currentSlug === c.slug;
                const hasSelection = !!selectedProducts[`${c.slug}_global`];
                return (
                  <button
                    key={c.id}
                    onClick={() => setActiveSlug(c.slug)}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
                      active
                        ? 'bg-brand text-white'
                        : 'text-ink hover:bg-bg-base'
                    }`}
                  >
                    <span>{pickLocalizedName(locale, c.nameKa, c.nameEn)}</span>
                    {hasSelection && (
                      <Badge
                        variant={active ? 'outline' : 'default'}
                        className={active ? 'border-white/40 text-white' : undefined}
                      >
                        ✓
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Products grid */}
          <section>
            <div className="mb-6 flex items-end justify-between">
              <div>
                <h1 className="font-serif text-2xl font-bold">{ka.calculator.step3}</h1>
                <p className="text-sm text-ink-muted">
                  {ka.calculator.chooseProduct}
                </p>
              </div>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="h-8 w-8 animate-spin text-brand" />
              </div>
            ) : products.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-ink-muted">
                  {ka.catalog.noProducts}
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {products.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    selected={
                      currentSlug
                        ? selectedProducts[`${currentSlug}_global`]?.productId === p.id
                        : false
                    }
                    onAction={() => handleSelect(p)}
                    qtyHint={
                      currentSlug
                        ? `${suggestedQuantity(currentSlug, totals)}`
                        : undefined
                    }
                  />
                ))}
              </div>
            )}
          </section>

          {/* Selected sidebar */}
          <aside>
            <Card className="sticky top-24">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShoppingBag className="h-4 w-4" />
                  {ka.calculator.selected} ({selectionCount})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selectionCount === 0 ? (
                  <p className="text-sm text-ink-muted">{ka.calculator.nothingSelected}</p>
                ) : (
                  <ul className="space-y-3">
                    {Object.entries(selectedProducts).map(([key, p]) => (
                      <li key={key} className="flex items-start justify-between gap-2 text-sm">
                        <div className="min-w-0">
                          <p className="line-clamp-2 font-medium">{p.nameKa}</p>
                          <p className="text-xs text-ink-muted">
                            {p.qty} × {formatGEL(p.pricePerUnit)}
                          </p>
                        </div>
                        <span className="shrink-0 font-semibold">
                          {formatGEL(p.totalPrice)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                  <span className="text-sm text-ink-muted">{ka.calculator.total}</span>
                  <span className="font-serif text-lg font-bold text-brand">
                    {formatGEL(totalSelected)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>

        <div className="mt-10 flex flex-col-reverse justify-between gap-3 sm:flex-row sm:items-center">
          <Button variant="outline" size="lg" asChild>
            <Link href="/calculator/materials">
              <ArrowLeft className="h-4 w-4" />
              {ka.calculator.backButton}
            </Link>
          </Button>
          <Button size="xl" asChild>
            <Link href="/calculator/furniture">
              {ka.calculator.nextButton}
              <ArrowRight className="h-5 w-5" />
            </Link>
          </Button>
        </div>
      </div>
    </>
  );
}
