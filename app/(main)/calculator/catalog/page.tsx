'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Sofa } from 'lucide-react';
import { StepIndicator } from '@/components/calculator/StepIndicator';
import { ProductCard } from '@/components/catalog/ProductCard';
import { StepHeader } from '@/components/flow/StepHeader';
import { StepNav } from '@/components/flow/StepNav';
import { SideList } from '@/components/flow/SideList';
import { EmptyStep } from '@/components/flow/EmptyStep';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useCategories, useProducts } from '@/hooks/useProducts';
import { aggregateRoomTotals } from '@/lib/calculator/materials';
import { useT, useLocale } from '@/lib/i18n/client';
import { localizedName, pickLocalizedName, roomTypeLabel } from '@/lib/i18n/labels';
import { formatGEL, cn } from '@/lib/utils';
import type { Category, Product } from '@/lib/db/schema';
import type { Room, SelectedProduct } from '@/lib/calculator/types';
import { categorySlugFromKey, roomIdFromKey, selectionKey, suggestedQuantity, suggestedQuantityForRoom } from '@/lib/calculator/quantities';

/** Floor and wall finishes are chosen per room; everything else once for the flat. */
const isFinishCategory = (c: Category | null) => c?.calculationType === 'per_m2_floor' || c?.calculationType === 'per_m2_wall';

