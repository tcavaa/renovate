'use client';

import { useLocale, useSetLocale } from '@/lib/i18n/client';
import { LOCALES, LOCALE_LABELS, type Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** Three short language marks in a row — ქა · RU · EN — the current one in ink. */
const MARKS: Record<Locale, string> = { ka: 'ქა', en: 'EN', ru: 'RU' };

export function LanguageSwitcher({ variant = 'desktop', tone = 'light' }: { variant?: 'desktop' | 'mobile'; tone?: 'light' | 'dark' }) {
  const locale = useLocale();
  const setLocale = useSetLocale();
  const dark = tone === 'dark';

  return (
    <div className={cn('flex items-center', variant === 'mobile' ? 'gap-5' : 'gap-3')} role="group" aria-label="Language">
      {LOCALES.map((l) => {
        const active = l === locale;
        return (
          <button
            key={l}
            type="button"
            lang={l}
            aria-pressed={active}
            aria-label={LOCALE_LABELS[l].native}
            onClick={() => l !== locale && setLocale(l)}
            className={cn(
              'relative py-1 text-[12px] font-semibold uppercase tracking-[0.08em] transition-colors',
              variant === 'mobile' && 'text-sm',
              active ? (dark ? 'text-white' : 'text-ink') : dark ? 'text-white/50 hover:text-white' : 'text-ink-faint hover:text-ink'
            )}
          >
            {MARKS[l]}
            {active && <span className={cn('absolute inset-x-0 -bottom-px h-px', dark ? 'bg-white' : 'bg-ink')} />}
          </button>
        );
      })}
    </div>
  );
}
