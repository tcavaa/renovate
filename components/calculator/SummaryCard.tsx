'use client';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useLocale, useT } from '@/lib/i18n/client';
import { materialLabel, workTypeLabel, phaseLabel, unitLabel, localizedName } from '@/lib/i18n/labels';
import type { ProjectSummary } from '@/lib/calculator/types';
import { MATERIAL_RATES_PER_M2 } from '@/lib/calculator/constants';
import { formatGEL, formatM2, formatNumber } from '@/lib/utils';
import { fill } from '@/lib/admin/list';
import { MoneyRow } from '@/components/ui/money-row';
import { Figure } from '@/components/calculator/MaterialsTable';

const TH = 'py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted';

/**
 * The estimate: the grand total as one large figure on an ink band, the four subtotals as a
 * hairline strip, every line in collapsible ledgers, and the arithmetic at the end.
 */
export interface PlatformFeeLine {
  perM2: number;
  m2: number;
  total: number;
}

export function SummaryCard({ summary, platformFee }: { summary: ProjectSummary; platformFee?: PlatformFeeLine }) {
  const t = useT();
  const locale = useLocale();
  const margin = summary.grandTotalWithMargin - summary.grandTotal;

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden bg-ink px-6 py-10 text-white md:px-10 md:py-14">
        <div className="grain absolute inset-0 opacity-60" />
        <p className="eyebrow relative text-white/60">{t.summary.grandTotalWithMargin}</p>
        <p className="display relative mt-4 text-[clamp(2.75rem,7vw,6rem)] tabular-nums">{formatGEL(summary.grandTotalWithMargin)}</p>
        <p className="relative mt-4 text-sm text-white/60">
          {t.summary.grandTotal} <span className="text-white">{formatGEL(summary.grandTotal)}</span>
          <span className="mx-2">+</span>
          {t.summary.contingency} <span className="text-white">{formatGEL(margin)}</span>
        </p>
      </div>

      <div className="grid border-t border-l border-line sm:grid-cols-2 lg:grid-cols-4">
        <Figure label={t.summary.materials} value={formatGEL(summary.subtotalMaterials)} />
        <Figure label={t.summary.products} value={formatGEL(summary.subtotalProducts)} />
        <Figure label={t.summary.furniture} value={formatGEL(summary.subtotalFurniture)} />
        <Figure label={t.summary.workers} value={formatGEL(summary.subtotalWorkers)} />
      </div>

      <div className="border border-line bg-bg-surface px-5">
        <Accordion type="multiple" defaultValue={['materials']}>
          <AccordionItem value="materials">
            <AccordionTrigger className="font-serif text-base">
              <span>
                {t.summary.materials} <span className="ml-2 text-sm font-normal text-ink-muted">({summary.materials.length})</span>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left">
                    <th className={TH}>{t.summary.item}</th>
                    <th className={`${TH} text-right`}>{t.summary.qty}</th>
                    <th className={`${TH} text-right`}>{t.summary.unitPrice}</th>
                    <th className={`${TH} text-right`}>{t.summary.total}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.materials.map((m) => {
                    const phase = MATERIAL_RATES_PER_M2[m.key]?.phase;
                    return (
                      <tr key={m.key} className="border-b border-line/60 last:border-0">
                        <td className="py-2 pr-2">
                          {materialLabel(t, m.key)}
                          {phase != null && <span className="ml-2 text-xs text-ink-muted">· {phaseLabel(t, phase)}</span>}
                        </td>
                        <td className="py-2 pr-2 text-right tabular-nums">
                          {formatNumber(m.qty)} {unitLabel(t, m.unit)}
                        </td>
                        <td className="py-2 pr-2 text-right tabular-nums text-ink-muted">{m.estimatedPriceGEL != null ? formatGEL(m.estimatedPriceGEL, true) : '—'}</td>
                        <td className="py-2 text-right font-medium tabular-nums">{m.estimatedPriceGEL != null ? formatGEL(m.qty * m.estimatedPriceGEL) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="products">
            <AccordionTrigger className="font-serif text-base">
              <span>
                {t.summary.products} <span className="ml-2 text-sm font-normal text-ink-muted">({summary.products.length})</span>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              {summary.products.length === 0 ? (
                <p className="py-4 text-sm text-ink-muted">{t.calculator.noProductsSelectedHint}</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {summary.products.map((p) => (
                      <tr key={`${p.productId}-${p.categorySlug ?? ''}-${p.roomId ?? ''}`} className="border-b border-line/60 last:border-0">
                        <td className="py-2 pr-2">
                          {localizedName(locale, p)}
                          {p.roomId && <span className="ml-2 text-xs text-ink-muted">· {summary.rooms.find((r) => r.id === p.roomId)?.nameKa ?? ''}</span>}
                        </td>
                        <td className="py-2 pr-2 text-right tabular-nums">
                          {formatNumber(p.qty)} {unitLabel(t, p.unit)}
                        </td>
                        <td className="py-2 text-right font-medium tabular-nums">{formatGEL(p.totalPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="furniture">
            <AccordionTrigger className="font-serif text-base">
              <span>
                {t.summary.furniture} <span className="ml-2 text-sm font-normal text-ink-muted">({summary.furniture.length})</span>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              {summary.furniture.length === 0 ? (
                <p className="py-4 text-sm text-ink-muted">{t.calculator.noFurnitureSelectedHint}</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {summary.furniture.map((p, i) => (
                      <tr key={`${p.productId}-${i}`} className="border-b border-line/60 last:border-0">
                        <td className="py-2 pr-2">{localizedName(locale, p)}</td>
                        <td className="py-2 text-right font-medium tabular-nums">{formatGEL(p.totalPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="workers" className="border-b-0">
            <AccordionTrigger className="font-serif text-base">
              <span>
                {t.summary.workers} <span className="ml-2 text-sm font-normal text-ink-muted">({summary.workerCosts.length})</span>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <table className="w-full text-sm">
                <tbody>
                  {summary.workerCosts.map((w) => (
                    <tr key={w.key} className="border-b border-line/60 last:border-0">
                      <td className="py-2 pr-2">{workTypeLabel(t, w.key)}</td>
                      <td className="py-2 pr-2 text-right tabular-nums text-ink-muted">
                        {formatNumber(w.qty)} {unitLabel(t, w.qtyUnit)}
                      </td>
                      <td className="py-2 text-right font-medium tabular-nums">{formatGEL(w.totalGEL)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      <div className="border border-line bg-bg-surface p-5 md:p-6">
        <div className="space-y-2">
          <MoneyRow label={t.summary.materials} value={summary.subtotalMaterials} />
          <MoneyRow label={t.summary.products} value={summary.subtotalProducts} />
          <MoneyRow label={t.summary.furniture} value={summary.subtotalFurniture} />
          <MoneyRow label={t.summary.workers} value={summary.subtotalWorkers} />
        </div>
        <div className="mt-4 space-y-2 border-t border-line pt-4">
          <MoneyRow label={t.summary.subtotal} value={summary.grandTotal} bold />
          <MoneyRow label={t.summary.contingency} value={margin} muted />
        </div>
        <div className="mt-4 flex items-baseline justify-between border-t-2 border-ink pt-4">
          <span className="font-serif text-lg font-semibold text-ink">{t.summary.grandTotalWithMargin}</span>
          <span className="font-serif text-3xl font-semibold tabular-nums text-ink">{formatGEL(summary.grandTotalWithMargin)}</span>
        </div>
        {platformFee && (
          <div className="mt-4 space-y-2 border-t border-line pt-4">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span>
                {t.market.feeCalculator}
                <span className="ml-2 text-xs text-ink-muted">{fill(t.market.platformFeeHint, { fee: formatGEL(platformFee.perM2), m2: formatM2(platformFee.m2) })}</span>
              </span>
              <span className="shrink-0 font-medium tabular-nums">{formatGEL(platformFee.total)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold text-ink">{t.market.totalWithFee}</span>
              <span className="font-serif text-xl font-semibold tabular-nums text-ink">{formatGEL(summary.grandTotalWithMargin + platformFee.total)}</span>
            </div>
            <p className="text-xs text-ink-muted">{t.market.feeNote}</p>
          </div>
        )}
      </div>
    </div>
  );
}
