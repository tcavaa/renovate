'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n/client';
import type { HomeState } from '@/lib/calculator/types';

const OPTIONS: Array<{ value: HomeState; phases: string }> = [
  { value: 'old_renovation', phases: '00, 02 – 13' },
  { value: 'black_frame', phases: '01 – 14' },
  { value: 'white_frame', phases: '02, 04, 06 – 14' },
  { value: 'green_frame', phases: '06, 09 – 12, 14' },
];

/**
 * Four sharp option cards — two by two, in one row on a wide screen — from the most work to
 * the least. The chosen one fills with ink; the others stay paper with a hairline. Each
 * shows which renovation phases the estimate will include.
 */
export function HomeStateSelector({ value, onChange }: { value: HomeState | null; onChange: (v: HomeState) => void }) {
  const t = useT();
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="radiogroup" aria-label={t.homeState.title}>
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
              'group relative flex min-h-[200px] flex-col rounded-2xl border p-5 text-left transition-[background-color,border-color,box-shadow] duration-300',
              selected ? 'border-brand bg-brand-50 ring-1 ring-brand' : 'border-line bg-bg-surface hover:border-stone hover:bg-mist-light'
            )}
          >
            <div className="flex items-start justify-between">
              <span className={cn('text-sm font-extrabold leading-none tabular-nums', selected ? 'text-brand' : 'text-ink-faint')}>{String(i + 1).padStart(2, '0')}</span>
              <span
                className={cn(
                  'grid h-6 w-6 place-items-center rounded-full border transition-colors',
                  selected ? 'border-brand bg-brand text-white' : 'border-stone text-transparent group-hover:border-ink'
                )}
              >
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
            </div>
            <h3 className="mt-auto font-display text-2xl leading-tight text-ink">{copy.label}</h3>
            <p className={cn('mt-2 text-sm leading-relaxed', selected ? 'text-ink-soft' : 'text-ink-muted')}>{copy.description}</p>
            <p className={cn('mt-4 text-[11px] font-bold uppercase tracking-[0.08em]', selected ? 'text-brand' : 'text-ink-faint')}>
              {t.calculator.phasesLabel} {opt.phases}
            </p>
          </button>
        );
      })}
    </div>
  );
}
