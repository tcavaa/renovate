'use client';

import { useT } from '@/lib/i18n/client';
import { formatGEL, formatM2 } from '@/lib/utils';
import { fill } from '@/lib/admin/list';
import { MoneyRow } from '@/components/ui/money-row';
import { Figure } from '@/components/calculator/MaterialsTable';
import type { SheetTotals } from '@/lib/summary/calculatorSheet';

/**
 * The estimate: the grand total as one large figure on an ink band, the four subtotals as a
 * hairline strip, the sheet itself (`children` — every line with its tick and its quantity,
 * the picks under the shop that sells them), and the arithmetic at the end.
 *
 * The figures are what the person made of the estimate. When they changed anything — a line
 * ticked out, a quantity of their own — the estimate as it was worked out stands beside
 * them: struck through under the big figure, and as its own rows in the arithmetic, with the
 * way back to it.
 */
export interface PlatformFeeLine {
  perM2: number;
  m2: number;
  total: number;
}

export function SummaryCard({
  totals,
  original,
  platformFee,
  note,
  onResetEdits,
  children,
}: {
  totals: SheetTotals;
  /** The same totals with no edit applied; absent when nothing was edited. */
  original?: SheetTotals | null;
  platformFee?: PlatformFeeLine;
  /** A line under the subtotals: how to use the sheet, and how much of it was edited. */
  note?: React.ReactNode;
  onResetEdits?: () => void;
  children?: React.ReactNode;
}) {
  const t = useT();
  const margin = totals.grandTotalWithMargin - totals.grandTotal;
  const delta = original ? Math.round((totals.grandTotalWithMargin - original.grandTotalWithMargin) * 100) / 100 : 0;

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden bg-ink px-6 py-10 text-white md:px-10 md:py-14">
        <div className="grain absolute inset-0 opacity-60" />
        <p className="eyebrow relative text-white/60">{t.summary.grandTotalWithMargin}</p>
        <p className="display relative mt-4 text-[clamp(2.75rem,7vw,6rem)] tabular-nums">{formatGEL(totals.grandTotalWithMargin)}</p>
        <p className="relative mt-4 text-sm text-white/60">
          {t.summary.grandTotal} <span className="text-white">{formatGEL(totals.grandTotal)}</span>
          <span className="mx-2">+</span>
          {t.summary.contingency} <span className="text-white">{formatGEL(margin)}</span>
          {original && (
            <>
              <span className="mx-2">·</span>
              {t.build.originalEstimate} <s className="text-white/80">{formatGEL(original.grandTotalWithMargin)}</s>
            </>
          )}
        </p>
      </div>

      <div className="grid border-t border-l border-line sm:grid-cols-2 lg:grid-cols-4">
        <Figure label={t.summary.materials} value={formatGEL(totals.subtotalMaterials)} />
        <Figure label={t.summary.products} value={formatGEL(totals.subtotalProducts)} />
        <Figure label={t.summary.furniture} value={formatGEL(totals.subtotalFurniture)} />
        <Figure label={t.summary.workers} value={formatGEL(totals.subtotalWorkers)} />
      </div>

      {note && <p className="no-print text-xs text-ink-muted">{note}</p>}

      {children}

      <div className="border border-line bg-bg-surface p-5 md:p-6">
        <div className="space-y-2">
          <MoneyRow label={t.summary.materials} value={totals.subtotalMaterials} />
          <MoneyRow label={t.summary.products} value={totals.subtotalProducts} />
          <MoneyRow label={t.summary.furniture} value={totals.subtotalFurniture} />
          <MoneyRow label={t.summary.workers} value={totals.subtotalWorkers} />
        </div>
        <div className="mt-4 space-y-2 border-t border-line pt-4">
          <MoneyRow label={t.summary.subtotal} value={totals.grandTotal} bold />
          <MoneyRow label={t.summary.contingency} value={margin} muted />
        </div>
        {original && (
          <div className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
            <MoneyRow label={t.build.originalEstimate} value={original.grandTotalWithMargin} muted />
            <div className={delta < 0 ? 'flex items-baseline justify-between gap-3 text-danger' : 'flex items-baseline justify-between gap-3'}>
              <span>{t.build.editsChange}</span>
              <span className="shrink-0 font-medium tabular-nums">
                {delta < 0 ? '−' : '+'}
                {formatGEL(Math.abs(delta))}
              </span>
            </div>
            {onResetEdits && (
              <button type="button" onClick={onResetEdits} className="no-print text-xs font-medium text-ink-muted underline underline-offset-2 hover:text-ink">
                {t.build.resetEdits}
              </button>
            )}
          </div>
        )}
        <div className="mt-4 flex items-baseline justify-between border-t-2 border-ink pt-4">
          <span className="font-serif text-lg font-semibold text-ink">{t.summary.grandTotalWithMargin}</span>
          <span className="font-serif text-3xl font-semibold tabular-nums text-ink">{formatGEL(totals.grandTotalWithMargin)}</span>
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
              <span className="font-serif text-xl font-semibold tabular-nums text-ink">{formatGEL(totals.grandTotalWithMargin + platformFee.total)}</span>
            </div>
            <p className="text-xs text-ink-muted">{t.market.feeNote}</p>
          </div>
        )}
      </div>
    </div>
  );
}
