import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  checkouts,
  orderEvents,
  orderItems,
  orders,
  products,
  projects,
  stores,
  teams,
  workers,
  type Order,
  type OrderEvent,
  type OrderItem,
  type Project,
  type Worker,
  type Team,
} from '@/lib/db/schema';
import type { SelectedProduct } from '@/lib/calculator/types';
import type { DesignScene, FloorPlan } from '@/lib/design/types';
import { orderedLines, priceScene } from '@/lib/design/pricing';
import { loadRateBook } from '@/lib/api/rateBook';
import { ka } from '@/lib/i18n/ka';
import { en } from '@/lib/i18n/en';
import { ru } from '@/lib/i18n/ru';
import { log } from '@/lib/log';
import {
  buildStoreOrders,
  calculationLinesByStore,
  costLinesByStore,
  effectiveCommissionPct,
  joinLines,
  MATERIAL_SLUG_PREFIX,
  materialLinesByStore,
  mergeLines,
  type OrderedMaterials,
  type OrderedQuantities,
  orderTotals,
  round2,
  type CheckoutKind,
  type LinesByStore,
  type OrderLineDraft,
  type OrderStatus,
} from './money';
import { awaitsConfirmation, summariseEdit } from './orderFlow';
import { notifyCustomerCheckout, notifyCustomerOrderUpdate, notifyPartnerNewOrder } from './notify';
import { addressOf, type CustomerContact } from '@/lib/account/contact';
import { loadPlatformSettings } from './settings';
import { calculationInput, projectKind } from '@/lib/projects/saved';
import { calculatorSheet, sheetLabour } from '@/lib/summary/calculatorSheet';
import { planProductIds } from '@/lib/api/productPrices';
import type { BudgetLine } from '@/lib/design/pricing';

/**
 * Writing and reading orders.
 *
 * A checkout turns a saved project into one `order` per partner store — the construction
 * materials to the store that supplies them — delivered to the customer's address (the
 * platform's fee is paid before, at each half's hinge: `./payments`); a booking is a brigade's
 * or a worker's order for a project's labour. Both are built by the pure functions in
 * `./money` and written here in one transaction. A booking is sent to its partner at once; a
 * store's order waits with the platform (`sentAt` NULL) until the orders agent has checked it
 * with the customer and confirmed it (`confirmOrder`), which is when the store is told.
 * Every edit goes through `applyOrderEdit`, which recomputes the totals from the items every
 * time — the stored subtotal is never trusted to be up to date on its own — and every step
 * leaves an `order_events` row (`./orderFlow` holds the rules).
 */

/** Who did something to an order, as its events remember them. */
export interface OrderActor {
  userId: number | null;
  role: string;
  name: string | null;
}

