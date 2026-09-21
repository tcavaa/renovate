/**
 * Costs a design scene.
 *
 * In `design_only` mode this is the furniture, the finishes the person chose and the delivery
 * charges — plus anything they added to a finished home themselves (a socket, a door). In
 * `full` mode it also folds in the calculator engine's bulk materials and labour, gated by
 * the works ticked on the technical step (or the home state when none were), and every
 * technical and electrical point the plan carries, so a user who arrived via the 3D studio
 * gets the same numbers a user who arrived via the calculator would.
 *
 * Everything comes back twice: as totals per section for the cost bar, and as `lines` — one
 * row per material, product, point and work with its quantity, unit and price — for the
 * budget page's "Materials + Products + Labour = Estimated project cost".
 *
 * The lines are also the only account of what is being *bought*. Which door is new work,
 * which socket the flat already had, which half of an interior door counts, how many
 * sections a radiator comes to — all of that is decided here and nowhere else, so the
 * baskets per store (and with them the delivery), the checkout dialogue and the orders the
 * stores are sent are read off the product lines (`orderedLines`) rather than worked out
 * again from the scene. They used to be: three loops over furniture and finishes, written
 * before a door or a socket was a product, which priced those on the budget and then sent
 * nobody an order for them.
 */

import type { RateBook } from '@/lib/calculator/rates';
import {
  buildProjectSummary,
  calculateMaterials,
  calculateWorkerCosts,
  estimateMaterialsCost,
} from '@/lib/calculator/materials';
import type { HomeState, Room } from '@/lib/calculator/types';
import { planToCalculatorRooms } from './planGeometry';
import { effectivePhases } from './technical';
import { alreadyHave, defaultExistingForHomeState, HAVE_NOTHING, type AlreadyHave } from './existing';
import { ELECTRICAL_LABOUR, ELECTRICAL_MATERIAL_GEL, ENTRANCE_DOOR_GEL, OPENING_ESTIMATE_GEL, OPENING_MATERIAL_FACTOR, TECHNICAL_LABOUR_DEFAULT_GEL, TECHNICAL_RATES, TRIM_INSTALL_DEFAULT_GEL } from './technicalRates';
import { isTrimSurface } from './trims';
import { radiatorSections } from './radiators';
import { measureKitchens } from './kitchen';
import { finishCoverage, type FinishCoverage } from './zones';
import { tickFor, tickedOff, validQuantity, type Quantities } from './ticks';
import type {
  DesignCost,
  DesignScene,
  ElectricalPoint,
  FloorPlan,
  Opening,
  SceneProduct,
  SceneStore,
  StoreBasket,
  SurfaceFinish,
  TechnicalPoint,
} from './types';
import { archetypeLabel } from './catalog';

export interface PriceOptions {
  /** Only used in `full` mode; ignored for design-only projects. */
  homeState?: HomeState;
  /** Rate book for the `full`-mode materials and labour; the shipped defaults when omitted. */
  book?: RateBook;
  /** Basket line labels for finishes, in the user's language. Georgian for any that are omitted. */
  surfaceLabels?: Partial<SurfaceLabels>;
  /** The same for doors, windows, fittings and radiators. Georgian for any that are omitted. */
  productLabels?: Partial<ProductLabels>;
  /** Language for the furniture line labels (archetype names). Georgian when omitted. */
  locale?: 'ka' | 'en' | 'ru';
  /** The works ticked on the technical step; the plan's own list when omitted. */
  works?: string[] | null;
  /**
   * What the flat already has and must not be charged for (`lib/design/existing`). The
   * plan's own list when omitted, which in turn falls back to the home state's default —
   * so a green frame is not billed for the floor it is standing on.
   */
  existing?: readonly string[] | null;
}

export type SurfaceLabels = Record<'floor' | 'wall' | 'ceiling' | 'skirting' | 'cornice', string>;

const DEFAULT_SURFACE_LABELS: SurfaceLabels = {
  floor: 'იატაკის საფარი',
  wall: 'კედლის საფარი',
  ceiling: 'ჭერის საფარი',
  skirting: 'იატაკის პლინტუსი',
  cornice: 'ჭერის პლინტუსი',
};

/**
 * What a basket line is when it is neither furniture (its archetype says) nor a finish (its
 * surface does): the kind of opening, the radiator, or the kind of fitting — the four
 * sockets as one, since one socket product serves them all.
 */
export type ProductLabelKey = 'door' | 'entrance_door' | 'window' | 'radiator' | 'socket' | Exclude<ElectricalPoint['kind'], `socket${string}`>;
export type ProductLabels = Record<ProductLabelKey, string>;

