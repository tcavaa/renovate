import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Money and quantities are formatted by hand, not through `Intl`.
 *
 * The server's ICU (Node) and the visitor's (their browser) disagree about Georgian: one
 * prints "890 ₾", the other "GEL 890", and every price on a server-rendered page then fails
 * hydration. Fixed rules — a narrow no-break space between thousands, a comma before
 * decimals, the lari sign after the figure — give the same string everywhere.
 */
const GROUP = '\u202F';

function groupDigits(value: number, fractionDigits: number): string {
  const fixed = Math.abs(value).toFixed(fractionDigits);
  const [int, frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP);
  const sign = value < 0 ? '−' : '';
  return frac ? `${sign}${grouped},${frac}` : `${sign}${grouped}`;
}

export function formatGEL(amount: number, withDecimals = false): string {
  if (!Number.isFinite(amount)) return '—';
  return `${groupDigits(amount, withDecimals ? 2 : 0)}\u00A0₾`;
}

export function formatM2(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(2)} მ²`;
}

export function formatNumber(value: number, fractionDigits = 2): string {
  if (!Number.isFinite(value)) return '—';
  // Trim trailing zeros so 4.30 reads 4,3 and 18.00 reads 18.
  const rounded = Number(value.toFixed(fractionDigits));
  const decimals = Math.min(fractionDigits, (rounded.toString().split('.')[1] ?? '').length);
  return groupDigits(rounded, decimals);
}

export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u10A0-\u10FF]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The time zone every date is shown in: the platform is Georgian, and a time shown is
 * Tbilisi's whatever zone the server (UTC on the hosts) or the browser runs in. Dates were
 * written in each side's own zone, so a UTC server and a Tbilisi browser disagreed by four hours
 * and hydration failed on every date in a client component.
 */
export const TIME_ZONE = 'Asia/Tbilisi';

const tbilisiParts = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/**
 * `08.09.2026, 06:45` in Tbilisi time — the same string on the server and in the browser,
 * whatever ICU and time zone each has (`toLocaleString` hydrated differently on the two sides).
 */
export function formatDateTime(value: string | number | Date, withTime = true): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const part = Object.fromEntries(tbilisiParts.formatToParts(d).map((p) => [p.type, p.value]));
  const date = `${part.day}.${part.month}.${part.year}`;
  return withTime ? `${date}, ${part.hour}:${part.minute}` : date;
}
