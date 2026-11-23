'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DesignSteps } from '@/components/design/DesignSteps';
import { DesignFlowGuard } from '@/components/flow/FlowGuard';
import { StylePicker } from '@/components/design/StylePicker';
import { StyleQuiz } from '@/components/design/StyleQuiz';
import { GenerationOverlay } from '@/components/design/GenerationOverlay';
import { StepHeader, SectionHead } from '@/components/flow/StepHeader';
import { StepNav } from '@/components/flow/StepNav';
import { StageBrief } from '@/components/flow/StageBrief';
import { EmptyStep } from '@/components/flow/EmptyStep';
import { HingeDialog } from '@/components/flow/HingeDialog';
import { useDesignStore } from '@/store/designStore';
import { useProjectId } from '@/components/projects/ProjectGate';
import { useDesignCatalog } from '@/hooks/useDesignCatalog';
import { useLocale, useT } from '@/lib/i18n/client';
import { generationStatus, startAiGeneration } from '@/lib/design/aiDesignClient';
import { aiFallback, generationAction, JOB_POLL_MS, type AiFallback, type GenerationStage, type GenerationStatus, type PlanRefusal } from '@/lib/design/generationJob';
import { PlanBadge } from '@/components/plans/PlanBadge';
import { usePlanStore } from '@/store/planStore';
import type { PlanFeature } from '@/lib/plans/plans';
import { MAX_AI_GENERATIONS } from '@/lib/design/aiProposal';
import { dropCachedCopy } from '@/lib/flow/projectSync';
import { formatM2 } from '@/lib/utils';
import { totalFloorAreaM2 } from '@/lib/design/planGeometry';
import { scoreQuiz } from '@/lib/design/styleQuiz';
import { designStepHref, designStepCount, designStepPosition, previousStepHref } from '@/lib/design/steps';
import { saveDesign } from '@/lib/design/saveDesign';

/**
 * What the overlay is showing: the engine's flat being opened, or the server's job at its stage —
 * and, when the AI designer was meant to design the flat and did not, why (`fallback`).
 */
type Run = { kind: 'engine'; fallback: AiFallback | null } | { kind: 'ai'; stage: GenerationStage; fallback: AiFallback | null };

/**
 * Step 4: the style test — five questions and a verdict — with the four plates under it for
 * a direct pick, and an optional furniture budget. "Generate" warns that the plan is settled
 * from here (`HingeDialog`), then lays the flat out and opens the studio.
 *
 * With the AI designer the flat is laid out on the server (`lib/api/designJob`): the page saves
 * the design, starts the job and asks after it every few seconds, the overlay showing its stage,
 * and when it is done reads the design again from the server and opens the studio. Closing the
 * page or losing the connection stops none of it: opening the project again lands here while the
 * job runs (and waits on it again) or in the studio once it is done. Without the designer, or when
 * the job fails, the engine lays the flat out here, as always. A plan that does not include the
 * designer (the plan's locks, `planRefused`) is said before the press, with the upgrade, and the
 * engine lays the flat out without asking the server.
 */
