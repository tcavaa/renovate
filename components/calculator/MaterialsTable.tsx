'use client';

import { useT } from '@/lib/i18n/client';
import { MATERIAL_RATES_PER_M2 } from '@/lib/calculator/constants';
import { materialLabel, workTypeLabel, phaseLabel, unitLabel } from '@/lib/i18n/labels';
import type { MaterialItem, WorkerCost } from '@/lib/calculator/types';
import { formatGEL, formatNumber } from '@/lib/utils';

const TH = 'px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-ink-muted';
const TD = 'px-4 py-2.5 align-top';

/**
 * The computed bill of materials as a ledger: one rounded table card per renovation phase, the
 * labour table after them, and the two subtotals as large figures at the end.
 */
export function MaterialsTable({ materials, workerCosts }: { materials: MaterialItem[]; workerCosts: WorkerCost[] }) {
  const t = useT();
  const grouped = materials.reduce<Record<number, MaterialItem[]>>((acc, m) => {
    const phase = MATERIAL_RATES_PER_M2[m.key]?.phase ?? 99;
    (acc[phase] ??= []).push(m);
    return acc;
  }, {});
  const phases = Object.keys(grouped)
    .map(Number)
    .sort((a, b) => a - b);

  const totalMaterials = materials.reduce((s, m) => s + m.qty * (m.estimatedPriceGEL ?? 0), 0);
  const totalWorkers = workerCosts.reduce((s, w) => s + w.totalGEL, 0);

  return (
    <div className="space-y-10">
      {phases.map((phase) => (
        <section key={phase}>
          <header className="flex items-baseline gap-3 pb-3">
            <span className="font-serif text-xl font-semibold leading-none tabular-nums text-wood">{String(phase).padStart(2, '0')}</span>
            <h3 className="font-serif text-lg font-semibold text-ink">{phaseLabel(t, phase)}</h3>
          </header>
          <div className="overflow-x-auto rounded-2xl border border-line bg-bg-surface shadow-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-sand/50 text-left">
                  <th className={TH}>{t.calculator.materialName}</th>
                  <th className={`${TH} text-right`}>{t.calculator.quantity}</th>
                  <th className={`${TH} text-right`}>{t.calculator.estimatedPrice}</th>
                  <th className={`${TH} text-right`}>{t.calculator.total}</th>
                </tr>
              </thead>
              <tbody>
                {grouped[phase]?.map((m) => {
                  const total = m.qty * (m.estimatedPriceGEL ?? 0);
                  return (
                    <tr key={m.key} className="border-b border-line/60 transition-colors last:border-0 hover:bg-sand-light/50">
                      <td className={`${TD} text-ink`}>{materialLabel(t, m.key)}</td>
                      <td className={`${TD} text-right tabular-nums text-ink-soft`}>
                        {formatNumber(m.qty)} {unitLabel(t, m.unit)}
                      </td>
                      <td className={`${TD} text-right tabular-nums text-ink-muted`}>
                        {m.estimatedPriceGEL != null ? `${formatGEL(m.estimatedPriceGEL, true)} / ${unitLabel(t, m.unit)}` : '—'}
                      </td>
                      <td className={`${TD} text-right font-medium tabular-nums`}>{total > 0 ? formatGEL(total) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section>
        <header className="flex items-baseline gap-3 pb-3">
          <span className="rounded-full bg-olive-soft px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-olive">{t.calculator.workersBadge}</span>
          <h3 className="font-serif text-lg font-semibold text-ink">{t.calculator.workersCost}</h3>
        </header>
        <div className="overflow-x-auto rounded-2xl border border-line bg-bg-surface shadow-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-sand/50 text-left">
                <th className={TH}>{t.calculator.workLabel}</th>
                <th className={`${TH} text-right`}>{t.calculator.quantity}</th>
                <th className={`${TH} text-right`}>{t.calculator.pricePerUnit}</th>
                <th className={`${TH} text-right`}>{t.calculator.total}</th>
              </tr>
            </thead>
            <tbody>
              {workerCosts.map((w) => (
                <tr key={w.key} className="border-b border-line/60 transition-colors last:border-0 hover:bg-sand-light/50">
                  <td className={`${TD} text-ink`}>{workTypeLabel(t, w.key)}</td>
                  <td className={`${TD} text-right tabular-nums text-ink-soft`}>
                    {formatNumber(w.qty)} {unitLabel(t, w.qtyUnit)}
                  </td>
                  <td className={`${TD} text-right tabular-nums text-ink-muted`}>{formatGEL(w.pricePerQty, !Number.isInteger(w.pricePerQty))}</td>
                  <td className={`${TD} text-right font-medium tabular-nums`}>{formatGEL(w.totalGEL)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="overflow-hidden rounded-2xl border border-line">
        <div className="-mb-px -mr-px grid sm:grid-cols-2">
          <Figure label={t.calculator.materialCost} value={formatGEL(totalMaterials)} />
          <Figure label={t.calculator.workerCost} value={formatGEL(totalWorkers)} />
        </div>
      </div>
    </div>
  );
}

/** One large figure with its label, drawn as a cell of a hairline grid. */
export function Figure({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="border-b border-r border-line bg-bg-surface px-5 py-5">
      <p className="eyebrow">{label}</p>
      <p className={`mt-2 font-serif font-semibold leading-none tabular-nums text-ink ${emphasis ? 'text-4xl' : 'text-3xl'}`}>{value}</p>
    </div>
  );
}
