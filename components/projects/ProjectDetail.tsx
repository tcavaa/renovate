import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Figure } from '@/components/calculator/MaterialsTable';
import { PlanSketch } from '@/components/projects/PlanSketch';
import { MoneyRow } from '@/components/ui/money-row';
import type { Project } from '@/lib/db/schema';
import type { Dictionary } from '@/lib/i18n/ka';
import type { Locale } from '@/lib/i18n';
import { formatM2L, homeStateLabel, roomTypeLabel, statusLabel } from '@/lib/i18n/labels';
import { formatGEL, cn } from '@/lib/utils';
import type { Room } from '@/lib/calculator/types';
import type { FloorPlan } from '@/lib/design/types';
import { projectKind } from '@/lib/projects/saved';
import type { ProjectSheets } from '@/lib/projects/sheets';
import { BudgetSheet } from '@/components/budget/BudgetSheet';
import { fill } from '@/lib/admin/list';
import { ProjectKindTags } from '@/components/projects/ProjectKindTags';
import { FoldSection } from '@/components/projects/FoldSection';

/**
 * A saved project, in full: meta, the layout, the rooms, and the sheet of each journey the
 * project went through — the calculator's estimate and the 3D design's budget — exactly as
 * it was left on the summary, with what was worked out still showing under every edit: a
 * line ticked off stands struck through where it stood, a changed quantity has the
 * calculated one beside it, and the breakdown says what the changes came to.
 *
 * Rendered identically for the owner (`/profile/projects/[id]`) and for admin
 * (`/admin/projects/[id]`); only the back link, the actions and any extra meta rows differ.
 * Server component — the caller loads the project and prices it with the current rate book.
 */
export interface MetaItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}

export function dateLocaleFor(locale: Locale): string {
  return locale === 'ka' ? 'ka-GE' : locale === 'ru' ? 'ru-RU' : 'en-US';
}