/** The signed-in person as an order's events remember them. */
export function actorOf(user: { id?: string | null; role: string; name?: string | null }): OrderActor {
  const id = Number(user.id);
  return { userId: Number.isInteger(id) && id > 0 ? id : null, role: user.role, name: user.name ?? null };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** One line of an order's history. Written inside the caller's transaction when it has one. */
export async function recordOrderEvent(
  runner: Tx | typeof db,
  orderId: number,
  actor: OrderActor,
  kind: OrderEvent['kind'],
  body: string | null = null,
  meta: Record<string, unknown> | null = null
): Promise<void> {
  await runner.insert(orderEvents).values({ orderId, userId: actor.userId, actorRole: actor.role.slice(0, 20), actorName: actor.name?.slice(0, 255) ?? null, kind, body, meta });
}

export function checkoutKindOf(project: Pick<Project, 'plan'>): CheckoutKind {
  return project.plan ? 'design' : 'calculator';
}

export interface CheckoutResult {
  /** The checkout the orders hang off. */
  checkoutId: number;
  totalM2: number;
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
  /** Lines an earlier checkout of this project already sent to a store, left out this time. */
  alreadyOrdered: number;
}

/** Thrown when a checkout would send nothing — everything is already ordered. */
export class NothingToOrder extends Error {
  constructor() {
    super('nothing to order');
    this.name = 'NothingToOrder';
  }
}

/** What earlier checkouts of a project already did, so the next one sends only what is new. */
export interface ProjectOrderState {
  /** The halves earlier checkouts were placed under; empty before the first order. */
  orderedKinds: CheckoutKind[];
  /** Units per product already sent to a store, on orders that were not cancelled. */
  orderedQty: OrderedQuantities;
  /** Units of each rate-book material already ordered, by the line's `material:<key>` slug. */
  orderedMaterials: OrderedMaterials;
}

export async function projectOrderState(projectId: number): Promise<ProjectOrderState> {
  const [kindRows, productRows] = await Promise.all([
    db.select({ kind: checkouts.kind }).from(checkouts).where(eq(checkouts.projectId, projectId)),
    db
      .select({ productId: orderItems.productId, categorySlug: orderItems.categorySlug, qty: orderItems.qty })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(and(eq(orders.projectId, projectId), ne(orders.status, 'cancelled'), eq(orderItems.removed, false))),
  ]);
  const orderedQty: OrderedQuantities = {};
  const orderedMaterials: OrderedMaterials = {};
  for (const row of productRows) {
    if (row.productId != null) orderedQty[row.productId] = round2((orderedQty[row.productId] ?? 0) + Number(row.qty));
    else if (row.categorySlug?.startsWith(MATERIAL_SLUG_PREFIX)) orderedMaterials[row.categorySlug] = round2((orderedMaterials[row.categorySlug] ?? 0) + Number(row.qty));
  }
  return { orderedKinds: [...new Set(kindRows.map((r) => r.kind))], orderedQty, orderedMaterials };
}

async function storeLookup(productIds: number[]): Promise<(id: number) => number | null> {
  const unique = [...new Set(productIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (unique.length === 0) return () => null;
  const rows = await db.select({ id: products.id, storeId: products.storeId }).from(products).where(inArray(products.id, unique));
  const map = new Map(rows.map((r) => [r.id, r.storeId ?? null]));
  return (id) => map.get(id) ?? null;
}

/**
 * The calculation's products by store, or null when the project has no calculator half: the
 * product lines of its priced sheet (`calculationLinesByStore`) — its picks, and the doors,
 * windows, fittings and radiators on its board — priced against its own home state.
 */
async function calculatorLinesOf(project: Project): Promise<LinesByStore | null> {
  if (project.selectedProducts == null) return null;
  const input = calculationInput(project, { book: await loadRateBook() });
  if (!input) return null;
  const selectedProducts = project.selectedProducts as Record<string, SelectedProduct>;
  const selectedFurniture = (project.selectedFurniture ?? {}) as Record<string, SelectedProduct[]>;
  const ids = [...Object.values(selectedProducts).map((p) => p.productId), ...Object.values(selectedFurniture).flat().map((p) => p.productId), ...planProductIds(input.board, input.electrical ?? [])];
  return calculationLinesByStore(input, await storeLookup(ids));
}

/**
 * The studio's products by store, or null when the project has no design half. Priced once,
 * against the project's own home state — the budget the customer ordered from — and the
 * order is that budget's product lines: doors, windows, fittings and radiators with the
 * furniture and the finishes, less whatever was ticked off. The store lookup covers every
 * product on those lines; it used to be gathered from the items and the finishes alone.
 */
async function sceneLinesOf(project: Project): Promise<LinesByStore | null> {
  if (!project.plan || !project.scene) return null;
  const cost = priceScene(project.plan as FloorPlan, project.scene as DesignScene, { homeState: project.homeState ?? undefined });
  return costLinesByStore(cost, await storeLookup(orderedLines(cost).map((line) => line.product.productId)));
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
    // What was ordered, kept beside what the platform later makes of it.
    originalQty: String(l.qty),
    originalUnitPrice: String(l.unitPrice),
  }));
}

/** The customer's contact and delivery address as an order row holds them. */
function customerColumns(customer: CustomerContact) {
  return {
    customerName: customer.name,
    customerPhone: customer.phone,
    customerEmail: customer.email,
    customerNote: customer.note,
    deliveryCity: customer.address?.city ?? null,
    deliveryAddress: customer.address?.line ?? null,
    deliveryPostalCode: customer.address?.postalCode ?? null,
  };
}

/** An order row's customer, as the mails take it. */
export function orderCustomer(order: Pick<Order, 'customerName' | 'customerPhone' | 'customerEmail' | 'customerNote' | 'deliveryCity' | 'deliveryAddress' | 'deliveryPostalCode'>): CustomerContact {
  return {
    name: order.customerName,
    phone: order.customerPhone,
    email: order.customerEmail,
    note: order.customerNote,
    address: addressOf({ city: order.deliveryCity, line: order.deliveryAddress, postalCode: order.deliveryPostalCode }),
  };
}

/**
 * Places the order for a project — whatever of it has not been ordered yet.
 *
 * A project is one row whichever way it was made, and it can be ordered in two sittings:
 * the calculation first, the 3D design later, or everything at once. The lines of both halves
 * are merged product by product, and products an earlier checkout already sent to a store are
 * left out rather than ordered twice. No fee is charged here: each half's was paid before its
 * hinge (`./payments`). Returns what the customer is shown: one line per store that will now
 * be contacting them.
 */
