'use client';

import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

/**
 * Editorial page head for one step: "STEP 02 / 05" eyebrow, a large serif title, a short
 * lead, and an optional row of facts or actions aligned to the right on wide screens.
 */
export function StepHeader({
  step,
  total,
  title,
  subtitle,
  meta,
  actions,
  className,
}: {
  step: number;
  total: number;
  title: string;
  subtitle?: string;
  /** Small facts under the title: "5 rooms · 86 m²". */
  meta?: React.ReactNode;
  /** Buttons aligned right on wide screens. */
  actions?: React.ReactNode;
  className?: string;
}) {
  const t = useT();
  return (
    <header className={cn('flex flex-col gap-6 border-b border-line pb-8 md:flex-row md:items-end md:justify-between', className)}>
      <div className="max-w-2xl">
        <p className="eyebrow">
          {t.common.step} <span className="tabular-nums text-ink">{String(step).padStart(2, '0')}</span>
          <span className="text-ink-faint"> / {String(total).padStart(2, '0')}</span>
        </p>
        <h1 className="mt-3 font-serif text-3xl font-bold leading-[1.05] tracking-tight text-ink md:text-[2.75rem]">{title}</h1>
        {subtitle && <p className="mt-3 max-w-xl text-base leading-relaxed text-ink-muted">{subtitle}</p>}
        {meta && <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A section title inside a step: a numbered eyebrow and a serif heading on one hairline. */
export function SectionHead({
  index,
  title,
  subtitle,
  aside,
  id,
}: {
  index?: string;
  title: string;
  subtitle?: string;
  aside?: React.ReactNode;
  id?: string;
}) {
  return (
    <div id={id} className="flex items-end justify-between gap-4 border-b border-line pb-3">
      <div>
        {index && <p className="eyebrow">{index}</p>}
        <h2 className={cn('font-serif text-xl font-semibold leading-tight text-ink', index && 'mt-1')}>{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {aside && <div className="shrink-0 text-sm text-ink-muted">{aside}</div>}
    </div>
  );
}
