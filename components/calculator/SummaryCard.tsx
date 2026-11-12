'use client';

import { useT } from '@/lib/i18n/client';
import { formatGEL } from '@/lib/utils';
import { MoneyRow } from '@/components/ui/money-row';
import { Figure } from '@/components/calculator/MaterialsTable';
import type { SheetTotals } from '@/lib/summary/calculatorSheet';

/**
 * The estimate: the grand total as one large lime figure on a black band, the four subtotals as a
 * hairline strip, the sheet itself (`children` — every line with its tick and its quantity,
 * the picks under the shop that sells them), and the arithmetic at the end.
 *
 * The figures are what the person made of the estimate. When they changed anything — a line
 * ticked out, a quantity of their own — the estimate as it was worked out stands beside
 * them: struck through under the big figure, and as its own rows in the arithmetic, with the
 * way back to it.
 */
export function SummaryCard({
  totals,
  original,
  fee,
  note,
  onResetEdits,
  children,
}: {
  totals: SheetTotals;
  /** The same totals with no edit applied; absent when nothing was edited. */
  original?: SheetTotals | null;
  /** The platform's fee, paid before the calculation started (`FeePaidNote`): a line under the total, not part of it. */
  fee?: React.ReactNode;
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
      <div className="relative overflow-hidden rounded-3xl bg-ink px-6 py-10 text-white [-webkit-print-color-adjust:exact] [print-color-adjust:exact] md:px-10 md:py-14">
        {/* Colour blocks in the corner: a tangerine half circle, a lilac slab, a sun square. */}
        <div className="no-print pointer-events-none absolute -right-10 bottom-0 hidden h-56 w-28 rounded-l-full bg-tangerine md:block" aria-hidden />
        <div className="no-print pointer-events-none absolute right-24 top-0 hidden h-28 w-20 bg-lilac lg:block" aria-hidden />
        <div className="no-print pointer-events-none absolute bottom-8 right-28 hidden h-10 w-10 bg-sun lg:block" aria-hidden />
        <p className="eyebrow relative text-white/60">{t.summary.grandTotalWithMargin}</p>
        <p className="display relative mt-4 text-[clamp(2.75rem,7vw,6rem)] tabular-nums text-lime">{formatGEL(totals.grandTotalWithMargin)}</p>
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

      <div className="overflow-hidden rounded-2xl border border-line">
        <div className="-mb-px -mr-px grid sm:grid-cols-2 lg:grid-cols-4">
          <Figure label={t.summary.materials} value={formatGEL(totals.subtotalMaterials)} />
          <Figure label={t.summary.products} value={formatGEL(totals.subtotalProducts)} />
          <Figure label={t.summary.furniture} value={formatGEL(totals.subtotalFurniture)} />
          <Figure label={t.summary.workers} value={formatGEL(totals.subtotalWorkers)} />
        </div>
      </div>

      {note && <p className="no-print text-xs text-ink-muted">{note}</p>}

      {children}

      <div className="rounded-2xl border border-line bg-bg-surface p-5 md:p-6">
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
              <button type="button" onClick={onResetEdits} className="no-print text-xs font-semibold text-ink-muted underline decoration-lime decoration-2 underline-offset-2 hover:text-ink">
                {t.build.resetEdits}
              </button>
            )}
          </div>
        )}
        <div className="mt-5 flex items-baseline justify-between gap-3 rounded-2xl bg-lime px-4 py-4 text-ink [-webkit-print-color-adjust:exact] [print-color-adjust:exact] md:px-5">
          <span className="font-display text-lg">{t.summary.grandTotalWithMargin}</span>
          <span className="font-display text-3xl tabular-nums">{formatGEL(totals.grandTotalWithMargin)}</span>
        </div>
        {fee && <div className="mt-4 border-t border-line pt-4">{fee}</div>}
      </div>
    </div>
  );
}
