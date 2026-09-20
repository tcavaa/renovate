/**
 * Skirting boards and cornices — the mouldings where a wall meets the floor and the ceiling.
 *
 * A trim is a product like any finish: sold by the running metre, with a *profile* (its
 * cross-section), a height, how far it stands out from the wall, and a colour. The 3D view
 * sweeps that profile along every wall of the room — round the corners on the mitre, broken
 * at the doors for a skirting board — so what is drawn is what is bought, and the budget
 * counts the metres. It travels in `scene.finishes` with `surface: 'skirting' | 'cornice'`,
 * which is what gives it undo, versions, autosave and the per-room tray for free.
 *
 * Without a product a room wears its style's own trim, which costs nothing (like the
 * style's default floor): a plain board everywhere, a cornice only in the two styles that
 * would have one.
 *
 * Pure: the outlines are plain numbers, shared by the 3D builder and the script that draws
 * the product photos.
 */

import { roomEdges } from './planGeometry';
import { toSceneProduct, type CatalogProduct } from './matcher';
import { styleAffinity } from './styles';
import type { ItemOrigin, PlanRoom, StyleId, SurfaceFinish, TrimKind, TrimProfile, TrimSpec } from './types';

export const TRIM_KINDS: TrimKind[] = ['skirting', 'cornice'];
export { TRIM_CATEGORY_SLUGS } from './catalog';

export function isTrimSurface(surface: SurfaceFinish['surface']): surface is TrimKind {
  return surface === 'skirting' || surface === 'cornice';
}

/** What a style puts along its walls when nothing is chosen; `null` is no moulding at all. */
export const STYLE_TRIMS: Record<StyleId, Record<TrimKind, (TrimSpec & { colorHex: string }) | null>> = {
  modern: { skirting: { profile: 'flat', heightM: 0.08, depthM: 0.012, colorHex: '#F4F4F2' }, cornice: null },
  scandinavian: { skirting: { profile: 'rounded', heightM: 0.07, depthM: 0.015, colorHex: '#F7F5F0' }, cornice: { profile: 'cove', heightM: 0.06, depthM: 0.06, colorHex: '#FAF8F4' } },
  industrial: { skirting: { profile: 'flat', heightM: 0.1, depthM: 0.012, colorHex: '#3A3A3C' }, cornice: null },
  vintage: { skirting: { profile: 'ogee', heightM: 0.14, depthM: 0.022, colorHex: '#EFE6D4' }, cornice: { profile: 'ogee', heightM: 0.11, depthM: 0.11, colorHex: '#F3ECDD' } },
};

/**
 * The cross-section of a moulding: a closed outline in (out from the wall, up) metres that
 * leaves the wall along the bottom, comes up its face and returns to the wall along the
 * top — the order `buildMouldingGeometry` expects. A skirting board stands on y = 0; a
 * cornice hangs from y = 0 (the ceiling), so its heights are negative.
 */
export function trimOutline(kind: TrimKind, spec: TrimSpec): Array<[number, number]> {
  const d = Math.max(0.004, spec.depthM);
  const h = Math.max(0.02, spec.heightM);
  if (kind === 'skirting') {
    switch (spec.profile) {
      case 'rounded':
        // A flat board with its top edge rounded over.
        return [[0, 0], [d, 0], ...arc(0, h - d, d, d, 0, Math.PI / 2, 5)];
      case 'stepped':
        // A thick lower board under a thinner upper one.
        return [[0, 0], [d, 0], [d, h * 0.62], [d * 0.55, h * 0.62], [d * 0.55, h], [0, h]];
      case 'ogee':
        // The tall classical board: a plinth, a hollow, a bead under the top.
        return [[0, 0], [d, 0], [d, h * 0.55], [d * 0.7, h * 0.63], [d * 0.45, h * 0.72], [d * 0.4, h * 0.82], [d * 0.62, h * 0.88], [d * 0.62, h * 0.94], [d * 0.3, h], [0, h]];
      case 'cove':
      case 'flat':
      default:
        return [[0, 0], [d, 0], [d, h], [0, h]];
    }
  }
  switch (spec.profile) {
    case 'flat':
      // A plain band under the ceiling.
      return [[0, -h], [d * 0.25, -h], [d * 0.25, 0], [0, 0]];
    case 'stepped':
      return [[0, -h], [d * 0.3, -h], [d * 0.3, -h * 0.55], [d * 0.65, -h * 0.55], [d * 0.65, -h * 0.2], [d, -h * 0.2], [d, 0], [0, 0]];
    case 'ogee':
      // An S-curve between a fillet on the wall and one on the ceiling.
      return [[0, -h], [d * 0.12, -h], [d * 0.12, -h * 0.88], [d * 0.3, -h * 0.74], [d * 0.36, -h * 0.55], [d * 0.5, -h * 0.36], [d * 0.74, -h * 0.26], [d * 0.88, -h * 0.12], [d * 0.88, 0], [0, 0]];
    case 'rounded':
    case 'cove':
    default:
      // A quarter hollow from the wall to the ceiling, with a fillet at each end.
      return [[0, -h], ...arc(d, -h, d * 0.9, h * 0.9, Math.PI, Math.PI / 2, 6), [d, 0], [0, 0]];
  }
}

