import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Dictionary, type Locale } from './index';
import { getDictionary } from './dictionaries';

export function getLocale(): Locale {
  const value = cookies().get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function getT(): Dictionary {
  return getDictionary(getLocale());
}