export default function StylePage() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const projectId = useProjectId();
  const { plan, styleId, styleProfile, budgetGel, homeState, mode, generation, setStyle, setStyleProfile, setBudget, generate, setStep, holdAutosave } = useDesignStore();
  const { products, loading, error } = useDesignCatalog();
  const [budgetInput, setBudgetInput] = useState(budgetGel ? String(budgetGel) : '');
  /** The warning before the generation (`HingeDialog`). */
  const [hinge, setHinge] = useState(false);
  /** The AI designer is there (a key on the server). */
  const [aiEnabled, setAiEnabled] = useState(false);
  /** The person's plan does not include the designer's start (the plan's locks): told before the generation, and the engine lays the flat out. */
  const [planRefused, setPlanRefused] = useState<PlanRefusal | null>(null);
  /** The feature the plan lacks, for the upgrade the overlay offers after a refused start. */
  const [upgradeFeature, setUpgradeFeature] = useState<PlanFeature>('catalog');
  const requestUpgrade = usePlanStore((s) => s.requestUpgrade);
  const [run, setRun] = useState<Run | null>(null);
  /** This page started the job, or found it running, and waits on it. */
  const waiting = useRef(false);
  /** The engine is to lay the flat out as soon as the catalogue is here (the job came to nothing before it arrived), and why. */
  const engineDue = useRef<{ fallback: AiFallback | null } | null>(null);
  /** The catalogue as it is now, for what the server's answers set off. */
  const catalogNow = useRef(products);
  const generating = run != null;

  /** Lays the flat out here with the engine, and opens the studio. */
  const engineNow = useCallback(
    (catalog: typeof products, fallback: AiFallback | null) => {
      engineDue.current = null;
      generate(catalog, null);
      setStep(5);
      setRun({ kind: 'engine', fallback });
    },
    [generate, setStep]
  );

  /**
   * Lays the flat out here with the engine — no designer (`fallback` null), or the designer could
   * not design it (why: the overlay says so).
   */
  const layOutWithEngine = useCallback(
    (fallback: AiFallback | null) => {
      waiting.current = false;
      holdAutosave(false);
      const catalog = catalogNow.current;
      if (catalog.length > 0) engineNow(catalog, fallback);
      else engineDue.current = { fallback };
    },
    [holdAutosave, engineNow]
  );

  useEffect(() => {
    catalogNow.current = products;
    if (engineDue.current && products.length > 0) engineNow(products, engineDue.current.fallback);
  }, [products, engineNow]);

  /** What the server says about the job, acted on (`generationAction`). */
  const follow = useCallback(
    (status: Pick<GenerationStatus, 'job' | 'designGenerated'>) => {
      const local = useDesignStore.getState();
      const action = generationAction(status, { generated: local.generated }, waiting.current);
      if (action === 'wait' && status.job) {
        waiting.current = true;
        holdAutosave(true);
        setRun({ kind: 'ai', stage: status.job.stage, fallback: null });
      } else if (action === 'reload') {
        waiting.current = false;
        holdAutosave(true);
        // The server's flat: the designer's, or the engine's when the designer failed (said so).
        setRun({ kind: 'ai', stage: 'done', fallback: aiFallback(status.job) });
      } else if (action === 'engine') {
        // Nothing laid out on the server: the person is told why.
        layOutWithEngine(aiFallback(status.job, false));
      } else if (waiting.current) {
        waiting.current = false;
        holdAutosave(false);
        setRun(null);
      }
    },
    [holdAutosave, layOutWithEngine]
  );

  // Whether the designer is there — and a job of this project's that is running, or finished
  // while the page was closed: the overlay comes back on it.
  useEffect(() => {
    let live = true;
    void generationStatus(projectId).then((status) => {
      if (!live || !status) return;
      setAiEnabled(status.enabled);
      setPlanRefused(status.planRefused);
      if (status.planRefused) setUpgradeFeature(status.planRefused.feature);
      follow(status);
    });
    return () => {
      live = false;
    };
  }, [projectId, follow]);

  // While a job runs: asked after every few seconds. A failed request is asked again — the
  // connection dropping changes nothing on the server.
  const stage = run?.kind === 'ai' ? run.stage : null;
  useEffect(() => {
    if (stage !== 'designing' && stage !== 'checking') return;
    const timer = window.setTimeout(() => {
      void generationStatus(projectId).then((status) => {
        if (status) follow(status);
        else setRun((r) => (r ? { ...r } : r));
      });
    }, JOB_POLL_MS);
    return () => window.clearTimeout(timer);
  }, [stage, run, projectId, follow]);

  // The autosave writes again when the page is left while a job runs (another step, the back button).
  useEffect(() => () => useDesignStore.for(projectId).getState().holdAutosave(false), [projectId]);

  if (!plan || plan.rooms.length === 0) {
    return (
      <>
        <DesignSteps current={4} />
        <EmptyStep message={t.design.needPlanDesc} back={t.design.addPlan} href={designStepHref(projectId, 1)} />
      </>
    );
  }

  /**
   * Before the hinge: the budget into the design and the design saved, with the autosave held — a
   * generation on the server writes over exactly the revision this save makes.
   */
  const saveBeforeGenerating = async () => {
    const budget = budgetInput ? Number(budgetInput) : null;
    holdAutosave(true);
    setBudget(Number.isFinite(budget as number) ? budget : null, products);
    try {
      return await saveDesign({ draft: true, projectId });
    } catch (err) {
      holdAutosave(false);
      throw err;
    }
  };

  /**
   * Paid: the flat is laid out in the style chosen, and the studio opens. With the AI designer,
   * on the server (its proposal, then its check of every room — `lib/api/designJob`); without
   * it, or when it cannot start, the engine here, as always.
   */
  const generateNow = async () => {
    setHinge(false);
    if (!aiEnabled) {
      layOutWithEngine(null);
      return;
    }
    // The plan does not include the designer (said before the press): the engine, and the upgrade offered.
    if (planRefused) {
      layOutWithEngine('plan');
      return;
    }
    // The design's AI runs used up (the server counts them too): the engine, and the person told.
    if ((generation?.aiCount ?? 0) >= MAX_AI_GENERATIONS) {
      layOutWithEngine('limit');
      return;
    }
    waiting.current = true;
    setRun({ kind: 'ai', stage: 'designing', fallback: null });
    const started = await startAiGeneration({ projectId, baseRev: useDesignStore.getState().baseRev ?? 0, locale: locale as 'ka' | 'en' | 'ru' });
    if ('job' in started) follow({ job: started.job, designGenerated: false });
    else {
      if (started.feature) setUpgradeFeature(started.feature);
      layOutWithEngine(started.refused);
    }
  };

  /** The overlay has finished: the studio — the engine's flat as it is here, the server's read again from the server. */
  const opened = () => {
    if (run?.kind === 'ai') {
      dropCachedCopy('design', projectId);
      window.location.assign(designStepHref(projectId, 5));
      return;
    }
    router.push(designStepHref(projectId, 5));
  };

  return (
    <>
      <DesignFlowGuard step={4} hold={generating} />
      <DesignSteps current={4} />
      <div className="container py-10 md:py-14">
        <StepHeader
          step={designStepPosition(4, homeState, mode)}
          total={designStepCount(homeState, mode)}
          title={t.build.quizTitle}
          subtitle={t.build.quizSubtitle}
          meta={
            <>
              <span>{plan.rooms.length} × {t.design.step2}</span>
              <span className="text-ink-faint">·</span>
              <span>{formatM2(totalFloorAreaM2(plan))}</span>
            </>
          }
        />
        <StageBrief step={4} className="mt-6" />

        <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <SectionHead title={t.design.budgetTitle} subtitle={t.design.budgetSubtitle} />
          <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-bg-surface p-5">
            <div className="w-56">
              <Label htmlFor="budget" className="eyebrow">
                {t.design.budgetTitle} · ₾
              </Label>
              <Input id="budget" type="number" min={0} step={500} inputMode="numeric" value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)} placeholder={t.design.budgetPlaceholder} className="mt-1.5 tabular-nums" />
            </div>
            {budgetInput && (
              <button type="button" onClick={() => setBudgetInput('')} className="arrow-link h-10 text-sm font-medium text-ink-soft hover:text-ink">
                {t.design.budgetAny}
              </button>
            )}
          </div>
        </section>

        <section className="mt-12">
          <StyleQuiz
            profile={styleProfile}
            styleId={styleId}
            onResult={(id, profile) => {
              setStyleProfile(profile);
              setStyle(id, products);
            }}
            onRetake={() => setStyleProfile(null)}
          />
        </section>

        <section className="mt-10 space-y-5">
          <SectionHead title={t.build.quizOrPick} subtitle={t.design.styleSubtitle} />
          <StylePicker
            value={styleId}
            onChange={(id) => {
              setStyle(id, products);
              // A direct pick is a profile of its own: the answers stay, the choice is marked.
              const scored = styleProfile ? scoreQuiz(styleProfile.answers) : null;
              setStyleProfile({ answers: styleProfile?.answers ?? {}, scores: scored?.profile.scores ?? { modern: 0, scandinavian: 0, industrial: 0, vintage: 0 }, direct: true });
            }}
          />
        </section>

        {/* Told before the generation: the plan does not include the AI designer, so the standard engine lays the flat out. */}
        {aiEnabled && planRefused && (
          <div className="mt-10 flex flex-wrap items-start gap-3 rounded-2xl bg-mist-light p-4 text-sm text-ink">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="min-w-0 flex-1">{t.decor.genAiPlanBefore}</p>
            <Button size="sm" variant="outline" onClick={() => requestUpgrade({ feature: planRefused.feature })} className="gap-1.5">
              {t.decor.genAiPlanUpgrade}
              {planRefused.plan && <PlanBadge plan={planRefused.plan} iconOnly />}
            </Button>
          </div>
        )}

        {error && <p className="mt-6 rounded-xl bg-coral-soft px-4 py-3 text-sm font-medium text-danger">{t.design.catalogError}</p>}
      </div>

      <StepNav
        back={{ href: previousStepHref(projectId, 4, homeState, mode), label: t.calculator.backButton }}
        next={{
          label: generating ? t.design.generating : t.design.generate,
          onClick: () => setHinge(true),
          disabled: loading || products.length === 0,
          loading: generating || loading,
          icon: <Sparkles className="h-4 w-4" />,
        }}
      />
      {hinge && (
        <HingeDialog open onOpenChange={setHinge} kind="design" save={saveBeforeGenerating} onConfirm={generateNow} />
      )}
      <GenerationOverlay
        open={generating}
        ai={run?.kind === 'ai'}
        stage={run?.kind === 'ai' ? run.stage : 'done'}
        fallback={run?.fallback ?? null}
        onDone={opened}
        // The studio opens with the upgrade dialogue over it (the engine's flat: no reload drops it).
        onUpgrade={() => {
          requestUpgrade({ feature: upgradeFeature });
          opened();
        }}
      />
    </>
  );
}