export async function createCheckoutForProject(project: Project, customer: CustomerContact, userId: number | null): Promise<CheckoutResult> {
  const settings = await loadPlatformSettings();
  const kind = projectKind(project);
  const state = await projectOrderState(project.id);

  // A half left before it was calculated or generated is neither charged for nor ordered: its
  // figures are not an estimate the customer has seen (`projectKind`).
  const calculatorReady = kind.hasCalculator && !kind.calculatorPending;
  const designReady = kind.hasDesign && !kind.designPending;
  const [calculatorLines, designLines, materialDrafts] = await Promise.all([
    calculatorReady ? calculatorLinesOf(project) : null,
    designReady ? sceneLinesOf(project) : null,
    calculatorReady || designReady ? projectMaterials(project) : [],
  ]);
  const productLines = mergeLines(designLines, calculatorLines, state.orderedQty);
  // The construction materials go to the store that supplies them — an order of their own, or
  // on that store's order when it also sells some of the products.
  const materialLines = materialLinesByStore(materialDrafts, settings.materialsStoreId, state.orderedMaterials);
  const lines = { ...joinLines(productLines, materialLines), skipped: productLines.skipped + materialLines.skipped };

  const totalM2 = Number(project.totalM2) || 0;
  if (lines.groups.size === 0) throw new NothingToOrder();

  const storeIds = [...lines.groups.keys()];
  const storeRows = storeIds.length ? await db.select().from(stores).where(inArray(stores.id, storeIds)) : [];
  const storesById = new Map(storeRows.map((s) => [s.id, s]));
  const drafts = buildStoreOrders(lines.groups, storesById, settings.storeCommissionPct);

  const goodsTotal = round2(drafts.reduce((s, d) => s + d.subtotal + d.deliveryFee, 0));
  const commissionTotal = round2(drafts.reduce((s, d) => s + d.commissionAmount, 0));
  // The checkout is filed under the half the project is furthest along in; it charges no fee.
  const checkoutKind: CheckoutKind = designReady ? 'design' : 'calculator';

  const written = await db.transaction(async (tx) => {
    const [inserted] = await tx.insert(checkouts).values({
      projectId: project.id,
      userId,
      kind: checkoutKind,
      totalM2: String(totalM2),
      feePerM2: '0',
      platformFee: '0',
      goodsTotal: String(goodsTotal),
      commissionTotal: String(commissionTotal),
      customerName: customer.name,
      customerPhone: customer.phone,
      customerEmail: customer.email,
      note: customer.note,
      deliveryCity: customer.address?.city ?? null,
      deliveryAddress: customer.address?.line ?? null,
      deliveryPostalCode: customer.address?.postalCode ?? null,
    });
    const checkoutId = inserted.insertId;
    const created: Array<{ id: number; draft: (typeof drafts)[number] }> = [];
    for (const draft of drafts) {
      // No `sentAt`: a store's order waits with the platform until the orders agent has
      // checked it with the customer and confirmed it (`confirmOrder`).
      const [orderInsert] = await tx.insert(orders).values({
        checkoutId,
        projectId: project.id,
        userId,
        partnerType: 'store',
        storeId: draft.storeId,
        status: 'new',
        sentAt: null,
        subtotal: String(draft.subtotal),
        deliveryFee: String(draft.deliveryFee),
        originalDeliveryFee: String(draft.deliveryFee),
        commissionPct: String(draft.commissionPct),
        commissionAmount: String(draft.commissionAmount),
        ...customerColumns(customer),
      });
      const orderId = orderInsert.insertId;
      if (draft.lines.length) await tx.insert(orderItems).values(itemRows(orderId, draft.lines));
      await recordOrderEvent(tx, orderId, { userId, role: 'user', name: customer.name }, 'created', null, { lines: draft.lines.length, subtotal: draft.subtotal, deliveryFee: draft.deliveryFee });
      created.push({ id: orderId, draft });
    }
    await tx.update(projects).set({ status: 'submitted' }).where(eq(projects.id, project.id));
    return { checkoutId, created };
  });

  log.info('checkout placed', { checkoutId: written.checkoutId, projectId: project.id, kind: checkoutKind, orders: written.created.length, commissionTotal, alreadyOrdered: lines.skipped });

  const result: CheckoutResult = {
    checkoutId: written.checkoutId,
    totalM2,
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
    alreadyOrdered: lines.skipped,
  };

  // Mail is best-effort and outside the transaction: the rows are the record. The stores are
  // not told yet — each is, with the lines the customer kept, when its order is confirmed.
  if (result.orders.length > 0) {
    await notifyCustomerCheckout({
      customer,
      checkoutId: written.checkoutId,
      orders: result.orders.map((o) => ({ id: o.id, partnerName: o.storeNameKa, subtotal: o.subtotal, deliveryFee: o.deliveryFee })),
    });
  }
  return result;
}

const workTypeNames = (key: string) => ({
  en: (en.workTypes as Record<string, string>)[key] ?? null,
  ru: (ru.workTypes as Record<string, string>)[key] ?? null,
});