const DEFAULT_PRODUCT_LABELS: ProductLabels = {
  door: 'შიდა კარი',
  entrance_door: 'შესასვლელი კარი',
  window: 'ფანჯარა',
  radiator: 'რადიატორი',
  socket: 'როზეტი',
  switch: 'ჩამრთველი',
  tv: 'ტელევიზორი',
  internet: 'ინტერნეტი',
  light_ceiling: 'ჭერის განათება',
  light_wall: 'კედლის სანათი',
  light_spot: 'სპოტი',
  light_strip: 'LED ლენტი',
  light_furniture: 'ავეჯის განათება',
};

const fittingLabelKey = (kind: ElectricalPoint['kind']): ProductLabelKey => (kind.startsWith('socket') ? 'socket' : (kind as ProductLabelKey));

/** `products` is the calculator's own: whatever was picked from its catalogue that no shop card holds. */
export type BudgetSection = 'furniture' | 'lighting' | 'finishes' | 'products' | 'openings' | 'electrical' | 'plumbing' | 'heating' | 'climate' | 'materials' | 'labour' | 'delivery';

/** One row of the budget: what, how much, at what price. */
export interface BudgetLine {
  section: BudgetSection;
  /** A stable key: a product id, a material or labour key, or a `budget.lines` dictionary key. */
  key: string;
  /** What the row is, when it is a product or a room; keys the UI translates otherwise. */
  name?: string;
  roomName?: string;
  qty: number;
  unit: 'piece' | 'm2' | 'm' | 'unit' | string;
  unitPrice: number;
  total: number;
  /** A rate-book or catalogue-free estimate rather than a real product's price. */
  estimated: boolean;
  /**
   * The line's own key (`lib/design/ticks`): what a tick and a changed quantity are kept
   * under. Every line has one — a product, but also a bag of plaster and an hour of the
   * electrician: the person decides what of the estimate they are taking, all of it. Only
   * delivery has none, because it is not chosen; it follows from what the stores bring.
   */
  tick?: string;
  /**
   * Ticked off: the line stays on the sheet, where it was, so it can be put back — but it
   * counts for nothing. Every total, section and basket leaves it out.
   */
  excluded?: boolean;
  /**
   * What the sheet worked the quantity out to be, when the person has set their own
   * (`scene.quantities`): `qty` and `total` are then theirs, and this is shown beside them so
   * the original is never lost from view.
   */
  originalQty?: number;
  /** Which of the cost's totals the line counts towards. */
  bucket?: CostBucket;
  /**
   * The catalogue product a product line is: its names in three languages, its category and
   * the shop that sells it, carrying the *line's* quantity and total — a folded line is every
   * instance together, not the first of them. A line that has one is something a store is
   * asked for; the baskets, the checkout dialogue and the orders are read off these and
   * nothing else (`orderedLines`).
   */
  product?: SceneProduct;
  /** What that product is here — "Sofa", "Wall covering", "Interior door" — in the caller's language, for the basket. */
  item?: string;
}

/** The totals of `DesignCost`, by the lines that make each one up. */
export type CostBucket = 'furniture' | 'finishes' | 'products' | 'materials' | 'labour' | 'openings' | 'technical' | 'delivery';

/** A budget line that is a product somebody sells. */
export type ProductLine = BudgetLine & { product: SceneProduct };

/**
 * What is being bought: every product line still ticked, in the order the budget lists them.
 * The one list the baskets, the checkout dialogue (`designCheckoutPart`) and the orders
 * (`sceneLinesByStore`) are made from, so none of them can disagree with the sheet the
 * person was looking at when they pressed the button.
 */
export function orderedLines(cost: Pick<DesignCost, 'lines'>): ProductLine[] {
  return cost.lines.filter((line): line is ProductLine => !!line.product && !line.excluded);
}

/** A line's product as the line counts it: the snapshot with the folded quantity and total. */
function lineProduct(product: SceneProduct, qty: number, total: number): SceneProduct {
  return { ...product, qty, totalPrice: total };
}

/**
 * A line as the person left it: ticked off or not, at the quantity they set. The edits are
 * applied in one place, after every section has worked out what *it* thinks the line is —
 * which is what keeps the original on the sheet beside the edit, and why a ticked-off line
 * still stands exactly where it stood.
 */
