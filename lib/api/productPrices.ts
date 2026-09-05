import { inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { products } from '@/lib/db/schema';

/**
 * Current catalogue prices, by product id, for repricing a client-submitted basket.
 *
 * The browser sends product snapshots with the prices and quantities it was showing. Those
 * are a preview: anyone can edit them in devtools before saving, and the admin dashboard
 * would then display the forged total as if it were real. Every save route therefore looks
 * the price up again here, recomputes the quantity from the rooms, and overwrites both.
 *
 * Inactive products are still returned — a saved design may legitimately reference a product
 * that was retired after it was chosen. A product that does not exist at all is not.
 */
export interface KnownPrice {
  pricePerUnit: number;
  nameKa: string;
  unit: string;
  coveragePerUnit: number | null;
}

export async function loadProductPrices(ids: Iterable<number>): Promise<Map<number, KnownPrice>> {
  const unique = [...new Set([...ids].filter((id) => Number.isInteger(id) && id > 0))];
  const known = new Map<number, KnownPrice>();
  if (unique.length === 0) return known;

  const rows = await db
    .select({
      id: products.id,
      pricePerUnit: products.pricePerUnit,
      nameKa: products.nameKa,
      unit: products.unit,
      coveragePerUnit: products.coveragePerUnit,
    })
    .from(products)
    .where(inArray(products.id, unique));

  for (const row of rows) {
    known.set(row.id, {
      pricePerUnit: Number(row.pricePerUnit),
      nameKa: row.nameKa,
      unit: row.unit,
      coveragePerUnit: row.coveragePerUnit != null ? Number(row.coveragePerUnit) : null,
    });
  }
  return known;
}

type PricedSnapshot = { productId: number; qty: number; pricePerUnit: number; totalPrice: number };

/**
 * Applies a looked-up price and a server-computed quantity to one snapshot. Returns `null`
 * when the product is unknown, so the caller can refuse the whole save rather than silently
 * keep the client's numbers.
 */
export function repriceSnapshot<T extends PricedSnapshot>(
  snapshot: T,
  known: Map<number, KnownPrice>,
  qty: number = snapshot.qty
): T | null {
  const price = known.get(snapshot.productId);
  if (!price) return null;
  return withPrice(snapshot, price.pricePerUnit, qty);
}

/**
 * Finishes are priced per square metre of room surface whatever the catalogue sells them
 * by: a tile already is, a tin of paint is its price divided by the area it covers. Mirrors
 * `pricePerM2` in `lib/design/surfaces.ts`.
 */
export function repriceFinishSnapshot<T extends PricedSnapshot & { unit: string }>(
  snapshot: T,
  known: Map<number, KnownPrice>,
  areaM2: number
): T | null {
  const price = known.get(snapshot.productId);
  if (!price) return null;
  const perM2 =
    price.unit === 'm2'
      ? price.pricePerUnit
      : price.pricePerUnit / Math.max(price.coveragePerUnit ?? (price.unit === 'liter' ? 8 : 1), 0.01);
  return { ...withPrice(snapshot, perM2, areaM2), unit: 'm2' };
}

function withPrice<T extends PricedSnapshot>(snapshot: T, pricePerUnit: number, qty: number): T {
  const safeQty = Number.isFinite(qty) && qty >= 0 ? qty : 0;
  return {
    ...snapshot,
    qty: safeQty,
    pricePerUnit,
    totalPrice: Math.round(pricePerUnit * safeQty * 100) / 100,
  };
}
