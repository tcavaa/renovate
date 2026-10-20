import { LOCALES } from './index';
import { getDictionary } from './dictionaries';
import { EQUIPMENT_KIND_LABEL, FIXTURE_KIND_LABEL, OPENING_KIND_LABEL, productKindLabel } from './labels';

type AnyMap = Record<string, string>;

/**
 * The 3D kinds the dictionaries name — fittings, doors and windows, equipment — by every name
 * they have in Georgian, English and Russian, for the product form's kind search (the
 * furniture kinds carry their three names in `ARCHETYPES`). Server-side only: it reads all
 * three dictionaries, and the browser is sent one.
 */
export function productKindNames(): Record<string, string[]> {
  const keys: AnyMap = { ...FIXTURE_KIND_LABEL, ...OPENING_KIND_LABEL, ...EQUIPMENT_KIND_LABEL };
  return Object.fromEntries(
    Object.entries(keys).map(([kind, key]) => {
      const names = LOCALES.flatMap((locale) => {
        const t = getDictionary(locale);
        return [productKindLabel(t, locale, kind), (t.build as unknown as AnyMap)[key]];
      });
      return [kind, [...new Set(names.filter((name): name is string => !!name && name !== kind))]];
    })
  );
}