export function withEdits(line: BudgetLine, isOut: (tick: string, productId?: number | null) => boolean, quantities: Quantities): BudgetLine {
  if (!line.tick) return line;
  let next = line;
  const wanted = quantities[line.tick];
  if (validQuantity(wanted) && Math.abs(wanted - line.qty) > 1e-9) {
    const total = round2(wanted * line.unitPrice);
    next = { ...next, originalQty: line.qty, qty: wanted, total, ...(line.product ? { product: lineProduct(line.product, wanted, total) } : {}) };
  }
  if (isOut(line.tick, line.product?.productId)) next = { ...next, excluded: true };
  return next;
}

export function priceScene(
  plan: FloorPlan,
  scene: DesignScene,
  options: PriceOptions = {}
): DesignCost {
  const roomName = new Map(plan.rooms.map((r) => [r.id, r.name]));
  const locale = options.locale ?? 'ka';
  // Every section first says what it works the flat out to be — `raw`, the original sheet.
  // The person's own edits come after, in one pass: lines ticked off (`scene.excluded`) and
  // quantities they set themselves (`scene.quantities`). A ticked-off line stays in `lines`,
  // flagged, exactly where it would otherwise be — a sheet that reshuffles itself under the
  // pointer every time a box is ticked cannot be read — and out of every total and basket.
  // What a tick takes out is *that line*: unticking a socket leaves the electrician's point,
  // because a socket somebody already owns still has to be wired — and the point has a tick
  // of its own for the person who is wiring it themselves.
  const raw: BudgetLine[] = [];
  /** Which room an item or kitchen line belongs to, for the per-room totals. */
  const roomOf = new Map<string, string>();

  // --- furniture ---
  // A made-to-measure kitchen is quoted by its façade, not by the model's price — the model
  // is only what is drawn. Its lines come below, with the measurement on them; it is a
  // joiner's job and not a product line, so no store is sent it either.
  const kitchens = measureKitchens(scene.items, plan.rooms);
  const measured = new Set(kitchens.map((k) => k.itemId));

  for (const item of scene.items) {
    const product = item.product;
    if (!product || measured.has(item.id)) continue;
    const isLight = item.slot === 'pendant' || item.slot === 'floor_lamp';
    // One line per placed piece, ticked on its own: the same bed in four bedrooms is four
    // lines, and unticking one of them is not unticking the other three.
    const tick = tickFor.item(item.id);
    roomOf.set(tick, item.roomId);
    raw.push({
      section: isLight ? 'lighting' : 'furniture',
      bucket: 'furniture',
      key: `product-${product.productId}`,
      tick,
      name: localizedName(product, locale),
      roomName: roomName.get(item.roomId),
      qty: product.qty,
      unit: product.unit,
      unitPrice: product.pricePerUnit,
      total: product.totalPrice,
      estimated: false,
      product,
      item: archetypeLabel(item.kind, locale),
    });
  }

  // The kitchens, one line each: what a joiner measures (the façade in m², the worktop by
  // the metre) at the market rates, marked as the estimate it is until a joiner quotes.
  for (const kitchen of kitchens) {
    const tick = tickFor.kitchen(kitchen.itemId);
    roomOf.set(tick, kitchen.roomId);
    raw.push({
      section: 'furniture',
      bucket: 'furniture',
      key: kitchen.slot === 'kitchen_island' ? 'kitchen_island_custom' : 'kitchen_run_custom',
      tick,
      roomName: kitchen.roomName,
      qty: kitchen.totalM2,
      unit: 'm2',
      unitPrice: kitchen.totalM2 > 0 ? round2(kitchen.totalGel / kitchen.totalM2) : 0,
      total: kitchen.totalGel,
      estimated: true,
    });
  }

  // --- surface finishes ---
  // A default finish carries no product and costs nothing; one the user picked is a real
  // tile or paint with a price, in either mode — choosing it is asking for it.
  // What the flat already has is left out of the budget altogether, line, basket and total.
  const have = alreadyHave(options.existing ?? plan.technical?.existing ?? defaultExistingForHomeState(scene.mode === 'full' ? options.homeState : null));
  const priced = scene.finishes.filter((f) => !have.surface(f.surface));
  // Which surfaces each product lies on, for the basket's label: one tile on a bathroom's
  // floor and its walls is one line, and says both.
  const surfacesOf = new Map<number, SurfaceFinish['surface'][]>();
  for (const finish of priced) {
    if (!finish.product) continue;
    const surfaces = surfacesOf.get(finish.product.productId) ?? [];
    if (!surfaces.includes(finish.surface)) surfaces.push(finish.surface);
    surfacesOf.set(finish.product.productId, surfaces);
  }
  for (const entry of finishCoverage(priced)) {
    raw.push({
      section: 'finishes',
      bucket: 'finishes',
      key: `product-${entry.product.productId}`,
      tick: tickFor.finish(entry.product.productId),
      name: localizedName(entry.product, locale),
      roomName: entry.rooms.map((id) => roomName.get(id) ?? id).join(', '),
      qty: entry.areaM2,
      unit: entry.unit === 'linear_m' ? 'm' : 'm2',
      unitPrice: entry.product.pricePerUnit,
      total: entry.total,
      estimated: false,
      product: lineProduct(entry.product, entry.areaM2, entry.total),
      item: (surfacesOf.get(entry.product.productId) ?? []).map((surface) => options.surfaceLabels?.[surface] ?? DEFAULT_SURFACE_LABELS[surface]).join(', '),
    });
  }
  // A skirting board or cornice somebody chose is fitted by the metre, in either mode:
  // choosing it is asking for it — and one ticked off the order is fitted all the same.
  const trimMetres = round2(priced.reduce((sum, f) => sum + (f.product && isTrimSurface(f.surface) ? f.product.qty : 0), 0));
  if (trimMetres > 0) {
    const price = options.book?.labour.trim_install?.price ?? TRIM_INSTALL_DEFAULT_GEL;
    raw.push({ section: 'labour', bucket: 'labour', key: 'trim_install', tick: tickFor.labour('trim_install'), qty: trimMetres, unit: 'm', unitPrice: price, total: round2(trimMetres * price), estimated: true });
  }

  // --- renovation work, when this is not a design-only project ---
  const full = scene.mode === 'full';
  const homeState = options.homeState ?? 'white_frame';
  const phases = full ? effectivePhases(homeState, options.works ?? plan.technical?.works ?? null) : [];
  if (full) {
    const rooms: Room[] = planToCalculatorRooms(plan);
    for (const m of calculateMaterials(rooms, homeState, options.book, phases)) {
      raw.push({ section: 'materials', bucket: 'materials', key: m.key, tick: tickFor.material(m.key), name: m.labelKa, qty: m.qty, unit: m.unit, unitPrice: m.estimatedPriceGEL ?? 0, total: round2(m.qty * (m.estimatedPriceGEL ?? 0)), estimated: true });
    }
    for (const w of calculateWorkerCosts(rooms, homeState, options.book, phases)) {
      raw.push({ section: 'labour', bucket: 'labour', key: w.key, tick: tickFor.labour(w.key), name: w.labelKa, qty: w.qty, unit: w.qtyUnit, unitPrice: w.pricePerQty, total: w.totalGEL, estimated: true });
    }
  }

  // --- doors and windows, sockets, lights, pipes ---
  const productLabels: ProductLabels = { ...DEFAULT_PRODUCT_LABELS, ...options.productLabels };
  if (!have.has('openings')) raw.push(...priceOpenings(plan, full, phases, roomName, locale, productLabels));
  raw.push(...priceTechnical(plan, scene.electrical ?? [], full, phases, options.book, roomName, locale, have, productLabels));

  // --- the person's edits, and everything that is counted, counted off the result ---
  const isOut = tickedOff(scene.excluded);
  const quantities = scene.quantities ?? {};
  const lines = raw.map((line) => withEdits(line, isOut, quantities));
  const counted = lines.filter((line) => !line.excluded);
  const sumOf = (bucket: CostBucket, only?: (line: BudgetLine) => boolean) => round2(counted.reduce((s, l) => s + (l.bucket === bucket && (!only || only(l)) ? l.total : 0), 0));
  const furnitureTotal = sumOf('furniture');
  const lightingTotal = sumOf('furniture', (l) => l.section === 'lighting');
  const finishesTotal = sumOf('finishes');
  const materialsTotal = sumOf('materials');
  const labourTotal = sumOf('labour');
  const openingsTotal = sumOf('openings');
  const technicalTotal = sumOf('technical');
  // What is being bought, for the "m² per material" list: the finishes still ticked.
  const finishOut = new Set(lines.filter((l) => l.bucket === 'finishes' && l.excluded).map((l) => l.product?.productId));
  const coverage = finishCoverage(priced.filter((f) => !f.product || !finishOut.has(f.product.productId)));

  // Per room: a piece and a kitchen in their own room, a finish in each room it lies in (in
  // the proportion the line was changed by), an estimate where it names exactly one room.
  const perRoom = new Map<string, number>();
  const credit = (roomId: string | undefined, amount: number) => {
    if (roomId) perRoom.set(roomId, (perRoom.get(roomId) ?? 0) + amount);
  };
  const byName = new Map([...roomName.entries()].map(([id, name]) => [name, id]));
  for (const line of counted) {
    if (line.bucket === 'furniture') credit(roomOf.get(line.tick ?? ''), line.total);
    else if (line.bucket === 'openings' || line.bucket === 'technical') credit(line.roomName ? byName.get(line.roomName) : undefined, line.total);
  }
  for (const finish of priced) {
    if (!finish.product) continue;
    const line = counted.find((l) => l.bucket === 'finishes' && l.product?.productId === finish.product!.productId);
    if (!line) continue;
    const ratio = line.originalQty != null && line.originalQty > 0 ? line.qty / line.originalQty : 1;
    credit(finish.roomId, finish.product.totalPrice * ratio);
  }

  // --- the baskets: what each store is asked for ---
  // Read off the lines once every section has had its say, not gathered along the way: they
  // were filled in the furniture loop and the finishes loop and nowhere else, so a door from
  // one shop and a socket from another were priced above and belonged to no basket — and a
  // shop that sold the flat nothing but its doors charged no delivery for bringing them.
  const basketsByStore = new Map<number | 'none', StoreBasket>();
  for (const line of orderedLines({ lines })) {
    const key = line.product.store?.id ?? 'none';
    let basket = basketsByStore.get(key);
    if (!basket) {
      basket = { store: line.product.store, lines: [], subtotal: 0, deliveryFee: 0 };
      basketsByStore.set(key, basket);
    }
    basket.lines.push({ item: line.item ?? '', roomName: line.roomName ?? '', product: line.product });
    basket.subtotal = round2(basket.subtotal + line.total);
  }

  // --- delivery, once per store, on everything that store is bringing ---
  const baskets = [...basketsByStore.values()].sort((a, b) => b.subtotal - a.subtotal);
  let deliveryTotal = 0;
  for (const basket of baskets) {
    basket.deliveryFee = deliveryFeeFor(basket.store, basket.subtotal);
    deliveryTotal += basket.deliveryFee;
    if (basket.deliveryFee > 0) {
      lines.push({ section: 'delivery', bucket: 'delivery', key: `delivery-${basket.store?.id ?? 'none'}`, name: basket.store ? localizedName(basket.store, locale) : undefined, qty: 1, unit: 'piece', unitPrice: basket.deliveryFee, total: basket.deliveryFee, estimated: false });
    }
  }

  const grandTotal = round2(furnitureTotal + finishesTotal + materialsTotal + labourTotal + deliveryTotal + openingsTotal + technicalTotal);

  return {
    furnitureTotal,
    lightingTotal,
    finishesTotal,
    materialsTotal,
    labourTotal,
    deliveryTotal: round2(deliveryTotal),
    openingsTotal,
    technicalTotal,
    grandTotal,
    perRoom: plan.rooms.map((room) => ({
      roomId: room.id,
      roomName: room.name,
      total: round2(perRoom.get(room.id) ?? 0),
    })),
    baskets,
    lines,
    coverage,
    kitchens,
  };
}

