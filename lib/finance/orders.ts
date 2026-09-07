import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  checkouts,
  orderItems,
  orders,
  products,
  projects,
  stores,
  workers,
  type Order,
  type OrderItem,
  type Project,
  type Worker,
} from '@/lib/db/schema';
import { buildProjectSummary } from '@/lib/calculator/materials';
import type { HomeState, Room, SelectedProduct } from '@/lib/calculator/types';
import type { DesignScene, FloorPlan } from '@/lib/design/types';
import { loadRateBook } from '@/lib/api/rateBook';
import { en } from '@/lib/i18n/en';
import { ru } from '@/lib/i18n/ru';
import { log } from '@/lib/log';
import {
  buildStoreOrders,
  calculatorLinesByStore,
  effectiveCommissionPct,
  feePerM2For,
  labourLines,
  orderTotals,
  platformFee,
  round2,
  sceneLinesByStore,
  type CheckoutKind,
  type LinesByStore,
  type OrderLineDraft,
  type OrderStatus,
} from './money';
import { notifyCustomerCheckout, notifyCustomerOrderUpdate, notifyPartnerNewOrder, type CustomerContact } from './notify';
import { loadPlatformSettings } from './settings';

/**
 * Writing and reading orders.
 *
 * A checkout turns a saved project into one `order` per partner store plus the platform's
 * own fee; a booking is a worker's order for a project's labour. Both are built by the pure
 * functions in `./money` and written here in one transaction, then announced by mail.
 * Partners edit their orders through `applyOrderEdit`, which recomputes the totals from the
 * items every time — the stored subtotal is never trusted to be up to date on its own.
 */

export function checkoutKindOf(project: Pick<Project, 'plan'>): CheckoutKind {
  return project.plan ? 'design' : 'calculator';
}

export interface CheckoutResult {
  checkoutId: number;
  kind: CheckoutKind;
  totalM2: number;
  feePerM2: number;
  platformFee: number;
  goodsTotal: number;
  commissionTotal: number;
  orders: Array<{
    id: number;
    storeId: number;
    storeNameKa: string;
    storeNameEn: string | null;
    storeNameRu: string | null;
    subtotal: number;
    deliveryFee: number;
    itemCount: number;
  }>;
  /** Lines nobody sells — shown to the customer so the missing pieces are not a surprise. */
  unassigned: number;
}

