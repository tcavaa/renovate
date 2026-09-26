'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AlertCircle, Check, Home, Info, PenLine, Plug, Receipt, Sofa, SquareDashed, Upload } from 'lucide-react';
import { DesignSteps } from '@/components/design/DesignSteps';
import { DesignFlowGuard } from '@/components/flow/FlowGuard';
import { PlanUploadCard } from '@/components/design/PlanUploadCard';
import { HomeStateSelector } from '@/components/calculator/HomeStateSelector';
import { StepHeader, SectionHead } from '@/components/flow/StepHeader';
import { StepNav } from '@/components/flow/StepNav';
import { StageBrief } from '@/components/flow/StageBrief';
import { useDesignStore } from '@/store/designStore';
import { useProjectId } from '@/components/projects/ProjectGate';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { fill } from '@/lib/admin/list';
import { DEFAULT_WALL_THICKNESS_M } from '@/lib/design/planGeometry';
import { DEFAULT_WALL_HEIGHT_M } from '@/lib/design/walls';
import { designStepHref } from '@/lib/design/steps';
import type { FloorPlan } from '@/lib/design/types';
import type { HomeState } from '@/lib/calculator/types';

type PlanMode = 'upload' | 'scratch';

/** A plan with something on it — rooms, or walls that do not close one yet. */
function hasDrawing(plan: FloorPlan | null | undefined): boolean {
  return !!plan && (plan.rooms.length > 0 || (plan.walls?.length ?? 0) > 0);
}

/**
 * Step 1 of the journey: where the plan comes from — an uploaded drawing (PDF or image), or
 * a sheet to draw on in the next step — and what kind of project this is.
 * Nothing leaves this page until the one continue button at the bottom.
 *
 * A calculation is not a way in here: a project that has one is carried into 3D by the
 * project's entry (`/design/<id>?from=calculator`), with its rooms, home state and picks.
 */
