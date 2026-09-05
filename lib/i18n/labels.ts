import type { Dictionary } from './ka';

type AnyMap = Record<string, string>;

export function unitLabel(t: Dictionary, unit: string): string {
  return (t.units as unknown as AnyMap)[unit] ?? unit;
}

export function formatM2L(t: Dictionary, value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(2)} ${t.units.m2}`;
}

export function materialLabel(t: Dictionary, key: string): string {
  return (t.materials as unknown as AnyMap)[key] ?? key;
}

export function workTypeLabel(t: Dictionary, key: string): string {
  return (t.workTypes as unknown as AnyMap)[key] ?? key;
}

export function phaseLabel(t: Dictionary, num: number): string {
  return (t.phases as unknown as AnyMap)[String(num)] ?? `${num}`;
}

export function roomTypeLabel(t: Dictionary, type: string): string {
  return (t.rooms as unknown as AnyMap)[type] ?? type;
}

export function homeStateLabel(t: Dictionary, state: string): string {
  const node = (t.homeState as unknown as Record<string, { label: string } | string>)[
    state
  ];
  if (node && typeof node === 'object' && 'label' in node) return node.label;
  return state;
}

export function homeStateShortLabel(t: Dictionary, state: string): string {
  return (t.homeStateShort as unknown as AnyMap)[state] ?? state;
}

export function workerSpecialtyLabel(t: Dictionary, slug: string): string {
  return (t.workerSpecialties as unknown as AnyMap)[slug] ?? slug;
}

export function statusLabel(t: Dictionary, status: string): string {
  return (t.status as unknown as AnyMap)[status] ?? status;
}

export type Locale = 'ka' | 'en' | 'ru';

/**
 * For DB content that has nameKa/nameEn (e.g. categories), pick the right one based on locale.
 * Russian falls back to nameEn (DB doesn't store Russian copy yet).
 * Free-text user content (project name) is returned as-is.
 */
export function pickLocalizedName(
  locale: Locale,
  nameKa: string | null | undefined,
  nameEn?: string | null | undefined
): string {
  if (locale === 'ka') return nameKa ?? '';
  if (locale === 'en') return nameEn ?? nameKa ?? '';
  return nameEn ?? nameKa ?? '';
}
