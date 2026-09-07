import type { ProjectSummary, Room, SelectedProduct } from '@/lib/calculator/types';
import type { DesignScene, FloorPlan } from '@/lib/design/types';
import { FREE_DELIVERY_THRESHOLD_GEL } from '@/lib/design/pricing';

/**
 * The marketplace arithmetic, with no database and no React.
 *
 * The platform owns nothing and sells nothing. It earns twice on every project: a fee per
 * square metre when the customer places a calculation or a 3D design (shown on the summary,
 * not collected — there is no payment integration yet), and a commission on every partner
 * order the project turns into — a store's basket, a worker's booking. Everything here is
 * the arithmetic of those two lines; `lib/finance/orders.ts` is where rows get written.
 */

export interface PlatformSettings {
  /** GEL per m² the customer is charged for a calculator project. */
  calculatorFeePerM2: number;
  /** GEL per m² for a 3D design. */
  designFeePerM2: number;
  /** Default commission on partner stores, percent — a store's own rate wins. */
  storeCommissionPct: number;
  /** Default commission on workers, percent — a worker's own rate wins. */
  workerCommissionPct: number;
}

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  calculatorFeePerM2: 2,
  designFeePerM2: 12,
  storeCommissionPct: 5,
  workerCommissionPct: 5,
};

export type CheckoutKind = 'calculator' | 'design';
export type OrderStatus = 'new' | 'confirmed' | 'in_progress' | 'done' | 'cancelled';
export const ORDER_STATUSES: readonly OrderStatus[] = ['new', 'confirmed', 'in_progress', 'done', 'cancelled'];

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function feePerM2For(kind: CheckoutKind, settings: PlatformSettings): number {
  return kind === 'design' ? settings.designFeePerM2 : settings.calculatorFeePerM2;
}

/** What the customer is shown for the project itself. */
export function platformFee(totalM2: number, feePerM2: number): number {
  if (!Number.isFinite(totalM2) || totalM2 <= 0) return 0;
  return round2(totalM2 * Math.max(0, feePerM2));
}

export function commissionFor(subtotal: number, pct: number): number {
  if (!Number.isFinite(subtotal) || subtotal <= 0) return 0;
  return round2((subtotal * Math.max(0, pct)) / 100);
}

/**
 * A partner's own rate when it has one, the platform default otherwise. Decimals arrive
 * from Drizzle as strings, so this also does the conversion.
 */
export function effectiveCommissionPct(partnerRate: number | string | null | undefined, defaultPct: number): number {
  if (partnerRate == null || partnerRate === '') return defaultPct;
  const n = Number(partnerRate);
  return Number.isFinite(n) && n >= 0 ? n : defaultPct;
}

// ---------------------------------------------------------------------------
// Order lines
// ---------------------------------------------------------------------------

export interface OrderLineDraft {
  productId: number | null;
  nameKa: string;
  nameEn: string | null;
  nameRu: string | null;
  categorySlug: string | null;
  roomName: string | null;
  unit: string;
  qty: number;
  unitPrice: number;
  total: number;
}

export interface ItemLike {
  qty: number | string;
  unitPrice: number | string;
  removed?: boolean | null;
}

export function lineTotal(qty: number | string, unitPrice: number | string): number {
  const q = Number(qty);
  const p = Number(unitPrice);
  if (!Number.isFinite(q) || !Number.isFinite(p)) return 0;
  return round2(Math.max(0, q) * Math.max(0, p));
}

/** Struck-out lines stay on the order for the customer to see but count for nothing. */
export function orderSubtotal(items: ItemLike[]): number {
  return round2(items.filter((i) => !i.removed).reduce((s, i) => s + lineTotal(i.qty, i.unitPrice), 0));
}

export function orderTotals(items: ItemLike[], commissionPct: number): { subtotal: number; commissionAmount: number } {
  const subtotal = orderSubtotal(items);
  return { subtotal, commissionAmount: commissionFor(subtotal, commissionPct) };
}

