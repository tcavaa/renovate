'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n/client';
import type { StudioStep } from '@/store/designStore';

const HREFS: Record<StudioStep, string> = {
  1: '/design',
  2: '/design/plan',
  3: '/design/style',
  4: '/design/studio',
  5: '/design/summary',
};

export function DesignSteps({ current }: { current: StudioStep }) {
  const t = useT();
  const steps: Array<{ num: StudioStep; label: string }> = [
    { num: 1, label: t.design.step1 },
    { num: 2, label: t.design.step2 },
    { num: 3, label: t.design.step3 },
    { num: 4, label: t.design.step4 },
    { num: 5, label: t.design.step5 },
  ];

  return (
    <div className="border-b border-line bg-bg-surface">
      <div className="container py-4">
        <ol className="flex items-center justify-between gap-1 sm:gap-4">
          {steps.map((step, i) => {
            const status =
              step.num < current ? 'done' : step.num === current ? 'current' : 'upcoming';
            const reachable = step.num <= current;
            const inner = (
              <>
                <span
                  className={cn(
                    'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold transition-colors',
                    status === 'done' && 'bg-success text-white',
                    status === 'current' && 'bg-brand text-white shadow-sm',
                    status === 'upcoming' && 'bg-line text-ink-muted'
                  )}
                >
                  {status === 'done' ? <Check className="h-3.5 w-3.5" /> : step.num}
                </span>
                <span
                  className={cn(
                    'hidden text-xs font-medium sm:inline',
                    status === 'current' ? 'text-ink' : 'text-ink-muted'
                  )}
                >
                  {step.label}
                </span>
              </>
            );
            const className = cn(
              'flex flex-1 items-center gap-2 sm:gap-3',
              reachable && 'cursor-pointer'
            );

            return (
              <li key={step.num} className="flex flex-1 items-center gap-2 sm:gap-3">
                {reachable ? (
                  <Link href={HREFS[step.num]} className={className}>
                    {inner}
                  </Link>
                ) : (
                  <div className={className}>{inner}</div>
                )}
                {i < steps.length - 1 && (
                  <span
                    className={cn(
                      'hidden h-px flex-1 sm:block',
                      step.num < current ? 'bg-success/40' : 'bg-line'
                    )}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
