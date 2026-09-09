import type {
  Room,
  RoomType,
  HomeState,
  MaterialItem,
  WorkerCost,
  SelectedProduct,
  ProjectSummary,
  UnitType,
} from './types';
import {
  HOME_STATES,
  WET_ROOM_TYPES,
  CONTINGENCY_PCT,
  type MaterialRate,
} from './constants';
import { DEFAULT_RATE_BOOK, type RateBook } from './rates';

/**
 * Computes derived dimensions (floor / wall / ceiling / perimeter) for a room.
 */
export function computeRoomAreas(input: {
  id: string;
  type: RoomType;
  nameKa: string;
  width: number;
  length: number;
  height: number;
}): Room {
  const width = Math.max(0, Number(input.width) || 0);
  const length = Math.max(0, Number(input.length) || 0);
  const height = Math.max(0, Number(input.height) || 0);

  const floorM2 = round2(width * length);
  const perimeterM = round2(2 * (width + length));
  const wallM2 = round2(perimeterM * height);
  const ceilingM2 = floorM2;
  const isWetRoom = WET_ROOM_TYPES.includes(input.type);

  return {
    ...input,
    width,
    length,
    height,
    floorM2,
    wallM2,
    ceilingM2,
    perimeterM,
    isWetRoom,
  };
}

/**
 * Aggregate room totals (used by both materials and labor calculation).
 */
export function aggregateRoomTotals(rooms: Room[]) {
  const totalFloorM2 = sum(rooms.map((r) => r.floorM2));
  const totalWallM2 = sum(rooms.map((r) => r.wallM2));
  const totalCeilingM2 = sum(rooms.map((r) => r.ceilingM2));
  const totalPerimeterM = sum(rooms.map((r) => r.perimeterM));
  const totalWetRoomM2 = sum(rooms.filter((r) => r.isWetRoom).map((r) => r.floorM2));
  const doorCount = rooms.length;
  const windowCount = rooms.filter(
    (r) => !['bathroom', 'toilet', 'hallway', 'storage'].includes(r.type)
  ).length;
  return {
    totalFloorM2: round2(totalFloorM2),
    totalWallM2: round2(totalWallM2),
    totalCeilingM2: round2(totalCeilingM2),
    totalPerimeterM: round2(totalPerimeterM),
    totalWetRoomM2: round2(totalWetRoomM2),
    doorCount,
    windowCount,
  };
}

/**
 * Calculates all material items required for the project.
 */
export function calculateMaterials(
  rooms: Room[],
  homeState: HomeState,
  book: RateBook = DEFAULT_RATE_BOOK
): MaterialItem[] {
  if (rooms.length === 0) return [];
  const t = aggregateRoomTotals(rooms);
  const phases = HOME_STATES[homeState].includedPhases;
  const items: MaterialItem[] = [];

  const baseFor = (rate: MaterialRate): number => {
    switch (rate.basis) {
      case 'floor':
        return t.totalFloorM2;
      case 'wall':
        return t.totalWallM2;
      case 'ceiling':
        return t.totalCeilingM2;
      case 'wet_floor':
        return t.totalWetRoomM2 * (rate.phase === 9 ? 1.5 : 1); // tile area = floor + walls in wet rooms
      case 'perimeter':
        return t.totalPerimeterM;
      default:
        return t.totalFloorM2;
    }
  };

  for (const [key, rate] of Object.entries(book.materials)) {
    if (!phases.includes(rate.phase)) continue;
    const base = baseFor(rate);
    if (base <= 0) continue;
    const rawQty = base * rate.qtyPerM2;
    const qty = round2(rawQty * (1 + rate.wasteFactorPct / 100));
    const estimated = rate.estimatedPriceGEL ?? null;
    items.push({
      key,
      labelKa: rate.labelKa,
      qty,
      unit: rate.unit as UnitType,
      estimatedPriceGEL: estimated,
      linkedCategorySlug: rate.linkedCategorySlug ?? null,
    });
  }

  return items;
}

