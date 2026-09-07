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

export function formatUnit(unit: string): string {
  const map: Record<string, string> = {
    m2: 'მ²',
    linear_m: 'გრძ.მ',
    piece: 'ცალი',
    liter: 'ლ',
    kg: 'კგ',
    m3: 'მ³',
    pack: 'პაკეტი',
    set: 'ნაკრები',
  };
  return map[unit] ?? unit;
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
 * `08.09.2026, 06:45` — the same string on the server and in the browser, whatever ICU each
 * ships. `toLocaleString` in a client component hydrated differently on the two sides (the
 * order editor hit this); this is for client components, server components may keep
 * `toLocaleString`. Local time of wherever it runs.
 */
export function formatDateTime(value: string | number | Date, withTime = true): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const two = (n: number) => String(n).padStart(2, '0');
  const date = `${two(d.getDate())}.${two(d.getMonth() + 1)}.${d.getFullYear()}`;
  return withTime ? `${date}, ${two(d.getHours())}:${two(d.getMinutes())}` : date;
}
