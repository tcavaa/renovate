'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Loader2, Trash2 } from 'lucide-react';
import { CALCULATOR_STEPS, StepIndicator } from '@/components/calculator/StepIndicator';
import { AskFurnitureDialog } from '@/components/calculator/AskFurnitureDialog';
import { ProductCard } from '@/components/catalog/ProductCard';
import { StepHeader } from '@/components/flow/StepHeader';
import { StepNav } from '@/components/flow/StepNav';
import { SideList } from '@/components/flow/SideList';
import { EmptyStep } from '@/components/flow/EmptyStep';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useCategories, useProducts } from '@/hooks/useProducts';
import { aggregateRoomTotals } from '@/lib/calculator/materials';
import { surfaceOfCategory } from '@/lib/calculator/placement';
import { useT, useLocale } from '@/lib/i18n/client';
import { localizedName, pickLocalizedName, unitLabel } from '@/lib/i18n/labels';
import { formatGEL, formatNumber } from '@/lib/utils';
import type { Product } from '@/lib/db/schema';
import type { SelectedProduct } from '@/lib/calculator/types';
import { cartKey, categorySlugFromKey, isCartKey, selectionKey, suggestedQuantity } from '@/lib/calculator/quantities';

/**
 * Step 3: the cart. Products are picked by kind, with no quantity to think about here: a
 * floor or wall material goes into the cart to be laid on the rooms on the next step, where
 * the area it covers is its quantity — several of one kind can be in the cart at once, a
 * tile for the bathroom and a laminate for the rest. Everything else — sockets, lights,
 * sanitary ware, doors, windows — is one product per kind, counted from the rooms by itself.
 * Nothing is required: with an empty cart the estimate is the renovation alone.
 */
