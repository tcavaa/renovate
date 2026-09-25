'use client';

/**
 * "What happens in this step": what you do, why, what you need, what you can change and
 * what comes next — five short lines under every step's title, folded away once read. The
 * whole journey is meant to explain itself; this is where it does.
 */

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import type { Dictionary } from '@/lib/i18n';
import type { StudioStep } from '@/store/designStore';

/**
 * The five lines of one step, as [label, text] — for the fold under a step's title, and for
 * the drop-down under the title of a full-screen step (`FlowBar`).
 */
export function stageBriefRows(t: Dictionary, step: StudioStep): Array<[string, string]> {
  const b = t.build as unknown as Record<string, string>;
  return [
    [t.build.briefWhat, b[`s${step}What`]],
    [t.build.briefWhy, b[`s${step}Why`]],
    [t.build.briefNeed, b[`s${step}Need`]],
    [t.build.briefChange, b[`s${step}Change`]],
    [t.build.briefNext, b[`s${step}Next`]],
  ];
}

export function StageBrief({ step, className, defaultOpen }: { step: StudioStep; className?: string; defaultOpen?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(defaultOpen ?? step <= 2);
  const rows = stageBriefRows(t, step);
  return (
    <section className={cn('rounded-[16px] border border-line bg-white', className)}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <span className="text-sm font-semibold text-ink">{t.build.briefToggle}</span>
        <ChevronDown className={cn('h-4 w-4 text-ink-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <dl className="grid gap-3 border-t border-line px-4 py-4 text-sm sm:grid-cols-5">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
              <dd className="mt-1 leading-relaxed text-ink-soft">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