function localizedName(row: { nameKa: string; nameEn?: string | null; nameRu?: string | null }, locale: 'ka' | 'en' | 'ru'): string {
  if (locale === 'en') return row.nameEn || row.nameKa;
  if (locale === 'ru') return row.nameRu || row.nameEn || row.nameKa;
  return row.nameKa;
}

/**
 * Doors and windows: the product each one is, or an estimate where none is chosen. An
 * interior door exists twice in the plan (once per room), so a pair counts once. In a
 * renovation with the doors-and-windows phase ticked every opening is new; otherwise only
 * the ones the person added themselves are priced — the rest are already in the wall.
 */
export function priceOpenings(plan: FloorPlan, full: boolean, phases: number[], roomName: Map<string, string>, locale: 'ka' | 'en' | 'ru' = 'ka', labels: ProductLabels = DEFAULT_PRODUCT_LABELS): BudgetLine[] {
  const all = full && phases.includes(10);
  const seen = new Set<string>();
  const lines: BudgetLine[] = [];
  const byProduct = new Map<number, { product: SceneProduct; label: ProductLabelKey; qty: number; total: number; rooms: Set<string> }>();
  for (const room of plan.rooms) {
    // The two halves of an interior door are listed in the same order on both sides of the
    // wall, so the n-th door between rooms A and B is one door however its halves sit.
    const ordinal = new Map<string, number>();
    for (const opening of room.openings) {
      if (opening.connectsToRoomId) {
        const pairKey = [room.id, opening.connectsToRoomId].sort().join('|') + `|${opening.kind}`;
        const n = ordinal.get(pairKey) ?? 0;
        ordinal.set(pairKey, n + 1);
        const key = `${pairKey}|${n}`;
        if (seen.has(key)) continue;
        seen.add(key);
      }
      if (!all && opening.origin !== 'user') continue;
      if (opening.product && opening.kind !== 'archway') {
        const label: ProductLabelKey = opening.kind === 'window' ? 'window' : opening.exterior ? 'entrance_door' : 'door';
        const bought = byProduct.get(opening.product.productId) ?? { product: opening.product, label, qty: 0, total: 0, rooms: new Set<string>() };
        bought.qty += 1;
        bought.total = round2(bought.total + opening.product.pricePerUnit);
        bought.rooms.add(room.id);
        byProduct.set(opening.product.productId, bought);
        continue;
      }
      const line = openingLine(opening, roomName.get(room.id));
      if (line) lines.push(line);
    }
  }
  for (const bought of byProduct.values()) {
    lines.push({ section: 'openings', bucket: 'openings', key: `product-${bought.product.productId}`, tick: tickFor.opening(bought.product.productId), name: localizedName(bought.product, locale), roomName: [...bought.rooms].map((id) => roomName.get(id) ?? id).join(', ') || undefined, qty: bought.qty, unit: 'piece', unitPrice: bought.product.pricePerUnit, total: bought.total, estimated: false, product: lineProduct(bought.product, bought.qty, bought.total), item: labels[bought.label] });
  }
  return lines;
}