/**
 * The sheet a project's work and materials are read off, as the customer left it on their
 * summary: its lines less the ones ticked off, at the quantities they set.
 *
 * A project with a design is read off the design's budget, because that is the fuller
 * account — the calculator's phases, but also an electrician's point for every socket that
 * was actually placed, the radiators hung, the skirting board fitted, and only the works
 * ticked on the technical step. A calculation on its own is the calculator's sheet. Either
 * way it is the same list the customer was looking at when they ordered; it used to be the
 * calculator's estimate worked out afresh, whatever had been edited.
 */
async function projectSheet(project: Project): Promise<{ lines: BudgetLine[]; contingency: number }> {
  const book = await loadRateBook();
  const kind = projectKind(project);
  // Only work that was worked out: a design never generated, a calculation never started, has
  // no lines anybody has seen (`projectKind`). The design's budget when it was generated, else
  // the calculator's sheet when it was calculated, else nothing.
  const designReady = project.plan != null && project.scene != null && !kind.designPending;
  // A calculation needs its home state; a project still on its first step has none.
  const calculatorReady = !kind.calculatorPending && project.homeState != null && (project.selectedProducts != null || project.plan == null);
  if (designReady) {
    const cost = priceScene(project.plan as FloorPlan, project.scene as DesignScene, { homeState: project.homeState ?? undefined, book });
    return { lines: cost.lines, contingency: cost.contingencyTotal };
  }
  if (!calculatorReady) return { lines: [], contingency: 0 };
  const input = calculationInput(project, { book });
  if (!input) return { lines: [], contingency: 0 };
  const sheet = calculatorSheet(input);
  return { lines: sheet.lines, contingency: sheet.contingency };
}

async function projectSheetLines(project: Project): Promise<BudgetLine[]> {
  return (await projectSheet(project)).lines;
}

/** The work a project asks for: the labour lines of its sheet — what a brigade or a worker is sent. */
async function projectLabour(project: Project): Promise<OrderLineDraft[]> {
  return sheetLabour(await projectSheetLines(project)).map((line) => {
    const names = workTypeNames(line.key);
    return {
      productId: null,
      nameKa: (ka.workTypes as Record<string, string>)[line.key] ?? line.name ?? line.key,
      nameEn: names.en,
      nameRu: names.ru,
      categorySlug: `labour:${line.key}`,
      roomName: null,
      unit: line.unit,
      qty: round2(line.qty),
      unitPrice: round2(line.unitPrice),
      total: round2(line.total),
    };
  });
}

/**
 * The construction materials a project asks for: the rate book's `material` lines of its sheet
 * (blocks, plaster, putty, pipes, cable…) still ticked — what the materials store is sent. The
 * Georgian name is the one on the sheet (the rate book's own label); English and Russian come
 * from the dictionaries.
 */
export async function projectMaterials(project: Project): Promise<OrderLineDraft[]> {
  return materialDrafts(await projectSheetLines(project));
}

function materialDrafts(lines: BudgetLine[]): OrderLineDraft[] {
  return lines
    .filter((line) => line.section === 'materials' && !line.excluded && line.qty > 0 && line.total > 0)
    .map((line) => ({
      productId: null,
      nameKa: line.name ?? (ka.materials as Record<string, string>)[line.key] ?? line.key,
      nameEn: (en.materials as Record<string, string>)[line.key] ?? null,
      nameRu: (ru.materials as Record<string, string>)[line.key] ?? null,
      categorySlug: `${MATERIAL_SLUG_PREFIX}${line.key}`,
      roomName: null,
      unit: line.unit,
      qty: round2(line.qty),
      unitPrice: round2(line.unitPrice),
      total: round2(line.total),
    }));
}

/**
 * What a checkout would send the materials store now — the checkout dialogue's preview, read
 * off the saved project the same way the checkout will read it.
 */
export interface MaterialsPreview {
  /** The supplier; null when none is set, and the lines would go nowhere. */
  storeId: number | null;
  storeNameKa: string | null;
  lines: OrderLineDraft[];
  total: number;
}

/**
 * The checkout dialogue's figures the server works out: the construction materials the
 * supplier would be sent, and the summary's reserve (`contingencyTotal` — 15 % of the
 * renovation's materials and labour, from the same sheet the materials are read off). The
 * reserve is shown and counted in the dialogue's total; it is on nobody's order.
 */
export interface CheckoutPreview {
  materials: MaterialsPreview | null;
  reserve: number;
}

