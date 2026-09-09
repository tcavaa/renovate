'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FlowStep {
  num: number;
  label: string;
  href: string;
}

/**
 * The journey as an editorial index: five numbered cells under the header, hairline above
 * and below, the current one underscored in ink. Done steps are links back; upcoming ones
 * are faded and inert. Shared by the calculator and the design studio.
 */
export function StepStrip({ steps, current }: { steps: FlowStep[]; current: number }) {
  return (
    <nav aria-label="steps" className="border-b border-line bg-bg-base">
      <ol className="container grid auto-cols-fr grid-flow-col">
        {steps.map((step) => {
          const status = step.num < current ? 'done' : step.num === current ? 'current' : 'upcoming';
          const reachable = step.num <= current;
          const inner = (
            <>
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    'grid h-5 w-5 shrink-0 place-items-center text-[10px] font-semibold tabular-nums',
                    status === 'done' && 'bg-ink text-white',
                    status === 'current' && 'bg-brand text-white',
                    status === 'upcoming' && 'border border-line text-ink-faint'
                  )}
                >
                  {status === 'done' ? <Check className="h-3 w-3" /> : String(step.num).padStart(2, '0')}
                </span>
                <span
                  className={cn(
                    'hidden truncate text-xs font-medium sm:inline',
                    status === 'current' ? 'text-ink' : status === 'done' ? 'text-ink-soft' : 'text-ink-faint'
                  )}
                >
                  {step.label}
                </span>
              </span>
              <span
                aria-hidden
                className={cn(
                  'absolute inset-x-0 bottom-0 h-[2px] transition-colors',
                  status === 'current' ? 'bg-ink' : 'bg-transparent'
                )}
              />
            </>
          );
          const cell = cn(
            'relative flex h-12 items-center justify-center px-2 sm:justify-start sm:px-4',
            'border-l border-line first:border-l-0',
            reachable && status !== 'current' && 'transition-colors hover:bg-white'
          );
          return (
            <li key={step.num} aria-current={status === 'current' ? 'step' : undefined} className="min-w-0">
              {reachable ? (
                <Link href={step.href} className={cell}>
                  {inner}
                </Link>
              ) : (
                <div className={cell}>{inner}</div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
