import { ka } from './ka';
import { en } from './en';
import { ru } from './ru';
import { DEFAULT_LOCALE, isLocale, type Dictionary, type Locale } from './index';

/**
 * All three dictionaries. Server-side only by convention: importing this from a client
 * component would put every language in the browser bundle, which is exactly what the split
 * from `./index` avoids. The root layout picks one and hands it to `LocaleProvider`.
 */
const dictionaries: Record<Locale, Dictionary> = { ka, en, ru };

export function getDictionary(locale: Locale | string | undefined): Dictionary {
  if (isLocale(locale)) return dictionaries[locale];
  return dictionaries[DEFAULT_LOCALE];
}
