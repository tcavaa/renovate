/**
 * Kitchen furniture is made to measure, so it is counted, not bought off a shelf.
 *
 * Every other product in the studio is a SKU with a price: a sofa is that sofa. A kitchen
 * is not — it is built for the flat it stands in, and a Georgian joiner quotes it by the
 * square metre of *façade*: the fronts of the units, lower and upper, measured as they face
 * the room. So what the plan has to hand the budget is a measurement, not a product price:
 * the running metres of the run, the façade area of the lower units, of the upper ones, of
 * the worktop, and the same per island.
 *
 * The model placed in 3D is still a real catalogue product (that is what is drawn), but its
 * price is replaced by the measured quote — `KITCHEN_RATES` per square metre of façade,
 * per metre of worktop — and the budget says the kitchen is made to order. A person who
 * would rather keep a stock price can, product by product (`custom: false` on the item).
 *
 * Pure arithmetic over the placed items; no React, no THREE.
 */

import type { PlacedItem, PlanRoom } from './types';

/** The archetypes that are made to measure. */
export const CUSTOM_KITCHEN_SLOTS = ['kitchen_run', 'kitchen_island'] as const;

export type KitchenSlot = (typeof CUSTOM_KITCHEN_SLOTS)[number];

export function isCustomKitchenItem(item: Pick<PlacedItem, 'slot' | 'custom'>): boolean {
  return item.custom !== false && (CUSTOM_KITCHEN_SLOTS as readonly string[]).includes(item.slot);
}

/**
 * What a made-to-measure kitchen costs, in GEL. Georgian joiners quote the carcases and
 * fronts by the square metre of façade, the worktop by the running metre, and charge the
 * fitting on top; the appliances and the sink are separate products the person places
 * themselves. Estimates for the Tbilisi market, marked as estimates in the budget.
 */
export const KITCHEN_RATES = {
  /** Lower units: carcase, front, drawer runners, hinges — per m² of façade. */
  lowerPerM2: 620,
  /** Upper units — per m² of façade. Lighter than the lower ones: no drawers, no worktop. */
  upperPerM2: 480,
  /** Worktop — per running metre, a middling laminate; stone is dearer and is chosen as a finish. */
  worktopPerM: 260,
  /** Fitting and assembly — per running metre of run. */
  fittingPerM: 90,
} as const;

/** Where the upper units stop, and where the worktop sits: the usual kitchen heights. */
export const LOWER_UNIT_HEIGHT_M = 0.9;
export const UPPER_UNIT_HEIGHT_M = 0.72;
/** The upper units run above the worktop over this much of the run's length (the hob and the window break them). */
export const UPPER_RUN_SHARE = 0.7;

export interface KitchenMeasure {
  itemId: string;
  roomId: string;
  roomName?: string;
  slot: KitchenSlot;
  /** Running metres of the run (an island is measured round the two long sides). */
  lengthM: number;
  /** Façade of the units under the worktop, m². */
  lowerM2: number;
  /** Façade of the units above it, m² — zero for an island. */
  upperM2: number;
  /** Worktop, running metres. */
  worktopM: number;
  /** Every façade together: what a joiner's quote is measured in. */
  totalM2: number;
  /** What the measurement comes to at `KITCHEN_RATES`. */
  totalGel: number;
}

/** The measurement of one made-to-measure piece. */
export function measureKitchenItem(item: PlacedItem, roomName?: string): KitchenMeasure {
  const slot = item.slot as KitchenSlot;
  const island = slot === 'kitchen_island';
  // A run is measured along its front; an island is worked from both long sides.
  const lengthM = round2(item.size.width);
  const lowerM2 = round2(lengthM * Math.min(item.size.height, LOWER_UNIT_HEIGHT_M) * (island ? 2 : 1));
  const upperM2 = island ? 0 : round2(lengthM * UPPER_RUN_SHARE * UPPER_UNIT_HEIGHT_M);
  const worktopM = lengthM;
  const totalM2 = round2(lowerM2 + upperM2);
  const totalGel = round2(lowerM2 * KITCHEN_RATES.lowerPerM2 + upperM2 * KITCHEN_RATES.upperPerM2 + worktopM * KITCHEN_RATES.worktopPerM + lengthM * KITCHEN_RATES.fittingPerM);
  return { itemId: item.id, roomId: item.roomId, roomName, slot, lengthM, lowerM2, upperM2, worktopM, totalM2, totalGel };
}

/** Every made-to-measure kitchen piece in the scene, measured. */
export function measureKitchens(items: PlacedItem[], rooms: PlanRoom[] = []): KitchenMeasure[] {
  const nameOf = new Map(rooms.map((r) => [r.id, r.name]));
  return items.filter(isCustomKitchenItem).map((item) => measureKitchenItem(item, nameOf.get(item.roomId)));
}

export interface KitchenTotals {
  lengthM: number;
  lowerM2: number;
  upperM2: number;
  worktopM: number;
  totalM2: number;
  totalGel: number;
}

export function kitchenTotals(measures: KitchenMeasure[]): KitchenTotals {
  return measures.reduce<KitchenTotals>(
    (sum, m) => ({
      lengthM: round2(sum.lengthM + m.lengthM),
      lowerM2: round2(sum.lowerM2 + m.lowerM2),
      upperM2: round2(sum.upperM2 + m.upperM2),
      worktopM: round2(sum.worktopM + m.worktopM),
      totalM2: round2(sum.totalM2 + m.totalM2),
      totalGel: round2(sum.totalGel + m.totalGel),
    }),
    { lengthM: 0, lowerM2: 0, upperM2: 0, worktopM: 0, totalM2: 0, totalGel: 0 }
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
