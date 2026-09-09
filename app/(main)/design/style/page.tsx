'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DesignSteps } from '@/components/design/DesignSteps';
import { StylePicker } from '@/components/design/StylePicker';
import { StepHeader, SectionHead } from '@/components/flow/StepHeader';
import { StepNav } from '@/components/flow/StepNav';
import { EmptyStep } from '@/components/flow/EmptyStep';
import { useDesignStore } from '@/store/designStore';
import { useDesignCatalog } from '@/hooks/useDesignCatalog';
import { useT } from '@/lib/i18n/client';
import { formatM2 } from '@/lib/utils';
import { totalFloorAreaM2 } from '@/lib/design/planGeometry';

export default function StylePage() {
  const t = useT();
  const router = useRouter();
  const { plan, styleId, budgetGel, setStyle, setBudget, generate } = useDesignStore();
  const { products, loading, error } = useDesignCatalog();
  const [budgetInput, setBudgetInput] = useState(budgetGel ? String(budgetGel) : '');
  const [generating, setGenerating] = useState(false);

  if (!plan || plan.rooms.length === 0) {
    return (
      <>
        <DesignSteps current={3} />
        <EmptyStep message={t.design.needPlanDesc} back={t.design.startOver} href="/design" />
      </>
    );
  }

  const handleGenerate = async () => {
    setGenerating(true);
    const budget = budgetInput ? Number(budgetInput) : null;
    setBudget(Number.isFinite(budget as number) ? budget : null, products);
    // Layout + matching are synchronous and fast; yield once so the button can show its
    // spinner rather than freezing mid-click.
    await new Promise((resolve) => setTimeout(resolve, 16));
    generate(products);
    router.push('/design/studio');
  };

  return (
    <>
      <DesignSteps current={3} />
      <div className="container py-10 md:py-14">
        <StepHeader
          step={3}
          total={5}
          title={t.design.styleTitle}
          subtitle={t.design.styleSubtitle}
          meta={
            <>
              <span>{plan.rooms.length} × {t.design.step2}</span>
              <span className="text-ink-faint">·</span>
              <span>{formatM2(totalFloorAreaM2(plan))}</span>
            </>
          }
        />

        <section className="mt-10">
          <StylePicker value={styleId} onChange={(id) => setStyle(id, products)} />
        </section>

        <section className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <SectionHead title={t.design.budgetTitle} subtitle={t.design.budgetSubtitle} />
          <div className="flex flex-wrap items-end gap-3 border border-line bg-bg-surface p-5">
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

        {error && <p className="mt-6 border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{t.design.catalogError}</p>}
      </div>

      <StepNav
        back={{ href: '/design/plan', label: t.calculator.backButton }}
        next={{
          label: generating ? t.design.generating : t.design.generate,
          onClick: handleGenerate,
          disabled: loading || products.length === 0,
          loading: generating || loading,
          icon: <Sparkles className="h-4 w-4" />,
        }}
      />
    </>
  );
}