/** What a door or window without a product is estimated at: a window by its area, a door apiece, the material weighing in. */
export function openingEstimate(opening: Pick<Opening, 'kind' | 'exterior' | 'material' | 'widthM' | 'heightM'>): { qty: number; unit: 'piece' | 'm2'; unitPrice: number; total: number } | null {
  const factor = OPENING_MATERIAL_FACTOR[opening.material ?? 'pvc'] ?? 1;
  if (opening.kind === 'window') {
    const area = Math.max(0.5, round2(opening.widthM * opening.heightM));
    const unitPrice = round2(OPENING_ESTIMATE_GEL.window * factor);
    return { qty: area, unit: 'm2', unitPrice, total: round2(area * unitPrice) };
  }
  if (opening.kind === 'archway') return null;
  const base = opening.exterior ? ENTRANCE_DOOR_GEL : OPENING_ESTIMATE_GEL.door;
  const unitPrice = round2(base * (opening.material ? OPENING_MATERIAL_FACTOR[opening.material] ?? 1 : 1));
  return { qty: 1, unit: 'piece', unitPrice, total: unitPrice };
}

function openingLine(opening: Opening, roomName?: string): BudgetLine | null {
  const estimate = openingEstimate(opening);
  if (!estimate) return null;
  const key = opening.kind === 'window' ? 'window' : opening.exterior ? 'entrance_door' : 'door';
  return { section: 'openings', bucket: 'openings', key, tick: tickFor.openingEstimate(opening.id), roomName, ...estimate, estimated: true };
}

