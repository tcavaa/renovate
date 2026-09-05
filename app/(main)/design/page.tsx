'use client';

import { useRouter } from 'next/navigation';
import { Home, Sofa, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DesignSteps } from '@/components/design/DesignSteps';
import { PlanUploadCard } from '@/components/design/PlanUploadCard';
import { useDesignStore } from '@/store/designStore';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { planFromCalculatorRooms } from '@/lib/design/planGeometry';

export default function DesignStartPage() {
  const t = useT();
  const router = useRouter();
  const { mode, setMode, setPlan } = useDesignStore();
  const calculatorRooms = useCalculatorStore((s) => s.rooms);

  const useCalculator = () => {
    if (calculatorRooms.length === 0) return;
    setPlan(planFromCalculatorRooms(calculatorRooms));
    router.push('/design/plan');
  };

  return (
    <>
      <DesignSteps current={1} />
      <div className="container py-10">
        <div className="mx-auto max-w-4xl space-y-10">
          <header className="text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand-dark">
              <Sparkles className="h-3.5 w-3.5" />
              {t.design.badge}
            </span>
            <h1 className="mt-3 font-serif text-3xl font-bold md:text-4xl">{t.design.title}</h1>
            <p className="mx-auto mt-3 max-w-2xl text-ink-muted">{t.design.subtitle}</p>
          </header>

          {/* ---- mode ---- */}
          <section>
            <h2 className="mb-1 font-serif text-xl font-semibold">{t.design.modeTitle}</h2>
            <p className="mb-4 text-sm text-ink-muted">{t.design.modeSubtitle}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <ModeCard
                active={mode === 'design_only'}
                onClick={() => setMode('design_only')}
                icon={<Sofa className="h-5 w-5" />}
                label={t.design.modeDesignOnlyLabel}
                description={t.design.modeDesignOnlyDesc}
              />
              <ModeCard
                active={mode === 'full'}
                onClick={() => setMode('full')}
                icon={<Home className="h-5 w-5" />}
                label={t.design.modeFullLabel}
                description={t.design.modeFullDesc}
              />
            </div>
          </section>

          {/* ---- upload ---- */}
          <section>
            <h2 className="mb-1 font-serif text-xl font-semibold">{t.design.uploadTitle}</h2>
            <p className="mb-4 text-sm text-ink-muted">{t.design.uploadFormats}</p>
            <PlanUploadCard
              showSample
              onPlan={(plan, imageUrl) => {
                setPlan(plan, imageUrl);
                router.push('/design/plan');
              }}
            />
          </section>

          {/* ---- no plan? ---- */}
          <section className="rounded-lg border border-line bg-bg-surface p-5">
            <h3 className="font-serif text-base font-semibold">{t.design.noPlanTitle}</h3>
            <p className="mt-1 text-sm text-ink-muted">{t.design.noPlanDesc}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={useCalculator}
                disabled={calculatorRooms.length === 0}
              >
                {t.design.useCalculatorRooms}
                {calculatorRooms.length > 0 && (
                  <span className="ml-1 text-ink-muted">({calculatorRooms.length})</span>
                )}
              </Button>
              <Button type="button" variant="ghost" size="sm" asChild>
                <a href="/calculator">{t.design.drawManually}</a>
              </Button>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function ModeCard({
  active,
  onClick,
  icon,
  label,
  description,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex items-start gap-3 rounded-lg border p-4 text-left transition-all',
        active
          ? 'border-brand bg-brand/5 shadow-cardHover ring-2 ring-brand/20'
          : 'border-line bg-bg-surface shadow-card hover:border-brand/40'
      )}
    >
      <span
        className={cn(
          'grid h-10 w-10 shrink-0 place-items-center rounded-lg',
          active ? 'bg-brand text-white' : 'bg-bg-base text-ink-muted'
        )}
      >
        {icon}
      </span>
      <span>
        <span className="block font-semibold text-ink">{label}</span>
        <span className="mt-0.5 block text-sm text-ink-muted">{description}</span>
      </span>
    </button>
  );
}
