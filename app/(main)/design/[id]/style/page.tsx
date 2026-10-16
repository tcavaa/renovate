'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
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
import { aiDesignerEnabled, requestAiDesign } from '@/lib/design/aiDesignClient';
import { MAX_AI_GENERATIONS } from '@/lib/design/aiProposal';
import { formatM2 } from '@/lib/utils';
import { totalFloorAreaM2 } from '@/lib/design/planGeometry';
import { scoreQuiz } from '@/lib/design/styleQuiz';
import { designStepHref, designStepPosition, previousStepHref } from '@/lib/design/steps';
import { saveDesign } from '@/lib/design/saveDesign';

/**
 * Step 4: the style test — five questions and a verdict — with the four plates under it for
 * a direct pick, and an optional furniture budget. "Generate" warns that the plan is settled
 * from here and takes the platform's fee for the design (`HingeDialog`: a test card for now),
 * then lays the flat out and opens the studio.
 */
export default function StylePage() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const projectId = useProjectId();
  const { plan, styleId, styleProfile, budgetGel, homeState, mode, generation, setStyle, setStyleProfile, setBudget, generate, setStep } = useDesignStore();
  const { products, loading, error } = useDesignCatalog();
  const [budgetInput, setBudgetInput] = useState(budgetGel ? String(budgetGel) : '');
  const [generating, setGenerating] = useState(false);
  /** The warning and the fee before the generation (`HingeDialog`). */
  const [hinge, setHinge] = useState(false);
  /** The AI designer is there (a key on the server) and this design has AI runs left. */
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiRun, setAiRun] = useState(false);
  /** The flat is laid out: the overlay may finish. */
  const [laidOut, setLaidOut] = useState(true);
  useEffect(() => {
    let live = true;
    void aiDesignerEnabled().then((on) => live && setAiEnabled(on));
    return () => {
      live = false;
    };
  }, []);

  if (!plan || plan.rooms.length === 0) {
    return (
      <>
        <DesignSteps current={4} />
        <EmptyStep message={t.design.needPlanDesc} back={t.design.addPlan} href={designStepHref(projectId, 1)} />
      </>
    );
  }

  /**
   * Paid: the flat is laid out in the style chosen, and the studio opens. With the AI designer,
   * its proposal first (furniture, colours, decor — `lib/design/aiProposal`); without it, or when
   * it fails, the engine alone, as always.
   */
  const generateNow = async () => {
    setHinge(false);
    const budget = budgetInput ? Number(budgetInput) : null;
    const budgetValue = Number.isFinite(budget as number) ? budget : null;
    const useAi = aiEnabled && (generation?.aiCount ?? 0) < MAX_AI_GENERATIONS;
    setAiRun(useAi);
    setLaidOut(!useAi);
    setGenerating(true);
    setBudget(budgetValue, products);
    // Layout + matching are synchronous and fast; yield once so the overlay can appear.
    await new Promise((resolve) => setTimeout(resolve, 16));
    const proposal = useAi ? await requestAiDesign({ projectId, plan, styleId, styleProfile, budgetGel: budgetValue, locale: locale as 'ka' | 'en' | 'ru' }) : null;
    generate(products, proposal);
    setStep(5);
    setLaidOut(true);
  };

  return (
    <>
      <DesignFlowGuard step={4} />
      <DesignSteps current={4} />
      <div className="container py-10 md:py-14">
        <StepHeader
          step={designStepPosition(4, homeState, mode)}
          total={8}
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
          <div className="flex flex-wrap items-end gap-3 rounded-[16px] border border-line bg-bg-surface p-5">
            <div className="w-56">
              <Label htmlFor="budget" className="eyebrow">
                {t.design.budgetTitle} · ₾
              </Label>
              <Input id="budget" type="number" min={0} step={500} inputMode="numeric" value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)} placeholder={t.design.budgetPlaceholder} className="mt-1.5 tabular-nums" />
            </div>
            {budgetInput && (
              <button type="button" onClick={() => setBudgetInput('')} className="bracket-link h-10 text-sm font-medium text-ink-soft hover:text-ink">
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

        {error && <p className="mt-6 rounded-[12px] border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{t.design.catalogError}</p>}
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
        <HingeDialog open onOpenChange={setHinge} kind="design" projectId={projectId} save={() => saveDesign({ draft: true })} onPaid={generateNow} />
      )}
      <GenerationOverlay open={generating} ai={aiRun} ready={laidOut} onDone={() => router.push(designStepHref(projectId, 5))} />
    </>
  );
}
