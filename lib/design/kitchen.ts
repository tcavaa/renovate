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
 * price is replaced by the measured one: the kitchen maker's price per square metre of façade
 * for the material it is made in (`kitchenMaterial` — a product of theirs sold by the m², in
 * the `kitchen-custom` category, so the order goes to them), or, with no material chosen, the
 * estimate at `KITCHEN_RATES` (per m² of façade and per metre of worktop). A material with a 3D
 * model of its own is drawn in the piece's place (`drawnModelUrl`). A person who would rather
 * keep a stock price can, product by product (`custom: false` on the item).
 *
 * Pure arithmetic over the placed items; no React, no THREE.
 */

import { toSceneProduct, type CatalogProduct } from './matcher';
import { KITCHEN_MATERIAL_CATEGORY, isKitchenMaterial } from './catalog';
import type { PlacedItem, PlanRoom, SceneProduct, StyleId } from './types';

export { KITCHEN_MATERIAL_CATEGORY, isKitchenMaterial };

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
  /** What the measurement comes to: the material's price per m² of façade, else `KITCHEN_RATES`. */
  totalGel: number;
}

/** The materials a made-to-measure kitchen can be made in — the maker's, sold by the m² — the style's own first, then the cheapest. */
export function kitchenMaterialCandidates(catalog: CatalogProduct[], styleId: StyleId): CatalogProduct[] {
  const affinity = (p: CatalogProduct) => {
    const tags = Array.isArray(p.styleTags) ? (p.styleTags as string[]) : [];
    return tags.includes(styleId) ? (tags[0] === styleId ? 2 : 1) : 0;
  };
  return catalog.filter(isKitchenMaterial).sort((a, b) => affinity(b) - affinity(a) || a.pricePerUnit - b.pricePerUnit);
}

/** The façade a made-to-measure piece comes to — what its material is bought by. */
export function kitchenFacadeM2(item: PlacedItem): number {
  const lengthM = round2(item.size.width);
  const island = item.slot === 'kitchen_island';
  const lowerM2 = round2(lengthM * Math.min(item.size.height, LOWER_UNIT_HEIGHT_M) * (island ? 2 : 1));
  const upperM2 = island ? 0 : round2(lengthM * UPPER_RUN_SHARE * UPPER_UNIT_HEIGHT_M);
  return round2(lowerM2 + upperM2);
}

/**
 * The piece made in `product` (or in nothing chosen, an estimate again), bought by its façade.
 * The material's own model, when it has one, is what the piece is drawn as — unless it is a
 * model of the other kind (a run's on an island): that one keeps the piece's own model.
 */
export function withKitchenMaterial(item: PlacedItem, product: CatalogProduct | null): PlacedItem {
  if (!product) {
    const { kitchenMaterial: _dropped, ...rest } = item;
    return rest;
  }
  const material = toSceneProduct(product, kitchenFacadeM2(item));
  if (product.model3dKind && product.model3dKind !== item.slot) material.model3dUrl = null;
  return { ...item, kitchenMaterial: material };
}

/** A made-to-measure piece's material, when it has one that counts (the maker's, sold by the m²). */
export function kitchenMaterialOf(item: PlacedItem): SceneProduct | null {
  const material = isCustomKitchenItem(item) ? item.kitchenMaterial : null;
  return material && isKitchenMaterial(material) ? material : null;
}

/** The model a placed piece is drawn as: a made-to-measure kitchen's material's own, when it has one; else the piece's product's. */
export function drawnModelUrl(item: PlacedItem): string | null {
  return kitchenMaterialOf(item)?.model3dUrl || item.product?.model3dUrl || null;
}

/**
 * What would change a made-to-measure piece's material line: a piece added or removed, a
 * material chosen, a run stretched or shortened. Empty with no such piece; the studio watches
 * it to call `ensureKitchenMaterials`.
 */
export function kitchenMaterialSignature(items: PlacedItem[]): string {
  return items
    .filter(isCustomKitchenItem)
    .map((i) => `${i.id}:${i.kitchenMaterial?.productId ?? ''}:${i.kitchenMaterial?.qty ?? ''}:${i.kitchenMaterial?.model3dUrl ?? ''}:${i.size.width}:${i.size.height}`)
    .join('|');
}

/**
 * Every made-to-measure piece is made in one of the maker's materials, as the catalogue has it
 * now: one without a material takes the style's (or the cheapest); one whose material is no
 * longer a material (sold by the piece now, moved out of the category) takes that too, or none;
 * one whose material is listed is bought again for the façade it has now and takes what the
 * catalogue says of it — its price, its photo, a 3D model uploaded since. A material the
 * catalogue does not list any more is kept, re-measured. The same array comes back when nothing
 * changed.
 */
export function withKitchenMaterials(items: PlacedItem[], catalog: CatalogProduct[], styleId: StyleId): PlacedItem[] {
  if (!items.some(isCustomKitchenItem)) return items;
  const candidates = kitchenMaterialCandidates(catalog, styleId);
  const best = candidates[0] ?? null;
  const materials = new Map(candidates.map((p) => [p.id, p]));
  const listed = new Set(catalog.map((p) => p.id));
  let changed = false;
  const next = items.map((item) => {
    if (!isCustomKitchenItem(item)) return item;
    const current = item.kitchenMaterial;
    if (current && !listed.has(current.productId)) {
      const qty = kitchenFacadeM2(item);
      if (current.qty === qty) return item;
      changed = true;
      return { ...item, kitchenMaterial: { ...current, qty, totalPrice: round2(current.pricePerUnit * qty) } };
    }
    const product = (current && materials.get(current.productId)) || best;
    if (!product) {
      if (!current) return item;
      changed = true;
      return withKitchenMaterial(item, null);
    }
    const made = withKitchenMaterial(item, product);
    if (current && sameMaterial(current, made.kitchenMaterial!)) return item;
    changed = true;
    return made;
  });
  return changed ? next : items;
}

function sameMaterial(a: SceneProduct, b: SceneProduct): boolean {
  return a.productId === b.productId && a.qty === b.qty && a.pricePerUnit === b.pricePerUnit && a.totalPrice === b.totalPrice && a.model3dUrl === b.model3dUrl && a.imageUrl === b.imageUrl && a.nameKa === b.nameKa;
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
  // The maker's price for the material, all in, per m² of façade; else the market's estimate.
  const material = kitchenMaterialOf(item);
  const totalGel = material
    ? round2(totalM2 * material.pricePerUnit)
    : round2(lowerM2 * KITCHEN_RATES.lowerPerM2 + upperM2 * KITCHEN_RATES.upperPerM2 + worktopM * KITCHEN_RATES.worktopPerM + lengthM * KITCHEN_RATES.fittingPerM);
  return { itemId: item.id, roomId: item.roomId, roomName, slot, lengthM, lowerM2, upperM2, worktopM, totalM2, totalGel };
}

/** Every made-to-measure kitchen piece in the scene, measured. */
/** What a placed piece is bought as: a made-to-measure kitchen in a material is the maker's product; anything else its own. */
export function boughtProduct(item: PlacedItem): SceneProduct | null {
  return kitchenMaterialOf(item) ?? item.product ?? null;
}

/** What a placed piece comes to as the budget counts it: a made-to-measure kitchen by its measurement, anything else its product. */
export function itemCostGel(item: PlacedItem): number {
  return isCustomKitchenItem(item) ? measureKitchenItem(item).totalGel : (item.product?.totalPrice ?? 0);
}

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
