import { and, desc, eq, gte, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { orderItems, orders, products } from '@/lib/db/schema';
import { partnerCondition, type PartnerRef } from '@/lib/finance/orders';
import { orderStage, type OrderStage } from '@/lib/finance/orderFlow';

/**
 * The numbers behind a partner's dashboard — its sales month by month, its best-selling
 * products, the state of its catalogue and of its orders. Everything counts only what the
 * partner has been sent (`partnerCondition`), and leaves cancelled orders and struck lines out.
 */

/** `YYYY-MM` for the month a date falls in, local time — the key the monthly series uses. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** The last `months` months, oldest first, including the current one. */
export function lastMonths(months: number, now = new Date()): string[] {
  const out: string[] = [];
  for (let i = months - 1; i >= 0; i--) out.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  return out;
}

export interface MonthlySales {
  month: string;
  goods: number;
  orders: number;
}

export async function partnerMonthlySales(ref: PartnerRef, months = 6, now = new Date()): Promise<MonthlySales[]> {
  const keys = lastMonths(months, now);
  const from = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const rows = await db
    .select({
      month: sql<string>`DATE_FORMAT(${orders.sentAt}, '%Y-%m')`,
      goods: sql<number>`COALESCE(SUM(${orders.subtotal}), 0)`,
      orders: sql<number>`COUNT(*)`,
    })
    .from(orders)
    .where(and(partnerCondition(ref), ne(orders.status, 'cancelled'), gte(orders.sentAt, from)))
    .groupBy(sql`DATE_FORMAT(${orders.sentAt}, '%Y-%m')`);
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  return keys.map((month) => ({ month, goods: Number(byMonth.get(month)?.goods ?? 0), orders: Number(byMonth.get(month)?.orders ?? 0) }));
}

export interface TopProduct {
  productId: number;
  nameKa: string;
  nameEn: string | null;
  nameRu: string | null;
  imageUrl: string | null;
  units: number;
  revenue: number;
  orders: number;
}

/** What a store sells most, by what it earned from it. */
export async function storeTopProducts(storeId: number, limit = 5): Promise<TopProduct[]> {
  const rows = await db
    .select({
      productId: orderItems.productId,
      nameKa: products.nameKa,
      nameEn: products.nameEn,
      nameRu: products.nameRu,
      imageUrl: products.imageUrl,
      units: sql<number>`SUM(${orderItems.qty})`,
      revenue: sql<number>`SUM(${orderItems.total})`,
      orders: sql<number>`COUNT(DISTINCT ${orderItems.orderId})`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(and(eq(orders.storeId, storeId), isNotNull(orders.sentAt), ne(orders.status, 'cancelled'), eq(orderItems.removed, false)))
    .groupBy(orderItems.productId, products.nameKa, products.nameEn, products.nameRu, products.imageUrl)
    .orderBy(desc(sql`SUM(${orderItems.total})`))
    .limit(limit);
  return rows.map((r) => ({ ...r, productId: Number(r.productId), units: Number(r.units), revenue: Number(r.revenue), orders: Number(r.orders) }));
}

export interface CatalogueHealth {
  total: number;
  shown: number;
  hidden: number;
  noPhoto: number;
  no3d: number;
}

/** The state of a store's shelf: what shows, what is hidden, what is missing its photo or model. */
export async function storeCatalogueHealth(storeId: number): Promise<CatalogueHealth> {
  const [row] = await db
    .select({
      total: sql<number>`COUNT(*)`,
      shown: sql<number>`SUM(${products.isActive} = 1)`,
      hidden: sql<number>`SUM(${products.isActive} = 0)`,
      noPhoto: sql<number>`SUM(${products.imageUrl} IS NULL OR ${products.imageUrl} = '')`,
      no3d: sql<number>`SUM(${products.model3dUrl} IS NULL)`,
    })
    .from(products)
    .where(and(eq(products.storeId, storeId), isNull(products.ownerUserId)));
  return { total: Number(row?.total ?? 0), shown: Number(row?.shown ?? 0), hidden: Number(row?.hidden ?? 0), noPhoto: Number(row?.noPhoto ?? 0), no3d: Number(row?.no3d ?? 0) };
}

/** How many of the partner's orders stand where, in the words the portal uses. */
export async function partnerStageCounts(ref: PartnerRef): Promise<Record<OrderStage, number>> {
  // Every order here has been sent (`partnerCondition`), so its stage follows from its status.
  const rows = await db
    .select({ status: orders.status, partnerType: orders.partnerType, n: sql<number>`COUNT(*)` })
    .from(orders)
    .where(partnerCondition(ref))
    .groupBy(orders.status, orders.partnerType);
  const counts: Record<OrderStage, number> = { review: 0, awaiting_partner: 0, accepted: 0, in_progress: 0, done: 0, cancelled: 0 };
  for (const r of rows) counts[orderStage({ status: r.status, partnerType: r.partnerType, sentAt: 'sent' })] += Number(r.n);
  return counts;
}