export async function checkoutPreview(project: Project, state: ProjectOrderState): Promise<CheckoutPreview> {
  const settings = await loadPlatformSettings();
  const sheet = await projectSheet(project);
  const drafts = materialDrafts(sheet.lines);
  const grouped = materialLinesByStore(drafts, settings.materialsStoreId, state.orderedMaterials);
  const lines = settings.materialsStoreId != null ? grouped.groups.get(settings.materialsStoreId) ?? [] : grouped.unassigned;
  let materials: MaterialsPreview | null = null;
  if (lines.length > 0) {
    const [store] = settings.materialsStoreId != null ? await db.select({ nameKa: stores.nameKa }).from(stores).where(eq(stores.id, settings.materialsStoreId)).limit(1) : [];
    materials = { storeId: settings.materialsStoreId, storeNameKa: store?.nameKa ?? null, lines, total: round2(lines.reduce((sum, l) => sum + l.total, 0)) };
  }
  return { materials, reserve: round2(sheet.contingency) };
}

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
    lines = await projectLabour(project);
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
      // The customer chose this partner on the last step: the booking is theirs at once.
      sentAt: new Date(),
      subtotal: String(totals.subtotal),
      deliveryFee: '0.00',
      originalDeliveryFee: '0.00',
      commissionPct: String(commissionPct),
      commissionAmount: String(totals.commissionAmount),
      ...customerColumns(customer),
    });
    const id = orderInsert.insertId;
    if (lines.length) await tx.insert(orderItems).values(itemRows(id, lines));
    await recordOrderEvent(tx, id, { userId, role: 'user', name: customer.name }, 'created', null, { lines: lines.length, subtotal: totals.subtotal });
    return id;
  });

  log.info('worker booked', { orderId, workerId: worker.id, projectId: project?.id ?? null, subtotal: totals.subtotal });
  await notifyPartnerNewOrder({ email: worker.email, partnerName: worker.nameKa, orderId, customer, lines, subtotal: totals.subtotal, deliveryFee: 0, kind: 'worker' });
  return { orderId, ...totals, commissionPct, itemCount: lines.length };
}

/**
 * Books a brigade for the whole job.
 *
 * A worker booking carries one trade's lines; a team's carries all of them, because the
 * team is hired to do the lot and its foreman is the one who answers for the dates. The
 * team's own markup, if it has one, is a line of its own rather than a quiet adjustment of
 * everybody's rates — the customer can see what the brigade charges for running the job.
 */
export async function createTeamBooking(args: { team: Team; project: Project | null; customer: CustomerContact; userId: number | null }): Promise<BookingResult> {
  const { team, project, customer, userId } = args;
  const settings = await loadPlatformSettings();
  const commissionPct = effectiveCommissionPct(team.commissionRate, settings.workerCommissionPct);

  let lines: OrderLineDraft[] = [];
  if (project) {
    lines = await projectLabour(project);
    const markup = Number(team.markupPct ?? 0);
    if (markup > 0 && lines.length > 0) {
      const base = lines.reduce((s, l) => s + l.total, 0);
      const fee = round2((base * markup) / 100);
      if (fee > 0) lines.push({ productId: null, nameKa: 'ბრიგადის მართვა', nameEn: 'Site management', nameRu: 'Управление работами', categorySlug: 'labour:team_markup', roomName: null, unit: 'unit', qty: 1, unitPrice: fee, total: fee });
    }
  }
  const totals = orderTotals(lines, commissionPct);

  const orderId = await db.transaction(async (tx) => {
    const [orderInsert] = await tx.insert(orders).values({
      checkoutId: null,
      projectId: project?.id ?? null,
      userId,
      partnerType: 'team',
      teamId: team.id,
      status: 'new',
      // The customer chose this partner on the last step: the booking is theirs at once.
      sentAt: new Date(),
      subtotal: String(totals.subtotal),
      deliveryFee: '0.00',
      originalDeliveryFee: '0.00',
      commissionPct: String(commissionPct),
      commissionAmount: String(totals.commissionAmount),
      ...customerColumns(customer),
    });
    const id = orderInsert.insertId;
    if (lines.length) await tx.insert(orderItems).values(itemRows(id, lines));
    await recordOrderEvent(tx, id, { userId, role: 'user', name: customer.name }, 'created', null, { lines: lines.length, subtotal: totals.subtotal });
    return id;
  });

  log.info('team booked', { orderId, teamId: team.id, projectId: project?.id ?? null, subtotal: totals.subtotal });
  await notifyPartnerNewOrder({ email: team.email, partnerName: team.nameKa, orderId, customer, lines, subtotal: totals.subtotal, deliveryFee: 0, kind: 'worker' });
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
  team: { id: number; nameKa: string; nameEn: string | null; nameRu: string | null; email: string | null; phone: string | null; logoUrl: string | null; leadName: string | null } | null;
  project: { id: number; nameKa: string | null; totalM2: string; isDesign: boolean } | null;
  checkout: { id: number; platformFee: string; feePerM2: string; kind: CheckoutKind } | null;
}