/**
 * Every socket, switch, light, pipe, radiator and air conditioner: an estimated material
 * price plus the rate book's labour per point. In a renovation the relevant phases decide
 * (electrical points need the electrical phases, pipes the plumbing ones); in a finished
 * home only what the person added themselves is new work.
 */
export function priceTechnical(plan: FloorPlan, electrical: ElectricalPoint[], full: boolean, phases: number[], book: RateBook | undefined, roomName: Map<string, string>, locale: 'ka' | 'en' | 'ru' = 'ka', have: AlreadyHave = HAVE_NOTHING, labels: ProductLabels = DEFAULT_PRODUCT_LABELS): BudgetLine[] {
  const lines: BudgetLine[] = [];
  const labourPrice = (key: keyof typeof TECHNICAL_LABOUR_DEFAULT_GEL): number => book?.labour[key]?.price ?? TECHNICAL_LABOUR_DEFAULT_GEL[key];
  const electricalOn = full && (phases.includes(3) || phases.includes(14));
  const plumbingOn = full && (phases.includes(2) || phases.includes(15));

  // Electrical points. A point that is a real product is a product line at its price — the
  // same product across points folds into one row — and the rest are estimates grouped by
  // kind, so the budget reads "12 × socket" not twelve rows. The labour is per point either way.
  const byKind = new Map<string, { point: ElectricalPoint; units: number; labourUnits: number }>();
  const byProduct = new Map<number, { product: NonNullable<ElectricalPoint['product']>; label: ProductLabelKey; qty: number; total: number; light: boolean; rooms: Set<string> }>();
  for (const point of electrical) {
    if (!(electricalOn || point.origin === 'user')) continue;
    // Already wired, or already lit: the flat came with it.
    if (have.has(point.kind.startsWith('light_') ? 'lighting' : 'electrical')) continue;
    const perMetre = point.kind === 'light_strip' || point.kind === 'light_furniture';
    const units = perMetre ? (point.lengthM ?? 1.5) : 1;
    const labour = ELECTRICAL_LABOUR[point.kind];
    const entry = byKind.get(point.kind) ?? { point, units: 0, labourUnits: 0 };
    if (point.product) {
      const bought = byProduct.get(point.product.productId) ?? { product: point.product, label: fittingLabelKey(point.kind), qty: 0, total: 0, light: point.kind.startsWith('light_'), rooms: new Set<string>() };
      bought.qty = round2(bought.qty + point.product.qty);
      bought.total = round2(bought.total + point.product.totalPrice);
      bought.rooms.add(point.roomId);
      byProduct.set(point.product.productId, bought);
    } else {
      entry.units = round2(entry.units + units);
    }
    entry.labourUnits = round2(entry.labourUnits + labour.perUnit * units);
    byKind.set(point.kind, entry);
  }
  for (const bought of byProduct.values()) {
    lines.push({ section: bought.light ? 'lighting' : 'electrical', bucket: 'technical', key: `product-${bought.product.productId}`, tick: tickFor.fixture(bought.product.productId), name: localizedName(bought.product, locale), roomName: [...bought.rooms].map((id) => roomName.get(id) ?? id).join(', ') || undefined, qty: bought.qty, unit: bought.product.unit, unitPrice: bought.product.pricePerUnit, total: bought.total, estimated: false, product: lineProduct(bought.product, bought.qty, bought.total), item: labels[bought.label] });
  }
  for (const [kind, entry] of byKind) {
    const material = ELECTRICAL_MATERIAL_GEL[kind as ElectricalPoint['kind']];
    const perMetre = kind === 'light_strip' || kind === 'light_furniture';
    const isLight = kind.startsWith('light_');
    if (entry.units > 0) lines.push({ section: isLight ? 'lighting' : 'electrical', bucket: 'technical', key: `electrical_${kind}`, tick: tickFor.estimate(`electrical_${kind}`), qty: entry.units, unit: perMetre ? 'm' : 'piece', unitPrice: material, total: round2(entry.units * material), estimated: true });
    const labour = ELECTRICAL_LABOUR[kind as ElectricalPoint['kind']];
    const price = labourPrice(labour.key);
    lines.push({ section: 'labour', bucket: 'technical', key: labour.key, tick: tickFor.labour(labour.key), qty: entry.labourUnits, unit: 'unit', unitPrice: price, total: round2(entry.labourUnits * price), estimated: true });
  }

  // Technical points, one row per kind. A radiator that is a real product is bought by the
  // section — as many as its room's heat calls for (`radiatorSections`) — and the same
  // product across radiators folds into one row; hanging it is a unit of labour either way.
  const techByKind = new Map<string, { units: number; labourUnits: number; rooms: Set<string> }>();
  const radiatorsBought = new Map<number, { product: SceneProduct; sections: number; rooms: Set<string> }>();
  for (const point of plan.technical?.points ?? []) {
    const rate = TECHNICAL_RATES[point.kind];
    const on = rate.section === 'electrical' || rate.section === 'climate' ? electricalOn : plumbingOn;
    if (!(on || point.origin === 'user')) continue;
    if (have.has(rate.section === 'heating' ? 'heating' : rate.section === 'climate' ? 'climate' : rate.section === 'electrical' ? 'electrical' : 'plumbing')) continue;
    const entry = techByKind.get(point.kind) ?? { units: 0, labourUnits: 0, rooms: new Set<string>() };
    entry.labourUnits += 1;
    if (point.kind === 'radiator' && point.product) {
      const bought = radiatorsBought.get(point.product.productId) ?? { product: point.product, sections: 0, rooms: new Set<string>() };
      bought.sections += radiatorSections(plan, point);
      if (point.roomId) bought.rooms.add(point.roomId);
      radiatorsBought.set(point.product.productId, bought);
    } else {
      entry.units += 1;
      if (point.roomId) entry.rooms.add(point.roomId);
    }
    techByKind.set(point.kind, entry);
  }
  for (const bought of radiatorsBought.values()) {
    const total = round2(bought.sections * bought.product.pricePerUnit);
    lines.push({ section: 'heating', bucket: 'technical', key: `product-${bought.product.productId}`, tick: tickFor.radiator(bought.product.productId), name: localizedName(bought.product, locale), roomName: [...bought.rooms].map((id) => roomName.get(id) ?? id).join(', ') || undefined, qty: bought.sections, unit: 'section', unitPrice: bought.product.pricePerUnit, total, estimated: false, product: lineProduct(bought.product, bought.sections, total), item: labels.radiator });
  }
  for (const [kind, entry] of techByKind) {
    const rate = TECHNICAL_RATES[kind as TechnicalPoint['kind']];
    if (entry.units > 0) lines.push({ section: rate.section, bucket: 'technical', key: `technical_${kind}`, tick: tickFor.estimate(`technical_${kind}`), roomName: [...entry.rooms].map((id) => roomName.get(id) ?? id).join(', ') || undefined, qty: entry.units, unit: 'piece', unitPrice: rate.materialGel, total: round2(entry.units * rate.materialGel), estimated: true });
    const price = labourPrice(rate.labour);
    const labourUnits = entry.labourUnits * rate.labourUnits;
    lines.push({ section: 'labour', bucket: 'technical', key: rate.labour, tick: tickFor.labour(rate.labour), qty: labourUnits, unit: 'unit', unitPrice: price, total: round2(labourUnits * price), estimated: true });
  }

  // Labour rows of the same key merge into one.
  const merged: BudgetLine[] = [];
  for (const line of lines) {
    const twin = line.section === 'labour' ? merged.find((m) => m.section === 'labour' && m.key === line.key) : undefined;
    if (twin) {
      twin.qty = round2(twin.qty + line.qty);
      twin.total = round2(twin.total + line.total);
    } else merged.push({ ...line });
  }
  return merged;
}