/**
 * Calculates the total worker labor cost for the project.
 */
export function calculateWorkerCosts(
  rooms: Room[],
  homeState: HomeState,
  book: RateBook = DEFAULT_RATE_BOOK
): WorkerCost[] {
  if (rooms.length === 0) return [];
  const t = aggregateRoomTotals(rooms);
  const phases = HOME_STATES[homeState].includedPhases;
  const costs: WorkerCost[] = [];

  // A labour line admin has switched off simply does not appear.
  const addCost = (key: string, qty: number, unit: 'm2' | 'unit') => {
    if (qty <= 0) return;
    const rate = book.labour[key];
    if (!rate) return;
    const pricePerQty = rate.price;
    costs.push({
      key,
      labelKa: rate.labelKa,
      qty: round2(qty),
      qtyUnit: unit,
      pricePerQty,
      totalGEL: round2(qty * pricePerQty),
    });
  };

  if (phases.includes(1)) addCost('demolition', t.totalFloorM2, 'm2');
  if (phases.includes(2)) addCost('plumbing_rough', t.totalFloorM2, 'm2');
  if (phases.includes(3)) addCost('electrical_rough', t.totalFloorM2, 'm2');
  if (phases.includes(5)) addCost('insulation', t.totalFloorM2, 'm2');
  if (phases.includes(6)) addCost('screed', t.totalFloorM2, 'm2');
  if (phases.includes(7)) addCost('plastering', t.totalWallM2, 'm2');
  if (phases.includes(8)) addCost('waterproofing', t.totalWetRoomM2, 'm2');
  if (phases.includes(9)) addCost('tiling', t.totalWetRoomM2 * 1.5, 'm2');
  if (phases.includes(10)) {
    addCost('windows', t.windowCount, 'unit');
    addCost('doors', t.doorCount, 'unit');
  }
  if (phases.includes(11)) addCost('flooring', t.totalFloorM2, 'm2');
  if (phases.includes(12)) addCost('ceiling', t.totalFloorM2, 'm2');
  if (phases.includes(13)) addCost('painting', t.totalWallM2 + t.totalCeilingM2, 'm2');
  if (phases.includes(14)) addCost('electrical_finish', t.totalFloorM2, 'm2');
  if (phases.includes(15)) addCost('plumbing_finish', t.totalWetRoomM2, 'm2');

  return costs;
}

/**
 * Compute total estimated cost of materials based on the per-unit estimated prices.
 */
export function estimateMaterialsCost(materials: MaterialItem[]): number {
  return round2(
    materials.reduce(
      (acc, item) => acc + item.qty * (item.estimatedPriceGEL ?? 0),
      0
    )
  );
}

export function sumProducts(items: SelectedProduct[]): number {
  return round2(items.reduce((acc, p) => acc + p.totalPrice, 0));
}

export function buildProjectSummary(
  rooms: Room[],
  homeState: HomeState,
  selectedProducts: SelectedProduct[],
  selectedFurniture: SelectedProduct[],
  book: RateBook = DEFAULT_RATE_BOOK
): ProjectSummary {
  const materials = calculateMaterials(rooms, homeState, book);
  const workerCosts = calculateWorkerCosts(rooms, homeState, book);

  const subtotalMaterials = estimateMaterialsCost(materials);
  const subtotalProducts = sumProducts(selectedProducts);
  const subtotalFurniture = sumProducts(selectedFurniture);
  const subtotalWorkers = round2(workerCosts.reduce((s, c) => s + c.totalGEL, 0));

  const grandTotal = round2(
    subtotalMaterials + subtotalProducts + subtotalFurniture + subtotalWorkers
  );
  const grandTotalWithMargin = round2(grandTotal * (1 + CONTINGENCY_PCT / 100));

  return {
    rooms,
    materials,
    products: selectedProducts,
    furniture: selectedFurniture,
    workerCosts,
    subtotalMaterials,
    subtotalProducts,
    subtotalFurniture,
    subtotalWorkers,
    grandTotal,
    grandTotalWithMargin,
  };
}

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
