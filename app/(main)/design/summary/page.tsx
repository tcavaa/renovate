'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, FileDown, HardHat, Loader2, Printer, Save, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DesignSteps } from '@/components/design/DesignSteps';
import { StepHeader } from '@/components/flow/StepHeader';
import { StepNav } from '@/components/flow/StepNav';
import { StageBrief } from '@/components/flow/StageBrief';
import { EmptyStep } from '@/components/flow/EmptyStep';
import { Figure } from '@/components/calculator/MaterialsTable';
import { useDesignStore } from '@/store/designStore';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useLocale, useT } from '@/lib/i18n/client';
import { basketLabels, localizedName, styleLabel } from '@/lib/i18n/labels';
import { archetypeLabel } from '@/lib/design/catalog';
import { budgetSummary, priceScene } from '@/lib/design/pricing';
import { useRateBook } from '@/hooks/useRateBook';
import { usePlatformFees } from '@/hooks/usePlatformFees';
import { platformFee } from '@/lib/finance/money';
import { CheckoutDialog, type CheckoutPart } from '@/components/checkout/CheckoutDialog';
import { calculatorCheckoutPart, designCheckoutPart } from '@/lib/projects/checkoutParts';
import { fill } from '@/lib/admin/list';
import { cn, formatGEL, formatM2 } from '@/lib/utils';
import { MoneyRow } from '@/components/ui/money-row';
import { totalFloorAreaM2 } from '@/lib/design/planGeometry';
import { BudgetSheet, type SheetActions } from '@/components/budget/BudgetSheet';
import { getStyle } from '@/lib/design/styles';
import { saveDesign } from '@/lib/design/saveDesign';
import { designStepPosition, previousStep, previousStepHref } from '@/lib/design/steps';
import { downloadPlanPdf } from '@/lib/design/planPdfExport';

/**
 * Step 7: the budget. Materials + products + labour = the estimated project cost, every line
 * with its quantity and price, grouped the way a builder would read it — finishes with their
 * m², doors and windows, furniture, lighting, sockets, pipes, heating, the bulk materials,
 * the labour — then the baskets per partner store and the platform's fee.
 */
