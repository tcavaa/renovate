/**
 * The calculator's estimate as the same sheet the design's budget is (`BudgetLine`).
 *
 * The calculator works an estimate out — bulk materials, labour by phase — and the person
 * adds the products and furniture they picked. All of it is theirs to take or leave at the
 * end: every line has a key (`lib/design/ticks`), can be ticked out of the order and have
 * its quantity changed, and what was worked out stays on the line as the original. One sheet
 * for both journeys, so the summary reads the same at the end of the calculator and at the
 * end of the studio, and a saved project can show what was changed in either.
 *
 * Pure: the engine's `ProjectSummary` in, lines and totals out. Who sells a pick is asked of
 * `storeOf` — the calculator's snapshots carry no shop — and a pick nobody sells stays under
 * its kind.
 */

import { CONTINGENCY_PCT } from '@/lib/calculator/constants';
import type { ProjectSummary, Room, SelectedProduct } from '@/lib/calculator/types';
import { withEdits, type BudgetLine } from '@/lib/design/pricing';
import { tickFor, tickedOff, type Quantities, type Tick } from '@/lib/design/ticks';
import type { SceneProduct, SceneStore } from '@/lib/design/types';

/** What the person made of the estimate: lines ticked off, quantities of their own. */
export interface CalculatorEdits {
  excluded?: Tick[];
  quantities?: Quantities;
}

export interface CalculatorPicks {
  selectedProducts: Record<string, SelectedProduct>;
  selectedFurniture: Record<string, SelectedProduct[]>;
}

export interface SheetTotals {
  subtotalMaterials: number;
  subtotalProducts: number;
  subtotalFurniture: number;
  subtotalWorkers: number;
  grandTotal: number;
  grandTotalWithMargin: number;
}

export interface CalculatorSheet extends SheetTotals {
  /** Every line, edited: ticked-off ones flagged where they stand, changed quantities beside their originals. */
  lines: BudgetLine[];
  /** The same totals with no edit applied — absent when nothing was edited. */
  original: SheetTotals | null;
  /** Lines ticked off, and quantities changed on lines still in. */
  excludedCount: number;
  changedCount: number;
}

