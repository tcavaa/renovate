'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useT } from '@/lib/i18n/client';
import { MATERIAL_RATES_PER_M2 } from '@/lib/calculator/constants';
import {
  materialLabel,
  workTypeLabel,
  phaseLabel,
  unitLabel,
} from '@/lib/i18n/labels';
import type { MaterialItem, WorkerCost } from '@/lib/calculator/types';
import { formatGEL, formatNumber } from '@/lib/utils';

export function MaterialsTable({
  materials,
  workerCosts,
}: {
  materials: MaterialItem[];
  workerCosts: WorkerCost[];
}) {
  const ka = useT();
  const grouped = materials.reduce<Record<number, MaterialItem[]>>((acc, m) => {
    const phase = MATERIAL_RATES_PER_M2[m.key]?.phase ?? 99;
    if (!acc[phase]) acc[phase] = [];
    acc[phase].push(m);
    return acc;
  }, {});

  const sortedPhases = Object.keys(grouped)
    .map(Number)
    .sort((a, b) => a - b);

  const totalMaterialsCost = materials.reduce(
    (s, m) => s + m.qty * (m.estimatedPriceGEL ?? 0),
    0
  );
  const totalWorkerCost = workerCosts.reduce((s, w) => s + w.totalGEL, 0);

  return (
    <div className="space-y-8">
      {sortedPhases.map((phase) => (
        <Card key={phase}>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Badge>{phase}</Badge>
              {phaseLabel(ka, phase)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                    <th className="pb-3 pr-3">{ka.calculator.materialName}</th>
                    <th className="pb-3 pr-3 text-right">{ka.calculator.quantity}</th>
                    <th className="pb-3 pr-3 text-right">{ka.calculator.estimatedPrice}</th>
                    <th className="pb-3 text-right">{ka.calculator.total}</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped[phase]?.map((m) => {
                    const total = m.qty * (m.estimatedPriceGEL ?? 0);
                    return (
                      <tr key={m.key} className="border-b border-line/60 last:border-0">
                        <td className="py-3 pr-3">{materialLabel(ka, m.key)}</td>
                        <td className="py-3 pr-3 text-right tabular-nums">
                          {formatNumber(m.qty)} {unitLabel(ka, m.unit)}
                        </td>
                        <td className="py-3 pr-3 text-right text-ink-muted tabular-nums">
                          {m.estimatedPriceGEL != null
                            ? `${formatGEL(m.estimatedPriceGEL, true)} / ${unitLabel(ka, m.unit)}`
                            : '—'}
                        </td>
                        <td className="py-3 text-right font-medium tabular-nums">
                          {total > 0 ? formatGEL(total) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Worker costs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <Badge variant="secondary">{ka.calculator.workersBadge}</Badge>
            {ka.calculator.workersCost}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="pb-3 pr-3">{ka.calculator.workLabel}</th>
                  <th className="pb-3 pr-3 text-right">{ka.calculator.quantity}</th>
                  <th className="pb-3 pr-3 text-right">{ka.calculator.pricePerUnit}</th>
                  <th className="pb-3 text-right">{ka.calculator.total}</th>
                </tr>
              </thead>
              <tbody>
                {workerCosts.map((w) => (
                  <tr key={w.key} className="border-b border-line/60 last:border-0">
                    <td className="py-3 pr-3">{workTypeLabel(ka, w.key)}</td>
                    <td className="py-3 pr-3 text-right tabular-nums">
                      {formatNumber(w.qty)} {unitLabel(ka, w.qtyUnit)}
                    </td>
                    <td className="py-3 pr-3 text-right text-ink-muted tabular-nums">
                      {formatGEL(w.pricePerQty)}
                    </td>
                    <td className="py-3 text-right font-medium tabular-nums">
                      {formatGEL(w.totalGEL)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Subtotals */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <span className="text-sm text-ink-muted">{ka.calculator.materialCost}</span>
            <span className="font-serif text-2xl font-bold text-brand">
              {formatGEL(totalMaterialsCost)}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <span className="text-sm text-ink-muted">{ka.calculator.workerCost}</span>
            <span className="font-serif text-2xl font-bold text-slate-deep">
              {formatGEL(totalWorkerCost)}
            </span>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
