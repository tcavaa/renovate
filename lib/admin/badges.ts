import { and, count, eq, isNull, notInArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { orders, stores, workers } from '@/lib/db/schema';
import { canAdmin, type AdminSection, type UserRole } from '@/lib/auth/roles';

/**
 * The counts beside the admin sidebar's sections — what is waiting on the person looking:
 * store orders to confirm (orders), stores and workers that registered and wait for approval.
 * Only the sections the role has are counted.
 */
export async function sidebarBadges(role: UserRole): Promise<Partial<Record<AdminSection, number>>> {
  const [ordersWaiting, storesPending, workersPending] = await Promise.all([
    canAdmin(role, 'orders')
      ? db.select({ n: count() }).from(orders).where(and(eq(orders.partnerType, 'store'), isNull(orders.sentAt), notInArray(orders.status, ['cancelled', 'done'])))
      : Promise.resolve(null),
    canAdmin(role, 'stores') ? db.select({ n: count() }).from(stores).where(eq(stores.approvalStatus, 'pending')) : Promise.resolve(null),
    canAdmin(role, 'workers') ? db.select({ n: count() }).from(workers).where(eq(workers.approvalStatus, 'pending')) : Promise.resolve(null),
  ]);
  const out: Partial<Record<AdminSection, number>> = {};
  if (ordersWaiting) out.orders = Number(ordersWaiting[0]?.n ?? 0);
  if (storesPending) out.stores = Number(storesPending[0]?.n ?? 0);
  if (workersPending) out.workers = Number(workersPending[0]?.n ?? 0);
  return out;
}