export default function DesignStartPage() {
  const t = useT();
  const router = useRouter();
  const projectId = useProjectId();
  const search = useSearchParams();
  const { mode, modeChosen, emptyStart, setMode, chooseEmptyStart, startEmpty, setPlan, homeState, setHomeState, plan, setPlanDefaults } = useDesignStore();
  // A project that already has a drawing opens on it, whatever the URL says (Back can bring the
  // hub tile's `?way` along); otherwise the tile's choice (`?way=upload|draw`), else the upload.
  const [planMode, setPlanMode] = useState<PlanMode>(() => {
    if (hasDrawing(useDesignStore.getState().plan)) return 'scratch';
    return search.get('way') === 'draw' ? 'scratch' : 'upload';
  });
  /** A plan read from an upload, waiting for "continue". */
  const [uploaded, setUploaded] = useState<{ plan: FloorPlan; imageUrl: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The drawing's defaults — 2.8 m walls, 12 cm thick — are not asked for here any more:
  // every wall and room carries its own on the board, where the thickness is in the toolbar.
  const heightM = plan?.wallHeightM ?? DEFAULT_WALL_HEIGHT_M;
  const thickness = plan?.wallThicknessM ?? DEFAULT_WALL_THICKNESS_M;

  const planReady = planMode === 'upload' ? !!uploaded : true;
  useEffect(() => {
    if (error && planReady && modeChosen) setError(null);
  }, [error, planReady, modeChosen]);

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  /** The one way forward: a plan of some kind (or a blank sheet), and a decision about what it is for. */
  const continueToRooms = () => {
    if (!planReady) {
      setError(t.design.needPlanFirst);
      scrollTo('plan-section');
      return;
    }
    if (!modeChosen) {
      setError(t.design.needModeFirst);
      scrollTo('mode-section');
      return;
    }
    if (planMode === 'upload' && uploaded) {
      setPlan({ ...uploaded.plan, wallThicknessM: thickness, wallHeightM: heightM }, uploaded.imageUrl);
    } else if (planMode === 'scratch' && !hasDrawing(useDesignStore.getState().plan)) {
      // A blank sheet: the walls are drawn on the next step. A sheet that already has
      // something on it — this project's drawing, come back to — is kept as it is.
      setPlan({ rooms: [], metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', imageUrl: null, wallThicknessM: thickness, wallHeightM: heightM, walls: [] }, null);
    }
    setPlanDefaults({ wallThicknessM: thickness, wallHeightM: heightM });
    // The empty start goes straight to the studio, on the rooms it has; a blank sheet has
    // none yet, so its walls are drawn on the next step, which then hands on to the studio.
    if (emptyStart && (useDesignStore.getState().plan?.rooms.length ?? 0) > 0) {
      startEmpty();
      router.push(designStepHref(projectId, 5));
      return;
    }
    router.push(designStepHref(projectId, 2));
  };

  const options: Array<{ id: PlanMode; icon: React.ReactNode; label: string; desc: string }> = [
    { id: 'upload', icon: <Upload className="h-5 w-5" />, label: t.calculator.optionUpload, desc: t.calculator.optionUploadDesc },
    { id: 'scratch', icon: <PenLine className="h-5 w-5" />, label: t.build.optionScratch, desc: t.build.optionScratchDesc },
  ];

  return (
    <>
      <DesignFlowGuard step={1} />
      <DesignSteps current={1} />
      <div className="container py-10 md:py-14">
        <StepHeader step={1} total={8} title={t.build.s1Title} subtitle={t.design.subtitle} />
        <StageBrief step={1} className="mt-6" />

        <section id="plan-section" className="mt-10 space-y-5">
          <SectionHead index="01" title={t.design.uploadTitle} subtitle={t.calculator.planSubtitle} aside={<span className="text-xs">{t.design.uploadFormats}</span>} />
          <div className="grid gap-3 sm:grid-cols-2" role="tablist">
            {options.map((o, i) => {
              const active = planMode === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setPlanMode(o.id)}
                  className={cn('group flex items-start gap-4 rounded-[16px] border p-5 text-left transition-colors', active ? 'border-ink bg-ink text-white' : 'border-line bg-bg-surface hover:border-ink/40')}
                >
                  <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border', active ? 'border-white/20' : 'border-line text-ink-muted')}>{o.icon}</span>
                  <span className="min-w-0">
                    <span className={cn('block text-xs font-semibold tabular-nums', active ? 'text-white/60' : 'text-ink-faint')}>{String(i + 1).padStart(2, '0')}</span>
                    <span className="mt-0.5 block font-serif text-lg font-semibold leading-tight">{o.label}</span>
                    <span className={cn('mt-1 block text-sm leading-relaxed', active ? 'text-white/70' : 'text-ink-muted')}>{o.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {planMode === 'upload' && (
            <div className="rounded-[16px] border border-line bg-bg-surface p-5 md:p-6">
              <PlanUploadCard showSample showContinue={false} onPlan={(p, imageUrl) => setUploaded({ plan: p, imageUrl })} onReset={() => setUploaded(null)} />
              {uploaded && (
                <p className="mt-4 flex items-center gap-2 text-sm font-medium text-success">
                  <Check className="h-4 w-4" />
                  {fill(t.design.planReady, { n: uploaded.plan.rooms.length })}
                </p>
              )}
            </div>
          )}

          {planMode === 'scratch' &&
            ((plan?.rooms.length ?? 0) > 0 ? (
              // This project's own drawing, come back to: it is what the next step opens on.
              <div className="rounded-[16px] border border-line bg-bg-surface p-6 text-sm">
                <p className="flex items-center gap-2 font-medium text-success">
                  <Check className="h-4 w-4" />
                  {fill(t.calculator.planAlreadyUploaded, { n: plan?.rooms.length ?? 0 })}
                </p>
              </div>
            ) : (
              <div className="rounded-[16px] border border-dashed border-line bg-bg-surface p-6 text-sm text-ink-muted">
                <p className="font-medium text-ink">{t.build.planEmptyTitle}</p>
                <p className="mt-1">{t.build.optionScratchDesc}</p>
              </div>
            ))}
        </section>

        {/*
          Each mode says what it covers, item by item, because "design only" sounded like it
          might still include the wiring and "renovation + design" like it might not include
          the sofa. Once a home state is chosen the section goes further and says what that
          state means: a green frame has its electrics and pipes already, so the technical
          step records them rather than charging for them.
        */}
        <section id="mode-section" className="mt-14 space-y-5">
          <SectionHead index="02" title={t.design.modeTitle} subtitle={t.design.modeSubtitle} />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <ModeCard
              active={modeChosen && !emptyStart && mode === 'design_only'}
              onClick={() => setMode('design_only')}
              icon={<Sofa className="h-5 w-5" />}
              label={t.design.modeDesignOnlyLabel}
              description={t.design.modeDesignOnlyDesc}
              coversLabel={t.design.modeCoversLabel}
              covers={t.design.modeDesignOnlyCovers}
            />
            <ModeCard
              active={modeChosen && !emptyStart && mode === 'full'}
              onClick={() => setMode('full')}
              icon={<Home className="h-5 w-5" />}
              label={t.design.modeFullLabel}
              description={t.design.modeFullDesc}
              coversLabel={t.design.modeCoversLabel}
              covers={t.design.modeFullCovers}
            />
            {/* The third way in: nothing laid out, nothing asked — the studio, empty, at once. */}
            <ModeCard
              active={modeChosen && emptyStart}
              onClick={chooseEmptyStart}
              icon={<SquareDashed className="h-5 w-5" />}
              label={t.design.modeEmptyLabel}
              description={t.design.modeEmptyDesc}
              coversLabel={t.design.modeCoversLabel}
              covers={t.design.modeEmptyCovers}
            />
          </div>

          {modeChosen && emptyStart && <ModeNote>{t.design.modeEmptyExcept}</ModeNote>}
          {modeChosen && !emptyStart && mode === 'design_only' && <ModeNote>{t.design.modeDesignOnlyExcept}</ModeNote>}

          {modeChosen && !emptyStart && mode === 'full' && (
            <div className="space-y-3 pt-2">
              <ModeNote>{t.design.modeFullExcept}</ModeNote>
              <div>
                <p className="eyebrow">{t.homeState.title}</p>
                <p className="mt-1 text-sm text-ink-muted">{t.homeState.subtitle}</p>
              </div>
              <HomeStateSelector value={homeState} onChange={setHomeState} />
              {homeState && <HomeStateCover state={homeState} />}
            </div>
          )}
        </section>
      </div>

      <StepNav next={{ label: t.design.continueButton, onClick: continueToRooms }}>
        {error && (
          <p role="alert" aria-live="polite" className="flex items-center gap-2 text-sm font-medium text-danger">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}
      </StepNav>
    </>
  );
}

function ModeCard({ active, onClick, icon, label, description, coversLabel, covers }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; description: string; coversLabel: string; covers: readonly string[] }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn('group flex items-start gap-4 rounded-[16px] border p-4 text-left transition-colors duration-300', active ? 'border-ink bg-ink text-white' : 'border-line bg-bg-surface hover:border-ink/40')}
    >
      <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border', active ? 'border-white/20 text-white' : 'border-line text-ink-muted')}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-serif text-lg font-semibold leading-tight">{label}</span>
        <span className={cn('mt-1 block text-sm leading-relaxed', active ? 'text-white/70' : 'text-ink-muted')}>{description}</span>
        <span className={cn('mt-3 block border-t pt-3', active ? 'border-white/15' : 'border-line')}>
          <span className={cn('block text-[11px] font-semibold uppercase tracking-wide', active ? 'text-white/50' : 'text-ink-faint')}>{coversLabel}</span>
          <span className="mt-1.5 block space-y-1">
            {covers.map((line) => (
              <span key={line} className="flex items-start gap-2">
                <Check className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', active ? 'text-white/60' : 'text-success')} />
                <span className={cn('text-[13px] leading-snug', active ? 'text-white/70' : 'text-ink-soft')}>{line}</span>
              </span>
            ))}
          </span>
        </span>
      </span>
      <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-full border', active ? 'border-white bg-white text-ink' : 'border-line text-transparent group-hover:border-ink/40')}>
        <Check className="h-3 w-3" />
      </span>
    </button>
  );
}

/** The qualification under the chosen mode: what it will *not* do, or what it still needs. */
function ModeNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex gap-2.5 rounded-[12px] border border-line bg-sand-light p-4 text-sm leading-relaxed text-ink-soft">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
      <span className="max-w-prose">{children}</span>
    </p>
  );
}

/**
 * What the chosen home state means for this project — what is already standing, what the
 * estimate will charge for, and what happens to the technical points. The third column is
 * the one that was missing: in a green frame the sockets and pipes exist and the plan only
 * records where they are, while in a black frame they are drawn and paid for.
 */
function HomeStateCover({ state }: { state: HomeState }) {
  const t = useT();
  const copy = t.homeStateCover[state];
  const rows: Array<{ label: string; value: string; icon: React.ReactNode }> = [
    { label: t.design.modeCoverDone, value: copy.done, icon: <Check className="h-3.5 w-3.5 text-success" /> },
    { label: t.design.modeCoverTodo, value: copy.todo, icon: <Receipt className="h-3.5 w-3.5 text-brand" /> },
    { label: t.design.modeCoverPoints, value: copy.points, icon: <Plug className="h-3.5 w-3.5 text-ink-muted" /> },
  ];
  return (
    <div className="rounded-[16px] border border-line bg-white">
      <p className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">{t.design.modeCoverTitle}</p>
      <dl className="grid gap-4 px-4 py-4 text-sm sm:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              {row.icon}
              {row.label}
            </dt>
            <dd className="mt-1 leading-relaxed text-ink-soft">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
