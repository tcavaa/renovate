'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Card, CardContent } from '@/components/ui/card';
import { useT } from '@/lib/i18n/client';
import {
  materialLabel,
  workTypeLabel,
  phaseLabel,
  unitLabel,
} from '@/lib/i18n/labels';
import type { ProjectSummary } from '@/lib/calculator/types';
import { MATERIAL_RATES_PER_M2 } from '@/lib/calculator/constants';
import { formatGEL, formatNumber } from '@/lib/utils';
import { MoneyRow } from '@/components/ui/money-row';

export function SummaryCard({ summary }: { summary: ProjectSummary }) {
  const ka = useT();
  return (
    <div className="space-y-6">
      {/* Hero total */}
      <Card className="border-brand/20 bg-gradient-to-br from-brand to-brand-dark text-white shadow-cardHover">
        <CardContent className="p-8 text-center">
          <p className="text-sm uppercase tracking-wide text-white/80">
            {ka.summary.grandTotalWithMargin}
          </p>
          <p className="mt-2 font-serif text-5xl font-bold">
            {formatGEL(summary.grandTotalWithMargin)}
          </p>
          <p className="mt-2 text-sm text-white/80">
            {ka.summary.grandTotal} {formatGEL(summary.grandTotal)} +{' '}
            {ka.summary.contingency} {formatGEL(summary.grandTotalWithMargin - summary.grandTotal)}
          </p>
        </CardContent>
      </Card>

      {/* Subtotals grid */}
      <div className="grid gap-3 sm:grid-cols-4">
        <SubtotalCard label={ka.summary.materials} value={summary.subtotalMaterials} accent="brand" />
        <SubtotalCard label={ka.summary.products} value={summary.subtotalProducts} accent="accent" />
        <SubtotalCard label={ka.summary.furniture} value={summary.subtotalFurniture} accent="success" />
        <SubtotalCard label={ka.summary.workers} value={summary.subtotalWorkers} accent="slate" />
      </div>

      {/* Detailed accordion */}
      <Card>
        <CardContent className="p-2 sm:p-6">
          <Accordion type="multiple" defaultValue={['materials']}>
            <AccordionItem value="materials">
              <AccordionTrigger>
                <span>
                  {ka.summary.materials}{' '}
                  <span className="ml-2 font-normal text-ink-muted">
                    ({summary.materials.length})
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                      <th className="py-2 pr-2">{ka.summary.item}</th>
                      <th className="py-2 pr-2 text-right">{ka.summary.qty}</th>
                      <th className="py-2 pr-2 text-right">{ka.summary.unitPrice}</th>
                      <th className="py-2 text-right">{ka.summary.total}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.materials.map((m) => {
                      const phase = MATERIAL_RATES_PER_M2[m.key]?.phase;
                      return (
                        <tr key={m.key} className="border-b border-line/40 last:border-0">
                          <td className="py-2 pr-2">
                            {materialLabel(ka, m.key)}
                            {phase != null && (
                              <span className="ml-2 text-xs text-ink-muted">
                                · {phaseLabel(ka, phase)}
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-2 text-right tabular-nums">
                            {formatNumber(m.qty)} {unitLabel(ka, m.unit)}
                          </td>
                          <td className="py-2 pr-2 text-right text-ink-muted tabular-nums">
                            {m.estimatedPriceGEL != null ? formatGEL(m.estimatedPriceGEL, true) : '—'}
                          </td>
                          <td className="py-2 text-right font-medium tabular-nums">
                            {m.estimatedPriceGEL != null
                              ? formatGEL(m.qty * m.estimatedPriceGEL)
                              : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="products">
              <AccordionTrigger>
                <span>
                  {ka.summary.products}{' '}
                  <span className="ml-2 font-normal text-ink-muted">
                    ({summary.products.length})
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                {summary.products.length === 0 ? (
                  <p className="text-sm text-ink-muted py-4">
                    {ka.calculator.noProductsSelectedHint}
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <tbody>
                      {summary.products.map((p) => (
                        <tr
                          key={`${p.productId}-${p.categorySlug ?? ''}`}
                          className="border-b border-line/40 last:border-0"
                        >
                          <td className="py-2 pr-2">{p.nameKa}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">
                            {formatNumber(p.qty)} {unitLabel(ka, p.unit)}
                          </td>
                          <td className="py-2 text-right font-medium tabular-nums">
                            {formatGEL(p.totalPrice)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="furniture">
              <AccordionTrigger>
                <span>
                  {ka.summary.furniture}{' '}
                  <span className="ml-2 font-normal text-ink-muted">
                    ({summary.furniture.length})
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                {summary.furniture.length === 0 ? (
                  <p className="text-sm text-ink-muted py-4">{ka.calculator.noFurnitureSelectedHint}</p>
                ) : (
                  <table className="w-full text-sm">
                    <tbody>
                      {summary.furniture.map((p, i) => (
                        <tr key={`${p.productId}-${i}`} className="border-b border-line/40 last:border-0">
                          <td className="py-2 pr-2">{p.nameKa}</td>
                          <td className="py-2 text-right font-medium tabular-nums">
                            {formatGEL(p.totalPrice)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="workers">
              <AccordionTrigger>
                <span>
                  {ka.summary.workers}{' '}
                  <span className="ml-2 font-normal text-ink-muted">
                    ({summary.workerCosts.length})
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <table className="w-full text-sm">
                  <tbody>
                    {summary.workerCosts.map((w) => (
                      <tr key={w.key} className="border-b border-line/40 last:border-0">
                        <td className="py-2 pr-2">{workTypeLabel(ka, w.key)}</td>
                        <td className="py-2 pr-2 text-right tabular-nums text-ink-muted">
                          {formatNumber(w.qty)} {unitLabel(ka, w.qtyUnit)}
                        </td>
                        <td className="py-2 text-right font-medium tabular-nums">
                          {formatGEL(w.totalGEL)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* Footer totals */}
      <Card>
        <CardContent className="p-6 space-y-3">
          <MoneyRow label={ka.summary.materials} value={summary.subtotalMaterials} />
          <MoneyRow label={ka.summary.products} value={summary.subtotalProducts} />
          <MoneyRow label={ka.summary.furniture} value={summary.subtotalFurniture} />
          <MoneyRow label={ka.summary.workers} value={summary.subtotalWorkers} />
          <div className="border-t border-line pt-3">
            <MoneyRow label={ka.summary.subtotal} value={summary.grandTotal} bold />
            <MoneyRow
              label={`${ka.summary.contingency}`}
              value={summary.grandTotalWithMargin - summary.grandTotal}
              muted
            />
            <div className="mt-3 flex items-center justify-between">
              <span className="font-serif text-lg font-bold">{ka.summary.grandTotalWithMargin}</span>
              <span className="font-serif text-2xl font-bold text-brand">
                {formatGEL(summary.grandTotalWithMargin)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SubtotalCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: 'brand' | 'accent' | 'success' | 'slate';
}) {
  const colorMap: Record<typeof accent, string> = {
    brand: 'text-brand',
    accent: 'text-accent-dark',
    success: 'text-success',
    slate: 'text-slate-deep',
  };
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-ink-muted">{label}</p>
        <p className={`mt-1 font-serif text-xl font-bold ${colorMap[accent]}`}>
          {formatGEL(value)}
        </p>
      </CardContent>
    </Card>
  );
}

