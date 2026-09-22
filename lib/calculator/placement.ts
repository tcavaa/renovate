/**
 * The calculator's placement step: the floor and wall materials in the cart are laid on the
 * rooms of the calculator's own board, and what they come to is read off that board.
 *
 * A material in the cart (`cartKey`) has no quantity of its own — the person says where it
 * goes, whole rooms or a square metre at a time, and the area laid is the quantity. The
 * board keeps that as `SurfaceFinish`es with the product snapshot carrying the area it
 * covers (`product.qty`), so the sum per product is the area, and `finishPickQuantity`
 * turns it into the product's own units. Pure functions; the pages call them.
 */

import type { Category } from '@/lib/db/schema';
import type { CatalogProduct } from '@/lib/design/matcher';
import type { SurfaceFinish } from '@/lib/design/types';
import type { SelectedProduct } from './types';

/** Which surface a category's products are laid on, or null for one that is not laid (a socket, a door). */
export function surfaceOfCategory(category: Pick<Category, 'calculationType'> | null | undefined): 'floor' | 'wall' | null {
  if (category?.calculationType === 'per_m2_floor') return 'floor';
  if (category?.calculationType === 'per_m2_wall') return 'wall';
  return null;
}

/** The square metres each product covers on the board, by product id — whole rooms, tiles, strips and zones alike. */
export function finishAreasByProduct(finishes: SurfaceFinish[]): Map<number, number> {
  const areas = new Map<number, number>();
  for (const finish of finishes) {
    if (!finish.product || (finish.surface !== 'floor' && finish.surface !== 'wall')) continue;
    const id = finish.product.productId;
    areas.set(id, Math.round(((areas.get(id) ?? 0) + finish.product.qty) * 100) / 100);
  }
  return areas;
}

/**
 * A cart pick as the catalogue product the board's finish actions take. The pick carries
 * what the board needs (texture, colour, coverage, specs) from the catalogue row it was
 * made from, so no catalogue has to be fetched to lay it.
 */
export function catalogProductFromPick(pick: SelectedProduct): CatalogProduct {
  return {
    id: pick.productId,
    nameKa: pick.nameKa,
    nameEn: pick.nameEn ?? null,
    nameRu: pick.nameRu ?? null,
    slug: pick.slug ?? '',
    brand: null,
    categorySlug: pick.categorySlug ?? '',
    pricePerUnit: pick.pricePerUnit,
    unit: pick.unit,
    imageUrl: pick.imageUrl,
    colorHex: pick.colorHex ?? null,
    textureUrl: pick.textureUrl ?? null,
    model3dKind: null,
    model3dUrl: null,
    widthCm: null,
    depthCm: null,
    heightCm: null,
    styleTags: [],
    tags: [],
    isFeatured: false,
    specs: pick.specs ?? null,
    coveragePerUnit: pick.coveragePerUnit ?? null,
    store: null,
  };
}
