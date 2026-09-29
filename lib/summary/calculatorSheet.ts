/**
 * The calculator's estimate as the sheet the design's budget is — worked out by the same
 * function, so one flat priced in either product comes to the same figure.
 *
 * A calculation is a design without furniture laid out: its drawing board is the plan — the
 * rooms, the walls, the doors and windows, the technical points and radiators — and the
 * fittings on it; each room's floor and walls in the products picked for them are its finishes;
 * a product picked for the whole flat that is a door, a window, a radiator, a socket or light, or
 * a moulding goes onto every one of those on the board (`boardWithPicks`). All of it is priced
 * by `priceScene` — the renovation's materials and labour from the same rooms and counts, the
 * finishes bought the same way, the doors, fittings and radiators as the same product lines,
 * delivery per shop and the renovation's contingency alike. What the design has no place for —
 * a basin or a pendant picked for the whole flat, the furniture picked room by room — is priced
 * with it as the calculator's own lines (`PriceOptions.extraLines`).
 *
 * Every line has a key (`lib/design/ticks`), can be ticked out of the order and have its
 * quantity changed, and what was worked out stays on the line as the original. Pure: who sells
 * a pick is asked of `storeOf` — the calculator's snapshots carry no shop.
 */

import type { HomeState, MaterialItem, Room, SelectedProduct, WorkChoices, WorkerCost } from '@/lib/calculator/types';
import type { RateBook } from '@/lib/calculator/rates';
import { estimateCounts, type EstimateCounts } from '@/lib/calculator/materials';
import { boardDoorCounts } from '@/lib/calculator/boardCounts';
import { boardFinishesFromPicks, catalogProductFromPick } from '@/lib/calculator/roomFinishes';
import { isCartKey, roomIdFromKey } from '@/lib/calculator/quantities';
import { orderedLines, priceScene, renovationEstimate, type BudgetLine, type ProductLabels, type ProductLine, type SurfaceLabels } from '@/lib/design/pricing';
import { boardPartitionCounts } from '@/lib/design/partitions';
import { FIXTURE_PRODUCT_KIND } from '@/lib/design/electrical';
import { dressBoard, pickTarget, type DressedBoard } from '@/lib/design/boardPicks';
import { planFromCalculatorRooms } from '@/lib/design/planGeometry';
import { ensureWalls } from '@/lib/design/walls';
import { tickFor, type Quantities, type Tick } from '@/lib/design/ticks';
import type { DesignCost, DesignScene, ElectricalPoint, FloorPlan, SceneProduct, SceneStore, SurfaceFinish } from '@/lib/design/types';

/** What the person made of the estimate: lines ticked off, quantities of their own. */
export interface CalculatorEdits {
  excluded?: Tick[];
  quantities?: Quantities;
  /** Laminate or parquet, plasterboard or a stretch ceiling: which labour the estimate prices. */
  choices?: Partial<WorkChoices>;
  /** How far the journey got and the page last open — so it reopens where it was left (`lib/flow/resume`). */
  progress?: { step: number; calculated: boolean; at?: number | null; steps?: number };
}

export interface CalculatorPicks {
  selectedProducts: Record<string, SelectedProduct>;
  selectedFurniture: Record<string, SelectedProduct[]>;
}

export interface SheetTotals {
  /** Estimated materials: the bulk ones and whatever is priced without a product. */
  subtotalMaterials: number;
  /** Real products — finishes, doors, fittings, radiators, the calculator's other picks — and their delivery. */
  subtotalProducts: number;
  subtotalFurniture: number;
  /** Every line of labour. */
  subtotalWorkers: number;
  grandTotal: number;
  /** The renovation's contingency: a share of its materials and labour, never of what is bought (`DesignCost.contingencyTotal`). */
  contingency: number;
  /** What to plan with: the sheet and the contingency. */
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
  /** The priced calculation itself: its baskets per shop, its coverage, its totals by kind. */
  cost: DesignCost;
}

