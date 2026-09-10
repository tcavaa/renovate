'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { Check, MapPin, Phone, Printer, Save, ShoppingBag, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DesignSteps } from '@/components/design/DesignSteps';
import { StepHeader } from '@/components/flow/StepHeader';
import { StepNav } from '@/components/flow/StepNav';
import { EmptyStep } from '@/components/flow/EmptyStep';
import { useDesignStore } from '@/store/designStore';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useLocale, useT } from '@/lib/i18n/client';
import { localizedName } from '@/lib/i18n/labels';
import { priceScene } from '@/lib/design/pricing';
import { useRateBook } from '@/hooks/useRateBook';
import { usePlatformFees } from '@/hooks/usePlatformFees';
import { platformFee } from '@/lib/finance/money';
import { CheckoutDialog, type CheckoutPart } from '@/components/checkout/CheckoutDialog';
import { calculatorCheckoutPart, designCheckoutPart } from '@/lib/projects/checkoutParts';
import { fill } from '@/lib/admin/list';
import { formatGEL, formatM2 } from '@/lib/utils';
import { MoneyRow } from '@/components/ui/money-row';
import { totalFloorAreaM2 } from '@/lib/design/planGeometry';
import { getStyle } from '@/lib/design/styles';
import { saveDesign } from '@/lib/design/saveDesign';

