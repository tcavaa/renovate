'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n/client';
import type { HomeState } from '@/lib/calculator/types';

const OPTIONS: Array<{ value: HomeState; phases: string }> = [
  { value: 'black_frame', phases: '01 – 18' },
  { value: 'white_frame', phases: '09 – 17' },
  { value: 'green_frame', phases: '17' },
];

/**
 * Three sharp option cards in a row. The chosen one fills with ink; the others stay paper
 * with a hairline. Each shows which renovation phases the estimate will include.
 */
export function HomeStateSelector({ value, onChange }: { value: HomeState | null; onChange: (v: HomeState) => void }) {
  const t = useT();
  return (
    <div className="grid border-t border-l border-line sm:grid-cols-3" role="radiogroup" aria-label={t.homeState.title}>
      {OPTIONS.map((opt, i) => {
        const copy = t.homeState[opt.value];
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            data-selected={selected}
            className={cn(
              'group relative flex min-h-[200px] flex-col border-b border-r border-line p-5 text-left transition-colors duration-300',
              selected ? 'bg-ink text-white' : 'bg-bg-surface hover:bg-sand-light'
            )}
          >
            <div className="flex items-start justify-between">
              <span className={cn('text-xs font-semibold tabular-nums', selected ? 'text-white/60' : 'text-ink-faint')}>{String(i + 1).padStart(2, '0')}</span>
              <span
                className={cn(
                  'grid h-5 w-5 place-items-center border transition-colors',
                  selected ? 'border-white bg-white text-ink' : 'border-line text-transparent group-hover:border-ink/40'
                )}
              >
                <Check className="h-3 w-3" />
              </span>
            </div>
            <h3 className={cn('mt-auto font-serif text-2xl font-semibold leading-tight', selected ? 'text-white' : 'text-ink')}>{copy.label}</h3>
            <p className={cn('mt-2 text-sm leading-relaxed', selected ? 'text-white/70' : 'text-ink-muted')}>{copy.description}</p>
            <p className={cn('mt-4 text-[11px] font-semibold uppercase tracking-[0.14em]', selected ? 'text-white/50' : 'text-ink-faint')}>
              {t.calculator.phasesLabel} {opt.phases}
            </p>
          </button>
        );
      })}
    </div>
  );
}
