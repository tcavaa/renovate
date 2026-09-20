'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Check, FileDown, HardHat, Loader2, MapPin, Phone, Printer, Save, ShoppingBag, Truck } from 'lucide-react';
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
import { localizedName, materialLabel, workTypeLabel } from '@/lib/i18n/labels';
import { budgetSections, budgetSummary, priceScene, type BudgetLine, type BudgetSection } from '@/lib/design/pricing';
import { useRateBook } from '@/hooks/useRateBook';
import { usePlatformFees } from '@/hooks/usePlatformFees';
import { platformFee } from '@/lib/finance/money';
import { CheckoutDialog, type CheckoutPart } from '@/components/checkout/CheckoutDialog';
import { calculatorCheckoutPart, designCheckoutPart } from '@/lib/projects/checkoutParts';
import { fill } from '@/lib/admin/list';
import { cn, formatGEL, formatM2, formatNumber, formatUnit } from '@/lib/utils';
import { MoneyRow } from '@/components/ui/money-row';
import { totalFloorAreaM2 } from '@/lib/design/planGeometry';
import { getStyle } from '@/lib/design/styles';
import { saveDesign } from '@/lib/design/saveDesign';
import { designStepPosition, previousStep, previousStepHref } from '@/lib/design/steps';
import { downloadPlanPdf } from '@/lib/design/planPdfExport';
import { electricalLabel, technicalLabel } from '@/components/plan/PlanToolbar';
import type { ElectricalKind, TechnicalKind } from '@/lib/design/types';
import type { Dictionary } from '@/lib/i18n';

const SECTION_ORDER: BudgetSection[] = ['finishes', 'openings', 'furniture', 'lighting', 'electrical', 'plumbing', 'heating', 'climate', 'materials', 'labour', 'delivery'];
const SECTION_KEY: Record<BudgetSection, keyof Dictionary['build']> = {
  furniture: 'secFurniture',
  lighting: 'secLighting',
  finishes: 'secFinishes',
  openings: 'secOpenings',
  electrical: 'secElectrical',
  plumbing: 'secPlumbing',
  heating: 'secHeating',
  climate: 'secClimate',
  materials: 'secMaterials',
  labour: 'secLabour',
  delivery: 'secDelivery',
};

/**
 * The product a budget line is, when it is one. Only a real SKU can be ticked off an order;
 * a labour line, a bulk material and a catalogue-free estimate are what the work costs
 * whoever does it, not something anybody buys from a shop.
 */
function productIdOf(line: BudgetLine): number | null {
  const id = line.key.startsWith('product-') ? Number(line.key.slice('product-'.length)) : NaN;
  return Number.isFinite(id) ? id : null;
}

/**
 * Step 7: the budget. Materials + products + labour = the estimated project cost, every line
 * with its quantity and price, grouped the way a builder would read it — finishes with their
 * m², doors and windows, furniture, lighting, sockets, pipes, heating, the bulk materials,
 * the labour — then the baskets per partner store and the platform's fee.
 */