export function ProjectDetail({
  project,
  sheets,
  t,
  locale,
  backHref,
  backLabel,
  extraMeta = [],
  actions,
  renders,
  orders,
}: {
  project: Project;
  /** Both halves priced as saved, with and without the edits (`loadProjectSheets`). */
  sheets: ProjectSheets;
  t: Dictionary;
  locale: Locale;
  backHref: string;
  backLabel: string;
  extraMeta?: MetaItem[];
  /** Buttons on the right of the head — the owner gets "open in 3D". */
  actions?: React.ReactNode;
  /** The photos and renders block, one of the folding blocks before the breakdown. */
  renders?: React.ReactNode;
  /** The orders placed against the project — the last folding block before the breakdown. */
  orders?: React.ReactNode;
}) {
  const rooms = (project.rooms ?? []) as Room[];
  const plan = (project.plan as FloorPlan | null) ?? null;
  const { calculator, design } = sheets;
  const kind = projectKind(project);
  const isDesign = kind.hasDesign;
  const kindLabel = [kind.hasCalculator ? t.profile.typeCalculator : null, kind.hasDesign ? t.profile.typeDesign : null].filter(Boolean).join(' + ') || t.profile.typeCalculator;
  const facts: Array<{ label: string; value: string }> = [
    { label: 'ID', value: `#${project.id}` },
    { label: t.profile.colType, value: kindLabel },
    { label: t.profile.metaCreated, value: new Date(project.createdAt).toLocaleString(dateLocaleFor(locale)) },
    { label: t.summary.homeState, value: homeStateLabel(t, project.homeState) },
    ...extraMeta.map((m) => ({ label: m.label, value: m.value })),
  ];

  return (
    <div className="py-4 md:py-8">
      <Link href={backHref} className="inline-flex items-center gap-2 text-sm text-ink-muted transition-colors hover:text-ink">
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </Link>

      {/* Title on its own line, the actions under it: side by side the buttons squeezed the name into a column of words. */}
      <header className="mt-4 border-b border-line pb-8">
        <div className="flex flex-wrap items-center gap-2">
          <ProjectKindTags t={t} kind={kind} />
          <span className={cn('border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]', project.status === 'saved' ? 'border-success/50 text-success' : 'border-line text-ink-muted')}>{statusLabel(t, project.status ?? 'draft')}</span>
        </div>
        <h1 className="mt-3 max-w-4xl font-serif text-3xl font-bold leading-[1.05] tracking-tight text-ink md:text-[2.75rem]">
          {project.nameKa ?? t.profile.fallbackName} <span className="text-ink-faint">#{project.id}</span>
        </h1>
        {actions && <div className="mt-6 flex flex-wrap items-center gap-2">{actions}</div>}
      </header>

      <dl className="mt-6 grid border-l border-t border-line sm:grid-cols-2 lg:grid-cols-4">
        {facts.map((f) => (
          <div key={f.label} className="border-b border-r border-line px-4 py-3">
            <dt className="eyebrow">{f.label}</dt>
            <dd className="mt-1 truncate text-sm font-medium text-ink">{f.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 grid border-l border-t border-line sm:grid-cols-2 lg:grid-cols-4">
        {calculator ? (
          <>
            <Figure label={t.summary.materials} value={formatGEL(calculator.subtotalMaterials + calculator.subtotalProducts)} />
            <Figure label={t.summary.furniture} value={formatGEL(calculator.subtotalFurniture)} />
            <Figure label={t.summary.workers} value={formatGEL(calculator.subtotalWorkers)} />
            {design ? <Figure label={t.profile.designBudgetTotal} value={formatGEL(design.grandTotal)} emphasis /> : <Figure label={t.summary.grandTotalWithMargin} value={formatGEL(calculator.grandTotalWithMargin)} emphasis />}
          </>
        ) : (
          design && <Figure label={t.profile.designBudgetTotal} value={formatGEL(design.grandTotal)} emphasis />
        )}
      </div>

      {/* Every block folds on its title; the breakdown at the end stays open. */}
      <div className="mt-8">
        <FoldSection title={`${t.calculator.layoutTitle} · ${t.summary.rooms}`} count={rooms.length} aside={<span className="font-serif text-lg font-semibold text-ink">{formatM2L(t, Number(project.totalM2))}</span>}>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div>
          {rooms.length > 0 || plan ? (
            <div className="border border-line bg-white p-4">
              <PlanSketch plan={plan} rooms={rooms} className="block h-auto w-full" />
            </div>
          ) : (
            <p className="border border-dashed border-line p-10 text-center text-sm text-ink-muted">{t.profile.layoutEmpty}</p>
          )}
        </div>

        <div>
          {rooms.length === 0 ? (
            <p className="border border-dashed border-line p-10 text-center text-sm text-ink-muted">{t.summary.roomsEmpty}</p>
          ) : (
            <ul className="border border-line bg-bg-surface">
              {rooms.map((r, i) => (
                <li key={r.id} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                  <span className="text-xs tabular-nums text-ink-faint">{String(i + 1).padStart(2, '0')}</span>
                  <div className="min-w-0">
                    <p className="truncate font-serif text-base font-semibold text-ink">
                      {r.nameKa}
                      {r.isWetRoom && <span className="ml-2 border border-line px-1 py-px text-[10px] font-medium uppercase tracking-wide text-ink-muted">{t.rooms.wet}</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {roomTypeLabel(t, r.type)}
                      <span className="mx-1.5 text-ink-faint">·</span>
                      <span className="tabular-nums">
                        {r.width} × {r.length} × {r.height} {t.units.m}
                      </span>
                      <span className="mx-1.5 text-ink-faint">·</span>
                      <span className="tabular-nums">
                        {t.rooms.wallsLabel} {formatM2L(t, r.wallM2)}
                      </span>
                    </p>
                  </div>
                  <span className="font-serif text-base font-semibold tabular-nums text-ink">{formatM2L(t, r.floorM2)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        </div>
        </FoldSection>

        {calculator && calculator.lines.length > 0 && (
          <FoldSection title={t.profile.sheetCalculator} count={calculator.lines.length} aside={<SheetAside total={calculator.grandTotalWithMargin} original={calculator.original?.grandTotalWithMargin ?? null} />} defaultOpen>
            <p className="mb-4 text-sm text-ink-muted">{calculator.original ? fill(t.profile.sheetEdited, { out: calculator.excludedCount, changed: calculator.changedCount }) : t.profile.sheetUnedited}</p>
            <BudgetSheet lines={calculator.lines} />
          </FoldSection>
        )}

        {design && design.lines.length > 0 && (
          <FoldSection title={t.profile.sheetDesign} count={design.lines.length} aside={<SheetAside total={design.grandTotal} original={design.originalGrandTotal} />} defaultOpen={!calculator}>
            <p className="mb-4 text-sm text-ink-muted">{design.originalGrandTotal != null ? fill(t.profile.sheetEdited, { out: design.excludedCount, changed: design.changedCount }) : t.profile.sheetUnedited}</p>
            <BudgetSheet lines={design.lines} />
          </FoldSection>
        )}

        {renders}

        {orders}

        <Section title={t.summary.breakdown} className="pt-8">
          <div className="grid gap-6 lg:grid-cols-2">
            {calculator && (
              <div className="border border-line bg-bg-surface p-5 md:p-6">
                <p className="eyebrow mb-3">{t.profile.sheetCalculator}</p>
                <div className="space-y-2">
                  <MoneyRow label={t.summary.materials} value={calculator.subtotalMaterials + calculator.subtotalProducts} />
                  <MoneyRow label={t.summary.furniture} value={calculator.subtotalFurniture} />
                  <MoneyRow label={t.summary.workers} value={calculator.subtotalWorkers} />
                </div>
                <div className="mt-4 space-y-2 border-t border-line pt-4">
                  <MoneyRow label={t.summary.grandTotal} value={calculator.grandTotal} bold />
                  <MoneyRow label={t.summary.contingency} value={calculator.grandTotalWithMargin - calculator.grandTotal} muted />
                </div>
                {calculator.original && <EditsRows t={t} original={calculator.original.grandTotalWithMargin} edited={calculator.grandTotalWithMargin} />}
                <div className="mt-4 flex items-baseline justify-between border-t-2 border-ink pt-4">
                  <span className="font-serif text-lg font-semibold text-ink">{t.summary.grandTotalWithMargin}</span>
                  <span className="font-serif text-3xl font-semibold tabular-nums text-ink">{formatGEL(calculator.grandTotalWithMargin)}</span>
                </div>
              </div>
            )}
            {design && (
              <div className="border border-line bg-bg-surface p-5 md:p-6">
                <p className="eyebrow mb-3">{t.profile.sheetDesign}</p>
                {design.originalGrandTotal != null && <EditsRows t={t} original={design.originalGrandTotal} edited={design.grandTotal} flush />}
                <div className={cn('flex items-baseline justify-between', design.originalGrandTotal != null && 'mt-4 border-t-2 border-ink pt-4')}>
                  <span className="font-serif text-lg font-semibold text-ink">{t.profile.designBudgetTotal}</span>
                  <span className="font-serif text-3xl font-semibold tabular-nums text-ink">{formatGEL(design.grandTotal)}</span>
                </div>
              </div>
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

function Section({ title, count, aside, className, children }: { title: string; count?: number; aside?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={className}>
      <div className="mb-4 flex items-baseline justify-between border-b border-line pb-3">
        <h2 className="font-serif text-2xl font-semibold text-ink">{title}</h2>
        {aside ?? (count !== undefined && <span className="text-sm tabular-nums text-ink-muted">{count}</span>)}
      </div>
      {children}
    </section>
  );
}

/** A sheet's total at the head of its block, the one that was worked out struck through beside it when it was edited. */
function SheetAside({ total, original }: { total: number; original: number | null }) {
  return (
    <span className="flex items-baseline gap-2">
      {original != null && <s className="text-sm tabular-nums text-ink-faint">{formatGEL(original)}</s>}
      <span className="font-serif text-lg font-semibold tabular-nums text-ink">{formatGEL(total)}</span>
    </span>
  );
}

/** What was worked out, and what the person's changes came to — under it or over it. */
function EditsRows({ t, original, edited, flush = false }: { t: Dictionary; original: number; edited: number; flush?: boolean }) {
  const delta = Math.round((edited - original) * 100) / 100;
  return (
    <div className={cn('space-y-2 text-sm', !flush && 'mt-4 border-t border-line pt-4')}>
      <MoneyRow label={t.build.originalEstimate} value={original} muted />
      <div className={cn('flex items-baseline justify-between gap-3', delta < 0 && 'text-danger')}>
        <span>{t.build.editsChange}</span>
        <span className="shrink-0 font-medium tabular-nums">
          {delta < 0 ? '−' : '+'}
          {formatGEL(Math.abs(delta))}
        </span>
      </div>
    </div>
  );
}
