'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DesignSteps } from '@/components/design/DesignSteps';
import { StylePicker } from '@/components/design/StylePicker';
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
        <div className="container py-20 text-center">
          <h1 className="font-serif text-2xl font-bold">{t.design.needPlanTitle}</h1>
          <p className="mt-2 text-ink-muted">{t.design.needPlanDesc}</p>
          <Button asChild className="mt-6">
            <Link href="/design">{t.design.startOver}</Link>
          </Button>
        </div>
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
      <div className="container py-10">
        <div className="mx-auto max-w-5xl space-y-10">
          <header>
            <h1 className="font-serif text-2xl font-bold md:text-3xl">{t.design.styleTitle}</h1>
            <p className="mt-1 text-sm text-ink-muted">{t.design.styleSubtitle}</p>
            <p className="mt-2 text-xs text-ink-muted">
              {plan.rooms.length} × {t.design.step2} · {formatM2(totalFloorAreaM2(plan))}
            </p>
          </header>

          <StylePicker value={styleId} onChange={(id) => setStyle(id, products)} />

          <section className="rounded-lg border border-line bg-bg-surface p-5">
            <h2 className="flex items-center gap-2 font-serif text-lg font-semibold">
              <Wallet className="h-4 w-4 text-brand" />
              {t.design.budgetTitle}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">{t.design.budgetSubtitle}</p>

            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div className="w-56">
                <Label htmlFor="budget">₾</Label>
                <Input
                  id="budget"
                  type="number"
                  min={0}
                  step={500}
                  inputMode="numeric"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  placeholder={t.design.budgetPlaceholder}
                />
              </div>
              {budgetInput && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setBudgetInput('')}>
                  {t.design.budgetAny}
                </Button>
              )}
            </div>
          </section>

          {error && (
            <p className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
              {t.design.catalogError}
            </p>
          )}

          <div className="flex justify-end">
            <Button
              type="button"
              size="xl"
              onClick={handleGenerate}
              disabled={loading || generating || products.length === 0}
              className="shadow-cardHover"
            >
              {generating || loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {generating ? t.design.generating : '…'}
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5" />
                  {t.design.generate}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