/**
 * Delivery is charged once per store, and waived above a threshold — which is both how
 * Georgian furniture retail actually works and a real reason for the summary to group the
 * basket by partner rather than showing one flat list.
 */
export const FREE_DELIVERY_THRESHOLD_GEL = 2000;

function deliveryFeeFor(store: SceneStore | null, subtotal: number): number {
  if (!store) return 0;
  if (subtotal >= FREE_DELIVERY_THRESHOLD_GEL) return 0;
  return store.deliveryFeeGel ?? 50;
}

/** Totals per section, for the budget page's header figures. */
export function budgetSections(cost: DesignCost): Record<BudgetSection, number> {
  const out: Record<BudgetSection, number> = { furniture: 0, lighting: 0, finishes: 0, products: 0, openings: 0, electrical: 0, plumbing: 0, heating: 0, climate: 0, materials: 0, labour: 0, delivery: 0 };
  for (const line of cost.lines) if (!line.excluded) out[line.section] = round2(out[line.section] + line.total);
  return out;
}

/** Materials (the bulk ones plus every estimated fitting) + products (from the catalogue) + labour = the estimate. */
export function budgetSummary(cost: DesignCost): { materials: number; products: number; labour: number; total: number } {
  let materials = 0;
  let products = 0;
  let labour = 0;
  for (const line of cost.lines) {
    if (line.excluded) continue;
    if (line.section === 'labour') labour += line.total;
    else if (line.estimated) materials += line.total;
    else products += line.total;
  }
  return { materials: round2(materials), products: round2(products), labour: round2(labour), total: round2(materials + products + labour) };
}