function line(p: Pick<SelectedProduct, 'productId' | 'nameKa' | 'nameEn' | 'nameRu' | 'pricePerUnit' | 'unit' | 'qty'> & { categorySlug?: string | null }, roomName: string | null): OrderLineDraft {
  const qty = Number(p.qty) || 0;
  const unitPrice = Number(p.pricePerUnit) || 0;
  return {
    productId: p.productId,
    nameKa: p.nameKa,
    nameEn: p.nameEn ?? null,
    nameRu: p.nameRu ?? null,
    categorySlug: p.categorySlug ?? null,
    roomName,
    unit: String(p.unit ?? 'piece'),
    qty,
    unitPrice,
    total: lineTotal(qty, unitPrice),
  };
}

/** Where a product is sold; `null`/`undefined` means nobody sells it right now. */
export type StoreOf = (productId: number) => number | null | undefined;

export interface LinesByStore {
  groups: Map<number, OrderLineDraft[]>;
  /** Lines whose product has no store — nothing to order, but the customer should know. */
  unassigned: OrderLineDraft[];
}

function push(result: LinesByStore, storeId: number | null | undefined, draft: OrderLineDraft): void {
  if (draft.qty <= 0) return;
  if (storeId == null) {
    result.unassigned.push(draft);
    return;
  }
  const list = result.groups.get(storeId) ?? [];
  list.push(draft);
  result.groups.set(storeId, list);
}

/**
 * A calculator project's picks, grouped by the store that sells each one. Materials carry
 * no room (they are bought for the whole flat); furniture is keyed by room.
 */
export function calculatorLinesByStore(
  selectedProducts: Record<string, SelectedProduct>,
  selectedFurniture: Record<string, SelectedProduct[]>,
  rooms: Pick<Room, 'id' | 'nameKa'>[],
  storeOf: StoreOf
): LinesByStore {
  const result: LinesByStore = { groups: new Map(), unassigned: [] };
  const roomName = new Map(rooms.map((r) => [r.id, r.nameKa]));
  for (const p of Object.values(selectedProducts)) push(result, storeOf(p.productId), line(p, null));
  for (const [roomId, list] of Object.entries(selectedFurniture)) {
    for (const p of list) push(result, storeOf(p.productId), line(p, roomName.get(roomId) ?? null));
  }
  return result;
}

/**
 * A design scene's furniture and finishes by store. The scene's own store snapshot is used
 * first; `storeOf` (the catalogue today) fills in when a snapshot has none.
 */
export function sceneLinesByStore(plan: FloorPlan, scene: DesignScene, storeOf: StoreOf = () => null): LinesByStore {
  const result: LinesByStore = { groups: new Map(), unassigned: [] };
  const roomName = new Map(plan.rooms.map((r) => [r.id, r.name]));
  for (const item of scene.items) {
    if (!item.product) continue;
    const storeId = item.product.store?.id ?? storeOf(item.product.productId);
    push(result, storeId, line(item.product as never, roomName.get(item.roomId) ?? null));
  }
  for (const finish of scene.finishes) {
    if (!finish.product) continue;
    const storeId = finish.product.store?.id ?? storeOf(finish.product.productId);
    push(result, storeId, line(finish.product as never, roomName.get(finish.roomId) ?? null));
  }
  return result;
}

export interface StoreLike {
  id: number;
  commissionRate: number | string | null;
  deliveryFeeGel: number | string | null;
}

export interface StoreOrderDraft {
  storeId: number;
  lines: OrderLineDraft[];
  subtotal: number;
  deliveryFee: number;
  commissionPct: number;
  commissionAmount: number;
}

