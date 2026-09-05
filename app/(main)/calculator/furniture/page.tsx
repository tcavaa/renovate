'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Loader2, Sofa, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StepIndicator } from '@/components/calculator/StepIndicator';
import { ProductCard } from '@/components/catalog/ProductCard';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useCategories, useProducts } from '@/hooks/useProducts';
import { useT, useLocale } from '@/lib/i18n/client';
import { roomTypeLabel, pickLocalizedName } from '@/lib/i18n/labels';
import { formatGEL } from '@/lib/utils';
import type { Product } from '@/lib/db/schema';
import type { SelectedProduct } from '@/lib/calculator/types';

export default function FurnitureStepPage() {
  const ka = useT();
  const locale = useLocale();
  const { rooms, selectedFurniture, addFurniture, removeFurniture } =
    useCalculatorStore();
  const { items: categories, loading: catLoading } = useCategories(true);

  const [activeRoomId, setActiveRoomId] = useState<string | null>(rooms[0]?.id ?? null);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const currentSlug = activeSlug ?? categories[0]?.slug ?? null;
  const { items: products, loading } = useProducts(currentSlug, 1, 24);

  const totalSelected = useMemo(
    () =>
      Object.values(selectedFurniture)
        .flat()
        .reduce((s, p) => s + p.totalPrice, 0),
    [selectedFurniture]
  );

  if (rooms.length === 0) {
    return (
      <>
        <StepIndicator current={4} />
        <div className="container py-16 text-center">
          <p className="text-ink-muted">{ka.calculator.needRoomsFirst}</p>
          <Button asChild className="mt-4">
            <Link href="/calculator">{ka.common.back}</Link>
          </Button>
        </div>
      </>
    );
  }

  const handleAdd = (p: Product) => {
    if (!activeRoomId) return;
    const sel: SelectedProduct = {
      productId: p.id,
      nameKa: p.nameKa,
      pricePerUnit: Number(p.pricePerUnit),
      unit: p.unit,
      qty: 1,
      totalPrice: Number(p.pricePerUnit),
      imageUrl: p.imageUrl,
      categorySlug: currentSlug ?? undefined,
    };
    addFurniture(activeRoomId, sel);
  };

  return (
    <>
      <StepIndicator current={4} />
      <div className="container py-10">
        <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
          {/* Rooms + Categories */}
          <aside className="space-y-6">
            <div>
              <h2 className="mb-3 font-serif text-lg font-semibold">
                {ka.furniture.selectRoom}
              </h2>
              <div className="space-y-1">
                {rooms.map((r) => {
                  const items = selectedFurniture[r.id] ?? [];
                  const active = activeRoomId === r.id;
                  return (
                    <button
                      key={r.id}
                      onClick={() => setActiveRoomId(r.id)}
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
                        active ? 'bg-brand text-white' : 'text-ink hover:bg-bg-base'
                      }`}
                    >
                      <span className="truncate">
                        {r.nameKa}{' '}
                        <span className={active ? 'text-white/70' : 'text-ink-muted'}>
                          ({roomTypeLabel(ka, r.type)})
                        </span>
                      </span>
                      {items.length > 0 && (
                        <Badge
                          variant={active ? 'outline' : 'default'}
                          className={active ? 'border-white/40 text-white' : undefined}
                        >
                          {items.length}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <h2 className="mb-3 font-serif text-lg font-semibold">
                {ka.furniture.chooseFurniture}
              </h2>
              {catLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-9 rounded-md bg-line/50" />
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  {categories.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setActiveSlug(c.slug)}
                      className={`block w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                        currentSlug === c.slug
                          ? 'bg-accent/10 text-accent-dark font-medium'
                          : 'text-ink hover:bg-bg-base'
                      }`}
                    >
                      {pickLocalizedName(locale, c.nameKa, c.nameEn)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>

          {/* Products + Cart */}
          <section className="space-y-8">
            <div>
              <h1 className="font-serif text-2xl font-bold">{ka.furniture.title}</h1>
              <p className="text-sm text-ink-muted">{ka.furniture.subtitle}</p>
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
                  <ProductCard key={p.id} product={p} onAction={() => handleAdd(p)} />
                ))}
              </div>
            )}

            {/* Per-room added items */}
            {activeRoomId && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Sofa className="h-4 w-4" />
                    {ka.furniture.addedItems}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(selectedFurniture[activeRoomId] ?? []).length === 0 ? (
                    <p className="text-sm text-ink-muted">{ka.furniture.noFurniture}</p>
                  ) : (
                    <ul className="divide-y divide-line/60">
                      {(selectedFurniture[activeRoomId] ?? []).map((item, idx) => (
                        <li
                          key={`${item.productId}-${idx}`}
                          className="flex items-center justify-between gap-3 py-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-bg-base">
                              <Plus className="h-4 w-4 text-brand" />
                            </div>
                            <p className="line-clamp-1 text-sm font-medium">
                              {item.nameKa}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-semibold">{formatGEL(item.totalPrice)}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeFurniture(activeRoomId, item.productId)}
                            >
                              <Trash2 className="h-4 w-4 text-danger" />
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="rounded-lg border border-line bg-bg-surface p-4 flex items-center justify-between">
              <span className="text-sm text-ink-muted">
                {ka.calculator.totalFurniture} ({Object.values(selectedFurniture).flat().length})
              </span>
              <span className="font-serif text-2xl font-bold text-brand">
                {formatGEL(totalSelected)}
              </span>
            </div>
          </section>
        </div>

        <div className="mt-10 flex flex-col-reverse justify-between gap-3 sm:flex-row sm:items-center">
          <Button variant="outline" size="lg" asChild>
            <Link href="/calculator/catalog">
              <ArrowLeft className="h-4 w-4" />
              {ka.calculator.backButton}
            </Link>
          </Button>
          <Button size="xl" asChild>
            <Link href="/calculator/summary">
              {ka.calculator.nextButton}
              <ArrowRight className="h-5 w-5" />
            </Link>
          </Button>
        </div>
      </div>
    </>
  );
}
