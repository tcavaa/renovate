import { ka } from './ka';
import { en } from './en';
import { ru } from './ru';
import type { Dictionary } from './ka';

export const LOCALES = ['ka', 'en', 'ru'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'ka';
export const LOCALE_COOKIE = 'locale';

export const LOCALE_LABELS: Record<Locale, { native: string; flag: string }> = {
  ka: { native: 'ქართული', flag: '🇬🇪' },
  en: { native: 'English', flag: '🇬🇧' },
  ru: { native: 'Русский', flag: '🇷🇺' },
};

const dictionaries: Record<Locale, Dictionary> = { ka, en, ru };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function getDictionary(locale: Locale | string | undefined): Dictionary {
  if (isLocale(locale)) return dictionaries[locale];
  return dictionaries[DEFAULT_LOCALE];
}

export type { Dictionary };
