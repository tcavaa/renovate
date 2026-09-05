'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n/client';

export function StepIndicator({ current }: { current: 1 | 2 | 3 | 4 | 5 }) {
  const ka = useT();
  const steps = [
    { num: 1, label: ka.calculator.step1, href: '/calculator' },
    { num: 2, label: ka.calculator.step2, href: '/calculator/materials' },
    { num: 3, label: ka.calculator.step3, href: '/calculator/catalog' },
    { num: 4, label: ka.calculator.step4, href: '/calculator/furniture' },
    { num: 5, label: ka.calculator.step5, href: '/calculator/summary' },
  ];

  return (
    <div className="border-b border-line bg-bg-surface">
      <div className="container py-5">
        <ol className="flex items-center justify-between gap-1 sm:gap-4">
          {steps.map((step, i) => {
            const status =
              step.num < current
                ? 'done'
                : step.num === current
                  ? 'current'
                  : 'upcoming';
            const reachable = step.num <= current;
            const inner = (
              <>
                  <span
                    className={cn(
                      'grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold transition-colors',
                      status === 'done' && 'bg-success text-white',
                      status === 'current' && 'bg-brand text-white shadow-sm',
                      status === 'upcoming' && 'bg-line text-ink-muted'
                    )}
                  >
                    {status === 'done' ? <Check className="h-4 w-4" /> : step.num}
                  </span>
                  <span
                    className={cn(
                      'hidden text-xs font-medium sm:inline md:text-sm',
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
                  <Link href={step.href} className={className}>
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