/** Same rule as the design summary: one fee per store, waived above the threshold. */
export function deliveryFeeFor(store: Pick<StoreLike, 'deliveryFeeGel'> | null | undefined, subtotal: number): number {
  if (!store) return 0;
  if (subtotal >= FREE_DELIVERY_THRESHOLD_GEL) return 0;
  const fee = store.deliveryFeeGel == null ? 50 : Number(store.deliveryFeeGel);
  return Number.isFinite(fee) ? fee : 50;
}

/** One order per store: subtotal, delivery and the commission at that store's rate. */
export function buildStoreOrders(groups: Map<number, OrderLineDraft[]>, stores: Map<number, StoreLike>, defaultPct: number): StoreOrderDraft[] {
  const drafts: StoreOrderDraft[] = [];
  for (const [storeId, lines] of groups) {
    const store = stores.get(storeId) ?? null;
    const subtotal = round2(lines.reduce((s, l) => s + l.total, 0));
    const commissionPct = effectiveCommissionPct(store?.commissionRate, defaultPct);
    drafts.push({
      storeId,
      lines,
      subtotal,
      deliveryFee: deliveryFeeFor(store, subtotal),
      commissionPct,
      commissionAmount: commissionFor(subtotal, commissionPct),
    });
  }
  return drafts.sort((a, b) => b.subtotal - a.subtotal);
}

/** A worker's booking for a project: one line per labour phase the calculator priced. */
export function labourLines(summary: Pick<ProjectSummary, 'workerCosts'>, label: (key: string) => { en: string | null; ru: string | null } = () => ({ en: null, ru: null })): OrderLineDraft[] {
  return summary.workerCosts
    .filter((w) => w.totalGEL > 0)
    .map((w) => {
      const names = label(w.key);
      return {
        productId: null,
        nameKa: w.labelKa,
        nameEn: names.en,
        nameRu: names.ru,
        categorySlug: `labour:${w.key}`,
        roomName: null,
        unit: w.qtyUnit,
        qty: round2(w.qty),
        unitPrice: round2(w.pricePerQty),
        total: round2(w.totalGEL),
      };
    });
}

// ---------------------------------------------------------------------------
// Report periods
// ---------------------------------------------------------------------------

export type ReportPeriod = 'today' | '7d' | '30d' | 'month' | 'year' | 'custom';
export const REPORT_PERIODS: readonly ReportPeriod[] = ['today', '7d', '30d', 'month', 'year', 'custom'];

export interface DateRange {
  from: Date;
  /** Exclusive. */
  to: Date;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function parseDay(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The half-open window a report covers. `custom` reads `from`/`to` as calendar days
 * (inclusive on both ends); a missing or malformed bound falls back to the last 30 days.
 */
export function periodRange(period: ReportPeriod, opts: { from?: string; to?: string; now?: Date } = {}): DateRange {
  const now = opts.now ?? new Date();
  const today = startOfDay(now);
  switch (period) {
    case 'today':
      return { from: today, to: addDays(today, 1) };
    case '7d':
      return { from: addDays(today, -6), to: addDays(today, 1) };
    case 'month':
      return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: new Date(today.getFullYear(), today.getMonth() + 1, 1) };
    case 'year':
      return { from: new Date(today.getFullYear(), 0, 1), to: new Date(today.getFullYear() + 1, 0, 1) };
    case 'custom': {
      const from = parseDay(opts.from);
      const to = parseDay(opts.to);
      if (from && to && to >= from) return { from, to: addDays(to, 1) };
      if (from && !to) return { from, to: addDays(today, 1) };
      return { from: addDays(today, -29), to: addDays(today, 1) };
    }
    case '30d':
    default:
      return { from: addDays(today, -29), to: addDays(today, 1) };
  }
}

/** `YYYY-MM-DD` in local time — the key every daily series is bucketed on. */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Every day of a range, so a chart has a bar for the days nothing happened. */
export function eachDay(range: DateRange): string[] {
  const days: string[] = [];
  for (let d = startOfDay(range.from); d < range.to && days.length < 400; d = addDays(d, 1)) days.push(dayKey(d));
  return days;
}
