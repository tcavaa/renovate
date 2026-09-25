import type {
  Room,
  RoomPart,
  RoomType,
  HomeState,
  MaterialItem,
  WorkerCost,
  SelectedProduct,
  ProjectSummary,
  UnitType,
} from './types';
import {
  BATH_ROOM_TYPES,
  DEFAULT_FIRST_SHARE,
  DEFAULT_STUDIO_PARTS,
  HOME_STATES,
  MATERIAL_CHOICE,
  ROOM_POINTS,
  TILED_FLOOR_ROOM_TYPES,
  WASHING_MACHINE_POINTS,
  WET_ROOM_TYPES,
  CONTINGENCY_PCT,
  workChoices,
  type MaterialRate,
  type WorkChoices,
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
 * The counts the estimate multiplies by: points, radiators, doors and the partition walls. The
 * calculator has no plan to count from, so it takes the usual figures for each room type
 * (`ROOM_POINTS`); the studio passes what its plan actually holds (`EstimateOptions.counts`).
 */
export interface EstimateCounts {
  /** Sockets, switches and lights — one electrician's point each. */
  electricPoints: number;
  /** Water supply, sewer, floor drain, washing machine… — one plumber's point each. */
  plumbingPoints: number;
  radiators: number;
  doors: number;
  /** Square metres of partition wall to build. */
  partitionM2: number;
}

export interface EstimateOptions {
  /** The phases to price; the home state's when omitted or empty (the studio's ticked works). */
  phases?: number[] | null;
  /** Laminate or parquet, plasterboard or stretch ceiling. The defaults when omitted. */
  choices?: Partial<WorkChoices> | null;
  /** Counts that replace the room-type estimates, where the caller knows better. */
  counts?: Partial<EstimateCounts> | null;
}

/**
 * Aggregate room totals (used by both materials and labor calculation). The areas are split
 * the way the renovation team prices them: bathrooms and toilets (tiled floor to ceiling,
 * their own screed) apart from the rest; the kitchen's and the balcony's floor (tiled) apart
 * from the floors that get laminate or parquet.
 */
export function aggregateRoomTotals(input: Room[]) {
  // A studio's areas are its parts': the kitchen half tiled, the living half laid with wood.
  // Doors and windows belong to the room as a whole, so they are counted off the input.
  const rooms = expandStudios(input);
  const totalFloorM2 = sum(rooms.map((r) => r.floorM2));
  const totalWallM2 = sum(rooms.map((r) => r.wallM2));
  const totalCeilingM2 = sum(rooms.map((r) => r.ceilingM2));
  const totalPerimeterM = sum(rooms.map((r) => r.perimeterM));
  const wetRooms = rooms.filter((r) => r.isWetRoom);
  const totalWetRoomM2 = sum(wetRooms.map((r) => r.floorM2));
  const bath = rooms.filter((r) => BATH_ROOM_TYPES.includes(r.type));
  const bathFloorM2 = sum(bath.map((r) => r.floorM2));
  const bathWallM2 = sum(bath.map((r) => r.wallM2));
  const tiledFloorM2 = sum(rooms.filter((r) => TILED_FLOOR_ROOM_TYPES.includes(r.type)).map((r) => r.floorM2));
  const doorCount = input.length;
  const windowCount = input.filter(
    (r) => !['bathroom', 'toilet', 'hallway', 'storage', 'closet'].includes(r.type)
  ).length;
  return {
    totalFloorM2: round2(totalFloorM2),
    totalWallM2: round2(totalWallM2),
    totalCeilingM2: round2(totalCeilingM2),
    totalPerimeterM: round2(totalPerimeterM),
    totalWetRoomM2: round2(totalWetRoomM2),
    wetRoomCount: wetRooms.length,
    /** Bathrooms and toilets. */
    bathFloorM2: round2(bathFloorM2),
    bathWallM2: round2(bathWallM2),
    /** Every floor but the bathrooms' — what the ordinary screed covers. */
    dryFloorM2: round2(totalFloorM2 - bathFloorM2),
    /** Every wall but the bathrooms' — what is plastered and painted. */
    dryWallM2: round2(totalWallM2 - bathWallM2),
    /** The kitchen's and the balcony's floor: tiles. */
    tiledFloorM2: round2(tiledFloorM2),
    /** What is left for laminate or parquet. */
    woodFloorM2: round2(Math.max(0, totalFloorM2 - bathFloorM2 - tiledFloorM2)),
    doorCount,
    windowCount,
  };
}

/**
 * Rooms with every studio replaced by its two parts, each a room of its own type — what the
 * areas and the points are counted from. A studio saved without its parts (measured off the
 * plan) is divided the default way: the first part a third of the floor and a third of the walls.
 */
export function expandStudios(rooms: Room[]): Room[] {
  return rooms.flatMap((room) => {
    if (room.type !== 'studio') return [room];
    const [first, second] = room.split?.parts ?? DEFAULT_STUDIO_PARTS;
    const parts: RoomPart[] =
      room.parts && room.parts.length === 2
        ? room.parts
        : [
            { type: first, floorM2: round2(room.floorM2 * DEFAULT_FIRST_SHARE), wallM2: round2(room.wallM2 * DEFAULT_FIRST_SHARE), perimeterM: round2(room.perimeterM * DEFAULT_FIRST_SHARE) },
            { type: second, floorM2: round2(room.floorM2 * (1 - DEFAULT_FIRST_SHARE)), wallM2: round2(room.wallM2 * (1 - DEFAULT_FIRST_SHARE)), perimeterM: round2(room.perimeterM * (1 - DEFAULT_FIRST_SHARE)) },
          ];
    return parts.map((part, i) => ({
      ...room,
      id: `${room.id}#${i}`,
      type: part.type,
      floorM2: part.floorM2,
      ceilingM2: part.floorM2,
      wallM2: part.wallM2,
      perimeterM: part.perimeterM,
      isWetRoom: WET_ROOM_TYPES.includes(part.type),
      split: undefined,
      parts: undefined,
    }));
  });
}

/**
 * The counts a flat of these rooms usually comes to. The partition walls are what the rooms'
 * walls add up to beyond the outline of the flat — taken as a square of the same floor area —
 * shared by the two rooms either side, at the rooms' average height. A rough figure, as the
 * room-type counts are; the studio measures its walls instead (`partitionArea`).
 */
export function estimateCounts(rooms: Room[]): EstimateCounts {
  if (rooms.length === 0) return { electricPoints: 0, plumbingPoints: 0, radiators: 0, doors: 0, partitionM2: 0 };
  const t = aggregateRoomTotals(rooms);
  // Points by the type of each part of a studio; the partitions by the rooms themselves (the
  // line across a studio is not a wall).
  const parts = expandStudios(rooms);
  const points = (field: 'electrical' | 'plumbing' | 'radiators') => sum(parts.map((r) => ROOM_POINTS[r.type]?.[field] ?? 0));
  const hasWater = parts.some((r) => r.type === 'bathroom' || r.type === 'kitchen');
  const avgHeight = sum(rooms.map((r) => r.height)) / rooms.length;
  // One room has no partition, whatever its shape.
  const partitionLengthM = rooms.length < 2 ? 0 : Math.max(0, (t.totalPerimeterM - 4 * Math.sqrt(t.totalFloorM2)) / 2);
  return {
    electricPoints: points('electrical'),
    plumbingPoints: points('plumbing') + (hasWater ? WASHING_MACHINE_POINTS : 0),
    radiators: points('radiators'),
    doors: t.doorCount,
    partitionM2: round2(partitionLengthM * avgHeight),
  };
}

function resolve(rooms: Room[], homeState: HomeState, options: EstimateOptions) {
  const phases = options.phases && options.phases.length > 0 ? options.phases : HOME_STATES[homeState].includedPhases;
  const counts: EstimateCounts = { ...estimateCounts(rooms) };
  for (const [key, value] of Object.entries(options.counts ?? {})) {
    if (typeof value === 'number' && Number.isFinite(value)) counts[key as keyof EstimateCounts] = Math.max(0, value);
  }
  return { phases, counts, choices: workChoices(options.choices), totals: aggregateRoomTotals(rooms) };
}

/**
 * Calculates all material items required for the project.
 */
export function calculateMaterials(
  rooms: Room[],
  homeState: HomeState,
  book: RateBook = DEFAULT_RATE_BOOK,
  options: EstimateOptions = {}
): MaterialItem[] {
  if (rooms.length === 0) return [];
  // The technical step lets the person tick the works themselves; the home state is the default.
  const { phases, counts, choices, totals: t } = resolve(rooms, homeState, options);
  const items: MaterialItem[] = [];

  const baseFor = (rate: MaterialRate): number => {
    switch (rate.basis) {
      case 'floor':
        return t.totalFloorM2;
      case 'dry_floor':
        return t.dryFloorM2;
      case 'bath_floor':
        return t.bathFloorM2;
      case 'wall':
        return t.totalWallM2;
      case 'dry_wall':
        return t.dryWallM2;
      case 'bath_wall':
        return t.bathWallM2;
      case 'ceiling':
        return t.totalCeilingM2;
      case 'partition':
        return counts.partitionM2;
      case 'radiator':
        return counts.radiators;
      case 'electric_point':
        return counts.electricPoints;
      case 'plumbing_point':
        return counts.plumbingPoints;
      default:
        return t.totalFloorM2;
    }
  };

  for (const [key, rate] of Object.entries(book.materials)) {
    if (!phases.includes(rate.phase)) continue;
    const only = MATERIAL_CHOICE[key];
    if (only && Object.entries(only).some(([k, v]) => choices[k as keyof WorkChoices] !== v)) continue;
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
 * The labour, phase by phase, as the renovation team prices it. Each phase is one work and
 * adds its lines once, whichever home state asked for it — which is what keeps a work common
 * to several states (the laminate, the ceiling) from being counted twice.
 */
export function calculateWorkerCosts(
  rooms: Room[],
  homeState: HomeState,
  book: RateBook = DEFAULT_RATE_BOOK,
  options: EstimateOptions = {}
): WorkerCost[] {
  if (rooms.length === 0) return [];
  const { phases, counts, choices, totals: t } = resolve(rooms, homeState, options);
  const costs: WorkerCost[] = [];
  const on = (phase: number) => phases.includes(phase);

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

  // 0 — stripping out an old renovation: the ordinary floors and walls, the tiles (the
  // bathrooms' floor and walls, the kitchen's and balcony's floor), and all of it carried out.
  if (on(0)) {
    addCost('demolish_floor', t.dryFloorM2 - t.tiledFloorM2, 'm2');
    addCost('demolish_walls', t.dryWallM2, 'm2');
    addCost('demolish_tiles', t.bathFloorM2 + t.bathWallM2 + t.tiledFloorM2, 'm2');
    addCost('debris_old', t.totalFloorM2, 'm2');
  }
  if (on(1)) addCost('wall_build', counts.partitionM2, 'm2');
  if (on(2)) {
    addCost('heating_piping', counts.radiators, 'unit');
    addCost('radiator_mount', counts.radiators, 'unit');
  }
  if (on(3)) addCost('floor_screed', t.dryFloorM2, 'm2');
  if (on(4)) {
    addCost('electric_point', counts.electricPoints, 'unit');
    // Walls already plastered have to be chased open for the wiring; walls about to be
    // plastered are wired first and plastered over.
    if (!on(5)) addCost('wall_chasing', counts.electricPoints, 'unit');
  }
  if (on(5)) addCost('plaster_walls', t.dryWallM2, 'm2');
  if (on(6)) addCost('paint_walls', t.dryWallM2, 'm2');
  if (on(7)) addCost('plumbing_install', counts.plumbingPoints, 'unit');
  if (on(8)) {
    addCost('bath_screed', t.bathFloorM2, 'm2');
    addCost('bath_wall_prep', t.bathWallM2, 'm2');
  }
  if (on(9)) addCost('bath_tiling', t.bathFloorM2 + t.bathWallM2, 'm2');
  if (on(10)) addCost('kitchen_tiling', t.tiledFloorM2, 'm2');
  if (on(11)) addCost(choices.floor === 'parquet' ? 'parquet_laying' : 'laminate_laying', t.woodFloorM2, 'm2');
  if (on(12)) {
    if (choices.ceiling === 'barisol') addCost('ceiling_barisol', t.totalCeilingM2, 'm2');
    else {
      addCost('ceiling_gypsum', t.totalCeilingM2, 'm2');
      addCost('ceiling_finish', t.totalCeilingM2, 'm2');
    }
  }
  if (on(13)) addCost('door_install', counts.doors, 'unit');
  // The rubbish of a new build — an old renovation's own removal already carries everything out.
  if (on(14) && !on(0)) addCost('debris_new', t.totalFloorM2, 'm2');

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
  book: RateBook = DEFAULT_RATE_BOOK,
  options: EstimateOptions = {}
): ProjectSummary {
  const materials = calculateMaterials(rooms, homeState, book, options);
  const workerCosts = calculateWorkerCosts(rooms, homeState, book, options);

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