export async function loadOrderView(orderId: number): Promise<OrderView | null> {
  const rows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  const order = rows[0];
  if (!order) return null;
  const [items, storeRows, workerRows, teamRows, projectRows, checkoutRows] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(asc(orderItems.sortOrder), asc(orderItems.id)),
    order.storeId
      ? db.select({ id: stores.id, nameKa: stores.nameKa, nameEn: stores.nameEn, nameRu: stores.nameRu, email: stores.email, phone: stores.phone, logoUrl: stores.logoUrl }).from(stores).where(eq(stores.id, order.storeId)).limit(1)
      : Promise.resolve([]),
    order.workerId
      ? db.select({ id: workers.id, nameKa: workers.nameKa, nameEn: workers.nameEn, nameRu: workers.nameRu, email: workers.email, phone: workers.phone, specialty: workers.specialty, specialtySlug: workers.specialtySlug }).from(workers).where(eq(workers.id, order.workerId)).limit(1)
      : Promise.resolve([]),
    order.teamId
      ? db.select({ id: teams.id, nameKa: teams.nameKa, nameEn: teams.nameEn, nameRu: teams.nameRu, email: teams.email, phone: teams.phone, logoUrl: teams.logoUrl, leadName: teams.leadName }).from(teams).where(eq(teams.id, order.teamId)).limit(1)
      : Promise.resolve([]),
    order.projectId
      ? db.select({ id: projects.id, nameKa: projects.nameKa, totalM2: projects.totalM2, isDesign: sql<number>`${projects.plan} IS NOT NULL` }).from(projects).where(eq(projects.id, order.projectId)).limit(1)
      : Promise.resolve([]),
    order.checkoutId
      ? db.select({ id: checkouts.id, platformFee: checkouts.platformFee, feePerM2: checkouts.feePerM2, kind: checkouts.kind }).from(checkouts).where(eq(checkouts.id, order.checkoutId)).limit(1)
      : Promise.resolve([]),
  ]);
  const project = projectRows[0] ? { ...projectRows[0], isDesign: Boolean(Number(projectRows[0].isDesign)) } : null;
  return { order, items, store: storeRows[0] ?? null, worker: workerRows[0] ?? null, team: teamRows[0] ?? null, project, checkout: checkoutRows[0] ?? null };
}

/** The partner's name as the mails and the pages print it. */
export function partnerNameOf(view: Pick<OrderView, 'store' | 'worker' | 'team'>): string {
  return view.store?.nameKa ?? view.team?.nameKa ?? view.worker?.nameKa ?? 'პარტნიორი';
}

/** First open: clears the unread badge. Idempotent. */
export async function markOrderViewed(orderId: number): Promise<void> {
  await db.update(orders).set({ viewedAt: new Date() }).where(and(eq(orders.id, orderId), isNull(orders.viewedAt)));
}

export interface OrderEdit {
  status?: OrderStatus;
  partnerMessage?: string | null;
  /** The agent's own note; never shown to the customer or the partner. */
  staffNote?: string | null;
  /** The platform's to change: what the store charges to bring the order. */
  deliveryFee?: number;
  items?: Array<{ id: number; qty?: number; unitPrice?: number; removed?: boolean; note?: string | null }>;
  addItems?: Array<{ nameKa: string; qty: number; unitPrice: number; unit?: string; note?: string | null }>;
}

/**
 * A change to an order: lines kept or struck out (they stay on the order, visible to the
 * customer), quantities and prices corrected, new lines, the delivery, a message, a status —
 * the platform's people may make any of these, a partner only the last two (the route decides).
 * The subtotal and the commission are recomputed from what is left; the percentage stays what
 * it was when the order was placed. Each kind of change leaves its own event, and a status or a
 * message tells the customer by mail.
 */
export async function applyOrderEdit(orderId: number, edit: OrderEdit, actor: OrderActor, notifyCustomer = true): Promise<OrderView | null> {
  const before = await loadOrderView(orderId);
  if (!before) return null;
  const summary = summariseEdit(
    { items: before.items.map((i) => ({ id: i.id, qty: Number(i.qty), unitPrice: Number(i.unitPrice), removed: i.removed })), deliveryFee: Number(before.order.deliveryFee) },
    edit
  );
  const statusChanged = edit.status !== undefined && edit.status !== before.order.status;
  const messageChanged = edit.partnerMessage !== undefined && (edit.partnerMessage ?? null) !== before.order.partnerMessage;

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
          // Added after the order was placed: no original, which is how the customer's view
          // knows to call it an addition.
          originalQty: null,
          originalUnitPrice: null,
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
        deliveryFee: edit.deliveryFee !== undefined ? String(round2(Math.max(0, edit.deliveryFee))) : undefined,
        status: edit.status ?? before.order.status,
        partnerMessage: edit.partnerMessage === undefined ? before.order.partnerMessage : edit.partnerMessage,
        staffNote: edit.staffNote === undefined ? before.order.staffNote : edit.staffNote,
      })
      .where(eq(orders.id, orderId));
    if (summary) await recordOrderEvent(tx, orderId, actor, 'edited', null, { ...summary });
    if (statusChanged) await recordOrderEvent(tx, orderId, actor, 'status', null, { from: before.order.status, to: edit.status });
    if (messageChanged) await recordOrderEvent(tx, orderId, actor, 'message', edit.partnerMessage ?? null);
  });

  const after = await loadOrderView(orderId);
  if (after && notifyCustomer && (statusChanged || messageChanged)) {
    await notifyCustomerOrderUpdate({
      email: after.order.customerEmail,
      customerName: after.order.customerName,
      orderId,
      partnerName: partnerNameOf(after),
      status: after.order.status,
      partnerMessage: after.order.partnerMessage,
    });
  }
  return after;
}