async function storeLookup(productIds: number[]): Promise<(id: number) => number | null> {
  const unique = [...new Set(productIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (unique.length === 0) return () => null;
  const rows = await db.select({ id: products.id, storeId: products.storeId }).from(products).where(inArray(products.id, unique));
  const map = new Map(rows.map((r) => [r.id, r.storeId ?? null]));
  return (id) => map.get(id) ?? null;
}

/** The project's picks grouped by store, whichever way the project was made. */
async function projectLines(project: Project): Promise<LinesByStore> {
  if (project.plan) {
    const plan = project.plan as FloorPlan;
    const scene = (project.scene ?? { items: [], finishes: [] }) as DesignScene;
    const ids = [...scene.items.map((i) => i.product?.productId), ...scene.finishes.map((f) => f.product?.productId)].filter((id): id is number => typeof id === 'number');
    return sceneLinesByStore(plan, scene, await storeLookup(ids));
  }
  const selectedProducts = (project.selectedProducts ?? {}) as Record<string, SelectedProduct>;
  const selectedFurniture = (project.selectedFurniture ?? {}) as Record<string, SelectedProduct[]>;
  const ids = [...Object.values(selectedProducts).map((p) => p.productId), ...Object.values(selectedFurniture).flat().map((p) => p.productId)];
  return calculatorLinesByStore(selectedProducts, selectedFurniture, (project.rooms ?? []) as Room[], await storeLookup(ids));
}

function itemRows(orderId: number, lines: OrderLineDraft[]) {
  return lines.map((l, i) => ({
    orderId,
    productId: l.productId,
    nameKa: l.nameKa,
    nameEn: l.nameEn,
    nameRu: l.nameRu,
    categorySlug: l.categorySlug,
    roomName: l.roomName,
    unit: l.unit,
    qty: String(l.qty),
    unitPrice: String(l.unitPrice),
    total: String(l.total),
    sortOrder: i,
  }));
}

/**
 * Places the order for a whole project. Returns what the customer is shown: the fee, and
 * one line per store that will now be contacting them.
 */
export async function createCheckoutForProject(project: Project, customer: CustomerContact, userId: number | null): Promise<CheckoutResult> {
  const settings = await loadPlatformSettings();
  const kind = checkoutKindOf(project);
  const lines = await projectLines(project);

  const storeIds = [...lines.groups.keys()];
  const storeRows = storeIds.length ? await db.select().from(stores).where(inArray(stores.id, storeIds)) : [];
  const storesById = new Map(storeRows.map((s) => [s.id, s]));
  const drafts = buildStoreOrders(lines.groups, storesById, settings.storeCommissionPct);

  const totalM2 = Number(project.totalM2) || 0;
  const feePerM2 = feePerM2For(kind, settings);
  const fee = platformFee(totalM2, feePerM2);
  const goodsTotal = round2(drafts.reduce((s, d) => s + d.subtotal + d.deliveryFee, 0));
  const commissionTotal = round2(drafts.reduce((s, d) => s + d.commissionAmount, 0));

  const written = await db.transaction(async (tx) => {
    const [checkoutInsert] = await tx.insert(checkouts).values({
      projectId: project.id,
      userId,
      kind,
      totalM2: String(totalM2),
      feePerM2: String(feePerM2),
      platformFee: String(fee),
      goodsTotal: String(goodsTotal),
      commissionTotal: String(commissionTotal),
      customerName: customer.name,
      customerPhone: customer.phone,
      customerEmail: customer.email,
      note: customer.note,
    });
    const checkoutId = checkoutInsert.insertId;
    const created: Array<{ id: number; draft: (typeof drafts)[number] }> = [];
    for (const draft of drafts) {
      const [orderInsert] = await tx.insert(orders).values({
        checkoutId,
        projectId: project.id,
        userId,
        partnerType: 'store',
        storeId: draft.storeId,
        status: 'new',
        subtotal: String(draft.subtotal),
        deliveryFee: String(draft.deliveryFee),
        commissionPct: String(draft.commissionPct),
        commissionAmount: String(draft.commissionAmount),
        customerName: customer.name,
        customerPhone: customer.phone,
        customerEmail: customer.email,
        customerNote: customer.note,
      });
      const orderId = orderInsert.insertId;
      if (draft.lines.length) await tx.insert(orderItems).values(itemRows(orderId, draft.lines));
      created.push({ id: orderId, draft });
    }
    await tx.update(projects).set({ status: 'submitted' }).where(eq(projects.id, project.id));
    return { checkoutId, created };
  });

  log.info('checkout placed', { checkoutId: written.checkoutId, projectId: project.id, kind, fee, orders: written.created.length, commissionTotal });

  const result: CheckoutResult = {
    checkoutId: written.checkoutId,
    kind,
    totalM2,
    feePerM2,
    platformFee: fee,
    goodsTotal,
    commissionTotal,
    orders: written.created.map(({ id, draft }) => {
      const store = storesById.get(draft.storeId);
      return {
        id,
        storeId: draft.storeId,
        storeNameKa: store?.nameKa ?? `#${draft.storeId}`,
        storeNameEn: store?.nameEn ?? null,
        storeNameRu: store?.nameRu ?? null,
        subtotal: draft.subtotal,
        deliveryFee: draft.deliveryFee,
        itemCount: draft.lines.length,
      };
    }),
    unassigned: lines.unassigned.length,
  };

  // Mail is best-effort and outside the transaction: the rows are the record.
  await Promise.all(
    written.created.map(({ id, draft }) => {
      const store = storesById.get(draft.storeId);
      return notifyPartnerNewOrder({
        email: store?.email,
        partnerName: store?.nameKa ?? `#${draft.storeId}`,
        orderId: id,
        customer,
        lines: draft.lines,
        subtotal: draft.subtotal,
        deliveryFee: draft.deliveryFee,
        kind: 'store',
      });
    })
  );
  await notifyCustomerCheckout({
    customer,
    checkoutId: written.checkoutId,
    platformFee: fee,
    orders: result.orders.map((o) => ({ id: o.id, partnerName: o.storeNameKa, subtotal: o.subtotal, deliveryFee: o.deliveryFee })),
  });
  return result;
}

const workTypeNames = (key: string) => ({
  en: (en.workTypes as Record<string, string>)[key] ?? null,
  ru: (ru.workTypes as Record<string, string>)[key] ?? null,
});

export interface BookingResult {
  orderId: number;
  subtotal: number;
  commissionPct: number;
  commissionAmount: number;
  itemCount: number;
}

/**
 * Books a worker. With a project the booking carries the calculator's labour lines for
 * that flat; without one it is a request the worker prices themselves (a fixed-price
 * worker's rate goes on as the single line).
 */
export async function createWorkerBooking(args: { worker: Worker; project: Project | null; customer: CustomerContact; userId: number | null }): Promise<BookingResult> {
  const { worker, project, customer, userId } = args;
  const settings = await loadPlatformSettings();
  const commissionPct = effectiveCommissionPct(worker.commissionRate, settings.workerCommissionPct);

  let lines: OrderLineDraft[] = [];
  if (project) {
    const selectedProducts = (project.selectedProducts ?? {}) as Record<string, SelectedProduct>;
    const selectedFurniture = (project.selectedFurniture ?? {}) as Record<string, SelectedProduct[]>;
    const summary = buildProjectSummary(
      (project.rooms ?? []) as Room[],
      project.homeState as HomeState,
      Object.values(selectedProducts),
      Object.values(selectedFurniture).flat(),
      await loadRateBook()
    );
    lines = labourLines(summary, workTypeNames);
  } else if (worker.priceUnit === 'fixed' && worker.pricePerUnit) {
    const price = Number(worker.pricePerUnit);
    lines = [{ productId: null, nameKa: worker.specialty, nameEn: null, nameRu: null, categorySlug: `labour:${worker.specialtySlug}`, roomName: null, unit: 'unit', qty: 1, unitPrice: price, total: round2(price) }];
  }
  const totals = orderTotals(lines, commissionPct);

  const orderId = await db.transaction(async (tx) => {
    const [orderInsert] = await tx.insert(orders).values({
      checkoutId: null,
      projectId: project?.id ?? null,
      userId,
      partnerType: 'worker',
      workerId: worker.id,
      status: 'new',
      subtotal: String(totals.subtotal),
      deliveryFee: '0.00',
      commissionPct: String(commissionPct),
      commissionAmount: String(totals.commissionAmount),
      customerName: customer.name,
      customerPhone: customer.phone,
      customerEmail: customer.email,
      customerNote: customer.note,
    });
    const id = orderInsert.insertId;
    if (lines.length) await tx.insert(orderItems).values(itemRows(id, lines));
    return id;
  });

  log.info('worker booked', { orderId, workerId: worker.id, projectId: project?.id ?? null, subtotal: totals.subtotal });
  await notifyPartnerNewOrder({ email: worker.email, partnerName: worker.nameKa, orderId, customer, lines, subtotal: totals.subtotal, deliveryFee: 0, kind: 'worker' });
  return { orderId, ...totals, commissionPct, itemCount: lines.length };
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export interface OrderView {
  order: Order;
  items: OrderItem[];
  store: { id: number; nameKa: string; nameEn: string | null; nameRu: string | null; email: string | null; phone: string | null; logoUrl: string | null } | null;
  worker: { id: number; nameKa: string; nameEn: string | null; nameRu: string | null; email: string | null; phone: string | null; specialty: string; specialtySlug: string } | null;
  project: { id: number; nameKa: string | null; totalM2: string; isDesign: boolean } | null;
  checkout: { id: number; platformFee: string; feePerM2: string; kind: CheckoutKind } | null;
}

export async function loadOrderView(orderId: number): Promise<OrderView | null> {
  const rows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  const order = rows[0];
  if (!order) return null;
  const [items, storeRows, workerRows, projectRows, checkoutRows] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(asc(orderItems.sortOrder), asc(orderItems.id)),
    order.storeId
      ? db.select({ id: stores.id, nameKa: stores.nameKa, nameEn: stores.nameEn, nameRu: stores.nameRu, email: stores.email, phone: stores.phone, logoUrl: stores.logoUrl }).from(stores).where(eq(stores.id, order.storeId)).limit(1)
      : Promise.resolve([]),
    order.workerId
      ? db.select({ id: workers.id, nameKa: workers.nameKa, nameEn: workers.nameEn, nameRu: workers.nameRu, email: workers.email, phone: workers.phone, specialty: workers.specialty, specialtySlug: workers.specialtySlug }).from(workers).where(eq(workers.id, order.workerId)).limit(1)
      : Promise.resolve([]),
    order.projectId
      ? db.select({ id: projects.id, nameKa: projects.nameKa, totalM2: projects.totalM2, isDesign: sql<number>`${projects.plan} IS NOT NULL` }).from(projects).where(eq(projects.id, order.projectId)).limit(1)
      : Promise.resolve([]),
    order.checkoutId
      ? db.select({ id: checkouts.id, platformFee: checkouts.platformFee, feePerM2: checkouts.feePerM2, kind: checkouts.kind }).from(checkouts).where(eq(checkouts.id, order.checkoutId)).limit(1)
      : Promise.resolve([]),
  ]);
  const project = projectRows[0] ? { ...projectRows[0], isDesign: Boolean(Number(projectRows[0].isDesign)) } : null;
  return { order, items, store: storeRows[0] ?? null, worker: workerRows[0] ?? null, project, checkout: checkoutRows[0] ?? null };
}

/** First open: clears the unread badge. Idempotent. */
export async function markOrderViewed(orderId: number): Promise<void> {
  await db.update(orders).set({ viewedAt: new Date() }).where(and(eq(orders.id, orderId), isNull(orders.viewedAt)));
}

export interface OrderEdit {
  status?: OrderStatus;
  partnerMessage?: string | null;
  items?: Array<{ id: number; qty?: number; unitPrice?: number; removed?: boolean; note?: string | null }>;
  addItems?: Array<{ nameKa: string; qty: number; unitPrice: number; unit?: string; note?: string | null }>;
}

/**
 * A partner's (or admin's) changes: struck-out lines, corrected quantities and prices,
 * new lines, a message, a status. The subtotal and the commission are recomputed from what
 * is left; the percentage stays what it was when the order was placed.
 */
export async function applyOrderEdit(orderId: number, edit: OrderEdit, notifyCustomer = true): Promise<OrderView | null> {
  const before = await loadOrderView(orderId);
  if (!before) return null;

  await db.transaction(async (tx) => {
    for (const change of edit.items ?? []) {
      const current = before.items.find((i) => i.id === change.id);
      if (!current) continue;
      const qty = change.qty ?? Number(current.qty);
      const unitPrice = change.unitPrice ?? Number(current.unitPrice);
      await tx
        .update(orderItems)
        .set({
          qty: String(qty),
          unitPrice: String(unitPrice),
          total: String(round2(qty * unitPrice)),
          removed: change.removed ?? current.removed,
          note: change.note === undefined ? current.note : change.note,
        })
        .where(and(eq(orderItems.id, change.id), eq(orderItems.orderId, orderId)));
    }
    if (edit.addItems?.length) {
      const start = before.items.length;
      await tx.insert(orderItems).values(
        edit.addItems.map((a, i) => ({
          orderId,
          productId: null,
          nameKa: a.nameKa,
          nameEn: null,
          nameRu: null,
          categorySlug: null,
          roomName: null,
          unit: a.unit ?? 'piece',
          qty: String(a.qty),
          unitPrice: String(a.unitPrice),
          total: String(round2(a.qty * a.unitPrice)),
          note: a.note ?? null,
          sortOrder: start + i,
        }))
      );
    }
    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    const totals = orderTotals(items, Number(before.order.commissionPct));
    await tx
      .update(orders)
      .set({
        subtotal: String(totals.subtotal),
        commissionAmount: String(totals.commissionAmount),
        status: edit.status ?? before.order.status,
        partnerMessage: edit.partnerMessage === undefined ? before.order.partnerMessage : edit.partnerMessage,
      })
      .where(eq(orders.id, orderId));
  });

  const after = await loadOrderView(orderId);
  if (after && notifyCustomer) {
    const statusChanged = edit.status && edit.status !== before.order.status;
    const messageChanged = edit.partnerMessage !== undefined && edit.partnerMessage !== before.order.partnerMessage;
    if (statusChanged || messageChanged) {
      await notifyCustomerOrderUpdate({
        email: after.order.customerEmail,
        customerName: after.order.customerName,
        orderId,
        partnerName: after.store?.nameKa ?? after.worker?.nameKa ?? 'პარტნიორი',
        status: after.order.status,
        partnerMessage: after.order.partnerMessage,
      });
    }
  }
  return after;
}

/** Which partner a session belongs to. */
export interface PartnerRef {
  storeId: number | null;
  workerId: number | null;
}

export function partnerCondition(ref: PartnerRef) {
  if (ref.storeId) return eq(orders.storeId, ref.storeId);
  if (ref.workerId) return eq(orders.workerId, ref.workerId);
  return sql`1 = 0`;
}

export function partnerOwnsOrder(ref: PartnerRef, order: Pick<Order, 'storeId' | 'workerId'>): boolean {
  if (ref.storeId && order.storeId === ref.storeId) return true;
  if (ref.workerId && order.workerId === ref.workerId) return true;
  return false;
}

export interface PartnerOrderRow {
  id: number;
  status: OrderStatus;
  subtotal: string;
  deliveryFee: string;
  commissionAmount: string;
  customerName: string;
  customerPhone: string;
  createdAt: Date;
  updatedAt: Date;
  viewedAt: Date | null;
  partnerMessage: string | null;
  itemCount: number;
  projectName: string | null;
}

export async function partnerOrders(ref: PartnerRef, opts: { status?: OrderStatus; limit?: number } = {}): Promise<PartnerOrderRow[]> {
  const where = [partnerCondition(ref)];
  if (opts.status) where.push(eq(orders.status, opts.status));
  const rows = await db
    .select({
      id: orders.id,
      status: orders.status,
      subtotal: orders.subtotal,
      deliveryFee: orders.deliveryFee,
      commissionAmount: orders.commissionAmount,
      customerName: orders.customerName,
      customerPhone: orders.customerPhone,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
      viewedAt: orders.viewedAt,
      partnerMessage: orders.partnerMessage,
      itemCount: sql<number>`(SELECT COUNT(*) FROM ${orderItems} WHERE ${orderItems.orderId} = ${orders.id} AND ${orderItems.removed} = 0)`,
      projectName: projects.nameKa,
    })
    .from(orders)
    .leftJoin(projects, eq(orders.projectId, projects.id))
    .where(and(...where))
    .orderBy(desc(orders.createdAt))
    .limit(opts.limit ?? 200);
  return rows.map((r) => ({ ...r, itemCount: Number(r.itemCount) }));
}

export interface PartnerStats {
  unread: number;
  open: number;
  done: number;
  cancelled: number;
  monthGoods: number;
  monthCommission: number;
  monthOrders: number;
  allTimeGoods: number;
  allTimeCommission: number;
}

/** The numbers at the top of a partner's dashboard. */
export async function partnerStats(ref: PartnerRef, now = new Date()): Promise<PartnerStats> {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [row] = await db
    .select({
      unread: sql<number>`SUM(${orders.viewedAt} IS NULL AND ${orders.status} <> 'cancelled')`,
      open: sql<number>`SUM(${orders.status} IN ('new','confirmed','in_progress'))`,
      done: sql<number>`SUM(${orders.status} = 'done')`,
      cancelled: sql<number>`SUM(${orders.status} = 'cancelled')`,
      monthGoods: sql<number>`COALESCE(SUM(CASE WHEN ${orders.status} <> 'cancelled' AND ${orders.createdAt} >= ${monthStart} THEN ${orders.subtotal} ELSE 0 END), 0)`,
      monthCommission: sql<number>`COALESCE(SUM(CASE WHEN ${orders.status} <> 'cancelled' AND ${orders.createdAt} >= ${monthStart} THEN ${orders.commissionAmount} ELSE 0 END), 0)`,
      monthOrders: sql<number>`SUM(${orders.status} <> 'cancelled' AND ${orders.createdAt} >= ${monthStart})`,
      allTimeGoods: sql<number>`COALESCE(SUM(CASE WHEN ${orders.status} <> 'cancelled' THEN ${orders.subtotal} ELSE 0 END), 0)`,
      allTimeCommission: sql<number>`COALESCE(SUM(CASE WHEN ${orders.status} <> 'cancelled' THEN ${orders.commissionAmount} ELSE 0 END), 0)`,
    })
    .from(orders)
    .where(partnerCondition(ref));
  return {
    unread: Number(row?.unread ?? 0),
    open: Number(row?.open ?? 0),
    done: Number(row?.done ?? 0),
    cancelled: Number(row?.cancelled ?? 0),
    monthGoods: Number(row?.monthGoods ?? 0),
    monthCommission: Number(row?.monthCommission ?? 0),
    monthOrders: Number(row?.monthOrders ?? 0),
    allTimeGoods: Number(row?.allTimeGoods ?? 0),
    allTimeCommission: Number(row?.allTimeCommission ?? 0),
  };
}

/** Every order placed against one project, for the customer's project page. */
export async function ordersForProject(projectId: number) {
  const rows = await db
    .select({
      id: orders.id,
      partnerType: orders.partnerType,
      status: orders.status,
      subtotal: orders.subtotal,
      deliveryFee: orders.deliveryFee,
      partnerMessage: orders.partnerMessage,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
      storeNameKa: stores.nameKa,
      storeNameEn: stores.nameEn,
      storeNameRu: stores.nameRu,
      storePhone: stores.phone,
      workerNameKa: workers.nameKa,
      workerNameEn: workers.nameEn,
      workerNameRu: workers.nameRu,
      workerPhone: workers.phone,
      itemCount: sql<number>`(SELECT COUNT(*) FROM ${orderItems} WHERE ${orderItems.orderId} = ${orders.id} AND ${orderItems.removed} = 0)`,
    })
    .from(orders)
    .leftJoin(stores, eq(orders.storeId, stores.id))
    .leftJoin(workers, eq(orders.workerId, workers.id))
    .where(eq(orders.projectId, projectId))
    .orderBy(desc(orders.createdAt));
  return rows.map((r) => ({ ...r, itemCount: Number(r.itemCount) }));
}

export async function checkoutForProject(projectId: number) {
  const rows = await db.select().from(checkouts).where(eq(checkouts.projectId, projectId)).orderBy(desc(checkouts.createdAt)).limit(1);
  return rows[0] ?? null;
}