export default function BudgetPage() {
  const t = useT();
  const locale = useLocale();
  const { plan, styleId, mode, budgetGel, items, finishes, electrical, styleProfile, homeState, projectId, calculatorPicks, excluded, quantities, toggleExcluded, setLinesExcluded, setQuantity, clearBudgetEdits } = useDesignStore();
  const calculator = useCalculatorStore();
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const fees = usePlatformFees();

  const scene = useMemo(() => ({ styleId, mode, budgetGel, items, finishes, electrical, styleProfile, excluded, quantities }), [styleId, mode, budgetGel, items, finishes, electrical, styleProfile, excluded, quantities]);
  const { book } = useRateBook();
  const priceOptions = useMemo(() => ({ homeState: homeState ?? undefined, book, locale, ...basketLabels(t) }), [homeState, book, locale, t]);
  /** The project as it stands: what is being ordered. */
  const cost = useMemo(() => (plan ? priceScene(plan, scene, priceOptions) : null), [plan, scene, priceOptions]);
  /**
   * The same project as the sheet worked it out — nothing ticked off, no quantity changed —
   * so the page can show the original beside what the person made of it. Priced twice rather
   * than subtracted: a product that is out can take its store's delivery with it, and only
   * the engine knows that.
   */
  const edited = excluded.length > 0 || Object.keys(quantities).length > 0;
  const fullCost = useMemo(
    () => (plan && edited ? priceScene(plan, { ...scene, excluded: [], quantities: {} }, priceOptions) : null),
    [plan, scene, edited, priceOptions]
  );

  if (!plan || !cost) {
    return (
      <>
        <DesignSteps current={7} />
        <EmptyStep message={t.design.needPlanDesc} back={t.design.startOver} href="/design" />
      </>
    );
  }

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
  // From the budget on this page, not from the scene: the dialogue lists the product lines
  // above that are still ticked — doors, fittings and radiators with the rest.
  const designPart = designCheckoutPart(plan, cost, fees.designFeePerM2, locale);
  const checkoutParts: CheckoutPart[] = [
    ...(calculatorPicks && calculator.rooms.length > 0 ? [calculatorCheckoutPart(calculator.rooms, calculator.selectedProducts, calculator.selectedFurniture, fees.calculatorFeePerM2, locale)] : []),
    ...(designPart ? [designPart] : []),
  ];
  const summary = budgetSummary(cost);

  // What the ticks came to. The lines themselves are all in `cost.lines`, the ticked-off
  // ones flagged where they stand; the second pricing is only for the difference, because a
  // product that is out can take its store's delivery with it and only the engine knows.
  const excludedLines = cost.lines.filter((l) => l.excluded).length;
  const changedLines = cost.lines.filter((l) => l.originalQty != null && !l.excluded).length;
  /** What the edits came to: negative when things were taken out, positive when more was ordered. */
  const editsDelta = fullCost ? Math.round((cost.grandTotal - fullCost.grandTotal) * 100) / 100 : 0;
  const sheetActions: SheetActions = {
    toggle: (line) => line.tick && toggleExcluded(line.tick, line.product?.productId),
    setMany: (lines, out) => setLinesExcluded(lines.filter((l) => l.tick).map((l) => ({ tick: l.tick!, productId: l.product?.productId })), out),
    setQuantity: (line, qty) => line.tick && setQuantity(line.tick, qty, line.originalQty ?? line.qty),
  };

  /** The 2D plan as a PDF: the board's own drawing at print resolution, on one A4 sheet. */
  const exportPlan = async () => {
    setExporting(true);
    setError(null);
    try {
      await downloadPlanPdf(plan, `${t.design.title}-${new Date().toISOString().slice(0, 10)}`, {
        title: t.design.title,
        subtitle: `${styleLabel(t, styleId)} · ${new Date().toLocaleDateString('ka-GE')}`,
        areaLabel: formatM2(areaM2),
        roomsLabel: fill(t.build.roomCount, { n: plan.rooms.length }),
        unitM2: t.units.m2,
        unitM: t.units.m,
        items,
        electrical,
        finishes,
        furniture: true,
        itemLabel: (item) => archetypeLabel(item.kind, locale),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <DesignSteps current={7} />
      <div className="container py-10 md:py-14">
        <StepHeader
          step={designStepPosition(7, homeState, mode)}
          total={8}
          title={t.build.budgetTitle}
          subtitle={t.build.budgetSubtitle}
          meta={
            <>
              <span className="flex items-center gap-1">
                {style.swatches.slice(0, 4).map((hex) => (
                  <span key={hex} className="h-3 w-3 rounded-[3px] border border-line" style={{ backgroundColor: hex }} />
                ))}
              </span>
              <span>{plan.rooms.length} × {t.design.step2}</span>
              <span className="text-ink-faint">·</span>
              <span>{formatM2(areaM2)}</span>
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
              <Button type="button" variant="outline" onClick={exportPlan} disabled={exporting}>
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                {t.build.exportPlanPdf}
              </Button>
              <Button type="button" variant="outline" onClick={save} disabled={saving || savedId != null}>
                {savedId != null ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                {saving ? t.design.saving : savedId != null ? t.design.savedTitle : t.design.saveDesign}
              </Button>
            </div>
          }
        />
        <StageBrief step={7} className="mt-6" />
        <p className="no-print mt-4 text-xs text-ink-muted">
          {t.build.sheetHint}
          <span className="mx-1.5 text-ink-faint">·</span>
          {excludedLines === 0 && changedLines === 0 ? t.build.editsNone : fill(t.build.editsCount, { out: excludedLines, changed: changedLines })}
        </p>

        {error && <p className="mt-6 rounded-[12px] border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</p>}

        {/* Materials + products + labour = the estimate. */}
        <div className="mt-8 grid overflow-hidden rounded-[16px] border border-line sm:grid-cols-4">
          <Figure label={t.build.budgetMaterials} value={formatGEL(summary.materials)} />
          <Figure label={t.build.budgetProducts} value={formatGEL(summary.products)} />
          <Figure label={t.build.budgetLabour} value={formatGEL(summary.labour)} />
          <Figure label={t.build.budgetTotal} value={formatGEL(summary.total)} emphasis />
        </div>
        <p className="mt-3 text-xs text-ink-muted">{t.build.budgetEstimatedNote}</p>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            <BudgetSheet lines={cost.lines} actions={sheetActions} rounded />
          </div>

          {/* ---- totals ---- */}
          <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-[16px] border border-line bg-bg-surface">
              <div className="border-b border-line px-4 py-3">
                <p className="eyebrow">{t.design.grandTotal}</p>
              </div>
              <div className="space-y-2 p-4 text-sm">
                <MoneyRow label={t.design.furnitureTotal} value={cost.furnitureTotal} />
                {cost.finishesTotal > 0 && <MoneyRow label={t.design.finishesTotal} value={cost.finishesTotal} />}
                {cost.openingsTotal > 0 && <MoneyRow label={t.build.secOpenings} value={cost.openingsTotal} />}
                {cost.technicalTotal > 0 && <MoneyRow label={`${t.build.secElectrical} · ${t.build.secPlumbing}`} value={cost.technicalTotal} />}
                {/* Whenever there is any, not only in a renovation: fitting a skirting board
                    somebody chose is labour in a design-only project too, and with the row
                    hidden the rows above no longer added up to the total under them. */}
                {(mode === 'full' || cost.materialsTotal > 0) && <MoneyRow label={t.design.materialsTotal} value={cost.materialsTotal} />}
                {(mode === 'full' || cost.labourTotal > 0) && <MoneyRow label={t.design.labourTotal} value={cost.labourTotal} />}
                <MoneyRow label={t.design.delivery} value={cost.deliveryTotal} />
                {/* What the ticks came to: the whole estimate, what was taken out, what is left. */}
                {fullCost && (
                  <div className="mt-3 space-y-1.5 border-t border-line pt-3">
                    <MoneyRow label={t.build.originalEstimate} value={fullCost.grandTotal} muted />
                    <div className={cn('flex items-baseline justify-between gap-3', editsDelta < 0 ? 'text-danger' : 'text-ink')}>
                      <span>{t.build.editsChange}</span>
                      <span className="shrink-0 font-medium tabular-nums">
                        {editsDelta < 0 ? '−' : '+'}
                        {formatGEL(Math.abs(editsDelta))}
                      </span>
                    </div>
                    <button type="button" onClick={clearBudgetEdits} className="no-print text-xs font-medium text-ink-muted underline underline-offset-2 hover:text-ink">
                      {t.build.resetEdits}
                    </button>
                  </div>
                )}
                <div className="mt-3 flex items-baseline justify-between border-t-2 border-ink pt-3">
                  <span className="font-serif font-semibold">{fullCost ? t.build.orderTotal : t.design.grandTotal}</span>
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

            {cost.coverage.length > 0 && (
              <div className="rounded-[16px] border border-line bg-bg-surface">
                <div className="border-b border-line px-4 py-3">
                  <p className="eyebrow">{t.build.m2ByMaterial}</p>
                </div>
                <ul className="space-y-1.5 p-4 text-sm">
                  {cost.coverage.map((c) => (
                    <li key={c.product.productId} className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-ink-soft">{localizedName(locale, c.product)}</span>
                      <span className="shrink-0 tabular-nums text-ink">{formatM2(c.areaM2)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-[16px] border border-line bg-bg-surface">
              <div className="border-b border-line px-4 py-3">
                <p className="eyebrow">{t.design.perRoomTitle}</p>
              </div>
              <div className="space-y-1.5 p-4 text-sm">
                {cost.perRoom.map((room) => (
                  <MoneyRow key={room.roomId} label={room.roomName} value={room.total} muted />
                ))}
              </div>
            </div>

            <Link href="/design/workers" className="flex h-12 items-center justify-center gap-2 rounded-[12px] border border-line bg-white text-sm font-medium text-ink hover:border-ink">
              <HardHat className="h-4 w-4" />
              {t.build.findWorkers}
            </Link>
          </div>
        </div>
      </div>

      <StepNav
        back={{ href: previousStepHref(7, homeState, mode), label: previousStep(7, homeState, mode) === 3 ? t.design.step3 : t.design.backToStudio }}
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
