'use client';

/**
 * The technical step's checks, one at a time in a modal over the plan.
 *
 * The automatic placement, the radiators room by room, the works, how the floor and the ceiling
 * are done and what the flat already has are the part of the journey people skip — and every
 * answer left at its default is a guess in the budget: a flat with no pipes marked is priced as
 * though it needed no plumbing. They used to be cards down the side of the board, easy to scroll
 * past. Now going on from the step opens them in order, each lit up in the list down the
 * modal's left, until every check the project is asked (`technicalChecks`) has been looked at
 * (`plan.technical.checked`). A check counts once something in it was changed or the person
 * went on from it. The card on the step (`TechnicalChecksCard`) lists them with where each
 * stands and opens any one of them.
 */

import { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight, ClipboardCheck, Flame, House, ListChecks, SlidersHorizontal, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { WorkChoicesPicker } from '@/components/calculator/WorkChoicesPicker';
import { technicalLabel } from '@/components/plan/PlanToolbar';
import { TECHNICAL_COLOR } from '@/components/plan/palette';
import { TECHNICAL_ICON } from '@/components/plan/icons';
import { useDesignStore } from '@/store/designStore';
import { useDesignCatalog } from '@/hooks/useDesignCatalog';
import { useT } from '@/lib/i18n/client';
import { homeStateLabel, phaseLabel } from '@/lib/i18n/labels';
import type { Dictionary } from '@/lib/i18n/ka';
import { fill } from '@/lib/admin/list';
import { cn, formatM2 } from '@/lib/utils';
import { CEILING_PHASE, FLOOR_PHASE, workChoices } from '@/lib/calculator/constants';
import type { HomeState } from '@/lib/calculator/types';
import { defaultWorksForHomeState, normalizeWorks, phasesForWorks, technicalChecks, TECHNICAL_KIND_LIST, uncheckedTechnical, WORK_STAGES, worksForStage, type TechnicalCheck, type WorkStage } from '@/lib/design/technical';
import { EXISTING_KEYS, effectiveExisting, type ExistingKey } from '@/lib/design/existing';
import { isHeatedRoom, radiatorPoints, radiatorRoom, radiatorSections, roomHeatDemandW, sectionsForRoom } from '@/lib/design/radiators';
import type { FloorPlan } from '@/lib/design/types';

/** One label per thing a flat can already have; the budget leaves each ticked one out. */
const EXISTING_LABEL = {
  floor: 'haveFloor',
  wall: 'haveWall',
  ceiling: 'haveCeiling',
  trim: 'haveTrim',
  openings: 'haveOpenings',
  electrical: 'haveElectrical',
  lighting: 'haveLighting',
  plumbing: 'havePlumbing',
  heating: 'haveHeating',
  climate: 'haveClimate',
} as const satisfies Record<ExistingKey, string>;

/** The line under each stage's title in the works checklist: where it takes the house from and to. */
const STAGE_DESC = {
  old_renovation: 'stageOldDesc',
  black_frame: 'stageBlackDesc',
  white_frame: 'stageWhiteDesc',
  green_frame: 'stageGreenDesc',
} as const satisfies Record<HomeState, string>;

const CHECK_ICON: Record<TechnicalCheck, typeof Sparkles> = {
  auto: Sparkles,
  radiators: Flame,
  works: ListChecks,
  choices: SlidersHorizontal,
  existing: House,
};

function checkTitle(t: Dictionary, check: TechnicalCheck): string {
  switch (check) {
    case 'auto':
      return t.build.autoTechnical;
    case 'radiators':
      return t.build.radiatorTable;
    case 'works':
      return t.build.worksTitle;
    case 'choices':
      return t.calculator.choicesTitle;
    case 'existing':
      return t.build.alreadyHaveTitle;
  }
}

function checkHint(t: Dictionary, check: TechnicalCheck): string {
  switch (check) {
    case 'auto':
      return t.build.autoTechnicalHint;
    case 'radiators':
      return t.build.suggestRadiatorsHint;
    case 'works':
      return t.build.worksHint;
    case 'choices':
      return t.build.checkChoicesHint;
    case 'existing':
      return t.build.alreadyHaveHint;
  }
}

/** The rooms that want heat, and how many of them have a radiator. */
function heating(plan: FloorPlan): { heated: number; hung: number } {
  const heated = plan.rooms.filter(isHeatedRoom);
  const points = radiatorPoints(plan);
  return { heated: heated.length, hung: heated.filter((room) => points.some((p) => radiatorRoom(plan, p)?.id === room.id)).length };
}

/**
 * What the step asks and where each answer stands: the works in force (the person's, else the
 * home state's), what the flat already has, the checks this project is asked and the ones not
 * looked at yet.
 */
export function useTechnicalChecks() {
  const plan = useDesignStore((s) => s.plan);
  const mode = useDesignStore((s) => s.mode);
  const homeState = useDesignStore((s) => s.homeState);
  // A list saved under the works of the old rate book reads in today's keys.
  const storedWorks = plan?.technical?.works;
  const works = useMemo(() => {
    const stored = storedWorks ? normalizeWorks(storedWorks) : [];
    return stored.length > 0 ? stored : defaultWorksForHomeState(homeState ?? (mode === 'full' ? 'white_frame' : 'green_frame'));
  }, [storedWorks, homeState, mode]);
  // What the flat already has, so the budget does not charge for it again. A green frame
  // starts with its wiring, pipes, heating and doors ticked, because that is what one is.
  const existing = useMemo(() => effectiveExisting(plan, homeState), [plan, homeState]);
  const checks = useMemo(() => technicalChecks(mode, works), [mode, works]);
  const checked = plan?.technical?.checked;
  const unchecked = useMemo(() => uncheckedTechnical(checks, checked), [checks, checked]);
  return { plan, works, existing, checks, unchecked };
}

/** One line on where a check stands: the points placed, the rooms heated, the works ticked… */
function useCheckStatus(): (check: TechnicalCheck) => string {
  const t = useT();
  const { plan, works, existing } = useTechnicalChecks();
  return (check) => {
    if (!plan) return '';
    switch (check) {
      case 'auto': {
        const n = (plan.technical?.points ?? []).filter((p) => p.kind !== 'radiator').length;
        return n > 0 ? fill(t.build.pointsPlaced, { n }) : t.build.checkAutoEmpty;
      }
      case 'radiators': {
        const { heated, hung } = heating(plan);
        return fill(t.build.checkRadiatorsStatus, { n: hung, total: heated });
      }
      case 'works':
        return fill(t.build.checkWorksStatus, { n: works.length });
      case 'choices': {
        const phases = new Set(phasesForWorks(works));
        const chosen = workChoices(plan.technical?.choices);
        const parts: string[] = [];
        if (phases.has(FLOOR_PHASE)) parts.push(chosen.floor === 'parquet' ? t.calculator.floorParquet : t.calculator.floorLaminate);
        if (phases.has(CEILING_PHASE)) parts.push(chosen.ceiling === 'barisol' ? t.calculator.ceilingBarisol : t.calculator.ceilingGypsum);
        return parts.join(' · ');
      }
      case 'existing':
        return fill(t.build.checkExistingStatus, { n: existing.length });
    }
  };
}

/** A check's mark: its number while it waits, a tick once it has been looked at. */
function CheckMark({ n, done, active, small }: { n: number; done: boolean; active?: boolean; small?: boolean }) {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-full font-semibold tabular-nums',
        small ? 'h-5 w-5 text-[10px]' : 'h-6 w-6 text-[11px]',
        done ? (active ? 'bg-success text-white' : 'bg-success/15 text-success') : active ? 'bg-white/20 text-white' : 'bg-white text-ink-muted ring-1 ring-line'
      )}
    >
      {done ? <Check className={small ? 'h-3 w-3' : 'h-3.5 w-3.5'} /> : n}
    </span>
  );
}