/** Everything a calculation is priced from. */
export interface CalculationInput {
  rooms: Room[];
  homeState: HomeState;
  picks: CalculatorPicks;
  /** The calculator's drawing board. Without one, the rooms laid out as rectangles with nothing on them. */
  board: FloorPlan | null;
  /** The fittings on the board — the standard sockets, switches and lights (`standardElectrical`). */
  electrical?: ElectricalPoint[] | null;
  edits?: CalculatorEdits | null;
  book?: RateBook;
  /** The shop that sells a product, when one does: the calculator's picks carry none. */
  storeOf?: (productId: number) => SceneStore | null | undefined;
  locale?: 'ka' | 'en' | 'ru';
  surfaceLabels?: Partial<SurfaceLabels>;
  productLabels?: Partial<ProductLabels>;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** A calculator pick as the product snapshot a sheet line carries. */
function snapshot(pick: SelectedProduct, store: SceneStore | null): SceneProduct {
  return {
    productId: pick.productId,
    nameKa: pick.nameKa,
    nameEn: pick.nameEn ?? null,
    nameRu: pick.nameRu ?? null,
    slug: pick.slug ?? '',
    brand: null,
    pricePerUnit: pick.pricePerUnit,
    unit: pick.unit,
    qty: pick.qty,
    totalPrice: pick.totalPrice,
    imageUrl: pick.imageUrl,
    colorHex: pick.colorHex ?? null,
    textureUrl: pick.textureUrl ?? null,
    model3dUrl: pick.model3dUrl ?? null,
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

/**
 * The ticks a project's edits come to, with the picks ticked off in the first version of
 * the calculator's summary — a flag on the pick itself — read as the ticks they are now.
 */
export function effectiveExcluded(picks: CalculatorPicks, edits?: CalculatorEdits | null): Tick[] {
  const excluded: Tick[] = [...(edits?.excluded ?? [])];
  // A room's floor or walls are its product's finish line now; the rest keep their pick's key.
  for (const [key, pick] of Object.entries(picks.selectedProducts)) if (pick.excluded) excluded.push(roomIdFromKey(key) && !isCartKey(key) ? tickFor.finish(pick.productId) : tickFor.pick(key));
  for (const { pick, tick } of furnitureTicks(picks.selectedFurniture)) if (pick.excluded) excluded.push(tick);
  return excluded;
}

/** The board as the calculation's picks for the whole flat dress it. */
export type BoardWithPicks = DressedBoard;

/**
 * The board as the whole-flat picks dress it (`dressBoard`): a door picked for the flat on every
 * interior door (an entrance door on the front door), a window on every window, a radiator on
 * every radiator — its sections counted from its room — a socket, switch or light on every
 * fitting of its kind, a skirting board or cornice round every room. The design puts the same
 * picks on its plan (`applyBoardPicks`), and a design made from the calculation is handed this.
 */
export function boardWithPicks(board: FloorPlan, electrical: ElectricalPoint[], selectedProducts: Record<string, SelectedProduct>, storeOf: (productId: number) => SceneStore | null | undefined = () => null): BoardWithPicks {
  const products = Object.entries(selectedProducts)
    .filter(([key]) => !roomIdFromKey(key) && !isCartKey(key))
    .map(([key, pick]) => ({ key, product: { ...catalogProductFromPick(pick), store: storeOf(pick.productId) ?? null } }));
  return dressBoard(board, electrical, products);
}

/**
 * How much of a product picked for the whole flat the sheet buys once it is on the board: the
 * doors or windows it hangs in, a radiator's sections over every radiator, a fitting's plates
 * or metres over every fitting of its kind, a moulding's metres round every room. Null when
 * the board has no place for it — its quantity is then the pick's own (`suggestedQuantity`).
 */
export function placedQuantity(board: FloorPlan | null, electrical: ElectricalPoint[], key: string, pick: SelectedProduct): number | null {
  if (!board) return null;
  const dressed = boardWithPicks(board, electrical, { [key]: pick });
  const n = dressed.placed[key];
  if (!n) return null;
  const target = pickTarget(pick);
  const sum = (values: number[]) => round2(values.reduce((s, v) => s + v, 0));
  if (target === 'radiator') return sum((dressed.plan.technical?.points ?? []).filter((p) => p.kind === 'radiator').map((p) => p.product?.qty ?? 0));
  if (target === 'skirting' || target === 'cornice') return sum(dressed.trims.map((f) => f.product?.qty ?? 0));
  if (target && typeof target === 'object') return sum(dressed.electrical.filter((p) => FIXTURE_PRODUCT_KIND[p.kind] === target.fixture).map((p) => p.product?.qty ?? 0));
  return n;
}

/** The board the calculation is priced on: its own, or its rooms as rectangles with nothing drawn on them. */
export function calculationBoard(rooms: Room[], board: FloorPlan | null): FloorPlan {
  if (board && board.rooms.length > 0) return board;
  const plan = ensureWalls(planFromCalculatorRooms(rooms));
  return { ...plan, rooms: plan.rooms.map((r) => ({ ...r, openings: [] })) };
}

/**
 * Counts the board cannot give, worked out from the rooms instead: the doors when none is
 * drawn, the partitions when the rooms stand apart, the points when none has been placed
 * (`estimateCounts`). Where the board says, it is counted as the design counts it.
 */
function missingCounts(plan: FloorPlan, electrical: ElectricalPoint[], rooms: Room[]): Partial<EstimateCounts> {
  const estimate = estimateCounts(rooms);
  const counts: Partial<EstimateCounts> = {};
  if (!('doors' in boardDoorCounts(plan))) counts.doors = estimate.doors;
  if (!('partitionM2' in boardPartitionCounts(plan))) counts.partitionM2 = estimate.partitionM2;
  if ((plan.technical?.points.length ?? 0) === 0 && electrical.length === 0) {
    counts.electricPoints = estimate.electricPoints;
    counts.plumbingPoints = estimate.plumbingPoints;
    counts.radiators = estimate.radiators;
  }
  return counts;
}

/** A shop's own snapshot on every product that has none. */
function withStore(product: SceneProduct | null | undefined, storeOf: (productId: number) => SceneStore | null | undefined): SceneProduct | null | undefined {
  if (!product || product.store) return product;
  const store = storeOf(product.productId) ?? null;
  return store ? { ...product, store } : product;
}

/** The calculation priced as a design (`priceScene`), with the person's edits laid over it — or not. */
export function calculationCost(input: CalculationInput, options: { edited?: boolean } = {}): DesignCost {
  const storeOf = input.storeOf ?? (() => null);
  const board = calculationBoard(input.rooms, input.board);
  const dressed = boardWithPicks(board, input.electrical ?? [], input.picks.selectedProducts, storeOf);
  const plan: FloorPlan = {
    ...dressed.plan,
    rooms: dressed.plan.rooms.map((room) => ({ ...room, openings: room.openings.map((o) => (o.product ? { ...o, product: withStore(o.product, storeOf) } : o)) })),
    ...(dressed.plan.technical ? { technical: { ...dressed.plan.technical, points: dressed.plan.technical.points.map((p) => (p.product ? { ...p, product: withStore(p.product, storeOf) } : p)) } } : {}),
  };
  const finishes = [...boardFinishesFromPicks(plan, input.picks.selectedProducts), ...dressed.trims].map((f) => (f.product ? { ...f, product: withStore(f.product, storeOf) ?? null } : f));
  const electrical = dressed.electrical.map((p) => (p.product ? { ...p, product: withStore(p.product, storeOf) } : p));
  const edited = options.edited ?? true;
  const scene: DesignScene = {
    styleId: 'scandinavian',
    mode: 'full',
    budgetGel: null,
    items: [],
    finishes,
    electrical,
    ...(edited ? { excluded: effectiveExcluded(input.picks, input.edits), quantities: input.edits?.quantities ?? {} } : {}),
  };
  return priceScene(plan, scene, {
    homeState: input.homeState,
    book: input.book,
    choices: input.edits?.choices ?? null,
    locale: input.locale,
    surfaceLabels: input.surfaceLabels,
    productLabels: input.productLabels,
    extraLines: ownLines(input.picks, dressed.placed, input.rooms, board, storeOf),
    counts: missingCounts(board, input.electrical ?? [], input.rooms),
  });
}

/**
 * The renovation's materials and labour of the calculation, exactly as its sheet has them
 * (`renovationEstimate` — the part of `priceScene` that is the works): what the materials step
 * shows, phase by phase.
 */
export function calculationEstimate(input: Pick<CalculationInput, 'rooms' | 'homeState' | 'board' | 'electrical' | 'edits' | 'book'>): { phases: number[]; materials: MaterialItem[]; workerCosts: WorkerCost[] } {
  const board = calculationBoard(input.rooms, input.board);
  return renovationEstimate(board, input.electrical ?? [], { homeState: input.homeState, book: input.book, choices: input.edits?.choices ?? null, counts: missingCounts(board, input.electrical ?? [], input.rooms) });
}

/**
 * The calculator's own lines: the picks the design has no place for — a product for the whole
 * flat that is none of the board's doors, fittings and mouldings (or found none of them to go
 * on), a cart pick from before rooms took their own — and the furniture, picked room by room.
 */
function ownLines(picks: CalculatorPicks, placed: Record<string, number>, rooms: Room[], board: FloorPlan, storeOf: (productId: number) => SceneStore | null | undefined): BudgetLine[] {
  const roomName = new Map([...board.rooms.map((r) => [r.id, r.name] as const), ...rooms.map((r) => [r.id, r.nameKa] as const)]);
  const lines: BudgetLine[] = [];
  for (const [key, pick] of Object.entries(picks.selectedProducts)) {
    if (placed[key] || (roomIdFromKey(key) && !isCartKey(key))) continue;
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
      product: snapshot(pick, storeOf(pick.productId) ?? null),
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
      product: snapshot(pick, storeOf(pick.productId) ?? null),
    });
  }
  return lines;
}

function totalsOf(cost: DesignCost): SheetTotals {
  let materials = 0;
  let products = 0;
  let workers = 0;
  for (const line of cost.lines) {
    if (line.excluded || line.bucket === 'furniture') continue;
    if (line.section === 'labour') workers += line.total;
    else if (line.estimated) materials += line.total;
    else products += line.total;
  }
  return {
    subtotalMaterials: round2(materials),
    subtotalProducts: round2(products),
    subtotalFurniture: cost.furnitureTotal,
    subtotalWorkers: round2(workers),
    grandTotal: cost.grandTotal,
    contingency: cost.contingencyTotal,
    grandTotalWithMargin: round2(cost.grandTotal + cost.contingencyTotal),
  };
}

/** The sheet the summary shows, the project page reads and the save stores the totals of. */
export function calculatorSheet(input: CalculationInput): CalculatorSheet {
  const cost = calculationCost(input);
  const lines = cost.lines;
  const excludedCount = lines.filter((l) => l.excluded).length;
  const changedCount = lines.filter((l) => l.originalQty != null && !l.excluded).length;
  const edited = excludedCount > 0 || lines.some((l) => l.originalQty != null);
  return { lines, ...totalsOf(cost), original: edited ? totalsOf(calculationCost(input, { edited: false })) : null, excludedCount, changedCount, cost };
}

/**
 * What the calculation buys, as the person left the sheet: every product line still ticked, at
 * the quantity on the sheet — the finishes, the doors and windows, the fittings, the radiators,
 * the other picks and the furniture. The one list the calculator's checkout dialogue and the
 * orders the stores are sent are made from, so neither can disagree with the sheet.
 */
export function orderedCalculationLines(input: CalculationInput): ProductLine[] {
  return orderedLines(calculationCost(input)).filter((line) => line.qty > 0);
}

/** The labour of the sheet as it was left: what a worker or a brigade is asked to do. */
export function sheetLabour(lines: BudgetLine[]): BudgetLine[] {
  return lines.filter((l) => l.section === 'labour' && !l.excluded && l.total > 0);
}