export type ConfirmResult = { ok: true; view: OrderView } | { ok: false; error: 'NOT_FOUND' | 'ORDER_ALREADY_SENT' | 'ORDER_EMPTY' };

/**
 * The platform confirms a store's order — checked with the customer, lines kept or struck, the
 * delivery agreed — and sends it to the store, which is told now, with the lines still ticked.
 * The customer is told it is confirmed. Two agents pressing at once confirm it once: only an
 * order still unsent is updated.
 */
export async function confirmOrder(orderId: number, actor: OrderActor): Promise<ConfirmResult> {
  const before = await loadOrderView(orderId);
  if (!before) return { ok: false, error: 'NOT_FOUND' };
  if (!awaitsConfirmation(before.order)) return { ok: false, error: 'ORDER_ALREADY_SENT' };
  const kept = before.items.filter((i) => !i.removed && Number(i.qty) > 0);
  if (kept.length === 0) return { ok: false, error: 'ORDER_EMPTY' };

  const now = new Date();
  const sent = await db.transaction(async (tx) => {
    const [result] = await tx
      .update(orders)
      .set({ status: 'confirmed', sentAt: now, confirmedAt: now, confirmedBy: actor.userId, viewedAt: null })
      .where(and(eq(orders.id, orderId), isNull(orders.sentAt)));
    if (!result.affectedRows) return false;
    await recordOrderEvent(tx, orderId, actor, 'confirmed', null, { lines: kept.length, subtotal: Number(before.order.subtotal), deliveryFee: Number(before.order.deliveryFee) });
    return true;
  });
  if (!sent) return { ok: false, error: 'ORDER_ALREADY_SENT' };

  const after = await loadOrderView(orderId);
  if (!after) return { ok: false, error: 'NOT_FOUND' };
  log.info('order confirmed and sent', { orderId, by: actor.userId, storeId: after.order.storeId, lines: kept.length });
  const { order } = after;
  await notifyPartnerNewOrder({
    email: after.store?.email,
    partnerName: partnerNameOf(after),
    orderId,
    customer: orderCustomer(order),
    lines: kept.map((i) => ({ nameKa: i.nameKa, qty: Number(i.qty), unit: i.unit, total: Number(i.total), roomName: i.roomName })),
    subtotal: Number(order.subtotal),
    deliveryFee: Number(order.deliveryFee),
    kind: 'store',
  });
  await notifyCustomerOrderUpdate({ email: order.customerEmail, customerName: order.customerName, orderId, partnerName: partnerNameOf(after), status: order.status, partnerMessage: order.partnerMessage });
  return { ok: true, view: after };
}

/**
 * A comment on an order — between the platform's people and the partner; the customer never
 * sees these. A word from the platform on an order the partner has is news for them: it is
 * flagged unread in their portal again.
 */
export async function addOrderComment(orderId: number, actor: OrderActor, body: string, fromStaff: boolean): Promise<void> {
  await db.transaction(async (tx) => {
    await recordOrderEvent(tx, orderId, actor, 'comment', body);
    if (fromStaff) await tx.update(orders).set({ viewedAt: null }).where(and(eq(orders.id, orderId), isNotNull(orders.sentAt)));
  });
}

/** An order's history, oldest first. */
export async function orderEventsFor(orderId: number): Promise<OrderEvent[]> {
  return db.select().from(orderEvents).where(eq(orderEvents.orderId, orderId)).orderBy(asc(orderEvents.createdAt), asc(orderEvents.id));
}

/** Which partner a session belongs to. */
export interface PartnerRef {
  storeId: number | null;
  workerId: number | null;
  teamId?: number | null;
}

/**
 * A partner's orders: its own, and only those it has been sent — a store's order waiting for
 * the platform's confirmation is not the store's yet.
 */
export function partnerCondition(ref: PartnerRef) {
  const sent = isNotNull(orders.sentAt);
  if (ref.storeId) return and(eq(orders.storeId, ref.storeId), sent)!;
  if (ref.workerId) return and(eq(orders.workerId, ref.workerId), sent)!;
  if (ref.teamId) return and(eq(orders.teamId, ref.teamId), sent)!;
  return sql`1 = 0`;
}

/**
 * The order as the person asking is allowed to see it. The agent's note is the platform's
 * own record of what was checked and what was agreed on the telephone; a partner reading it
 * would be reading about themselves, and the customer was never meant to see it at all.
 */
