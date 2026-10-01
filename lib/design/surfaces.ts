/**
 * Floor and wall finishes a room can be given.
 *
 * A finish is an ordinary catalogue product — a laminate, a tile, a paint — that carries a
 * `textureUrl` and, in `specs`, which surfaces it is for, how many metres one tile of the
 * texture covers, and optional normal/roughness maps. `pnpm textures:stock` writes those
 * products; this module reads them. Everything here is pure and isomorphic.
 *
 * A style's own floors and walls are such products too (`styleFinish`): the textures the
 * styles lay are the textures of partner products, so the flat the studio generates is
 * floored, tiled and painted in things that can be bought — and are, in the budget.
 */

import type { RoomType } from '@/lib/calculator/types';
import type { CatalogProduct } from './matcher';
import { toSceneProduct } from './matcher';
import { getStyle, styleAffinity } from './styles';
import { isBaseFinish } from './zones';
import { roomWallAreaM2 } from './planGeometry';
import type { ItemOrigin, PlanRoom, StyleDefinition, StyleId, StyleSurface, SurfaceFinish } from './types';

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

/**
 * Wall area to cover: the walled perimeter (not the edges on a room separator) at the room's
 * height, less the doors, windows and openings — the one figure the renovation's plaster and
 * paint are counted by too, in the design and in the calculator (`roomWallAreaM2`).
 */
export function wallAreaM2(room: PlanRoom): number {
  return roomWallAreaM2(room);
}

/**
 * How the style lays this surface in a room of this kind: tiles in a bathroom; elsewhere the
 * room's own look (`StyleDefinition.rooms` — the bedroom's paint, the kitchen's tiles), else
 * the style's floor and wall. With `generic`, the style's floor and wall whatever the room —
 * what a catalogue without the room's own product falls back to. The ceiling is the style's.
 */
export function roomLook(style: StyleDefinition, type: PlanRoom['type'], surface: 'floor' | 'wall' | 'ceiling', generic = false): StyleSurface {
  if (surface === 'ceiling') return style.surfaces.ceiling;
  if (isWetRoom(type)) return surface === 'floor' ? style.surfaces.wetFloor : style.surfaces.wetWall;
  const own = generic ? undefined : style.rooms[type]?.[surface];
  return own ?? (surface === 'floor' ? style.surfaces.floor : style.surfaces.wall);
}