/** Points on an elliptical arc from `start` to `end` radians about (cx, cy), in (out, up). */
function arc(cx: number, cy: number, rx: number, ry: number, start: number, end: number, steps: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const a = start + ((end - start) * i) / steps;
    // To the hundredth of a millimetre, so an arc that ends on the wall ends exactly on it.
    out.push([Math.round((cx + Math.cos(a) * rx) * 1e5) / 1e5, Math.round((cy + Math.sin(a) * ry) * 1e5) / 1e5]);
  }
  return out;
}

/** What a trim product's `specs` carry. */
export interface TrimProductSpecs {
  profile?: TrimProfile;
  heightCm?: number;
  depthCm?: number;
}

export function trimSpecs(product: CatalogProduct): TrimProductSpecs {
  const specs = product.specs;
  return specs && typeof specs === 'object' && !Array.isArray(specs) ? (specs as TrimProductSpecs) : {};
}

export function isTrimProduct(product: CatalogProduct, kind: TrimKind): boolean {
  return product.categorySlug === kind;
}

/** The catalogue's mouldings of a kind: the style's own first, then by price. */
export function trimOptions(catalog: CatalogProduct[], kind: TrimKind, styleId: StyleId): CatalogProduct[] {
  return catalog
    .filter((p) => isTrimProduct(p, kind))
    .sort((a, b) => styleAffinity(styleId, b.styleTags, b.tags) - styleAffinity(styleId, a.styleTags, a.tags) || a.pricePerUnit - b.pricePerUnit);
}

/** Running metres of a trim in a room: the whole perimeter for a cornice, less the doorways for a skirting board. */
export function trimLengthM(room: PlanRoom, kind: TrimKind): number {
  const perimeter = roomEdges(room.polygon).reduce((sum, e) => sum + e.length, 0);
  const doorways = kind === 'skirting' ? room.openings.filter((o) => o.kind !== 'window').reduce((sum, o) => sum + o.widthM, 0) : 0;
  return Math.max(0, Math.round((perimeter - doorways) * 10) / 10);
}

/** The style's own trim for a room — no product, no cost; `trim: null` where the style has none. */
export function defaultTrim(room: PlanRoom, kind: TrimKind, styleId: StyleId): SurfaceFinish {
  const spec = STYLE_TRIMS[styleId][kind];
  return {
    roomId: room.id,
    surface: kind,
    colorHex: spec?.colorHex ?? '#FFFFFF',
    textureUrl: null,
    textureScaleM: 1,
    product: null,
    trim: spec ? { profile: spec.profile, heightM: spec.heightM, depthM: spec.depthM } : null,
    origin: 'style',
  };
}

/** The trim a chosen product gives a room, priced by the metres it runs. */
export function trimFromProduct(room: PlanRoom, kind: TrimKind, product: CatalogProduct, origin: ItemOrigin = 'studio'): SurfaceFinish {
  const specs = trimSpecs(product);
  const fallback = STYLE_TRIMS.modern.skirting!;
  const heightM = (specs.heightCm ?? product.heightCm ?? fallback.heightM * 100) / 100;
  const depthM = (specs.depthCm ?? product.depthCm ?? (kind === 'cornice' ? heightM * 100 : fallback.depthM * 100)) / 100;
  return {
    roomId: room.id,
    surface: kind,
    colorHex: product.colorHex ?? '#FFFFFF',
    textureUrl: null,
    textureScaleM: 1,
    product: toSceneProduct({ ...product, unit: 'linear_m' }, trimLengthM(room, kind)),
    trim: { profile: specs.profile ?? (kind === 'cornice' ? 'cove' : 'flat'), heightM, depthM },
    origin,
  };
}

/** The trim a room wears: what was chosen for it, else nothing (the caller falls back to the style). */
export function trimFor(finishes: SurfaceFinish[], roomId: string, kind: TrimKind): SurfaceFinish | undefined {
  return finishes.find((f) => f.roomId === roomId && f.surface === kind);
}