export default function BudgetPage() {
  const t = useT();
  const locale = useLocale();
  const { plan, styleId, mode, budgetGel, items, finishes, electrical, styleProfile, homeState, projectId, calculatorPicks, excluded, toggleExcluded, setExcluded } = useDesignStore();
  const calculator = useCalculatorStore();
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const fees = usePlatformFees();

  const scene = useMemo(() => ({ styleId, mode, budgetGel, items, finishes, electrical, styleProfile, excluded }), [styleId, mode, budgetGel, items, finishes, electrical, styleProfile, excluded]);
  const { book } = useRateBook();
  const priceOptions = useMemo(
    () => ({ homeState: homeState ?? undefined, book, locale, surfaceLabels: { floor: t.design.finishFloor, wall: t.design.finishWall, ceiling: t.design.finishCeiling } }),
    [homeState, book, locale, t]
  );
  /** The project as it stands: what is being ordered. */
  const cost = useMemo(() => (plan ? priceScene(plan, scene, priceOptions) : null), [plan, scene, priceOptions]);
  /**
   * The same project with nothing ticked off, so the page can say what the ticks came to.
   * Priced twice rather than subtracted: a product that is out takes its delivery and its
   * labour with it, and only the engine knows that.
   */
  const fullCost = useMemo(
    () => (plan && excluded.length > 0 ? priceScene(plan, { ...scene, excluded: [] }, priceOptions) : null),
    [plan, scene, excluded.length, priceOptions]
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
  const designPart = designCheckoutPart(plan, items, finishes, fees.designFeePerM2, locale, excluded);
  const checkoutParts: CheckoutPart[] = [
    ...(calculatorPicks && calculator.rooms.length > 0 ? [calculatorCheckoutPart(calculator.rooms, calculator.selectedProducts, calculator.selectedFurniture, fees.calculatorFeePerM2, locale)] : []),
    ...(designPart ? [designPart] : []),
  ];
  const summary = budgetSummary(cost);
  const sections = budgetSections(cost);

  const isExcluded = (line: BudgetLine): boolean => {
    const id = productIdOf(line);
    return id != null && excluded.includes(id);
  };
  const excludedTotal = fullCost ? Math.round((fullCost.grandTotal - cost.grandTotal) * 100) / 100 : 0;

  /** The 2D plan as a PDF: the board's own drawing at print resolution, on one A4 sheet. */
  const exportPlan = async () => {
    setExporting(true);
    setError(null);
    try {
      await downloadPlanPdf(plan, `${t.design.title}-${new Date().toISOString().slice(0, 10)}`, {
        title: t.design.title,
        areaLabel: formatM2(areaM2),
        roomsLabel: fill(t.build.roomCount, { n: plan.rooms.length }),
        unitM2: t.units.m2,
        items,
        electrical,
        furniture: true,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const lineName = (line: BudgetLine): string => {
    if (line.key.startsWith('electrical_')) return electricalLabel(t, line.key.slice('electrical_'.length) as ElectricalKind);
    if (line.key.startsWith('technical_')) return technicalLabel(t, line.key.slice('technical_'.length) as TechnicalKind);
    if (line.key === 'window') return t.build.lineWindow;
    if (line.key === 'door') return t.build.lineDoor;
    if (line.key === 'entrance_door') return t.build.lineEntranceDoor;
    if (line.key === 'kitchen_run_custom') return t.build.lineKitchenRun;
    if (line.key === 'kitchen_island_custom') return t.build.lineKitchenIsland;
    if (line.section === 'labour') return workTypeLabel(t, line.key);
    if (line.section === 'materials') return materialLabel(t, line.key);
    return line.name ?? line.key;
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
        <p className="no-print mt-4 text-xs text-ink-muted">{excluded.length === 0 ? t.build.excludedNone : fill(t.build.excludedCount, { n: excluded.length })}</p>

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
            {SECTION_ORDER.map((section) => {
              const lines = cost.lines.filter((l) => l.section === section);
              if (lines.length === 0) return null;
              return (
                <section key={section} className="overflow-hidden rounded-[16px] border border-line bg-bg-surface">
                  <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                    <h3 className="font-serif text-lg font-semibold text-ink">{t.build[SECTION_KEY[section]]}</h3>
                    <span className="font-serif text-lg font-semibold tabular-nums text-ink">{formatGEL(sections[section])}</span>
                  </header>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-[0.12em] text-ink-muted">
                        <th className="px-4 py-2 text-left font-semibold">{t.build.colItem}</th>
                        <th className="px-2 py-2 text-right font-semibold">{t.build.colQty}</th>
                        <th className="px-2 py-2 text-right font-semibold">{t.build.colUnitPrice}</th>
                        <th className="px-4 py-2 text-right font-semibold">{t.build.colTotal}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line, i) => {
                        const productId = productIdOf(line);
                        return (
                        <tr key={`${line.key}-${i}`} className="border-t border-line/70">
                          <td className="px-4 py-2">
                            <p className="flex items-start gap-2 font-medium text-ink">
                              {productId != null && (
                                <input
                                  type="checkbox"
                                  checked
                                  onChange={() => toggleExcluded(productId)}
                                  aria-label={`${t.build.includeInOrder} — ${lineName(line)}`}
                                  className="no-print mt-0.5 accent-ink"
                                />
                              )}
                              {lineName(line)}
                            </p>
                            <p className="text-xs text-ink-muted">
                              {line.roomName}
                              {line.estimated && (
                                <span className={cn('ml-1.5 rounded-[4px] bg-sand px-1 py-px text-[10px] uppercase tracking-wide text-ink-muted')}>{t.build.estimated}</span>
                              )}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-ink-soft">
                            {formatNumber(line.qty)} {formatUnit(line.unit)}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-ink-muted">{formatGEL(line.unitPrice, line.unitPrice < 10)}</td>
                          <td className="whitespace-nowrap px-4 py-2 text-right font-semibold tabular-nums">{formatGEL(line.total)}</td>
                        </tr>
                        );
                      })}
                      {/* What was ticked off in this section, so it can be put back. */}
                      {(fullCost?.lines ?? []).filter((l) => l.section === section && isExcluded(l)).map((line, i) => {
                        const productId = productIdOf(line)!;
                        return (
                          <tr key={`out-${line.key}-${i}`} className="border-t border-line/70 text-ink-faint">
                            <td className="px-4 py-2">
                              <p className="flex items-start gap-2 font-medium line-through">
                                <input type="checkbox" checked={false} onChange={() => toggleExcluded(productId)} aria-label={`${t.build.includeInOrder} — ${lineName(line)}`} className="no-print mt-0.5 accent-ink" />
                                {lineName(line)}
                              </p>
                              <p className="text-xs">{line.roomName}</p>
                            </td>
                            <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                              {formatNumber(line.qty)} {formatUnit(line.unit)}
                            </td>
                            <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{formatGEL(line.unitPrice, line.unitPrice < 10)}</td>
                            <td className="whitespace-nowrap px-4 py-2 text-right font-semibold tabular-nums line-through">{formatGEL(line.total)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </section>
              );
            })}

            {/* Products, per partner store. */}
            {cost.baskets.length > 0 && <p className="eyebrow pt-2">{t.design.byStore}</p>}
            {cost.baskets.map((basket, index) => (
              <section key={basket.store?.id ?? `none-${index}`} className="overflow-hidden rounded-[16px] border border-line bg-bg-surface">
                <header className="flex items-center gap-4 border-b border-line p-4">
                  {basket.store?.logoUrl ? (
                    <Image src={basket.store.logoUrl} alt={localizedName(locale, basket.store)} width={40} height={40} className="rounded-[8px] border border-line" />
                  ) : (
                    <span className="grid h-10 w-10 place-items-center rounded-[8px] border border-line font-serif text-base font-semibold text-ink">{(basket.store ? localizedName(locale, basket.store) : '—').slice(0, 1)}</span>
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
                          {line.product.qty !== 1 && `${formatNumber(line.product.qty)} × `}
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
            <div className="rounded-[16px] border border-line bg-bg-surface">
              <div className="border-b border-line px-4 py-3">
                <p className="eyebrow">{t.design.grandTotal}</p>
              </div>
              <div className="space-y-2 p-4 text-sm">
                <MoneyRow label={t.design.furnitureTotal} value={cost.furnitureTotal} />
                {cost.finishesTotal > 0 && <MoneyRow label={t.design.finishesTotal} value={cost.finishesTotal} />}
                {cost.openingsTotal > 0 && <MoneyRow label={t.build.secOpenings} value={cost.openingsTotal} />}
                {cost.technicalTotal > 0 && <MoneyRow label={`${t.build.secElectrical} · ${t.build.secPlumbing}`} value={cost.technicalTotal} />}
                {mode === 'full' && (
                  <>
                    <MoneyRow label={t.design.materialsTotal} value={cost.materialsTotal} />
                    <MoneyRow label={t.design.labourTotal} value={cost.labourTotal} />
                  </>
                )}
                <MoneyRow label={t.design.delivery} value={cost.deliveryTotal} />
                {/* What the ticks came to: the whole estimate, what was taken out, what is left. */}
                {fullCost && (
                  <div className="mt-3 space-y-1.5 border-t border-line pt-3">
                    <MoneyRow label={t.build.fullEstimate} value={fullCost.grandTotal} muted />
                    <div className="flex items-baseline justify-between gap-3 text-danger">
                      <span>{t.build.excludedTotal}</span>
                      <span className="shrink-0 font-medium tabular-nums">−{formatGEL(excludedTotal)}</span>
                    </div>
                    <button type="button" onClick={() => setExcluded([])} className="no-print text-xs font-medium text-ink-muted underline underline-offset-2 hover:text-ink">
                      {t.build.includeAll}
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
