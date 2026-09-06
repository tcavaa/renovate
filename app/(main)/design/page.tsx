'use client';

import { useRouter } from 'next/navigation';
import { ArrowRight, Home, Sofa } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DesignSteps } from '@/components/design/DesignSteps';
import { PlanUploadCard } from '@/components/design/PlanUploadCard';
import { useDesignStore } from '@/store/designStore';
import { useCalculatorStore } from '@/store/calculatorStore';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { planFromCalculatorRooms } from '@/lib/design/planGeometry';

/** Step 1 of the studio: what kind of project, and the plan it starts from. */
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
      <div className="relative overflow-hidden bg-radial-warm">
        <div className="grain absolute inset-0" />
        <div className="container relative py-14 md:py-20">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
            <div>
              <p className="eyebrow">{t.design.badge}</p>
              <h1 className="mt-4 text-display-md font-bold text-ink">{t.design.title}</h1>
              <p className="mt-5 max-w-md text-lg leading-relaxed text-ink-soft">{t.design.subtitle}</p>

              <div className="mt-10">
                <h2 className="text-sm font-semibold text-ink">{t.design.modeTitle}</h2>
                <p className="mt-1 text-sm text-ink-muted">{t.design.modeSubtitle}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
              </div>

              <div className="mt-10 rounded-2xl border border-line/70 bg-white/60 p-5 backdrop-blur">
                <h3 className="text-sm font-semibold">{t.design.noPlanTitle}</h3>
                <p className="mt-1 text-sm text-ink-muted">{t.design.noPlanDesc}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={useCalculator} disabled={calculatorRooms.length === 0}>
                    {t.design.useCalculatorRooms}
                    {calculatorRooms.length > 0 && <span className="text-ink-muted">({calculatorRooms.length})</span>}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="rounded-full" asChild>
                    <a href="/calculator">
                      {t.design.drawManually} <ArrowRight className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </div>
            </div>

            <section className="rounded-3xl border border-line bg-bg-surface p-5 shadow-card md:p-7">
              <div className="mb-5 flex items-baseline justify-between gap-3">
                <h2 className="font-serif text-xl font-semibold">{t.design.uploadTitle}</h2>
                <span className="text-xs text-ink-muted">{t.design.uploadFormats}</span>
              </div>
              <PlanUploadCard
                showSample
                onPlan={(plan, imageUrl) => {
                  setPlan(plan, imageUrl);
                  router.push('/design/plan');
                }}
              />
            </section>
          </div>
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
        'flex items-start gap-3 rounded-2xl border p-4 text-left transition-all duration-300',
        active ? 'border-ink bg-ink text-white shadow-cardHover' : 'border-line bg-white/70 hover:border-ink/30 hover:bg-white'
      )}
    >
      <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', active ? 'bg-white/15 text-white' : 'bg-bg-base text-ink-muted')}>{icon}</span>
      <span>
        <span className="block font-semibold">{label}</span>
        <span className={cn('mt-0.5 block text-sm', active ? 'text-white/70' : 'text-ink-muted')}>{description}</span>
      </span>
    </button>
  );
}
