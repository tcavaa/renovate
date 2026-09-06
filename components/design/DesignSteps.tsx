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

/** The five-step journey as a slim progress strip; done steps are links back. */
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
    <div className="border-b border-line/70 bg-bg-base/80 backdrop-blur">
      <ol className="container flex h-[52px] items-center gap-1 overflow-x-auto sm:gap-2">
        {steps.map((step, i) => {
          const status = step.num < current ? 'done' : step.num === current ? 'current' : 'upcoming';
          const reachable = step.num <= current;
          const inner = (
            <>
              <span
                className={cn(
                  'grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold transition-colors',
                  status === 'done' && 'bg-ink text-white',
                  status === 'current' && 'bg-brand text-white',
                  status === 'upcoming' && 'border border-line text-ink-faint'
                )}
              >
                {status === 'done' ? <Check className="h-3 w-3" /> : step.num}
              </span>
              <span className={cn('whitespace-nowrap text-xs font-medium', status === 'current' ? 'text-ink' : 'text-ink-muted')}>{step.label}</span>
            </>
          );
          const className = cn('flex items-center gap-2 rounded-full px-2 py-1', reachable && status !== 'current' && 'hover:bg-white');
          return (
            <li key={step.num} className="flex items-center gap-1 sm:gap-2">
              {reachable ? (
                <Link href={HREFS[step.num]} className={className}>
                  {inner}
                </Link>
              ) : (
                <div className={className}>{inner}</div>
              )}
              {i < steps.length - 1 && <span className={cn('h-px w-6 sm:w-10', step.num < current ? 'bg-ink' : 'bg-line')} />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