/** The style's own finish for this surface in this room — tiles in a bathroom, the bedroom's paint. */
export function defaultFinish(room: PlanRoom, surface: SurfaceFinish['surface'], styleId: StyleId): SurfaceFinish {
  const style = getStyle(styleId);
  const spec = roomLook(style, room.type, surface === 'ceiling' ? 'ceiling' : surface === 'floor' ? 'floor' : 'wall');
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

/**
 * The finish a chosen product gives this room, priced by the area it covers — per square metre,
 * with what the product is sold by kept beside it (`SceneProduct.sale`) for the budget, which
 * buys whole tins and the cutting waste.
 */
export function finishFromProduct(
  room: PlanRoom,
  surface: Surface,
  product: CatalogProduct,
  origin: ItemOrigin = 'studio'
): SurfaceFinish {
  const specs = surfaceSpecs(product);
  const qty = surface === 'floor' ? Math.round(room.areaM2 * 100) / 100 : wallAreaM2(room);
  return {
    roomId: room.id,
    surface,
    colorHex: product.colorHex ?? '#FFFFFF',
    textureUrl: product.textureUrl,
    textureScaleM: specs.textureScaleM ?? 1.5,
    normalUrl: specs.normalUrl ?? null,
    roughnessUrl: specs.roughnessUrl ?? null,
    product: { ...toSceneProduct({ ...product, pricePerUnit: pricePerM2(product), unit: 'm2' }, qty), sale: { unit: product.unit, pricePerUnit: product.pricePerUnit, coveragePerUnit: product.coveragePerUnit ?? null } },
    origin,
  };
}

/** Two addresses of one texture file: the same path, whatever host or query came with it. */
function sameTexture(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const path = (url: string) => url.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, '').split(/[?#]/)[0];
  return path(a) === path(b);
}

/**
 * The product a style's own finish *is*: the catalogue finish whose texture the style lays on
 * this surface of this room (`roomLook` — tiles in a bathroom, the bedroom's paint, the
 * kitchen's tiles), so what the studio shows is what the budget buys. A catalogue without that
 * one gives the style's own floor or wall for any room (a database the room paints have not
 * reached yet), then the room's best finish of the same kind — a wet one in a bathroom, a dry
 * one anywhere else (`surfaceOptions`); one without any leaves the look to stand unpriced (null).
 */
export function styleFinishProduct(catalog: CatalogProduct[], room: PlanRoom, surface: Surface, styleId: StyleId): CatalogProduct | null {
  const options = surfaceOptions(catalog, surface, room, styleId);
  const style = getStyle(styleId);
  for (const look of [roomLook(style, room.type, surface), roomLook(style, room.type, surface, true)]) {
    const own = look.textureUrl ? options.find((p) => sameTexture(p.textureUrl, look.textureUrl)) : undefined;
    if (own) return own;
  }
  const wet = isWetRoom(room.type);
  return options.find((p) => !!surfaceSpecs(p).wet === wet) ?? null;
}

/**
 * The style's finish for a surface of a room: the product it is where the catalogue has one
 * (`styleFinishProduct`), still marked `origin: 'style'` — nobody chose it, the style did —
 * and the style's plain look where it has none. A ceiling is only ever the style's colour.
 */
export function styleFinish(room: PlanRoom, surface: 'floor' | 'wall' | 'ceiling', styleId: StyleId, catalog: CatalogProduct[] = []): SurfaceFinish {
  const look = defaultFinish(room, surface, styleId);
  if (surface === 'ceiling') return look;
  const product = styleFinishProduct(catalog, room, surface, styleId);
  if (!product) return look;
  // A texture product seldom has a colour of its own; the style's is the one its look was
  // picked to — what shows until the texture is in, and what the 2D sheet is tinted with: the
  // style's plain wall's colour when that is what stood in for the room's paint.
  const finish = finishFromProduct(room, surface, product, 'style');
  if (product.colorHex) return finish;
  const generic = roomLook(getStyle(styleId), room.type, surface, true);
  return { ...finish, colorHex: !sameTexture(product.textureUrl, look.textureUrl) && sameTexture(product.textureUrl, generic.textureUrl) ? generic.colorHex : look.colorHex };
}

/** A whole-room finish the style laid rather than a person: marked so, or from before finishes had an origin and bare. */
export function isStyleFinish(finish: Pick<SurfaceFinish, 'origin' | 'product'>): boolean {
  return finish.origin === 'style' || (finish.origin == null && !finish.product);
}

/**
 * Every room's floor and walls as the products the studio shows. A whole-room finish that is
 * still the style's becomes — or stays — the style's product for the room as it is now (a
 * room retyped as a bathroom gets the style's tiles), a room with no floor or walls at all
 * gets the style's, and whatever somebody chose is left alone. For a design laid out before
 * the style's finishes were products, and after everything that lays finishes with no
 * catalogue to hand (a new plan, the empty start, an edit to the rooms). The same array when
 * there is nothing to change; a catalogue with no finish for a surface changes nothing there.
 */
export function withStyleFinishes(finishes: SurfaceFinish[], rooms: PlanRoom[], styleId: StyleId, catalog: CatalogProduct[]): SurfaceFinish[] {
  if (catalog.length === 0) return finishes;
  let next = finishes;
  for (const room of rooms) {
    for (const surface of ['floor', 'wall'] as const) {
      const index = next.findIndex((f) => f.roomId === room.id && f.surface === surface && isBaseFinish(f));
      const current = index >= 0 ? next[index] : undefined;
      if (current && !isStyleFinish(current)) continue;
      const wanted = styleFinish(room, surface, styleId, catalog);
      if (!wanted.product || current?.product?.productId === wanted.product.productId) continue;
      if (next === finishes) next = [...finishes];
      if (current) next[index] = wanted;
      else next.push(wanted);
    }
  }
  return next;
}