export default function DesignSummaryPage() {
  const t = useT();
  const locale = useLocale();
  const { plan, styleId, mode, budgetGel, items, finishes, floorPlanUrl, homeState, projectId, setProjectId, calculatorPicks } = useDesignStore();
  const calculator = useCalculatorStore();
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const fees = usePlatformFees();

  const scene = useMemo(
    () => ({ styleId, mode, budgetGel, items, finishes }),
    [styleId, mode, budgetGel, items, finishes]
  );
  const { book } = useRateBook();
  const cost = useMemo(
    () =>
      plan
        ? priceScene(plan, scene, {
            homeState: homeState ?? undefined,
            book,
            locale,
            surfaceLabels: { floor: t.design.finishFloor, wall: t.design.finishWall, ceiling: t.design.finishCeiling },
          })
        : null,
    [plan, scene, homeState, book, t, locale]
  );

  if (!plan || !cost) {
    return (
      <>
        <DesignSteps current={5} />
        <EmptyStep message={t.design.needPlanDesc} back={t.design.startOver} href="/design" />
      </>
    );
  }

  /**
   * Writes the design once and returns its id — the save button and the checkout share it.
   * An explicit save, so a draft the autosave left behind becomes a saved project.
   */
  const saveOnce = async (): Promise<number> => {
    if (savedId != null) return savedId;
    const id = await saveDesign({ draft: false, nameKa: `${t.design.title} — ${new Date().toLocaleDateString('ka-GE')}` });
    setSavedId(id);
    return id;
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveOnce();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const style = getStyle(styleId);
  const areaM2 = totalFloorAreaM2(plan);
  const fee = platformFee(areaM2, fees.designFeePerM2);
  const designPart = designCheckoutPart(plan, items, finishes, fees.designFeePerM2, locale);
  const checkoutParts: CheckoutPart[] = [
    ...(calculatorPicks && calculator.rooms.length > 0 ? [calculatorCheckoutPart(calculator.rooms, calculator.selectedProducts, calculator.selectedFurniture, fees.calculatorFeePerM2, locale)] : []),
    ...(designPart ? [designPart] : []),
  ];

  return (
    <>
      <DesignSteps current={5} />
      <div className="container py-10 md:py-14">
        <StepHeader
          step={5}
          total={5}
          title={t.design.summaryTitle}
          subtitle={t.design.summarySubtitle}
          meta={
            <>
              <span className="flex items-center gap-1">
                {style.swatches.slice(0, 4).map((hex) => (
                  <span key={hex} className="h-3 w-3 border border-line" style={{ backgroundColor: hex }} />
                ))}
              </span>
              <span>{plan.rooms.length} × {t.design.step2}</span>
              <span className="text-ink-faint">·</span>
              <span>{formatM2(totalFloorAreaM2(plan))}</span>
              <span className="text-ink-faint">·</span>
              <span>
                {items.filter((i) => i.product).length} {t.design.itemsInRoom}
              </span>
            </>
          }
          actions={
            <div className="no-print flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={() => window.print()}>
                <Printer className="h-4 w-4" />
                {t.design.print}
              </Button>
              <Button type="button" variant="outline" onClick={save} disabled={saving || savedId != null}>
                {savedId != null ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                {saving ? t.design.saving : savedId != null ? t.design.savedTitle : t.design.saveDesign}
              </Button>
            </div>
          }
        />

        {error && <p className="mt-6 border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</p>}

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* ---- baskets, grouped by partner ---- */}
          <div className="space-y-6">
            <p className="eyebrow">{t.design.byStore}</p>

            {cost.baskets.map((basket, index) => (
              <section key={basket.store?.id ?? `none-${index}`} className="border border-line bg-bg-surface">
                <header className="flex items-center gap-4 border-b border-line p-4">
                  {basket.store?.logoUrl ? (
                    <Image src={basket.store.logoUrl} alt={localizedName(locale, basket.store)} width={40} height={40} className="border border-line" />
                  ) : (
                    <span className="grid h-10 w-10 place-items-center border border-line font-serif text-base font-semibold text-ink">{(basket.store ? localizedName(locale, basket.store) : '—').slice(0, 1)}</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-serif text-lg font-semibold text-ink">{basket.store ? localizedName(locale, basket.store) : '—'}</h3>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-muted">
                      {basket.store?.address && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {basket.store.address}
                        </span>
                      )}
                      {basket.store?.phone && (
                        <a href={`tel:${basket.store.phone}`} className="flex items-center gap-1 hover:text-ink">
                          <Phone className="h-3 w-3" />
                          {basket.store.phone}
                        </a>
                      )}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-serif text-xl font-semibold tabular-nums text-ink">{formatGEL(basket.subtotal)}</p>
                    <p className="flex items-center justify-end gap-1 text-[11px] text-ink-muted">
                      <Truck className="h-3 w-3" />
                      {basket.deliveryFee === 0 ? t.design.freeDelivery : formatGEL(basket.deliveryFee)}
                    </p>
                  </div>
                </header>

                <table className="w-full text-sm">
                  <tbody>
                    {basket.lines.map((line, i) => (
                      <tr key={`${line.product.productId}-${i}`} className="border-b border-line/70 last:border-b-0">
                        <td className="py-2.5 pl-4 pr-2">
                          <p className="font-medium text-ink">{localizedName(locale, line.product)}</p>
                          <p className="text-xs text-ink-muted">
                            {line.item} · {line.roomName}
                          </p>
                        </td>
                        <td className="whitespace-nowrap py-2.5 text-right text-xs tabular-nums text-ink-muted">
                          {line.product.qty !== 1 && `${line.product.qty} × `}
                          {formatGEL(line.product.pricePerUnit)}
                        </td>
                        <td className="whitespace-nowrap py-2.5 pl-3 pr-4 text-right font-semibold tabular-nums">{formatGEL(line.product.totalPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
          </div>

          {/* ---- totals ---- */}
          <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <div className="border border-line bg-bg-surface">
              <div className="border-b border-line px-4 py-3">
                <p className="eyebrow">{t.design.grandTotal}</p>
              </div>
              <div className="space-y-2 p-4 text-sm">
                <MoneyRow label={t.design.furnitureTotal} value={cost.furnitureTotal} />
                {mode !== 'full' && cost.finishesTotal > 0 && <MoneyRow label={t.design.finishesTotal} value={cost.finishesTotal} />}
                {mode === 'full' && (
                  <>
                    <MoneyRow label={t.design.finishesTotal} value={cost.finishesTotal} />
                    <MoneyRow label={t.design.materialsTotal} value={cost.materialsTotal} />
                    <MoneyRow label={t.design.labourTotal} value={cost.labourTotal} />
                  </>
                )}
                <MoneyRow label={t.design.delivery} value={cost.deliveryTotal} />
                <div className="mt-3 flex items-baseline justify-between border-t-2 border-ink pt-3">
                  <span className="font-serif font-semibold">{t.design.grandTotal}</span>
                  <span className="font-serif text-2xl font-semibold tabular-nums text-ink">{formatGEL(cost.grandTotal)}</span>
                </div>
                <div className="mt-3 space-y-1.5 border-t border-line pt-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span>
                      {t.market.feeDesign}
                      <span className="block text-xs text-ink-muted">{fill(t.market.platformFeeHint, { fee: formatGEL(fees.designFeePerM2), m2: formatM2(areaM2) })}</span>
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">{formatGEL(fee)}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold text-ink">{t.market.totalWithFee}</span>
                    <span className="font-serif text-xl font-semibold tabular-nums text-ink">{formatGEL(cost.grandTotal + fee)}</span>
                  </div>
                  <p className="text-xs text-ink-muted">{t.market.feeNote}</p>
                </div>
              </div>
            </div>

            <div className="border border-line bg-bg-surface">
              <div className="border-b border-line px-4 py-3">
                <p className="eyebrow">{t.design.perRoomTitle}</p>
              </div>
              <div className="space-y-1.5 p-4 text-sm">
                {cost.perRoom.map((room) => (
                  <MoneyRow key={room.roomId} label={room.roomName} value={room.total} muted />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <StepNav
        back={{ href: '/design/studio', label: t.design.backToStudio }}
        next={{ label: t.market.checkout, onClick: () => setCheckoutOpen(true), disabled: saving, icon: <ShoppingBag className="h-4 w-4" /> }}
      >
        <p className="text-sm text-ink-muted sm:text-right">
          {t.market.totalWithFee} · <span className="font-serif text-base font-semibold text-ink">{formatGEL(cost.grandTotal + fee)}</span>
        </p>
      </StepNav>

      <CheckoutDialog open={checkoutOpen} onOpenChange={setCheckoutOpen} saveProject={saveOnce} projectId={projectId} parts={checkoutParts} />
    </>
  );
}

