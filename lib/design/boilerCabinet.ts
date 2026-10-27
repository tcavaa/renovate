/**
 * A gas boiler's ventilated cabinet (the design rules, `lib/design/rules.ts`): on a balcony, in a
 * kitchen or in a bathroom the boiler is built into a cabinet with louvres, its service access
 * kept, rather than hidden behind sealed finishes. The joiner makes it to measure — the boiler's
 * size and 10 cm all round, no deeper than 60 cm — and prices it like a made-to-measure kitchen:
 * per m² of its façade (the front and the two sides), in one of the joiner's materials, products
 * of the `boiler-cabinet` category whose price admin sets in the product form.
 *
 * Every boiler gets one in the catalogue's first material (the style's, then the cheapest) once
 * the catalogue is in (`withBoilerCabinets`, run with the equipment's products); the boiler's card
 * changes the material or takes the cabinet off (`cabinet: null`). Not drawn in 3D. Pure.
 */

import { isBoilerCabinetMaterial } from './catalog';
import { toSceneProduct, type CatalogProduct } from './matcher';
import { BOILER_CABINET_CLEARANCE_M, BOILER_CABINET_MAX_DEPTH_M, BOILER_DEFAULT_SIZE_M } from './rules';
import type { FloorPlan, StyleId, TechnicalPoint } from './types';

/** The cabinet's outside size, metres: the boiler's and the clearance all round, its depth capped. */
export function boilerCabinetSize(point: Pick<TechnicalPoint, 'sizeM'>): { width: number; depth: number; height: number } {
  const boiler = point.sizeM ?? BOILER_DEFAULT_SIZE_M;
  const c = BOILER_CABINET_CLEARANCE_M;
  return { width: boiler.width + 2 * c, depth: Math.min(BOILER_CABINET_MAX_DEPTH_M, boiler.depth + c), height: boiler.height + 2 * c };
}

/** Square metres of façade the joiner prices: the front and the two sides. */
export function boilerCabinetFacadeM2(point: Pick<TechnicalPoint, 'sizeM'>): number {
  const { width, depth, height } = boilerCabinetSize(point);
  return Math.round((width * height + 2 * depth * height) * 100) / 100;
}

/** The joiner's cabinet materials: the style's own first, then the cheaper. */
export function boilerCabinetCandidates(catalog: CatalogProduct[], styleId: StyleId): CatalogProduct[] {
  const affinity = (p: CatalogProduct) => (Array.isArray(p.styleTags) && (p.styleTags as string[]).includes(styleId) ? 1 : 0);
  return catalog.filter(isBoilerCabinetMaterial).sort((a, b) => affinity(b) - affinity(a) || a.pricePerUnit - b.pricePerUnit);
}

/** The boiler with its cabinet in `material` (or none), bought by its façade. */
export function withBoilerCabinet(point: TechnicalPoint, material: CatalogProduct | null): TechnicalPoint {
  return { ...point, cabinet: material ? toSceneProduct(material, boilerCabinetFacadeM2(point)) : null };
}

/**
 * Every boiler that has not been given a cabinet takes one in the first material, and one that has
 * is measured again (a boiler of another size). A cabinet taken off stays off. The same plan comes
 * back when nothing changed.
 */
export function withBoilerCabinets(plan: FloorPlan, catalog: CatalogProduct[], styleId: StyleId): FloorPlan {
  const points = plan.technical?.points ?? [];
  if (!points.some((p) => p.kind === 'boiler')) return plan;
  const first = boilerCabinetCandidates(catalog, styleId)[0];
  let changed = false;
  const next = points.map((point) => {
    if (point.kind !== 'boiler' || point.cabinet === null) return point;
    if (point.cabinet) {
      const qty = boilerCabinetFacadeM2(point);
      if (point.cabinet.qty === qty) return point;
      changed = true;
      return { ...point, cabinet: { ...point.cabinet, qty, totalPrice: Math.round(point.cabinet.pricePerUnit * qty * 100) / 100 } };
    }
    if (!first) return point;
    changed = true;
    return withBoilerCabinet(point, first);
  });
  return changed ? { ...plan, technical: { ...plan.technical, points: next } } : plan;
}
