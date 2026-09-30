/**
 * The plan's technical points that are equipment somebody buys: the electrical panel, the
 * boiler (a gas combi boiler or an electric water heater), the air conditioner, the extractor —
 * a cooker hood in a kitchen, a fan in the wall of a bathroom — and the floor drain. Each is a
 * catalogue product, one per point, the way a radiator is (`lib/design/radiators`): the budget
 * prices it as a real line that its shop is sent, the 3D view draws its model on its wall
 * (`buildEquipment`), and the point with no product in the catalogue stays the flat estimate of
 * `TECHNICAL_RATES`. The pipes, the gas and the heating pipe are the fitters' work, not
 * products, and stay estimates.
 *
 * Pure: plain data in, plain data out.
 */

import { toSceneProduct, type CatalogProduct } from './matcher';
import { radiatorRoom } from './radiators';
import { COOKER_HOOD_ELEVATION_M, HOOD_ROOM_TYPES, TECHNICAL_KINDS } from './technical';
import type { FloorPlan, Opening, PlanRoom, StyleId, TechnicalKind, TechnicalPoint } from './types';
import type { RoomType } from '@/lib/calculator/types';

/** The technical kinds that are a product. */
export const EQUIPMENT_KINDS = ['electrical_panel', 'boiler', 'ac_unit', 'extractor', 'floor_drain'] as const satisfies readonly TechnicalKind[];
export type EquipmentKind = (typeof EQUIPMENT_KINDS)[number];

/** The product kinds (`model3dKind`) they are bought as: an extractor is two, by its room. */
export const EQUIPMENT_PRODUCT_KINDS = ['electrical_panel', 'boiler', 'ac_unit', 'cooker_hood', 'bathroom_fan', 'floor_drain'] as const;
export type EquipmentProductKind = (typeof EQUIPMENT_PRODUCT_KINDS)[number];

export { COOKER_HOOD_ELEVATION_M };

export function isEquipmentKind(kind: TechnicalKind): kind is EquipmentKind {
  return (EQUIPMENT_KINDS as readonly string[]).includes(kind);
}

export function isEquipmentProductKind(kind: string | null | undefined): kind is EquipmentProductKind {
  return !!kind && (EQUIPMENT_PRODUCT_KINDS as readonly string[]).includes(kind);
}

/** What a point of this kind, in a room of this type, is bought as; null for a point that is no product. */
export function equipmentProductKind(kind: TechnicalKind, roomType?: RoomType | null): EquipmentProductKind | null {
  switch (kind) {
    case 'extractor':
      return roomType && HOOD_ROOM_TYPES.includes(roomType) ? 'cooker_hood' : 'bathroom_fan';
    case 'electrical_panel':
    case 'boiler':
    case 'ac_unit':
    case 'floor_drain':
      return kind;
    default:
      return null;
  }
}

/** The product kind a point on this plan is bought as — its room decides an extractor's. */
export function pointProductKind(plan: FloorPlan, point: TechnicalPoint): EquipmentProductKind | null {
  if (!isEquipmentKind(point.kind)) return null;
  return equipmentProductKind(point.kind, radiatorRoom(plan, point)?.type ?? null);
}

/** What an equipment product's `specs` carry: its place in the list, and the floor an air conditioner cools. */
export interface EquipmentSpecs {
  /** Lower first: the product a point takes when nothing says otherwise (a combi boiler before a water heater). */
  rank?: number;
  /** An air conditioner: the floor area it is sized for, m². */
  coverM2?: number;
}

export function equipmentSpecs(product: Pick<CatalogProduct, 'specs'>): EquipmentSpecs {
  const specs = product.specs;
  return specs && typeof specs === 'object' && !Array.isArray(specs) ? (specs as EquipmentSpecs) : {};
}

/**
 * The catalogue's products for a point, best first: the style's own; for an air conditioner
 * the smallest that covers its room (a room bigger than any unit takes the biggest); then the
 * catalogue's rank, then the cheapest. Only products with a model — the studio draws them.
 */
export function equipmentCandidates(productKind: EquipmentProductKind, catalog: CatalogProduct[], styleId: StyleId, room?: Pick<PlanRoom, 'areaM2'> | null): CatalogProduct[] {
  const affinity = (p: CatalogProduct) => {
    const tags = Array.isArray(p.styleTags) ? (p.styleTags as string[]) : [];
    return tags.includes(styleId) ? (tags[0] === styleId ? 2 : 1) : 0;
  };
  // An air conditioner that cools the room first, the smallest of those; else the largest.
  const fit = (p: CatalogProduct): [number, number] => {
    if (productKind !== 'ac_unit' || !room) return [0, 0];
    const cover = equipmentSpecs(p).coverM2;
    if (cover == null) return [0, Number.MAX_SAFE_INTEGER];
    return cover >= room.areaM2 ? [0, cover] : [1, -cover];
  };
  const rank = (p: CatalogProduct) => equipmentSpecs(p).rank ?? 99;
  return catalog
    .filter((p) => p.model3dKind === productKind && !!p.model3dUrl)
    .sort((a, b) => {
      const [fa, sa] = fit(a);
      const [fb, sb] = fit(b);
      return affinity(b) - affinity(a) || fa - fb || sa - sb || rank(a) - rank(b) || a.pricePerUnit - b.pricePerUnit;
    });
}

