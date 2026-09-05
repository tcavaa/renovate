import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const gelFormatter = new Intl.NumberFormat('ka-GE', {
  style: 'currency',
  currency: 'GEL',
  maximumFractionDigits: 0,
});

const gelFormatterDecimals = new Intl.NumberFormat('ka-GE', {
  style: 'currency',
  currency: 'GEL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatGEL(amount: number, withDecimals = false): string {
  if (!Number.isFinite(amount)) return '—';
  return withDecimals ? gelFormatterDecimals.format(amount) : gelFormatter.format(amount);
}

export function formatM2(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(2)} მ²`;
}

export function formatNumber(value: number, fractionDigits = 2): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('ka-GE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  }).format(value);
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
