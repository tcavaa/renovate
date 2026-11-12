'use client';

import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

/**
 * The right-hand column of every auth page: an eyebrow chip, a heavy title, a short lead, the
 * form, and a hairline-separated footer for the alternate action. No card — the form sits
 * directly on the page, the way the step pages do.
 */
export function AuthForm({ title, subtitle, children, footer, className }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode; className?: string }) {
  const t = useT();
  return (
    <div className={cn('w-full max-w-md', className)}>
      <p className="inline-flex items-center gap-2 rounded-full bg-mist-light px-3 py-1.5 text-xs font-semibold text-ink">
        <span className="h-2 w-2 bg-lime" aria-hidden />
        {t.auth.eyebrow}
      </p>
      <h1 className="mt-4 font-display text-4xl leading-[1] text-ink md:text-5xl">{title}</h1>
      {subtitle && <p className="mt-3 text-sm leading-relaxed text-ink-muted">{subtitle}</p>}
      <div className="mt-8 border-t border-line pt-8">{children}</div>
      {footer && <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-sm text-ink-muted">{footer}</div>}
    </div>
  );
}

/** Label above a field, in the small-caps voice used across the flows. */
export function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-semibold text-ink">
        {label}
      </label>
      {children}
    </div>
  );
}

export function Notice({ tone, children }: { tone: 'error' | 'success'; children: React.ReactNode }) {
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={cn('rounded-xl px-4 py-3 text-sm font-medium', tone === 'error' ? 'bg-coral-soft text-danger' : 'bg-lime-soft text-ink')}>
      {children}
    </p>
  );
}
