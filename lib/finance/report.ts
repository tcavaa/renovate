import { and, desc, eq, gte, lt, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { checkouts, orderItems, orders, products, stores, workers } from '@/lib/db/schema';
import { eachDay, round2, type DateRange, type OrderStatus } from './money';

/**
 * The admin's revenue report for one window: what the platform earned (fees + commissions),
 * what moved through it (goods, labour, delivery), and who did the moving. Every figure is
 * a snapshot summed from `checkouts` and `orders`; cancelled orders count for nothing.
 */
export interface RevenueReport {
  fees: { total: number; calculator: number; design: number; count: number; calculatorCount: number; designCount: number; m2: number };
  commissions: { total: number; stores: number; workers: number; orders: number; storeOrders: number; workerOrders: number; cancelledOrders: number };
  gmv: { goods: number; labour: number; delivery: number; total: number };
  revenue: number;
  days: Array<{ day: string; fees: number; commissions: number; orders: number; checkouts: number }>;
  byStore: Array<{ storeId: number; nameKa: string; nameEn: string | null; nameRu: string | null; orders: number; goods: number; commission: number; pct: number | null }>;
  byWorker: Array<{ workerId: number; nameKa: string; nameEn: string | null; nameRu: string | null; specialty: string; orders: number; labour: number; commission: number; pct: number | null }>;
  topProducts: Array<{ productId: number | null; nameKa: string; nameEn: string | null; nameRu: string | null; storeNameKa: string | null; qty: number; total: number; orders: number }>;
  statuses: Record<OrderStatus, number>;
}

const num = (v: unknown) => Number(v ?? 0) || 0;

export async function revenueReport(range: DateRange): Promise<RevenueReport> {
  const inCheckoutRange = and(gte(checkouts.createdAt, range.from), lt(checkouts.createdAt, range.to));
  const inOrderRange = and(gte(orders.createdAt, range.from), lt(orders.createdAt, range.to));
  const liveOrders = and(inOrderRange, ne(orders.status, 'cancelled'));

  const [feeRows, orderRows, statusRows, feeDays, orderDays, storeRows, workerRows, productRows] = await Promise.all([
    db
      .select({ kind: checkouts.kind, total: sql<number>`COALESCE(SUM(${checkouts.platformFee}), 0)`, count: sql<number>`COUNT(*)`, m2: sql<number>`COALESCE(SUM(${checkouts.totalM2}), 0)` })
      .from(checkouts)
      .where(inCheckoutRange)
      .groupBy(checkouts.kind),
    db
      .select({
        partnerType: orders.partnerType,
        commission: sql<number>`COALESCE(SUM(${orders.commissionAmount}), 0)`,
        subtotal: sql<number>`COALESCE(SUM(${orders.subtotal}), 0)`,
        delivery: sql<number>`COALESCE(SUM(${orders.deliveryFee}), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(orders)
      .where(liveOrders)
      .groupBy(orders.partnerType),
    db.select({ status: orders.status, count: sql<number>`COUNT(*)` }).from(orders).where(inOrderRange).groupBy(orders.status),
    db
      .select({ day: sql<string>`DATE_FORMAT(${checkouts.createdAt}, '%Y-%m-%d')`, fees: sql<number>`COALESCE(SUM(${checkouts.platformFee}), 0)`, count: sql<number>`COUNT(*)` })
      .from(checkouts)
      .where(inCheckoutRange)
      .groupBy(sql`DATE_FORMAT(${checkouts.createdAt}, '%Y-%m-%d')`),
    db
      .select({ day: sql<string>`DATE_FORMAT(${orders.createdAt}, '%Y-%m-%d')`, commissions: sql<number>`COALESCE(SUM(${orders.commissionAmount}), 0)`, count: sql<number>`COUNT(*)` })
      .from(orders)
      .where(liveOrders)
      .groupBy(sql`DATE_FORMAT(${orders.createdAt}, '%Y-%m-%d')`),
    db
      .select({
        storeId: stores.id,
        nameKa: stores.nameKa,
        nameEn: stores.nameEn,
        nameRu: stores.nameRu,
        pct: stores.commissionRate,
        orders: sql<number>`COUNT(${orders.id})`,
        goods: sql<number>`COALESCE(SUM(${orders.subtotal}), 0)`,
        commission: sql<number>`COALESCE(SUM(${orders.commissionAmount}), 0)`,
      })
      .from(orders)
      .innerJoin(stores, eq(orders.storeId, stores.id))
      .where(liveOrders)
      .groupBy(stores.id, stores.nameKa, stores.nameEn, stores.nameRu, stores.commissionRate)
      .orderBy(desc(sql`SUM(${orders.subtotal})`)),
    db
      .select({
        workerId: workers.id,
        nameKa: workers.nameKa,
        nameEn: workers.nameEn,
        nameRu: workers.nameRu,
        specialty: workers.specialty,
        pct: workers.commissionRate,
        orders: sql<number>`COUNT(${orders.id})`,
        labour: sql<number>`COALESCE(SUM(${orders.subtotal}), 0)`,
        commission: sql<number>`COALESCE(SUM(${orders.commissionAmount}), 0)`,
      })
      .from(orders)
      .innerJoin(workers, eq(orders.workerId, workers.id))
      .where(liveOrders)
      .groupBy(workers.id, workers.nameKa, workers.nameEn, workers.nameRu, workers.specialty, workers.commissionRate)
      .orderBy(desc(sql`SUM(${orders.subtotal})`)),
    db
      .select({
        productId: orderItems.productId,
        nameKa: orderItems.nameKa,
        nameEn: orderItems.nameEn,
        nameRu: orderItems.nameRu,
        storeNameKa: stores.nameKa,
        qty: sql<number>`COALESCE(SUM(${orderItems.qty}), 0)`,
        total: sql<number>`COALESCE(SUM(${orderItems.total}), 0)`,
        orders: sql<number>`COUNT(DISTINCT ${orderItems.orderId})`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .leftJoin(products, eq(orderItems.productId, products.id))
      .leftJoin(stores, eq(products.storeId, stores.id))
      .where(and(liveOrders, eq(orderItems.removed, false)))
      .groupBy(orderItems.productId, orderItems.nameKa, orderItems.nameEn, orderItems.nameRu, stores.nameKa)
      .orderBy(desc(sql`SUM(${orderItems.total})`))
      .limit(15),
  ]);

  const feeOf = (kind: 'calculator' | 'design') => feeRows.find((r) => r.kind === kind);
  const ordersOf = (type: 'store' | 'worker') => orderRows.find((r) => r.partnerType === type);
  const calc = feeOf('calculator');
  const design = feeOf('design');
  const storeOrders = ordersOf('store');
  const workerOrders = ordersOf('worker');

  const statuses: Record<OrderStatus, number> = { new: 0, confirmed: 0, in_progress: 0, done: 0, cancelled: 0 };
  for (const row of statusRows) statuses[row.status] = num(row.count);

  const feeByDay = new Map(feeDays.map((r) => [r.day, r]));
  const orderByDay = new Map(orderDays.map((r) => [r.day, r]));
  const days = eachDay(range).map((day) => ({
    day,
    fees: round2(num(feeByDay.get(day)?.fees)),
    checkouts: num(feeByDay.get(day)?.count),
    commissions: round2(num(orderByDay.get(day)?.commissions)),
    orders: num(orderByDay.get(day)?.count),
  }));

  const fees = {
    calculator: round2(num(calc?.total)),
    design: round2(num(design?.total)),
    total: round2(num(calc?.total) + num(design?.total)),
    count: num(calc?.count) + num(design?.count),
    calculatorCount: num(calc?.count),
    designCount: num(design?.count),
    m2: round2(num(calc?.m2) + num(design?.m2)),
  };
  const commissions = {
    stores: round2(num(storeOrders?.commission)),
    workers: round2(num(workerOrders?.commission)),
    total: round2(num(storeOrders?.commission) + num(workerOrders?.commission)),
    orders: num(storeOrders?.count) + num(workerOrders?.count),
    storeOrders: num(storeOrders?.count),
    workerOrders: num(workerOrders?.count),
    cancelledOrders: statuses.cancelled,
  };
  const gmv = {
    goods: round2(num(storeOrders?.subtotal)),
    labour: round2(num(workerOrders?.subtotal)),
    delivery: round2(num(storeOrders?.delivery) + num(workerOrders?.delivery)),
    total: round2(num(storeOrders?.subtotal) + num(workerOrders?.subtotal) + num(storeOrders?.delivery) + num(workerOrders?.delivery)),
  };

  return {
    fees,
    commissions,
    gmv,
    revenue: round2(fees.total + commissions.total),
    days,
    byStore: storeRows.map((r) => ({ storeId: r.storeId, nameKa: r.nameKa, nameEn: r.nameEn, nameRu: r.nameRu, orders: num(r.orders), goods: round2(num(r.goods)), commission: round2(num(r.commission)), pct: r.pct == null ? null : Number(r.pct) })),
    byWorker: workerRows.map((r) => ({ workerId: r.workerId, nameKa: r.nameKa, nameEn: r.nameEn, nameRu: r.nameRu, specialty: r.specialty, orders: num(r.orders), labour: round2(num(r.labour)), commission: round2(num(r.commission)), pct: r.pct == null ? null : Number(r.pct) })),
    topProducts: productRows.map((r) => ({ productId: r.productId, nameKa: r.nameKa, nameEn: r.nameEn, nameRu: r.nameRu, storeNameKa: r.storeNameKa, qty: round2(num(r.qty)), total: round2(num(r.total)), orders: num(r.orders) })),
    statuses,
  };
}

/** One row per order for the CSV export: partner, customer, money, status. */
export async function ordersForExport(range: DateRange) {
  return db
    .select({
      id: orders.id,
      createdAt: orders.createdAt,
      partnerType: orders.partnerType,
      storeName: stores.nameKa,
      workerName: workers.nameKa,
      status: orders.status,
      customerName: orders.customerName,
      customerPhone: orders.customerPhone,
      subtotal: orders.subtotal,
      deliveryFee: orders.deliveryFee,
      commissionPct: orders.commissionPct,
      commissionAmount: orders.commissionAmount,
      projectId: orders.projectId,
      checkoutId: orders.checkoutId,
    })
    .from(orders)
    .leftJoin(stores, eq(orders.storeId, stores.id))
    .leftJoin(workers, eq(orders.workerId, workers.id))
    .where(and(gte(orders.createdAt, range.from), lt(orders.createdAt, range.to)))
    .orderBy(desc(orders.createdAt));
}
