import type { Dictionary } from './ka';

/**
 * Locale metadata that is safe to import from the client.
 *
 * The dictionaries themselves live in `./dictionaries` (server) and reach the browser as a
 * prop on `LocaleProvider`, so a visitor downloads one language, not three.
 */

export const LOCALES = ['ka', 'en', 'ru'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'ka';
export const LOCALE_COOKIE = 'locale';

export const LOCALE_LABELS: Record<Locale, { native: string; flag: string }> = {
  ka: { native: 'ქართული', flag: '🇬🇪' },
  en: { native: 'English', flag: '🇬🇧' },
  ru: { native: 'Русский', flag: '🇷🇺' },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * The languages the site offers: what the language switcher lists and what a visitor can be
 * shown. Russian is hidden for now — its dictionary is kept up to date all the same (`ru.ts`
 * must still match `Dictionary`), so offering it again is putting it back in this list.
 */
export const OFFERED_LOCALES: readonly Locale[] = ['ka', 'en'];

/** A locale the site offers now (`OFFERED_LOCALES`) — a cookie naming any other falls back to the default. */
export function isOfferedLocale(value: unknown): value is Locale {
  return isLocale(value) && OFFERED_LOCALES.includes(value);
}

export type { Dictionary };
