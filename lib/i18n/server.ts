import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Dictionary, type Locale } from './index';
import { getDictionary } from './dictionaries';

/** The visitor's locale from the cookie. Async because Next 15+ request APIs are. */
export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function getT(): Promise<Dictionary> {
  return getDictionary(await getLocale());
}