export function redactForPartner<T extends { order: Order }>(view: T): T {
  return { ...view, order: { ...view.order, staffNote: null } };
}

export function partnerOwnsOrder(ref: PartnerRef, order: Pick<Order, 'storeId' | 'workerId' | 'teamId' | 'sentAt'>): boolean {
  // Still with the platform: not the partner's yet, whoever it will go to.
  if (!order.sentAt) return false;
  if (ref.storeId && order.storeId === ref.storeId) return true;
  if (ref.workerId && order.workerId === ref.workerId) return true;
  if (ref.teamId && order.teamId === ref.teamId) return true;
  return false;
}

export interface PartnerOrderRow {
  id: number;
  partnerType: 'store' | 'worker' | 'team';
  status: OrderStatus;
  sentAt: Date | null;
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
  projectId: number | null;
  projectName: string | null;
}

export async function partnerOrders(ref: PartnerRef, opts: { status?: OrderStatus; unread?: boolean; q?: string; limit?: number } = {}): Promise<PartnerOrderRow[]> {
  const where = [partnerCondition(ref)];
  if (opts.status) where.push(eq(orders.status, opts.status));
  if (opts.unread) where.push(isNull(orders.viewedAt));
  if (opts.q) {
    const needle = `%${opts.q}%`;
    where.push(sql`(${orders.customerName} LIKE ${needle} OR ${orders.customerPhone} LIKE ${needle} OR CAST(${orders.id} AS CHAR) LIKE ${needle})`);
  }
  const rows = await db
    .select({
      id: orders.id,
      partnerType: orders.partnerType,
      status: orders.status,
      sentAt: orders.sentAt,
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
      projectId: orders.projectId,
      projectName: projects.nameKa,
    })
    .from(orders)
    .leftJoin(projects, eq(orders.projectId, projects.id))
    .where(and(...where))
    // Newest to the partner first: a store's order is new to it when the platform sent it.
    .orderBy(desc(orders.sentAt), desc(orders.id))
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
      monthGoods: sql<number>`COALESCE(SUM(CASE WHEN ${orders.status} <> 'cancelled' AND ${orders.sentAt} >= ${monthStart} THEN ${orders.subtotal} ELSE 0 END), 0)`,
      monthCommission: sql<number>`COALESCE(SUM(CASE WHEN ${orders.status} <> 'cancelled' AND ${orders.sentAt} >= ${monthStart} THEN ${orders.commissionAmount} ELSE 0 END), 0)`,
      monthOrders: sql<number>`SUM(${orders.status} <> 'cancelled' AND ${orders.sentAt} >= ${monthStart})`,
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

/** Every order placed against one project, with its lines, for the customer's project page and the admin's. */
export async function ordersForProject(projectId: number) {
  const rows = await db
    .select({
      id: orders.id,
      partnerType: orders.partnerType,
      status: orders.status,
      subtotal: orders.subtotal,
      deliveryFee: orders.deliveryFee,
      originalDeliveryFee: orders.originalDeliveryFee,
      commissionAmount: orders.commissionAmount,
      partnerMessage: orders.partnerMessage,
      sentAt: orders.sentAt,
      confirmedAt: orders.confirmedAt,
      viewedAt: orders.viewedAt,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
      storeId: orders.storeId,
      storeNameKa: stores.nameKa,
      storeNameEn: stores.nameEn,
      storeNameRu: stores.nameRu,
      storePhone: stores.phone,
      workerNameKa: workers.nameKa,
      workerNameEn: workers.nameEn,
      workerNameRu: workers.nameRu,
      workerPhone: workers.phone,
      teamNameKa: teams.nameKa,
      teamNameEn: teams.nameEn,
      teamNameRu: teams.nameRu,
      teamPhone: teams.phone,
      itemCount: sql<number>`(SELECT COUNT(*) FROM ${orderItems} WHERE ${orderItems.orderId} = ${orders.id} AND ${orderItems.removed} = 0)`,
    })
    .from(orders)
    .leftJoin(stores, eq(orders.storeId, stores.id))
    .leftJoin(workers, eq(orders.workerId, workers.id))
    .leftJoin(teams, eq(orders.teamId, teams.id))
    .where(eq(orders.projectId, projectId))
    .orderBy(desc(orders.createdAt), asc(orders.id));
  const ids = rows.map((r) => r.id);
  const lines = ids.length ? await db.select().from(orderItems).where(inArray(orderItems.orderId, ids)).orderBy(asc(orderItems.sortOrder), asc(orderItems.id)) : [];
  return rows.map((r) => ({ ...r, itemCount: Number(r.itemCount), items: lines.filter((l) => l.orderId === r.id) }));
}

export type ProjectOrder = Awaited<ReturnType<typeof ordersForProject>>[number];

