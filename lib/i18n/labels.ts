import type { Dictionary } from './ka';
import type { ProductLabels, SurfaceLabels } from '@/lib/design/pricing';

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

export function homeStateLabel(t: Dictionary, state: string | null): string {
  // A project on its first step has not chosen one yet.
  if (!state) return '—';
  const node = (t.homeState as unknown as Record<string, { label: string } | string>)[state];
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

export function roleLabel(t: Dictionary, role: string): string {
  return (t.roles as unknown as AnyMap)[role] ?? role;
}

export function orderStatusLabel(t: Dictionary, status: string): string {
  return (t.orderStatus as unknown as AnyMap)[status] ?? status;
}

export function styleLabel(t: Dictionary, styleId: string): string {
  return (t.styleNames as unknown as AnyMap)[styleId] ?? styleId;
}

/** The calculator's six steps by number, as the step strip and the hubs name them. */
export function calculatorStepLabels(t: Dictionary): string[] {
  return [t.calculator.step1, t.calculator.stepPlan, t.calculator.step2, t.calculator.step3, t.calculator.step4, t.calculator.step5];
}

/**
 * What the pricing engine calls a basket line, in the visitor's language: the surface a
 * finish lies on, the kind of opening, the kind of fitting, the radiator. The engine has
 * Georgian defaults and no dictionary; a page that shows the baskets hands it these.
 */
export function basketLabels(t: Dictionary): { surfaceLabels: SurfaceLabels; productLabels: ProductLabels } {
  return {
    surfaceLabels: { floor: t.design.finishFloor, wall: t.design.finishWall, ceiling: t.design.finishCeiling, skirting: t.design.finishSkirting, cornice: t.design.finishCornice },
    productLabels: {
      door: t.build.lineDoor,
      entrance_door: t.build.lineEntranceDoor,
      window: t.build.lineWindow,
      radiator: t.build.tkRadiator,
      socket: t.build.ekSocket,
      switch: t.build.ekSwitch,
      tv: t.build.ekTv,
      internet: t.build.ekInternet,
      light_ceiling: t.build.ekLightCeiling,
      light_wall: t.build.ekLightWall,
      light_spot: t.build.ekLightSpot,
      light_strip: t.build.ekLightStrip,
      light_furniture: t.build.ekLightFurniture,
    },
  };
}

/**
 * A `{ error }` string from the API in the user's language.
 *
 * Routes return codes (`STORE_HAS_PRODUCTS`), never prose, so a Georgian sentence never
 * reaches an English screen. Anything not in the table — a Zod message, an unexpected
 * string — is shown as-is rather than hidden, because it is still the most specific hint.
 */
export function apiErrorMessage(t: Dictionary, code: string | null | undefined): string {
  if (!code) return t.apiErrors.UNKNOWN;
  return (t.apiErrors as unknown as AnyMap)[code] ?? code;
}

export type Locale = 'ka' | 'en' | 'ru';

/** Anything with a Georgian name and optional English / Russian translations. */
export interface Localizable {
  nameKa: string;
  nameEn?: string | null;
  nameRu?: string | null;
}

/**
 * The name to show for a product, store, worker or category in the visitor's language.
 * Russian falls back to English, English to Georgian, so a half-translated catalogue still
 * shows every item.
 */
export function localizedName(locale: Locale, item: Localizable): string {
  if (locale === 'ru') return item.nameRu || item.nameEn || item.nameKa;
  if (locale === 'en') return item.nameEn || item.nameKa;
  return item.nameKa;
}

/** Same fallback for free text (descriptions, bios); `null` when nothing is set. */
export function localizedText(
  locale: Locale,
  ka: string | null | undefined,
  en?: string | null,
  ru?: string | null
): string | null {
  if (locale === 'ru') return ru || en || ka || null;
  if (locale === 'en') return en || ka || null;
  return ka || null;
}

/** Positional form of `localizedName`, for rows that are not already an object with the three names. */
export function pickLocalizedName(
  locale: Locale,
  nameKa: string | null | undefined,
  nameEn?: string | null | undefined,
  nameRu?: string | null | undefined
): string {
  return localizedName(locale, { nameKa: nameKa ?? '', nameEn, nameRu });
}
