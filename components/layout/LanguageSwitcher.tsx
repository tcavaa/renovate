'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Globe } from 'lucide-react';
import { useLocale, useSetLocale } from '@/lib/i18n/client';
import { LOCALES, LOCALE_LABELS, type Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export function LanguageSwitcher({
  variant = 'desktop',
}: {
  variant?: 'desktop' | 'mobile';
}) {
  const locale = useLocale();
  const setLocale = useSetLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const current = LOCALE_LABELS[locale];

  const select = (next: Locale) => {
    setOpen(false);
    if (next !== locale) setLocale(next);
  };

  if (variant === 'mobile') {
    return (
      <div className="grid grid-cols-3 gap-2">
        {LOCALES.map((l) => {
          const active = l === locale;
          return (
            <button
              key={l}
              type="button"
              onClick={() => select(l)}
              className={cn(
                'flex items-center justify-center gap-1 rounded-md border px-2 py-2 text-sm font-medium transition-colors',
                active
                  ? 'border-brand bg-brand/10 text-brand-dark'
                  : 'border-line bg-bg-surface hover:bg-bg-base'
              )}
            >
              <span aria-hidden>{LOCALE_LABELS[l].flag}</span>
              <span className="text-xs">{l.toUpperCase()}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md border border-line bg-bg-surface px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-bg-base"
        aria-label="Language"
      >
        <Globe className="h-4 w-4 text-ink-muted" />
        <span aria-hidden>{current.flag}</span>
        <span className="hidden sm:inline">{locale.toUpperCase()}</span>
        <ChevronDown className="h-3.5 w-3.5 text-ink-muted" />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-lg border border-line bg-bg-surface p-1 shadow-lg"
          role="menu"
        >
          {LOCALES.map((l) => {
            const active = l === locale;
            return (
              <button
                key={l}
                type="button"
                onClick={() => select(l)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                  active ? 'bg-brand/10 text-brand-dark' : 'hover:bg-bg-base'
                )}
              >
                <span className="flex items-center gap-2">
                  <span aria-hidden>{LOCALE_LABELS[l].flag}</span>
                  <span>{LOCALE_LABELS[l].native}</span>
                </span>
                {active && <Check className="h-4 w-4" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
