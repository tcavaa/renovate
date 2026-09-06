'use client';

import { useRouter } from 'next/navigation';
import { ArrowRight, Check, Home, Sofa } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DesignSteps } from '@/components/design/DesignSteps';
import { PlanUploadCard } from '@/components/design/PlanUploadCard';
import { StepHeader, SectionHead } from '@/components/flow/StepHeader';
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
      <div className="container py-10 md:py-14">
        <StepHeader step={1} total={5} title={t.design.title} subtitle={t.design.subtitle} />
        <div className="mt-10">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
            <div>
              <SectionHead index="01" title={t.design.modeTitle} subtitle={t.design.modeSubtitle} />
              <div>
                <div className="mt-5 grid gap-3">
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

              <div className="mt-8 border border-line bg-bg-surface p-5">
                <p className="eyebrow">{t.design.noPlanTitle}</p>
                <p className="mt-1 text-sm text-ink-muted">{t.design.noPlanDesc}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={useCalculator} disabled={calculatorRooms.length === 0}>
                    {t.design.useCalculatorRooms}
                    {calculatorRooms.length > 0 && <span className="text-ink-muted">({calculatorRooms.length})</span>}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" asChild>
                    <a href="/calculator">
                      {t.design.drawManually} <ArrowRight className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </div>
            </div>

            <section>
              <SectionHead index="02" title={t.design.uploadTitle} aside={<span className="text-xs">{t.design.uploadFormats}</span>} />
              <div className="mt-5 border border-line bg-bg-surface p-5 md:p-6">
              <PlanUploadCard
                showSample
                onPlan={(plan, imageUrl) => {
                  setPlan(plan, imageUrl);
                  router.push('/design/plan');
                }}
              />
              </div>
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
        'group flex items-start gap-4 border p-4 text-left transition-colors duration-300',
        active ? 'border-ink bg-ink text-white' : 'border-line bg-bg-surface hover:border-ink/40'
      )}
    >
      <span className={cn('grid h-10 w-10 shrink-0 place-items-center border', active ? 'border-white/20 text-white' : 'border-line text-ink-muted')}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-serif text-lg font-semibold leading-tight">{label}</span>
        <span className={cn('mt-1 block text-sm leading-relaxed', active ? 'text-white/70' : 'text-ink-muted')}>{description}</span>
      </span>
      <span className={cn('grid h-5 w-5 shrink-0 place-items-center border', active ? 'border-white bg-white text-ink' : 'border-line text-transparent group-hover:border-ink/40')}>
        <Check className="h-3 w-3" />
      </span>
    </button>
  );
}
