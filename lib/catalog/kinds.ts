import { ARCHETYPES } from '@/lib/design/catalog';
import { FIXTURE_PRODUCT_KINDS } from '@/lib/design/electrical';
import { OPENING_PRODUCT_KINDS } from '@/lib/design/openings';
import { RADIATOR_PRODUCT_KIND } from '@/lib/design/radiators';

/**
 * Every 3D kind a product can have — the furniture the studio places, the electrical layer's
 * fittings, doors and windows, the radiator section — which a category may take as its own
 * (`categories.model3dKind`: the products of that kind belong there).
 */
export const PRODUCT_KINDS: readonly string[] = [...new Set([...Object.keys(ARCHETYPES), ...FIXTURE_PRODUCT_KINDS, ...OPENING_PRODUCT_KINDS, RADIATOR_PRODUCT_KIND])];

export function isProductKind(value: unknown): value is string {
  return typeof value === 'string' && PRODUCT_KINDS.includes(value);
}