export default function CatalogStepPage() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const { rooms, homeState, selectedProducts, selectProduct, addCartFinish, removeProduct } = useCalculatorStore();
  const { items: categories, loading: catLoading } = useCategories(false);

  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [askFurniture, setAskFurniture] = useState(false);
  const currentSlug = activeSlug ?? categories[0]?.slug ?? null;
  const current = categories.find((c) => c.slug === currentSlug) ?? null;
  const { items: products, loading } = useProducts(currentSlug, 1, 24);

  const totals = useMemo(() => aggregateRoomTotals(rooms), [rooms]);
  const cart = useMemo(() => Object.entries(selectedProducts), [selectedProducts]);
  const laidCount = cart.filter(([key]) => isCartKey(key)).length;
  const totalSelected = useMemo(() => cart.reduce((s, [, p]) => s + p.totalPrice, 0), [cart]);

  if (rooms.length === 0 || !homeState) {
    return (
      <>
        <StepIndicator current={3} />
        <EmptyStep message={t.calculator.needRoomsFirst} back={t.common.back} />
      </>
    );
  }

  /** Floor and wall materials are laid on the rooms later; the rest are counted here. */
  const surface = surfaceOfCategory(current);
  const hasAny = (slug: string) => cart.some(([key]) => categorySlugFromKey(key) === slug);
  const isChosen = (p: Product): boolean => {
    if (!currentSlug) return false;
    return surface ? !!selectedProducts[cartKey(currentSlug, p.id)] : selectedProducts[selectionKey(currentSlug)]?.productId === p.id;
  };

  const snapshot = (p: Product, qty: number): SelectedProduct => ({
    productId: p.id,
    nameKa: p.nameKa,
    nameEn: p.nameEn,
    nameRu: p.nameRu,
    pricePerUnit: Number(p.pricePerUnit),
    unit: p.unit,
    qty,
    totalPrice: Math.round(Number(p.pricePerUnit) * qty * 100) / 100,
    imageUrl: p.imageUrl,
    categorySlug: currentSlug ?? undefined,
  });

  const handleSelect = (p: Product) => {
    if (!currentSlug) return;
    if (surface) {
      const key = cartKey(currentSlug, p.id);
      if (selectedProducts[key]) removeProduct(key);
      else
        addCartFinish({
          ...snapshot(p, 0),
          surface,
          slug: p.slug,
          textureUrl: p.textureUrl,
          colorHex: p.colorHex,
          coveragePerUnit: p.coveragePerUnit == null ? null : Number(p.coveragePerUnit),
          specs: p.specs,
        });
      return;
    }
    const key = selectionKey(currentSlug);
    if (selectedProducts[key]?.productId === p.id) {
      removeProduct(key);
      return;
    }
    selectProduct(key, snapshot(p, suggestedQuantity(currentSlug, totals) || 1));
  };

  /** On to the placement when there is something to lay; straight to the furniture question otherwise. */
  const next = () => {
    if (laidCount > 0) router.push('/calculator/placement');
    else setAskFurniture(true);
  };

  return (
    <>
      <StepIndicator current={3} />
      <div className="container py-10 md:py-14">
        <StepHeader step={3} total={CALCULATOR_STEPS} title={t.calculator.step3} subtitle={t.calculator.cartHint} />

        <div className="mt-8 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)_300px]">
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
            <div className="mb-4 flex items-baseline justify-between gap-4 border-b border-line pb-3">
              <h2 className="font-serif text-xl font-semibold text-ink">{current ? pickLocalizedName(locale, current.nameKa, current.nameEn, current.nameRu) : '…'}</h2>
              {current && <p className="text-right text-xs text-ink-muted">{surface ? t.calculator.placedOnNextStep : t.calculator.autoQuantity}</p>}
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
                  <ProductCard key={p.id} product={p} selected={isChosen(p)} onAction={() => handleSelect(p)} actionLabel={surface ? t.calculator.addToCart : undefined} selectedLabel={surface ? t.calculator.inCart : undefined} />
                ))}
              </div>
            )}
          </section>

          {/* The cart: what is laid later with the area to come, what is counted now with its count. */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="border border-line bg-bg-surface">
              <div className="border-b border-line px-4 py-3">
                <p className="eyebrow">
                  {t.calculator.cartTitle} <span className="text-ink">{cart.length}</span>
                </p>
              </div>
              {cart.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-ink-muted">{t.calculator.cartEmpty}</p>
              ) : (
                <ul>
                  {cart.map(([key, p]) => {
                    const laid = isCartKey(key);
                    return (
                      <li key={key} className="flex items-start gap-3 border-b border-line px-4 py-3 text-sm">
                        <span className="relative mt-0.5 block h-9 w-9 shrink-0 overflow-hidden border border-line bg-bg-base">
                          {p.imageUrl ? <Image src={p.imageUrl} alt="" fill sizes="36px" className="object-cover" /> : p.colorHex ? <span className="block h-full w-full" style={{ backgroundColor: p.colorHex }} /> : null}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 font-medium text-ink">{localizedName(locale, p)}</p>
                          <p className="mt-0.5 text-xs tabular-nums text-ink-muted">
                            {laid && p.qty === 0 ? t.calculator.placedOnNextStep : `${formatNumber(p.qty, p.unit === 'm2' ? 1 : 0)} ${unitLabel(t, p.unit)} × ${formatGEL(p.pricePerUnit)}`}
                            {!laid && <span className="ml-1 text-ink-faint">· {t.calculator.autoQuantity}</span>}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className="font-semibold tabular-nums">{laid && p.qty === 0 ? '—' : formatGEL(p.totalPrice)}</span>
                          <button type="button" onClick={() => removeProduct(key)} aria-label={t.calculator.removeFromCart} title={t.calculator.removeFromCart} className="grid h-7 w-7 place-items-center text-ink-faint transition-colors hover:bg-danger/10 hover:text-danger">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
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

      <StepNav back={{ href: '/calculator/materials', label: t.calculator.backButton }} next={{ label: t.calculator.nextButton, onClick: next }}>
        <p className="text-sm text-ink-muted sm:text-right">
          {t.calculator.cartTitle} {cart.length} · <span className="font-serif text-base font-semibold text-ink">{formatGEL(totalSelected)}</span>
        </p>
      </StepNav>

      <AskFurnitureDialog open={askFurniture} onOpenChange={setAskFurniture} />
    </>
  );
}
