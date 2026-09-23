'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AlertCircle, PenLine, Upload } from 'lucide-react';
import Image from 'next/image';
import { CALCULATOR_STEPS, StepIndicator } from '@/components/calculator/StepIndicator';
import { CalculatorFlowGuard } from '@/components/flow/FlowGuard';
import { HomeStateSelector } from '@/components/calculator/HomeStateSelector';
import { PlanUploadCard } from '@/components/design/PlanUploadCard';
import { PlanSketch } from '@/components/projects/PlanSketch';
import { Button } from '@/components/ui/button';
import { StepHeader, SectionHead } from '@/components/flow/StepHeader';
import { StepNav } from '@/components/flow/StepNav';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useCalculatorPlanStore } from '@/store/designStore';
import { useCalculatorPlan } from '@/hooks/useCalculatorPlan';
import { useT } from '@/lib/i18n/client';
import { calculatorRoomsFromPlan } from '@/lib/design/planGeometry';
import type { FloorPlan } from '@/lib/design/types';
import { cn } from '@/lib/utils';

type PlanMode = 'upload' | 'draw';

/**
 * Step 1 of the calculator: the way in and the home's condition. Upload a plan (the card
 * hands it over as soon as its area makes sense; nothing is kept until "continue") or say
 * you will draw one, and pick the home state below. The drawing itself — checking an
 * uploaded plan, or drawing on a blank sheet — is the next step, on the same board the
 * studio uses; "start the calculation" is pressed there, once the rooms exist.
 *
 * The plan lives in the calculator's *own* board (`useCalculatorPlanStore`), separate from
 * the studio's; the calculator's rooms are read off it after every edit.
 */
export default function CalculatorStep1Page() {
  const router = useRouter();
  const t = useT();
  const { homeState, rooms, setHomeState, replaceRooms } = useCalculatorStore();
  const plan = useCalculatorPlan();
  const setPlan = useCalculatorPlanStore((s) => s.setPlan);
  const floorPlanUrl = useCalculatorPlanStore((s) => s.floorPlanUrl);
  const planOnFile = !!plan && rooms.length > 0 && plan.rooms.length === rooms.length && plan.rooms.every((r) => rooms.some((room) => room.id === r.id));
  const [mode, setMode] = useState<PlanMode>(() => (plan && plan.rooms.length === 0 && plan.source === 'manual' ? 'draw' : 'upload'));
  const [replacingPlan, setReplacingPlan] = useState(false);
  /** A plan read from an upload, waiting for "continue"; taken back when its area is cleared. */
  const [uploaded, setUploaded] = useState<{ plan: FloorPlan; imageUrl: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const planReady = mode === 'draw' || (planOnFile && !replacingPlan) || !!uploaded;
  useEffect(() => {
    if (error && planReady && homeState) setError(null);
  }, [error, planReady, homeState]);

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  /** On to the board: with the uploaded plan, with the plan already on file, or with a blank sheet. */
  const continueToPlan = () => {
    if (!planReady) {
      setError(t.design.needPlanFirst);
      scrollTo('plan-section');
      return;
    }
    if (!homeState) {
      setError(t.calculator.needHomeStateFirst);
      scrollTo('home-state-section');
      return;
    }
    if (uploaded && (mode === 'upload' || !planOnFile)) {
      // A different plan is a different flat: rooms, products and furniture all start over.
      replaceRooms(calculatorRoomsFromPlan(uploaded.plan));
      setPlan(uploaded.plan, uploaded.imageUrl);
    } else if (!plan || (plan.rooms.length === 0 && (plan.walls?.length ?? 0) === 0)) {
      // A blank sheet: the walls are drawn on the next step.
      setPlan({ rooms: [], metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', imageUrl: null, wallThicknessM: 0.12, wallHeightM: 2.8, walls: [] }, null);
      replaceRooms([]);
    }
    router.push('/calculator/plan');
  };

  const options: Array<{ id: PlanMode; icon: React.ReactNode; label: string; desc: string }> = [
    { id: 'upload', icon: <Upload className="h-5 w-5" />, label: t.calculator.optionUpload, desc: t.calculator.optionUploadDesc },
    { id: 'draw', icon: <PenLine className="h-5 w-5" />, label: t.calculator.optionDraw, desc: t.build.optionScratchDesc },
  ];

  return (
    <>
      <CalculatorFlowGuard step={1} />
      <StepIndicator current={1} />
      <div className="container py-10 md:py-14">
        <StepHeader step={1} total={CALCULATOR_STEPS} title={t.calculator.title} subtitle={t.calculator.startSubtitle} />

        <section id="plan-section" className="mt-10 space-y-5">
          <SectionHead index="01" title={t.calculator.planTitle} subtitle={t.calculator.wayInHint} />

          {/* The two ways in, side by side; the chosen one opens below. */}
          <div className="grid gap-3 sm:grid-cols-2" role="tablist">
            {options.map((o, i) => {
              const active = mode === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setMode(o.id)}
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

          {planOnFile && !replacingPlan && plan && (
            <div className="grid items-center gap-5 rounded-[16px] border border-line bg-bg-surface p-5 sm:grid-cols-[220px_minmax(0,1fr)]">
              <div className="rounded-[12px] border border-line bg-white p-2">
                {floorPlanUrl ? (
                  <Image src={floorPlanUrl} alt="" width={440} height={330} unoptimized className="h-auto max-h-44 w-full object-contain" />
                ) : (
                  <PlanSketch plan={plan} rooms={rooms} className="block h-auto w-full" />
                )}
              </div>
              <div>
                <p className="font-medium text-success">{t.calculator.planAlreadyUploaded.replace('{n}', String(rooms.length))}</p>
                <p className="mt-1 text-sm text-ink-muted">{t.calculator.uploadPlanHint}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setReplacingPlan(true);
                      setMode('upload');
                    }}
                  >
                    {t.calculator.replacePlan}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {mode === 'upload' && (!planOnFile || replacingPlan) && (
            <div className="rounded-[16px] border border-line bg-bg-surface p-5">
              <p className="text-sm text-ink-muted">{t.calculator.uploadPlanHint}</p>
              <div className="mt-4">
                {/* No button of its own: the plan waits here, and the one continue below takes it. */}
                <PlanUploadCard showSample showContinue={false} onPlan={(read, imageUrl) => setUploaded({ plan: read, imageUrl })} onReset={() => setUploaded(null)} />
              </div>
              {uploaded && <p className="mt-3 text-sm font-medium text-success">{t.calculator.planRoomsApplied.replace('{n}', String(uploaded.plan.rooms.length))}</p>}
            </div>
          )}
        </section>

        <section id="home-state-section" className="mt-14 space-y-5">
          <SectionHead index="02" title={t.homeState.title} subtitle={t.homeState.subtitle} />
          <HomeStateSelector value={homeState} onChange={setHomeState} />
        </section>
      </div>

      <StepNav next={{ label: t.design.continueButton, onClick: continueToPlan }}>
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
