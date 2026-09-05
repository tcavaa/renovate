import { inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { products } from '@/lib/db/schema';

/**
 * Current catalogue prices, by product id, for repricing a client-submitted basket.
 *
 * The browser sends product snapshots with the prices it was showing. Those are a preview:
 * anyone can edit them in devtools before saving, and the admin dashboard would then display
 * the forged total as if it were real. Every save route therefore looks the price up again
 * here and overwrites what the client sent.
 *
 * Inactive products are still returned — a saved design may legitimately reference a product
 * that was retired after it was chosen. A product that does not exist at all is not.
 */
export interface KnownPrice {
  pricePerUnit: number;
  nameKa: string;
}

export async function loadProductPrices(ids: Iterable<number>): Promise<Map<number, KnownPrice>> {
  const unique = [...new Set([...ids].filter((id) => Number.isInteger(id) && id > 0))];
  const known = new Map<number, KnownPrice>();
  if (unique.length === 0) return known;

  const rows = await db
    .select({ id: products.id, pricePerUnit: products.pricePerUnit, nameKa: products.nameKa })
    .from(products)
    .where(inArray(products.id, unique));

  for (const row of rows) {
    known.set(row.id, { pricePerUnit: Number(row.pricePerUnit), nameKa: row.nameKa });
  }
  return known;
}

/**
 * Applies a looked-up price to one snapshot. Returns `null` when the product is unknown, so
 * the caller can refuse the whole save rather than silently keep the client's number.
 */
export function repriceSnapshot<T extends { productId: number; qty: number; pricePerUnit: number; totalPrice: number }>(
  snapshot: T,
  known: Map<number, KnownPrice>
): T | null {
  const price = known.get(snapshot.productId);
  if (!price) return null;
  const qty = Number.isFinite(snapshot.qty) && snapshot.qty >= 0 ? snapshot.qty : 0;
  return {
    ...snapshot,
    pricePerUnit: price.pricePerUnit,
    totalPrice: Math.round(price.pricePerUnit * qty * 100) / 100,
  };
}
