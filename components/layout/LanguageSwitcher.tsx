'use client';

import { useLocale, useSetLocale } from '@/lib/i18n/client';
import { LOCALE_LABELS, OFFERED_LOCALES, type Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** A short mark per language the site offers (`OFFERED_LOCALES`: ქა · EN while Russian is hidden), in a row, the current one in ink. */
const MARKS: Record<Locale, string> = { ka: 'ქა', en: 'EN', ru: 'RU' };

export function LanguageSwitcher({ variant = 'desktop', tone = 'light' }: { variant?: 'desktop' | 'mobile'; tone?: 'light' | 'dark' }) {
  const locale = useLocale();
  const setLocale = useSetLocale();
  const dark = tone === 'dark';

  return (
    <div className={cn('flex items-center', variant === 'mobile' ? 'gap-2' : 'gap-0.5')} role="group" aria-label="Language">
      {OFFERED_LOCALES.map((l) => {
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
              'rounded-full px-2 py-1 text-[12px] font-bold uppercase tracking-[0.04em] transition-colors',
              variant === 'mobile' && 'px-3 py-1.5 text-sm',
              active ? (dark ? 'bg-lime text-ink' : 'bg-ink text-white') : dark ? 'text-white/55 hover:text-white' : 'text-ink-muted hover:text-ink'
            )}
          >
            {MARKS[l]}
          </button>
        );
      })}
    </div>
  );
}
