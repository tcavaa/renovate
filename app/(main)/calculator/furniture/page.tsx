'use client';

import { useMemo, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { StepIndicator } from '@/components/calculator/StepIndicator';
import { ProductCard } from '@/components/catalog/ProductCard';
import { StepHeader } from '@/components/flow/StepHeader';
import { StepNav } from '@/components/flow/StepNav';
import { SideList } from '@/components/flow/SideList';
import { EmptyStep } from '@/components/flow/EmptyStep';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useCategories, useProducts } from '@/hooks/useProducts';
import { useT, useLocale } from '@/lib/i18n/client';
import { localizedName, roomTypeLabel, pickLocalizedName } from '@/lib/i18n/labels';
import { formatGEL } from '@/lib/utils';
import type { Product } from '@/lib/db/schema';
import type { SelectedProduct } from '@/lib/calculator/types';

export default function FurnitureStepPage() {
  const t = useT();
  const locale = useLocale();
  const { rooms, selectedFurniture, addFurniture, removeFurniture } = useCalculatorStore();
  const { items: categories, loading: catLoading } = useCategories(true);

  const [activeRoomId, setActiveRoomId] = useState<string | null>(rooms[0]?.id ?? null);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const currentSlug = activeSlug ?? categories[0]?.slug ?? null;
  const current = categories.find((c) => c.slug === currentSlug) ?? null;
  const { items: products, loading } = useProducts(currentSlug, 1, 24);

  const activeRoom = rooms.find((r) => r.id === activeRoomId) ?? null;
  const roomItems = activeRoomId ? selectedFurniture[activeRoomId] ?? [] : [];
  const allItems = Object.values(selectedFurniture).flat();
  const totalSelected = useMemo(() => allItems.reduce((s, p) => s + p.totalPrice, 0), [allItems]);

  if (rooms.length === 0) {
    return (
      <>
        <StepIndicator current={4} />
        <EmptyStep message={t.calculator.needRoomsFirst} back={t.common.back} />
      </>
    );
  }

  const handleAdd = (p: Product) => {
    if (!activeRoomId) return;
    const sel: SelectedProduct = {
      productId: p.id,
      nameKa: p.nameKa,
      nameEn: p.nameEn,
      nameRu: p.nameRu,
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
      <div className="container py-10 md:py-14">
        <StepHeader step={4} total={5} title={t.furniture.title} subtitle={t.furniture.subtitle} />

        <div className="mt-8 grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="space-y-8 lg:sticky lg:top-24 lg:self-start">
            <SideList
              title={t.furniture.selectRoom}
              activeId={activeRoomId}
              onSelect={setActiveRoomId}
              items={rooms.map((r) => ({
                id: r.id,
                label: r.nameKa,
                hint: roomTypeLabel(t, r.type),
                count: (selectedFurniture[r.id] ?? []).length || undefined,
              }))}
            />
            {catLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-9 animate-pulse bg-line/50" />
                ))}
              </div>
            ) : (
              <SideList
                title={t.furniture.chooseFurniture}
                activeId={currentSlug}
                onSelect={setActiveSlug}
                items={categories.map((c) => ({ id: c.slug, label: pickLocalizedName(locale, c.nameKa, c.nameEn, c.nameRu) }))}
              />
            )}
          </aside>

          <section className="space-y-10">
            <div>
              <div className="mb-4 flex items-baseline justify-between border-b border-line pb-3">
                <h2 className="font-serif text-xl font-semibold text-ink">{current ? pickLocalizedName(locale, current.nameKa, current.nameEn, current.nameRu) : '…'}</h2>
                {activeRoom && (
                  <p className="text-sm text-ink-muted">
                    → <span className="text-ink">{activeRoom.nameKa}</span>
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
                    <ProductCard key={p.id} product={p} onAction={() => handleAdd(p)} />
                  ))}
                </div>
              )}
            </div>

            {activeRoomId && (
              <div className="border border-line bg-bg-surface">
                <div className="flex items-baseline justify-between border-b border-line px-4 py-3">
                  <p className="eyebrow">
                    {t.furniture.addedItems} · <span className="text-ink">{activeRoom?.nameKa}</span>
                  </p>
                  <span className="text-xs tabular-nums text-ink-muted">{roomItems.length}</span>
                </div>
                {roomItems.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-ink-muted">{t.furniture.noFurniture}</p>
                ) : (
                  <ul>
                    {roomItems.map((item, idx) => (
                      <li key={`${item.productId}-${idx}`} className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0">
                        <p className="line-clamp-1 text-sm font-medium text-ink">{localizedName(locale, item)}</p>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold tabular-nums">{formatGEL(item.totalPrice)}</span>
                          <button
                            type="button"
                            onClick={() => removeFurniture(activeRoomId, item.productId)}
                            aria-label={t.rooms.remove}
                            className="grid h-8 w-8 place-items-center text-ink-faint transition-colors hover:bg-danger/10 hover:text-danger"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      <StepNav back={{ href: '/calculator/catalog', label: t.calculator.backButton }} next={{ href: '/calculator/summary', label: t.calculator.nextButton }}>
        <p className="text-sm text-ink-muted sm:text-right">
          {t.calculator.totalFurniture} ({allItems.length}) · <span className="font-serif text-base font-semibold text-ink">{formatGEL(totalSelected)}</span>
        </p>
      </StepNav>
    </>
  );
}