export interface SheetOptions {
  rooms: Pick<Room, 'id' | 'nameKa'>[];
  edits?: CalculatorEdits | null;
  /** The shop that sells a product, when one does. */
  storeOf?: (productId: number) => SceneStore | null | undefined;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** A calculator pick as the product snapshot a sheet line carries. */
function snapshot(pick: SelectedProduct, store: SceneStore | null): SceneProduct {
  return {
    productId: pick.productId,
    nameKa: pick.nameKa,
    nameEn: pick.nameEn ?? null,
    nameRu: pick.nameRu ?? null,
    slug: '',
    brand: null,
    pricePerUnit: pick.pricePerUnit,
    unit: pick.unit,
    qty: pick.qty,
    totalPrice: pick.totalPrice,
    imageUrl: pick.imageUrl,
    colorHex: null,
    textureUrl: null,
    model3dUrl: null,
    categorySlug: pick.categorySlug ?? null,
    store,
  };
}

/** The keys of a project's furniture picks, in order — the n-th copy of a product in a room gets its own. */
export function furnitureTicks(selectedFurniture: Record<string, SelectedProduct[]>): Array<{ roomId: string; pick: SelectedProduct; tick: string }> {
  const out: Array<{ roomId: string; pick: SelectedProduct; tick: string }> = [];
  for (const [roomId, list] of Object.entries(selectedFurniture)) {
    const seen = new Map<number, number>();
    for (const pick of list) {
      const n = seen.get(pick.productId) ?? 0;
      seen.set(pick.productId, n + 1);
      out.push({ roomId, pick, tick: tickFor.furniture(roomId, pick.productId, n) });
    }
  }
  return out;
}

/** The sheet as the engine worked it out: no tick, no changed quantity. */
export function calculatorLines(summary: Pick<ProjectSummary, 'materials' | 'workerCosts'>, picks: CalculatorPicks, options: SheetOptions): BudgetLine[] {
  const roomName = new Map(options.rooms.map((r) => [r.id, r.nameKa]));
  const storeOf = (productId: number): SceneStore | null => options.storeOf?.(productId) ?? null;
  const lines: BudgetLine[] = [];

  for (const m of summary.materials) {
    const unitPrice = m.estimatedPriceGEL ?? 0;
    lines.push({ section: 'materials', bucket: 'materials', key: m.key, tick: tickFor.material(m.key), name: m.labelKa, qty: m.qty, unit: m.unit, unitPrice, total: round2(m.qty * unitPrice), estimated: true });
  }
  for (const [key, pick] of Object.entries(picks.selectedProducts)) {
    lines.push({
      section: 'products',
      bucket: 'products',
      key: `product-${pick.productId}`,
      tick: tickFor.pick(key),
      name: pick.nameKa,
      roomName: pick.roomId ? roomName.get(pick.roomId) : undefined,
      qty: pick.qty,
      unit: pick.unit,
      unitPrice: pick.pricePerUnit,
      total: pick.totalPrice,
      estimated: false,
      product: snapshot(pick, storeOf(pick.productId)),
    });
  }
  for (const { roomId, pick, tick } of furnitureTicks(picks.selectedFurniture)) {
    lines.push({
      section: 'furniture',
      bucket: 'furniture',
      key: `product-${pick.productId}`,
      tick,
      name: pick.nameKa,
      roomName: roomName.get(roomId),
      qty: pick.qty,
      unit: pick.unit,
      unitPrice: pick.pricePerUnit,
      total: pick.totalPrice,
      estimated: false,
      product: snapshot(pick, storeOf(pick.productId)),
    });
  }
  for (const w of summary.workerCosts) {
    lines.push({ section: 'labour', bucket: 'labour', key: w.key, tick: tickFor.labour(w.key), name: w.labelKa, qty: w.qty, unit: w.qtyUnit, unitPrice: w.pricePerQty, total: w.totalGEL, estimated: true });
  }
  return lines;
}

function totalsOf(lines: BudgetLine[]): SheetTotals {
  const sum = (bucket: BudgetLine['bucket']) => round2(lines.reduce((s, l) => s + (l.bucket === bucket && !l.excluded ? l.total : 0), 0));
  const subtotalMaterials = sum('materials');
  const subtotalProducts = sum('products');
  const subtotalFurniture = sum('furniture');
  const subtotalWorkers = sum('labour');
  const grandTotal = round2(subtotalMaterials + subtotalProducts + subtotalFurniture + subtotalWorkers);
  return { subtotalMaterials, subtotalProducts, subtotalFurniture, subtotalWorkers, grandTotal, grandTotalWithMargin: round2(grandTotal * (1 + CONTINGENCY_PCT / 100)) };
}

/**
 * The ticks a project's edits come to, with the picks ticked off in the first version of
 * the calculator's summary — a flag on the pick itself — read as the ticks they are now.
 */
export function effectiveExcluded(picks: CalculatorPicks, edits?: CalculatorEdits | null): Tick[] {
  const excluded: Tick[] = [...(edits?.excluded ?? [])];
  for (const [key, pick] of Object.entries(picks.selectedProducts)) if (pick.excluded) excluded.push(tickFor.pick(key));
  for (const { pick, tick } of furnitureTicks(picks.selectedFurniture)) if (pick.excluded) excluded.push(tick);
  return excluded;
}

export function calculatorSheet(summary: Pick<ProjectSummary, 'materials' | 'workerCosts'>, picks: CalculatorPicks, options: SheetOptions): CalculatorSheet {
  const raw = calculatorLines(summary, picks, options);
  const isOut = tickedOff(effectiveExcluded(picks, options.edits));
  const quantities = options.edits?.quantities ?? {};
  const lines = raw.map((line) => withEdits(line, isOut, quantities));
  const excludedCount = lines.filter((l) => l.excluded).length;
  const changedCount = lines.filter((l) => l.originalQty != null && !l.excluded).length;
  const edited = excludedCount > 0 || lines.some((l) => l.originalQty != null);
  return { lines, ...totalsOf(lines), original: edited ? totalsOf(raw) : null, excludedCount, changedCount };
}

/**
 * The picks that are being bought, as the person left them: not ticked off, at the quantity
 * they set. The one list the calculator's checkout dialogue and the orders the stores are
 * sent are both made from, so neither can disagree with the sheet.
 */
export function orderedPickLines(picks: CalculatorPicks, rooms: Pick<Room, 'id' | 'nameKa'>[], edits?: CalculatorEdits | null): BudgetLine[] {
  const isOut = tickedOff(effectiveExcluded(picks, edits));
  const quantities = edits?.quantities ?? {};
  return calculatorLines({ materials: [], workerCosts: [] }, picks, { rooms })
    .map((line) => withEdits(line, isOut, quantities))
    .filter((line) => !line.excluded && line.qty > 0);
}

/** The labour of the sheet as it was left: what a worker or a brigade is asked to do. */
export function sheetLabour(lines: BudgetLine[]): BudgetLine[] {
  return lines.filter((l) => l.section === 'labour' && !l.excluded && l.total > 0);
}