export default function CatalogStepPage() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const { rooms, homeState, selectedProducts, selectProduct, selectFinish, removeProduct } = useCalculatorStore();
  const { items: categories, loading: catLoading } = useCategories(false);

  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  /** Per finish category: the room being chosen for, or null for "the same everywhere". */
  const [scope, setScope] = useState<Record<string, string | null>>({});
  const [askFurniture, setAskFurniture] = useState(false);
  const currentSlug = activeSlug ?? categories[0]?.slug ?? null;
  const current = categories.find((c) => c.slug === currentSlug) ?? null;
  const { items: products, loading } = useProducts(currentSlug, 1, 24);

  const totals = useMemo(() => aggregateRoomTotals(rooms), [rooms]);
  const selectionCount = Object.keys(selectedProducts).length;
  const totalSelected = useMemo(() => Object.values(selectedProducts).reduce((s, p) => s + p.totalPrice, 0), [selectedProducts]);
  const roomName = (id: string | undefined) => (id ? rooms.find((r) => r.id === id)?.nameKa ?? '' : '');

  if (rooms.length === 0 || !homeState) {
    return (
      <>
        <StepIndicator current={3} />
        <EmptyStep message={t.calculator.needRoomsFirst} back={t.common.back} />
      </>
    );
  }

  const perRoom = isFinishCategory(current);
  const scopeRoomId = perRoom && currentSlug ? scope[currentSlug] ?? null : null;
  const scopeRoom: Room | null = scopeRoomId ? rooms.find((r) => r.id === scopeRoomId) ?? null : null;
  const currentKey = currentSlug ? selectionKey(currentSlug, scopeRoomId) : null;
  const suggested = currentSlug ? (scopeRoom ? suggestedQuantityForRoom(currentSlug, scopeRoom) : suggestedQuantity(currentSlug, totals)) : 0;

  /** Which scopes of the current category already have a product: the whole flat, or room ids. */
  const chosenScopes = new Set<string>();
  for (const key of Object.keys(selectedProducts)) {
    if (!currentSlug || categorySlugFromKey(key) !== currentSlug) continue;
    chosenScopes.add(roomIdFromKey(key) ?? 'all');
  }
  const hasAny = (slug: string) => Object.keys(selectedProducts).some((key) => categorySlugFromKey(key) === slug);

  const handleSelect = (p: Product) => {
    if (!currentSlug || !currentKey) return;
    if (selectedProducts[currentKey]?.productId === p.id) {
      removeProduct(currentKey);
      return;
    }
    const qty = suggested || 1;
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
    if (perRoom) selectFinish(currentSlug, scopeRoomId, sel);
    else selectProduct(currentKey, sel);
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
                  count: hasAny(c.slug) ? '✓' : undefined,
                }))}
              />
            )}
          </aside>

          <section>
            <div className="mb-4 flex items-baseline justify-between border-b border-line pb-3">
              <h2 className="font-serif text-xl font-semibold text-ink">{current ? pickLocalizedName(locale, current.nameKa, current.nameEn, current.nameRu) : '…'}</h2>
              {currentSlug && (
                <p className="text-sm text-ink-muted">
                  {t.calculator.needRequiredQty}: <span className="tabular-nums text-ink">{suggested}</span>
                  {scopeRoom && <span className="ml-1">({t.calculator.qtyForRoom})</span>}
                </p>
              )}
            </div>

            {/* Floors and walls: one product for every room, or a different one per room —
                the kitchen, bathroom and toilet are rooms like any other here, so they are
                always a separate choice. */}
            {perRoom && currentSlug && (
              <div className="mb-5 border border-line bg-bg-surface p-4">
                <p className="eyebrow">{t.calculator.finishScopeTitle}</p>
                <p className="mt-1 text-xs text-ink-muted">{t.calculator.finishScopeHint}</p>
                <div className="mt-3 flex flex-wrap gap-2" role="tablist">
                  <ScopeChip label={t.calculator.finishScopeAll} active={scopeRoomId === null} chosen={chosenScopes.has('all')} onClick={() => setScope((s) => ({ ...s, [currentSlug]: null }))} />
                  {rooms.map((room) => (
                    <ScopeChip
                      key={room.id}
                      label={room.nameKa}
                      hint={roomTypeLabel(t, room.type)}
                      active={scopeRoomId === room.id}
                      chosen={chosenScopes.has(room.id)}
                      onClick={() => setScope((s) => ({ ...s, [currentSlug]: room.id }))}
                    />
                  ))}
                </div>
                {scopeRoomId === null && chosenScopes.size > 0 && !chosenScopes.has('all') && (
                  <p className="mt-2 text-xs text-warning">{t.calculator.finishScopeReplaces}</p>
                )}
              </div>
            )}

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
                    selected={currentKey ? selectedProducts[currentKey]?.productId === p.id : false}
                    onAction={() => handleSelect(p)}
                    qtyHint={currentSlug ? String(suggested) : undefined}
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
                          {p.roomId && <span className="mr-1 text-ink-soft">{roomName(p.roomId)} ·</span>}
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

      <StepNav back={{ href: '/calculator/materials', label: t.calculator.backButton }} next={{ label: t.calculator.nextButton, onClick: () => setAskFurniture(true) }}>
        <p className="text-sm text-ink-muted sm:text-right">
          {t.calculator.selected} {selectionCount} · <span className="font-serif text-base font-semibold text-ink">{formatGEL(totalSelected)}</span>
        </p>
      </StepNav>

      {/* Furniture is optional here: it can be chosen later, in 3D, room by room. */}
      <Dialog open={askFurniture} onOpenChange={setAskFurniture}>
        <DialogContent>
          <DialogHeader>
            <div className="mb-2 grid h-12 w-12 place-items-center border border-line bg-bg-base text-ink">
              <Sofa className="h-6 w-6" />
            </div>
            <DialogTitle>{t.calculator.furnitureModalTitle}</DialogTitle>
            <DialogDescription>{t.calculator.furnitureModalDesc}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="ink" size="lg" onClick={() => router.push('/calculator/furniture')}>
              {t.calculator.furnitureModalYes}
            </Button>
            <Button variant="outline" size="lg" onClick={() => router.push('/calculator/summary')}>
              {t.calculator.furnitureModalNo}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ScopeChip({ label, hint, active, chosen, onClick }: { label: string; hint?: string; active: boolean; chosen: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 border px-3 text-sm transition-colors',
        active ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink hover:border-ink/50'
      )}
    >
      {chosen && <Check className={cn('h-3.5 w-3.5', active ? 'text-white' : 'text-success')} />}
      <span>{label}</span>
      {hint && <span className={cn('text-[11px]', active ? 'text-white/60' : 'text-ink-faint')}>{hint}</span>}
    </button>
  );
}
