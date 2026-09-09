'use client';

import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

/**
 * The right-hand column of every auth page: an eyebrow, a serif title, a short lead, the
 * form, and a hairline-separated footer for the alternate action. No card — the form sits
 * directly on the paper, the way the step pages do.
 */
export function AuthForm({ title, subtitle, children, footer, className }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode; className?: string }) {
  const t = useT();
  return (
    <div className={cn('w-full max-w-md', className)}>
      <p className="eyebrow">{t.auth.eyebrow}</p>
      <h1 className="mt-3 font-serif text-3xl font-bold leading-[1.05] tracking-tight text-ink md:text-4xl">{title}</h1>
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
      <label htmlFor={id} className="eyebrow block">
        {label}
      </label>
      {children}
    </div>
  );
}

export function Notice({ tone, children }: { tone: 'error' | 'success'; children: React.ReactNode }) {
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={cn('border px-3 py-2.5 text-sm', tone === 'error' ? 'border-danger/40 bg-danger/5 text-danger' : 'border-success/40 bg-success/5 text-ink')}>
      {children}
    </p>
  );
}
