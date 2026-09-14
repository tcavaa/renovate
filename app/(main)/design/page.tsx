'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AlertCircle, Check, Home, PenLine, Sofa, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DesignSteps } from '@/components/design/DesignSteps';
import { PlanUploadCard } from '@/components/design/PlanUploadCard';
import { HomeStateSelector } from '@/components/calculator/HomeStateSelector';
import { StepHeader, SectionHead } from '@/components/flow/StepHeader';
import { StepNav } from '@/components/flow/StepNav';
import { StageBrief } from '@/components/flow/StageBrief';
import { useDesignStore } from '@/store/designStore';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { fill } from '@/lib/admin/list';
import { planFromCalculatorRooms } from '@/lib/design/planGeometry';
import { WALL_THICKNESS_OPTIONS_M } from '@/lib/design/walls';
import type { FloorPlan } from '@/lib/design/types';

type PlanMode = 'upload' | 'scratch';

/**
 * Step 1 of the journey: where the plan comes from — an uploaded drawing (PDF or image),
 * the rooms from the calculator, or a blank sheet to draw on in the next step — the
 * default wall height and thickness the drawing will use, and what kind of project this is.
 * Nothing leaves this page until the one continue button at the bottom.
 */
export default function DesignStartPage() {
  const t = useT();
  const router = useRouter();
  const { mode, modeChosen, setMode, setPlan, homeState, setHomeState, startFromCalculator, setProjectId, plan, setPlanDefaults } = useDesignStore();
  const calculatorRooms = useCalculatorStore((s) => s.rooms);
  const [planMode, setPlanMode] = useState<PlanMode>('upload');
  /** A plan read from an upload (or borrowed from the calculator), waiting for "continue". */
  const [uploaded, setUploaded] = useState<{ plan: FloorPlan; imageUrl: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wallHeight, setWallHeight] = useState(String(plan?.wallHeightM ?? 2.8));
  const [thickness, setThickness] = useState(plan?.wallThicknessM ?? 0.12);

  const planReady = planMode === 'upload' ? !!uploaded : true;
  useEffect(() => {
    if (error && planReady && modeChosen) setError(null);
  }, [error, planReady, modeChosen]);

  const useCalculator = () => {
    const calc = useCalculatorStore.getState();
    if (calc.rooms.length === 0) return;
    // The calculation and this design are one project: carry its home state, picks and id.
    if (calc.homeState) {
      startFromCalculator({ rooms: calc.rooms, homeState: calc.homeState, selectedProducts: calc.selectedProducts, selectedFurniture: calc.selectedFurniture, projectId: calc.projectId });
      router.push('/design/plan');
      return;
    }
    setProjectId(calc.projectId);
    setUploaded({ plan: planFromCalculatorRooms(calc.rooms), imageUrl: null });
  };

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
    const heightM = Math.min(6, Math.max(1.8, Number(wallHeight) || 2.8));
    if (planMode === 'upload' && uploaded) {
      setPlan({ ...uploaded.plan, wallThicknessM: thickness, wallHeightM: heightM }, uploaded.imageUrl);
    } else if (planMode === 'scratch') {
      // A blank sheet: the walls are drawn on the next step.
      setPlan({ rooms: [], metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', imageUrl: null, wallThicknessM: thickness, wallHeightM: heightM, walls: [] }, null);
    }
    setPlanDefaults({ wallThicknessM: thickness, wallHeightM: heightM });
    router.push('/design/plan');
  };

  const options: Array<{ id: PlanMode; icon: React.ReactNode; label: string; desc: string }> = [
    { id: 'upload', icon: <Upload className="h-5 w-5" />, label: t.calculator.optionUpload, desc: t.calculator.optionUploadDesc },
    { id: 'scratch', icon: <PenLine className="h-5 w-5" />, label: t.build.optionScratch, desc: t.build.optionScratchDesc },
  ];

  return (
    <>
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
              {calculatorRooms.length > 0 && (
                <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
                  <p className="text-sm text-ink-muted">{t.design.noPlanDesc}</p>
                  <Button type="button" variant="outline" size="sm" onClick={useCalculator}>
                    {t.design.useCalculatorRooms} ({calculatorRooms.length})
                  </Button>
                </div>
              )}
            </div>
          )}

          {planMode === 'scratch' && (
            <div className="rounded-[16px] border border-dashed border-line bg-bg-surface p-6 text-sm text-ink-muted">
              <p className="font-medium text-ink">{t.build.planEmptyTitle}</p>
              <p className="mt-1">{t.build.optionScratchDesc}</p>
            </div>
          )}

          <div className="rounded-[16px] border border-line bg-bg-surface p-5">
            <p className="text-sm font-semibold text-ink">{t.build.defaultsTitle}</p>
            <p className="mt-1 text-xs text-ink-muted">{t.build.defaultsHint}</p>
            <div className="mt-4 flex flex-wrap items-end gap-6">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{t.build.defaultWallHeight}</span>
                <input type="number" inputMode="decimal" min={1.8} max={6} step={0.05} value={wallHeight} onChange={(e) => setWallHeight(e.target.value)} className="h-10 w-32 rounded-[10px] border border-line bg-white px-3 text-sm tabular-nums" />
              </label>
              <div>
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{t.build.defaultWallThickness}</span>
                <div className="flex gap-1" role="radiogroup">
                  {WALL_THICKNESS_OPTIONS_M.map((m) => (
                    <button key={m} type="button" role="radio" aria-checked={Math.abs(thickness - m) < 1e-6} onClick={() => setThickness(m)} className={cn('h-10 rounded-[10px] px-3 text-sm font-semibold tabular-nums transition-colors', Math.abs(thickness - m) < 1e-6 ? 'bg-ink text-white' : 'border border-line bg-white text-ink-soft hover:border-ink')}>
                      {fill(t.build.thicknessCm, { n: Math.round(m * 100) })}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="mode-section" className="mt-14 space-y-5">
          <SectionHead index="02" title={t.design.modeTitle} subtitle={t.design.modeSubtitle} />
          <div className="grid gap-3 sm:grid-cols-2">
            <ModeCard active={modeChosen && mode === 'design_only'} onClick={() => setMode('design_only')} icon={<Sofa className="h-5 w-5" />} label={t.design.modeDesignOnlyLabel} description={t.design.modeDesignOnlyDesc} />
            <ModeCard active={modeChosen && mode === 'full'} onClick={() => setMode('full')} icon={<Home className="h-5 w-5" />} label={t.design.modeFullLabel} description={t.design.modeFullDesc} />
          </div>
          {modeChosen && mode === 'full' && (
            <div className="space-y-3 pt-2">
              <div>
                <p className="eyebrow">{t.homeState.title}</p>
                <p className="mt-1 text-sm text-ink-muted">{t.homeState.subtitle}</p>
              </div>
              <HomeStateSelector value={homeState} onChange={setHomeState} />
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

function ModeCard({ active, onClick, icon, label, description }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; description: string }) {
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
      </span>
      <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-full border', active ? 'border-white bg-white text-ink' : 'border-line text-transparent group-hover:border-ink/40')}>
        <Check className="h-3 w-3" />
      </span>
    </button>
  );
}