export type { FinishCoverage };

/**
 * The full calculator summary, for `full`-mode projects that continue into the materials and
 * labour steps. Reuses the existing engine rather than duplicating any of its rates.
 */
export function fullProjectSummary(
  plan: FloorPlan,
  scene: DesignScene,
  homeState: HomeState,
  book?: RateBook
) {
  const rooms = planToCalculatorRooms(plan);
  const furniture = scene.items
    .map((item) => item.product)
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => ({
      productId: p.productId,
      nameKa: p.nameKa,
      pricePerUnit: p.pricePerUnit,
      unit: p.unit as never,
      qty: p.qty,
      totalPrice: p.totalPrice,
      imageUrl: p.imageUrl,
      categorySlug: p.categorySlug ?? undefined,
    }));

  const finishes = scene.finishes
    .map((f) => f.product)
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => ({
      productId: p.productId,
      nameKa: p.nameKa,
      pricePerUnit: p.pricePerUnit,
      unit: p.unit as never,
      qty: p.qty,
      totalPrice: p.totalPrice,
      imageUrl: p.imageUrl,
      categorySlug: p.categorySlug ?? undefined,
    }));

  return buildProjectSummary(rooms, homeState, finishes, furniture, book, effectivePhases(homeState, plan.technical?.works ?? null));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
