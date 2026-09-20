'use client';

import Link from 'next/link';
import { Check, Lock } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { StartOverButton } from '@/components/flow/StartOverButton';
import type { FlowKind } from '@/lib/flow/reset';
import { cn } from '@/lib/utils';

export interface FlowStep {
  num: number;
  label: string;
  href: string;
}

/**
 * The journey as an editorial index: numbered cells under the header, hairline above and
 * below, the current one underscored in ink. Done steps are links back; upcoming ones are
 * faded and inert; steps before `lockedBefore` are shut with a padlock — the 3D design has
 * been made and the things that fed it cannot be changed under it any more. "Start again"
 * sits at the end, because closing a step has to leave a way out of it.
 *
 * Shared by the calculator and the design studio, which shut a step for different reasons —
 * hence `lockedTitle`; the default says it was the 3D design.
 */
export function StepStrip({ steps, current, lockedBefore = 0, kind, lockedTitle }: { steps: FlowStep[]; current: number; /** Steps numbered below this are closed. */ lockedBefore?: number; /** Which journey "start again" empties. */ kind?: FlowKind; /** Why those steps are shut. */ lockedTitle?: string }) {
  const t = useT();
  return (
    <nav aria-label="steps" className="border-b border-line bg-bg-base">
      <div className="container flex items-stretch gap-2">
      <ol className="grid flex-1 auto-cols-fr grid-flow-col">
        {steps.map((step) => {
          const locked = step.num < lockedBefore;
          const status = locked ? 'locked' : step.num < current ? 'done' : step.num === current ? 'current' : 'upcoming';
          const reachable = !locked && step.num <= current;
          const inner = (
            <>
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    'grid h-5 w-5 shrink-0 place-items-center text-[10px] font-semibold tabular-nums',
                    status === 'done' && 'bg-ink text-white',
                    status === 'current' && 'bg-brand text-white',
                    status === 'locked' && 'bg-sand text-ink-faint',
                    status === 'upcoming' && 'border border-line text-ink-faint'
                  )}
                >
                  {status === 'done' ? <Check className="h-3 w-3" /> : status === 'locked' ? <Lock className="h-2.5 w-2.5" /> : String(step.num).padStart(2, '0')}
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
                <div className={cell} title={status === 'locked' ? lockedTitle ?? t.flow.lockedStep : undefined}>
                  {inner}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {kind && <StartOverButton kind={kind} className="self-center" />}
      </div>
    </nav>
  );
}