/**
 * The point with `product` as its equipment (or none): one piece, priced as one, drawn at the
 * product's size. A cooker hood hung at the height the extractor of a bathroom takes (or none)
 * comes down to the hood's — a hood two metres up the wall would be in nobody's reach.
 */
export function withEquipmentProduct(point: TechnicalPoint, product: CatalogProduct | null): TechnicalPoint {
  const { product: _dropped, sizeM: _size, ...rest } = point;
  if (!product) return rest;
  const sizeM = product.widthCm && product.heightCm && product.depthCm ? { width: product.widthCm / 100, depth: product.depthCm / 100, height: product.heightCm / 100 } : null;
  const next: TechnicalPoint = { ...rest, product: toSceneProduct(product, 1), ...(sizeM ? { sizeM } : {}) };
  if (product.model3dKind === 'cooker_hood' && (point.elevationM == null || point.elevationM === TECHNICAL_KINDS.extractor.defaultElevationM)) next.elevationM = COOKER_HOOD_ELEVATION_M;
  return next;
}

/** How far a wall-hung piece keeps from the edge of a window or a door beside it, and from a wall's end. */
const OPENING_CLEARANCE_M = 0.05;
const WALL_END_MARGIN_M = 0.02;

/**
 * Where along its wall a wall-hung piece hangs so that it covers no window and no door: the
 * point's own spot when that is clear, else the nearest clear spot on the same wall, else the
 * point's own — and never past the wall's ends. `s` and the answer are metres along the edge
 * from its start; the piece spans `widthM` about it and `bottomM`..`bottomM + heightM` up the
 * wall. A window it clears in height (an air conditioner over the window head) is no obstacle.
 * The 3D view hangs the piece there (`buildEquipment`); the plan's point stays where it was put —
 * an extractor placed at a window's middle before it became a cooker hood would otherwise hang
 * a hood over the glass.
 */
export function clearOfOpenings(openings: Opening[], edge: { index: number; length: number }, s: number, widthM: number, bottomM: number, heightM: number): number {
  const half = Math.min(widthM / 2 + WALL_END_MARGIN_M, edge.length / 2);
  const lo = half;
  const hi = edge.length - half;
  const clamp = (value: number) => Math.max(lo, Math.min(hi, value));
  // Where the piece's centre may not be: each opening on this wall that it would overlap in height, widened by half the piece.
  const blocked = openings
    .filter((o) => o.wallIndex === edge.index && o.sillM < bottomM + heightM && o.sillM + o.heightM > bottomM)
    .map((o) => {
      const centre = o.t * edge.length;
      const reach = o.widthM / 2 + OPENING_CLEARANCE_M + widthM / 2;
      return [centre - reach, centre + reach] as const;
    });
  const free = (value: number) => blocked.every(([a, b]) => value <= a || value >= b);
  const at = clamp(s);
  if (free(at)) return at;
  const candidates = blocked.flatMap(([a, b]) => [a, b]).map(clamp).filter(free);
  if (candidates.length === 0) return at;
  return candidates.reduce((best, c) => (Math.abs(c - at) < Math.abs(best - at) ? c : best));
}

/**
 * What would change the products the equipment points want: a point added, removed, re-kinded,
 * moved to another room or given a product, and a room retyped or resized (an extractor in a
 * room become a kitchen is a hood; a bigger room, a bigger air conditioner). Empty with no
 * equipment. The pages watch it to call `ensureEquipmentProducts`.
 */
export function equipmentSignature(plan: FloorPlan | null): string {
  const points = (plan?.technical?.points ?? []).filter((p) => isEquipmentKind(p.kind));
  if (!plan || points.length === 0) return '';
  return `${points.map((p) => `${p.id}:${p.kind}:${p.roomId ?? ''}:${p.product?.productId ?? ''}`).join('|')}#${plan.rooms.map((r) => `${r.id}:${r.type}:${r.areaM2}`).join(',')}`;
}

/**
 * Every equipment point without a product takes the catalogue's best for it, and one whose
 * product is of another kind than its room calls for now — an extractor moved from the
 * bathroom into the kitchen — takes the right one. The same plan object comes back when
 * nothing changed.
 */
export function withEquipmentProducts(plan: FloorPlan, catalog: CatalogProduct[], styleId: StyleId): FloorPlan {
  const points = plan.technical?.points ?? [];
  if (catalog.length === 0 || !points.some((p) => isEquipmentKind(p.kind))) return plan;
  const kindOf = new Map(catalog.map((p) => [p.id, p.model3dKind]));
  let changed = false;
  const next = points.map((point) => {
    if (!isEquipmentKind(point.kind)) return point;
    const room = radiatorRoom(plan, point);
    const wanted = equipmentProductKind(point.kind, room?.type ?? null);
    if (!wanted) return point;
    // A product the catalogue does not list any more is kept as it is: the save refuses it, not this.
    if (point.product && (!kindOf.has(point.product.productId) || kindOf.get(point.product.productId) === wanted)) return point;
    const best = equipmentCandidates(wanted, catalog, styleId, room)[0];
    if (!best) return point;
    changed = true;
    return withEquipmentProduct(point, best);
  });
  return changed ? { ...plan, technical: { ...plan.technical, points: next } } : plan;
}
