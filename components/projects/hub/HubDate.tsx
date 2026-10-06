'use client';

import { useLocale, useT } from '@/lib/i18n/client';
import { fill } from '@/lib/admin/list';
import type { Locale } from '@/lib/i18n';
import { TIME_ZONE } from '@/lib/utils';

const DATE_LOCALE: Record<Locale, string> = { ka: 'ka-GE', en: 'en-GB', ru: 'ru-RU' };
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * When a card's project or render last changed, the way a file list says it: "today, 15:06",
 * "3 days ago, 13:21", then the date. Worked out in the browser — its clock and time zone are
 * the person's; the server's may be another's — so the text the server sent is allowed to differ.
 */
export function HubDate({ at, className }: { at: number | string; className?: string }) {
  const t = useT();
  const locale = useLocale();
  const when = new Date(at);
  const two = (n: number) => String(n).padStart(2, '0');
  const time = `${two(when.getHours())}:${two(when.getMinutes())}`;
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(new Date()) - midnight(when)) / DAY_MS);
  const label =
    days <= 0
      ? fill(t.hub.todayAt, { time })
      : days === 1
        ? fill(t.hub.yesterdayAt, { time })
        : days < 7
          ? fill(t.hub.daysAgoAt, { n: days, time })
          : when.toLocaleDateString(DATE_LOCALE[locale], { timeZone: TIME_ZONE, day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <time dateTime={when.toISOString()} className={className} suppressHydrationWarning>
      {label}
    </time>
  );
}
