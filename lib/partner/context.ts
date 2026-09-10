import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { stores, workers } from '@/lib/db/schema';
import { canOpenPartnerPortal } from '@/lib/auth/roles';
import type { PartnerRef } from '@/lib/finance/orders';

/**
 * Who is looking at the portal. A `store` account resolves to its store, a `worker` account
 * to its worker; admin may open the portal with `?store=ID` / `?worker=ID` to see exactly
 * what that partner sees. `type: null` means a role without a link — the layout shows the
 * "not linked" card and nothing else.
 */
export interface PartnerContext {
  ref: PartnerRef;
  type: 'store' | 'worker' | null;
  name: string | null;
  commissionRate: number | null;
  email: string | null;
  /** A self-registered partner waits here until admin approves; admin-created ones are approved. */
  approvalStatus: 'pending' | 'approved' | 'rejected' | null;
  isAdmin: boolean;
  userId: number;
}

export async function loadPartnerContext(search?: { store?: string; worker?: string }): Promise<PartnerContext | null> {
  const session = await auth();
  if (!session?.user?.id || !canOpenPartnerPortal(session.user.role)) return null;
  const isAdmin = session.user.role === 'admin';
  let storeId = session.user.role === 'store' ? session.user.storeId : null;
  let workerId = session.user.role === 'worker' ? session.user.workerId : null;
  if (isAdmin) {
    const s = Number(search?.store);
    const w = Number(search?.worker);
    if (Number.isInteger(s) && s > 0) storeId = s;
    else if (Number.isInteger(w) && w > 0) workerId = w;
  }
  const base = { ref: { storeId: storeId ?? null, workerId: workerId ?? null }, isAdmin, userId: Number(session.user.id) };
  if (storeId) {
    const [row] = await db.select({ nameKa: stores.nameKa, commissionRate: stores.commissionRate, email: stores.email, approvalStatus: stores.approvalStatus }).from(stores).where(eq(stores.id, storeId)).limit(1);
    return { ...base, type: 'store', name: row?.nameKa ?? `#${storeId}`, commissionRate: row?.commissionRate == null ? null : Number(row.commissionRate), email: row?.email ?? null, approvalStatus: row?.approvalStatus ?? null };
  }
  if (workerId) {
    const [row] = await db.select({ nameKa: workers.nameKa, commissionRate: workers.commissionRate, email: workers.email, approvalStatus: workers.approvalStatus }).from(workers).where(eq(workers.id, workerId)).limit(1);
    return { ...base, type: 'worker', name: row?.nameKa ?? `#${workerId}`, commissionRate: row?.commissionRate == null ? null : Number(row.commissionRate), email: row?.email ?? null, approvalStatus: row?.approvalStatus ?? null };
  }
  return { ...base, type: null, name: null, commissionRate: null, email: null, approvalStatus: null };
}

/** Keeps admin's `?store=` / `?worker=` preview on every portal link. */
export function partnerHref(path: string, ctx: PartnerContext): string {
  if (!ctx.isAdmin) return path;
  if (ctx.ref.storeId) return `${path}?store=${ctx.ref.storeId}`;
  if (ctx.ref.workerId) return `${path}?worker=${ctx.ref.workerId}`;
  return path;
}
