/**
 * The materials custom decor is made of — catalogue products like any other, each in a
 * sub-category of `decor-materials` that says what kind of material it is (wood, stone, an
 * LED line…). Admin sets each one's unit (m², metre or piece) and price; the budget measures
 * how much of it a piece uses (`quantities.ts`) and buys that.
 */

import type { CatalogProduct } from '@/lib/design/matcher';
import type { SceneProduct } from '@/lib/design/types';

/** The parent category of every decor material. Not `decor`: that one holds artwork, plants and mirrors. */
export const DECOR_MATERIAL_CATEGORY = 'decor-materials';

export const DECOR_MATERIAL_KINDS = [
  'wood', // slats, shelves: a veneer or solid timber
  'board', // felt or MDF backing, flat boards
  'led', // a light line: strip, profile and diffuser
  'moulding', // a picture-frame or chair-rail profile
  'gypsum', // plasterboard build-out for niches
  'stone', // marble, sintered stone, travertine slabs
  'fabric', // upholstered panels
  'relief', // fluted or ribbed paintable relief
  'brick', // brick slips
  'concrete', // concrete-look panels
  'tile', // tiles and their borders
  'wallpaper', // murals and wallpaper
  'trim', // edge trims: steel-look, brass, timber
] as const;
export type DecorMaterialKind = (typeof DECOR_MATERIAL_KINDS)[number];

/** The sub-category a kind lives in. */
export function decorKindSlug(kind: DecorMaterialKind): string {
  return `decor-${kind}`;
}

/** Every slug the catalogue loader has to know so a product's nearest category is its kind. */
export const DECOR_MATERIAL_SLUGS = [DECOR_MATERIAL_CATEGORY, ...DECOR_MATERIAL_KINDS.map(decorKindSlug)];

const KIND_BY_SLUG = new Map<string, DecorMaterialKind>(DECOR_MATERIAL_KINDS.map((kind) => [decorKindSlug(kind), kind]));

/** The kind of a decor material from its category, or null for anything else. */
export function decorMaterialKind(product: Pick<CatalogProduct, 'categorySlug'> | Pick<SceneProduct, 'categorySlug'>): DecorMaterialKind | null {
  return (product.categorySlug && KIND_BY_SLUG.get(product.categorySlug)) || null;
}

/** A decor material is bought by the m², the metre or the piece — anything else is not one the budget can measure. */
export const DECOR_UNITS = ['m2', 'linear_m', 'piece'] as const;
export type DecorUnit = (typeof DECOR_UNITS)[number];

export function isDecorUnit(unit: string | null | undefined): unit is DecorUnit {
  return !!unit && (DECOR_UNITS as readonly string[]).includes(unit);
}

export function isDecorMaterial(product: Pick<CatalogProduct, 'categorySlug' | 'unit'>): boolean {
  return decorMaterialKind(product) != null && isDecorUnit(product.unit);
}

/** What a decor material's `specs` may say, beyond the catalogue's own fields. */
export interface DecorMaterialSpecs {
  /** Metres of surface one tile of its texture covers. */
  textureScaleM?: number;
  /** Takes a colour of the person's choice (paint, lacquer, a dyed fabric). */
  tintable?: boolean;
  /** An LED line's colour temperature, kelvin. */
  cct?: number;
  /** A moulding's face width, millimetres. */
  profileMm?: number;
  roughness?: number;
}

export function decorSpecs(product: { specs?: unknown } | null | undefined): DecorMaterialSpecs {
  const specs = product?.specs;
  return specs && typeof specs === 'object' ? (specs as DecorMaterialSpecs) : {};
}

/**
 * The decor materials of the given kinds in the catalogue: by kind in the order given, then by unit
 * (prices per m², per metre and per piece cannot be compared), then the cheaper.
 */
export function decorMaterialsOf(catalog: CatalogProduct[], kinds: readonly DecorMaterialKind[]): CatalogProduct[] {
  const wanted = new Set(kinds);
  return catalog
    .filter((p) => isDecorMaterial(p) && wanted.has(decorMaterialKind(p)!))
    .sort(
      (a, b) =>
        kinds.indexOf(decorMaterialKind(a)!) - kinds.indexOf(decorMaterialKind(b)!) ||
        DECOR_UNITS.indexOf(a.unit as DecorUnit) - DECOR_UNITS.indexOf(b.unit as DecorUnit) ||
        a.pricePerUnit - b.pricePerUnit
    );
}

/**
 * The material a slot takes when nobody chose one: the first of its kinds (`decorMaterialsOf`),
 * except a light line, which is the warmest — a home is lit at 2700 K, not at the cheapest.
 */
export function defaultDecorMaterial(catalog: CatalogProduct[], kinds: readonly DecorMaterialKind[]): CatalogProduct | undefined {
  const options = decorMaterialsOf(catalog, kinds);
  if (kinds[0] !== 'led') return options[0];
  return [...options].sort((a, b) => (decorSpecs(a).cct ?? 2700) - (decorSpecs(b).cct ?? 2700))[0];
}

/** An LED line's glow colour for its colour temperature. */
export function ledColor(cct: number | undefined): string {
  const k = cct ?? 2700;
  if (k <= 2800) return '#FFC98A';
  if (k <= 3200) return '#FFD9A8';
  if (k <= 4200) return '#FFF0DA';
  return '#F2F6FF';
}
