/**
 * Floor and wall finishes a room can be given.
 *
 * A finish is an ordinary catalogue product — a laminate, a tile, a paint — that carries a
 * `textureUrl` and, in `specs`, which surfaces it is for, how many metres one tile of the
 * texture covers, and optional normal/roughness maps. `pnpm textures:stock` writes those
 * products; this module reads them. Everything here is pure and isomorphic.
 */

import type { RoomType } from '@/lib/calculator/types';
import type { CatalogProduct } from './matcher';
import { toSceneProduct } from './matcher';
import { getStyle, styleAffinity } from './styles';
import type { ItemOrigin, PlanRoom, StyleId, StyleSurface, SurfaceFinish } from './types';

export type Surface = 'floor' | 'wall';

export interface SurfaceSpecs {
  surfaces?: Surface[];
  /** Made for bathrooms — tiles. Preferred there, listed last elsewhere. */
  wet?: boolean;
  /** Metres of real surface one texture tile covers. */
  textureScaleM?: number;
  normalUrl?: string;
  roughnessUrl?: string;
}

/** The categories whose products can be finishes; the catalogue route serves these too. */
export const SURFACE_CATEGORY_SLUGS = ['laminate', 'floor-tiles', 'wall-tiles', 'paint'];

export function isWetRoom(type: RoomType): boolean {
  return type === 'bathroom' || type === 'toilet';
}

export function surfaceSpecs(product: CatalogProduct): SurfaceSpecs {
  const specs = product.specs;
  return specs && typeof specs === 'object' && !Array.isArray(specs) ? (specs as SurfaceSpecs) : {};
}

export function isSurfaceProduct(product: CatalogProduct, surface: Surface): boolean {
  return !!product.textureUrl && (surfaceSpecs(product).surfaces ?? []).includes(surface);
}

/**
 * Everything the room could have on this surface, best first: what suits a wet room (or
 * does not) ahead, then the current style, then price.
 */
export function surfaceOptions(
  catalog: CatalogProduct[],
  surface: Surface,
  room: PlanRoom | null,
  styleId: StyleId
): CatalogProduct[] {
  const wet = room ? isWetRoom(room.type) : false;
  return catalog
    .filter((p) => isSurfaceProduct(p, surface))
    .sort((a, b) => {
      const wetA = !!surfaceSpecs(a).wet === wet ? 0 : 1;
      const wetB = !!surfaceSpecs(b).wet === wet ? 0 : 1;
      if (wetA !== wetB) return wetA - wetB;
      const byStyle = styleAffinity(styleId, b.styleTags, b.tags) - styleAffinity(styleId, a.styleTags, a.tags);
      if (byStyle !== 0) return byStyle;
      return pricePerM2(a) - pricePerM2(b);
    });
}

/** Paint is sold by the litre and tiles by the square metre; the room is priced per m². */
export function pricePerM2(product: CatalogProduct): number {
  if (product.unit === 'm2') return product.pricePerUnit;
  const coverage = product.coveragePerUnit ?? (product.unit === 'liter' ? 8 : 1);
  return product.pricePerUnit / Math.max(coverage, 0.01);
}

/** Wall area to cover: the perimeter times the height, less the doors and windows. */
export function wallAreaM2(room: PlanRoom): number {
  const gross = room.perimeterM * room.heightM;
  const openings = room.openings.reduce((sum, o) => sum + o.widthM * o.heightM, 0);
  return Math.max(1, Math.round((gross - openings) * 10) / 10);
}

/** The style's own finish for this surface in this room — tiles in a bathroom. */
export function defaultFinish(room: PlanRoom, surface: SurfaceFinish['surface'], styleId: StyleId): SurfaceFinish {
  const style = getStyle(styleId);
  const wet = isWetRoom(room.type);
  const spec: StyleSurface =
    surface === 'ceiling'
      ? style.surfaces.ceiling
      : surface === 'floor'
        ? wet
          ? style.surfaces.wetFloor
          : style.surfaces.floor
        : wet
          ? style.surfaces.wetWall
          : style.surfaces.wall;
  return {
    roomId: room.id,
    surface,
    colorHex: spec.colorHex,
    textureUrl: spec.textureUrl ?? null,
    textureScaleM: spec.textureScaleM ?? 2,
    normalUrl: spec.normalUrl ?? null,
    roughnessUrl: spec.roughnessUrl ?? null,
    product: null,
    origin: 'style',
  };
}

/** The finish a chosen product gives this room, priced by the area it covers. */
export function finishFromProduct(
  room: PlanRoom,
  surface: Surface,
  product: CatalogProduct,
  origin: ItemOrigin = 'studio'
): SurfaceFinish {
  const specs = surfaceSpecs(product);
  const qty = surface === 'floor' ? Math.round(room.areaM2 * 10) / 10 : wallAreaM2(room);
  return {
    roomId: room.id,
    surface,
    colorHex: product.colorHex ?? '#FFFFFF',
    textureUrl: product.textureUrl,
    textureScaleM: specs.textureScaleM ?? 1.5,
    normalUrl: specs.normalUrl ?? null,
    roughnessUrl: specs.roughnessUrl ?? null,
    product: toSceneProduct({ ...product, pricePerUnit: pricePerM2(product), unit: 'm2' }, qty),
    origin,
  };
}
