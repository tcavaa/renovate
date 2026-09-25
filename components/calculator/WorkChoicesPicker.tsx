'use client';

import { useT } from '@/lib/i18n/client';
import { workChoices } from '@/lib/calculator/constants';
import type { WorkChoices } from '@/lib/calculator/types';
import { cn } from '@/lib/utils';

/**
 * The two works that come in two kinds: the floor laid as laminate or parquet, the ceiling as
 * plasterboard or a stretch ceiling. Each is offered only when the estimate includes that work
 * (`floor` / `ceiling`), since the choice changes nothing otherwise.
 */
export function WorkChoicesPicker({
  value,
  onChange,
  floor,
  ceiling,
  compact = false,
}: {
  value: Partial<WorkChoices> | null | undefined;
  onChange: (next: Partial<WorkChoices>) => void;
  floor: boolean;
  ceiling: boolean;
  compact?: boolean;
}) {
  const t = useT();
  const choices = workChoices(value);
  if (!floor && !ceiling) return null;
  const rows: Array<{ label: string; options: Array<{ label: string; active: boolean; pick: () => void }> }> = [];
  if (floor)
    rows.push({
      label: t.calculator.floorChoice,
      options: [
        { label: t.calculator.floorLaminate, active: choices.floor === 'laminate', pick: () => onChange({ floor: 'laminate' }) },
        { label: t.calculator.floorParquet, active: choices.floor === 'parquet', pick: () => onChange({ floor: 'parquet' }) },
      ],
    });
  if (ceiling)
    rows.push({
      label: t.calculator.ceilingChoice,
      options: [
        { label: t.calculator.ceilingGypsum, active: choices.ceiling === 'gypsum', pick: () => onChange({ ceiling: 'gypsum' }) },
        { label: t.calculator.ceilingBarisol, active: choices.ceiling === 'barisol', pick: () => onChange({ ceiling: 'barisol' }) },
      ],
    });

  return (
    <div className={cn(compact ? 'space-y-2' : 'space-y-3')}>
      {rows.map((row) => (
        <div key={row.label} className="flex flex-wrap items-center gap-2">
          <span className={cn('text-ink-muted', compact ? 'w-full text-[11px]' : 'w-40 text-sm')}>{row.label}</span>
          <div className="inline-flex border border-line" role="radiogroup" aria-label={row.label}>
            {row.options.map((option) => (
              <button
                key={option.label}
                type="button"
                role="radio"
                aria-checked={option.active}
                onClick={option.pick}
                className={cn('px-3 font-medium transition-colors', compact ? 'py-1 text-xs' : 'py-1.5 text-sm', option.active ? 'bg-ink text-white' : 'bg-white text-ink-soft hover:bg-sand-light')}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className={cn('text-ink-muted', compact ? 'text-[10px] leading-snug' : 'text-xs')}>{t.calculator.choicesHint}</p>
    </div>
  );
}