/**
 * The checks as a card on the step: where each stands, any one a click away, and the button
 * that walks through them.
 */
export function TechnicalChecksCard({ onOpen }: { onOpen: (check: TechnicalCheck) => void }) {
  const t = useT();
  const { checks, unchecked } = useTechnicalChecks();
  const status = useCheckStatus();
  const done = checks.length - unchecked.length;
  return (
    <section className="rounded-[16px] border border-line bg-white p-3" aria-label={t.build.checksPanelTitle}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <ClipboardCheck className="h-4 w-4 text-brand" />
            {t.build.checksPanelTitle}
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">{fill(t.build.checksPanelHint, { n: checks.length })}</p>
        </div>
        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums', unchecked.length === 0 ? 'bg-success/15 text-success' : 'bg-sand text-ink')}>
          {done} / {checks.length}
        </span>
      </div>
      <ul className="mt-2 space-y-0.5">
        {checks.map((check, i) => (
          <li key={check}>
            <button type="button" onClick={() => onOpen(check)} className="flex w-full items-center gap-2.5 rounded-[10px] px-1.5 py-1.5 text-left transition-colors hover:bg-sand-light">
              <CheckMark n={i + 1} done={!unchecked.includes(check)} small />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-ink">{checkTitle(t, check)}</span>
                <span className="block truncate text-[10px] text-ink-muted">{status(check)}</span>
              </span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => onOpen(unchecked[0] ?? checks[0])} className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-[10px] bg-ink text-xs font-semibold text-white transition-colors hover:bg-brand">
        {unchecked.length === 0 ? t.build.checksReview : t.build.checksOpen}
      </button>
    </section>
  );
}

/**
 * The modal: the checks down its left, the one in view lit up, what it asks on the right, and
 * the way through along the bottom. "Next" counts the check in view as looked at and goes to
 * the following one — after the last, to the first still waiting, and when none is, it does
 * what `finish` says: on to the next step when the modal was opened by going on, back to the
 * plan when it was opened from the card.
 */
export function TechnicalChecksDialog({ open, onOpenChange, at, onAt, finish }: { open: boolean; onOpenChange: (open: boolean) => void; at: TechnicalCheck; onAt: (check: TechnicalCheck) => void; finish: { label: string; onFinish: () => void } }) {
  const t = useT();
  const markChecked = useDesignStore((s) => s.markTechnicalChecked);
  const { plan, checks, unchecked } = useTechnicalChecks();
  const status = useCheckStatus();
  if (!plan || checks.length === 0) return null;

  const current = checks.includes(at) ? at : checks[0];
  const index = checks.indexOf(current);
  const following = checks[index + 1] ?? unchecked.find((c) => c !== current) ?? null;
  const touch = () => markChecked([current]);
  const next = () => {
    markChecked([current]);
    if (following) onAt(following);
    else finish.onFinish();
  };
  const Icon = CHECK_ICON[current];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName="bg-ink/25 backdrop-blur-[2px]" className="flex h-[min(680px,calc(100vh-2rem))] w-[calc(100vw-2rem)] max-w-[920px] flex-col gap-0 overflow-hidden rounded-[18px] border-line/70 bg-bg-base p-0 shadow-float sm:rounded-[18px]">
        <div className="shrink-0 border-b border-line bg-white px-5 py-4 pr-14">
          <p className="eyebrow">{fill(t.build.checkStep, { n: index + 1, total: checks.length })}</p>
          <DialogTitle className="mt-1 text-lg leading-tight">{t.build.checksTitle}</DialogTitle>
          <DialogDescription className="mt-1 text-xs leading-snug">{t.build.checksLead}</DialogDescription>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* The checks, the one in view lit up; a click opens any of them. */}
          <nav aria-label={t.build.checksTitle} className="hidden w-60 shrink-0 space-y-1 overflow-y-auto border-r border-line bg-sand-light/40 p-3 sm:block">
            {checks.map((check, i) => {
              const active = check === current;
              return (
                <button
                  key={check}
                  type="button"
                  onClick={() => onAt(check)}
                  aria-current={active ? 'step' : undefined}
                  className={cn('flex w-full items-start gap-2.5 rounded-[12px] px-2.5 py-2 text-left transition-colors', active ? 'bg-ink text-white shadow-card' : 'text-ink-soft hover:bg-white hover:text-ink')}
                >
                  <CheckMark n={i + 1} done={!unchecked.includes(check)} active={active} />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold leading-snug">{checkTitle(t, check)}</span>
                    <span className={cn('mt-0.5 block truncate text-[11px]', active ? 'text-white/70' : 'text-ink-muted')}>{status(check)}</span>
                  </span>
                </button>
              );
            })}
          </nav>

          <section className="min-w-0 flex-1 overflow-y-auto overscroll-contain p-5">
            {/* Below `sm` the list is a row of marks. */}
            <div className="mb-4 flex gap-1.5 sm:hidden">
              {checks.map((check, i) => (
                <button key={check} type="button" onClick={() => onAt(check)} aria-label={checkTitle(t, check)} aria-current={check === current ? 'step' : undefined} className={cn('rounded-full', check === current && 'ring-2 ring-ink ring-offset-2 ring-offset-bg-base')}>
                  <CheckMark n={i + 1} done={!unchecked.includes(check)} small />
                </button>
              ))}
            </div>
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-ink text-white">
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3 className="font-serif text-lg font-semibold leading-tight text-ink">{checkTitle(t, current)}</h3>
                <p className="mt-1 text-xs leading-snug text-ink-muted">{checkHint(t, current)}</p>
              </div>
            </div>
            <div className="mt-5">
              {current === 'auto' && <AutoCheck plan={plan} onTouch={touch} />}
              {current === 'radiators' && <RadiatorsCheck plan={plan} onTouch={touch} />}
              {current === 'works' && <WorksCheck onTouch={touch} />}
              {current === 'choices' && <ChoicesCheck onTouch={touch} />}
              {current === 'existing' && <ExistingCheck onTouch={touch} />}
            </div>
          </section>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line bg-white px-5 py-3">
          <button type="button" onClick={() => index > 0 && onAt(checks[index - 1])} disabled={index === 0} className="flex h-10 items-center gap-1.5 rounded-[10px] border border-line px-3 text-sm font-medium text-ink-soft transition-colors hover:border-ink hover:text-ink disabled:pointer-events-none disabled:opacity-40">
            <ChevronLeft className="h-4 w-4" />
            {t.build.checkBack}
          </button>
          <span className="hidden text-xs tabular-nums text-ink-muted sm:inline">{fill(t.build.checksProgress, { n: checks.length - unchecked.length, total: checks.length })}</span>
          <button type="button" onClick={next} className="flex h-10 items-center gap-1.5 rounded-[10px] bg-ink pl-4 pr-3 text-sm font-medium text-white shadow-float transition-colors hover:bg-brand">
            {following ? t.build.checkNext : finish.label}
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The points the rules can place, at a click, and what is on the plan now. */
function AutoCheck({ plan, onTouch }: { plan: FloorPlan; onTouch: () => void }) {
  const t = useT();
  const suggestTechnical = useDesignStore((s) => s.suggestTechnical);
  /** What the last placement did, for the line beside the button. */
  const [placed, setPlaced] = useState<number | null>(null);
  const points = plan.technical?.points ?? [];
  const counts = TECHNICAL_KIND_LIST.map((kind) => ({ kind, n: points.filter((p) => p.kind === kind).length })).filter((c) => c.n > 0);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setPlaced(suggestTechnical());
            onTouch();
          }}
          className="flex h-10 items-center gap-2 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white transition-colors hover:bg-brand"
        >
          <Sparkles className="h-4 w-4" />
          {t.build.autoTechnical}
        </button>
        {placed != null && (
          <p className="text-xs font-medium text-success" role="status">
            {placed > 0 ? fill(t.build.autoTechnicalDone, { n: placed }) : t.build.autoTechnicalNone}
          </p>
        )}
      </div>
      <div className="rounded-[14px] border border-line bg-white p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{t.build.checkPlacedTitle}</p>
        {counts.length === 0 ? (
          <p className="mt-2 text-xs text-ink-muted">{t.build.checkAutoEmpty}</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {counts.map(({ kind, n }) => {
              const KindIcon = TECHNICAL_ICON[kind];
              return (
                <li key={kind} className="flex items-center gap-1.5 rounded-full border border-line bg-bg-base py-1 pl-1 pr-2.5 text-xs text-ink">
                  <span className="grid h-5 w-5 place-items-center rounded-full text-white" style={{ backgroundColor: TECHNICAL_COLOR[kind] }}>
                    <KindIcon className="h-3 w-3" />
                  </span>
                  {technicalLabel(t, kind)}
                  <span className="tabular-nums text-ink-muted">×{n}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="text-[11px] leading-snug text-ink-muted">{t.build.checkAutoByHand}</p>
    </div>
  );
}

/** How many sections each room wants, and a radiator under every window at a click. */
function RadiatorsCheck({ plan, onTouch }: { plan: FloorPlan; onTouch: () => void }) {
  const t = useT();
  const suggestRadiators = useDesignStore((s) => s.suggestRadiators);
  const { products } = useDesignCatalog();
  /** What the last "hang the radiators" did: how many were added, or 0 when every room had one. */
  const [hung, setHung] = useState<number | null>(null);
  const points = radiatorPoints(plan);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setHung(suggestRadiators(products));
            onTouch();
          }}
          className="flex h-10 items-center gap-2 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white transition-colors hover:bg-brand"
        >
          <Flame className="h-4 w-4" />
          {t.build.suggestRadiators}
        </button>
        {hung != null && <p className="text-xs font-medium text-success" role="status">{hung > 0 ? fill(t.build.radiatorsAdded, { n: hung }) : t.build.radiatorsNone}</p>}
      </div>
      <ul className="grid gap-1.5 md:grid-cols-2">
        {plan.rooms.filter(isHeatedRoom).map((room) => {
          const here = points.filter((p) => radiatorRoom(plan, p)?.id === room.id);
          const sections = here.reduce((sum, p) => sum + radiatorSections(plan, p), 0);
          const wanted = sectionsForRoom(plan, room, here[0]?.radiator?.wattsPerSection);
          return (
            <li key={room.id} className="flex items-center justify-between gap-3 rounded-[10px] border border-line bg-white px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-ink">{room.name}</span>
                <span className="block truncate text-[11px] text-ink-muted">
                  {formatM2(room.areaM2)} · {roomHeatDemandW(plan, room)} {t.build.unitWatt}
                </span>
              </span>
              <span className={cn('shrink-0 text-xs tabular-nums', here.length === 0 ? 'text-ink-muted' : sections < wanted ? 'text-warning' : 'text-success')}>
                {here.length > 0 ? `${here.length} × · ${sections}/${wanted}` : `0 · ${wanted}`} {t.build.radiatorSection}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The works this renovation needs, in four groups by the stage they take the house through. */
function WorksCheck({ onTouch }: { onTouch: () => void }) {
  const t = useT();
  const setWorks = useDesignStore((s) => s.setWorks);
  const { works } = useTechnicalChecks();
  const toggle = (key: string) => {
    setWorks(works.includes(key) ? works.filter((k) => k !== key) : [...works, key]);
    onTouch();
  };
  const setStage = (stage: WorkStage, on: boolean) => {
    const keys = worksForStage(stage).map((w) => w.key);
    const rest = works.filter((k) => !keys.includes(k));
    setWorks(on ? [...rest, ...keys] : rest);
    onTouch();
  };
  return (
    <div className="space-y-2">
      {WORK_STAGES.map((stage) => {
        const list = worksForStage(stage);
        const on = list.filter((w) => works.includes(w.key)).length;
        return (
          <details key={stage.homeState} open={on > 0} className="group rounded-[12px] border border-line bg-white">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">{homeStateLabel(t, stage.homeState)}</span>
                <span className="block truncate text-[11px] text-ink-muted">{t.build[STAGE_DESC[stage.homeState]]}</span>
              </span>
              <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums', on > 0 ? 'bg-ink text-white' : 'bg-sand text-ink-muted')}>
                {on} / {list.length}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-line px-2 pb-2 pt-1">
              <div className="flex justify-end gap-2 px-1 py-1 text-[11px]">
                <button type="button" onClick={() => setStage(stage, true)} className="font-medium text-ink-soft hover:text-ink">
                  {t.build.stageAll}
                </button>
                <span className="text-ink-faint">·</span>
                <button type="button" onClick={() => setStage(stage, false)} className="font-medium text-ink-soft hover:text-ink">
                  {t.build.stageNone}
                </button>
              </div>
              <ul className="grid gap-0.5 md:grid-cols-2">
                {list.map((w) => {
                  const checked = works.includes(w.key);
                  return (
                    <li key={w.key}>
                      <label className={cn('flex cursor-pointer items-center gap-2 rounded-[8px] px-2 py-1.5 text-xs transition-colors', checked ? 'bg-sand-light text-ink' : 'text-ink-soft hover:bg-sand-light/60')}>
                        <input type="checkbox" checked={checked} onChange={() => toggle(w.key)} className="accent-ink" />
                        <span className="w-6 text-[10px] tabular-nums text-ink-faint">{String(w.phase).padStart(2, '0')}</span>
                        {phaseLabel(t, w.phase)}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          </details>
        );
      })}
    </div>
  );
}

/** Laminate or parquet, plasterboard or a stretch ceiling — only for the works that are in. */
function ChoicesCheck({ onTouch }: { onTouch: () => void }) {
  const setWorkChoices = useDesignStore((s) => s.setWorkChoices);
  const { plan, works } = useTechnicalChecks();
  const phases = new Set(phasesForWorks(works));
  return (
    <div className="rounded-[14px] border border-line bg-white p-4">
      <WorkChoicesPicker
        value={plan?.technical?.choices}
        onChange={(choices) => {
          setWorkChoices(choices);
          onTouch();
        }}
        floor={phases.has(FLOOR_PHASE)}
        ceiling={phases.has(CEILING_PHASE)}
      />
    </div>
  );
}

/** Ten ticks for what is already standing; the budget leaves each ticked one out. */
function ExistingCheck({ onTouch }: { onTouch: () => void }) {
  const t = useT();
  const setExisting = useDesignStore((s) => s.setExisting);
  const { existing } = useTechnicalChecks();
  const set = (keys: string[]) => {
    setExisting(keys);
    onTouch();
  };
  return (
    <div className="rounded-[14px] border border-line bg-white p-3">
      <div className="flex justify-end gap-2 text-[11px]">
        <button type="button" onClick={() => set([...EXISTING_KEYS])} className="font-medium text-ink-soft hover:text-ink">
          {t.build.stageAll}
        </button>
        <span className="text-ink-faint">·</span>
        <button type="button" onClick={() => set([])} className="font-medium text-ink-soft hover:text-ink">
          {t.build.stageNone}
        </button>
      </div>
      <ul className="mt-1 grid gap-0.5 md:grid-cols-2">
        {EXISTING_KEYS.map((key) => {
          const checked = existing.includes(key);
          return (
            <li key={key}>
              <label className={cn('flex cursor-pointer items-center gap-2 rounded-[8px] px-2 py-1.5 text-xs transition-colors', checked ? 'bg-sand-light text-ink' : 'text-ink-soft hover:bg-sand-light/60')}>
                <input type="checkbox" checked={checked} onChange={() => set(checked ? existing.filter((k) => k !== key) : [...existing, key])} className="accent-ink" />
                {t.build[EXISTING_LABEL[key]]}
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
