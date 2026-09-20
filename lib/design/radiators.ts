/**
 * Central-heating radiators: how many sections a room needs, and what each radiator is.
 *
 * A radiator is sold by the section (a panel radiator by the 10 cm module), so the two
 * questions the plan has to answer are *how much heat does this room want* and *how many
 * sections of this product give it*. The rule is the one a Georgian heating fitter quotes
 * over the phone: about 100 W per square metre at an ordinary ceiling — more under a high
 * one, a fifth more in a corner room with two outside walls — divided by what one section
 * of the chosen radiator gives (`wattsPerSection`, 110–180 W depending on the make). The
 * room's sections are then shared out between the radiators standing in it, each kept
 * between four sections and fourteen: below four a radiator is not worth hanging, above
 * fourteen the far end runs cold and a second radiator is the answer.
 *
 * Every radiator is a product, like every fitting and every door: `radiator` is the
 * `model3dKind`, one product per design, the style's own first. The model is one *section*;
 * the 3D view repeats it (`lib/design3d/buildStructure`). A radiator with no product in the
 * catalogue stays the flat estimate of `TECHNICAL_RATES` and is drawn with the style's
 * default sections.
 *
 * Pure: plain data in, plain data out.
 */

import { pointOnEdge, polygonCentroid, roomEdges, type PlanEdge } from './planGeometry';
import { toSceneProduct, type CatalogProduct } from './matcher';
import { planEdgeWalls, edgeWallKey } from './wallPieces';
import type { FloorPlan, PlanRoom, StyleId, TechnicalPoint, Vec2 } from './types';
import type { RoomType } from '@/lib/calculator/types';

export const RADIATOR_PRODUCT_KIND = 'radiator';
export { RADIATOR_CATEGORY_SLUGS } from './catalog';

/** Heat a square metre of floor wants under a 2.7 m ceiling, watts. */
export const HEAT_W_PER_M2 = 100;
export const REFERENCE_CEILING_M = 2.7;
/** A room with two or more outside walls loses this much more. */
export const CORNER_ROOM_FACTOR = 1.2;
/** What a section gives when the product does not say. */
export const DEFAULT_WATTS_PER_SECTION = 170;
export const DEFAULT_SECTION_WIDTH_M = 0.08;
export const MIN_SECTIONS = 4;
export const MAX_SECTIONS = 14;
/** Rooms nobody heats. */
const UNHEATED: RoomType[] = ['balcony', 'storage', 'closet'];
/** An outside wall shorter than this does not make a corner room. */
const OUTSIDE_WALL_MIN_M = 1.5;

export function isHeatedRoom(room: Pick<PlanRoom, 'type'>): boolean {
  return !UNHEATED.includes(room.type);
}

/** The room's walls that have nothing but the outside behind most of their length. */
export function outsideEdges(plan: FloorPlan, room: PlanRoom): PlanEdge[] {
  const walls = planEdgeWalls(plan);
  return roomEdges(room.polygon).filter((edge) => {
    const wall = walls.get(edgeWallKey(room.id, edge.index));
    if (!wall) return false;
    const open = wall.pieces.filter((p) => !p.neighbour).reduce((sum, p) => sum + (p.to - p.from), 0);
    return open >= OUTSIDE_WALL_MIN_M && open >= edge.length * 0.5;
  });
}

/** Watts the room wants: its area, its height, and whether it stands on a corner of the flat. */
export function roomHeatDemandW(plan: FloorPlan, room: PlanRoom): number {
  if (!isHeatedRoom(room)) return 0;
  const corner = outsideEdges(plan, room).length >= 2 ? CORNER_ROOM_FACTOR : 1;
  return Math.round(room.areaM2 * HEAT_W_PER_M2 * Math.max(0.85, room.heightM / REFERENCE_CEILING_M) * corner);
}

/** Sections of a radiator giving `wattsPerSection` that cover the room's demand. */
export function sectionsForRoom(plan: FloorPlan, room: PlanRoom, wattsPerSection: number = DEFAULT_WATTS_PER_SECTION): number {
  const demand = roomHeatDemandW(plan, room);
  return demand > 0 ? Math.ceil(demand / Math.max(40, wattsPerSection)) : 0;
}

/** What a radiator product's `specs` carry. */
export interface RadiatorSpecs {
  wattsPerSection?: number;
  sectionWidthCm?: number;
}

export function radiatorSpecs(product: CatalogProduct): RadiatorSpecs {
  const specs = product.specs;
  return specs && typeof specs === 'object' && !Array.isArray(specs) ? (specs as RadiatorSpecs) : {};
}

/** The catalogue's radiators: the style's own first, then the cheapest per section. */
export function radiatorCandidates(catalog: CatalogProduct[], styleId: StyleId): CatalogProduct[] {
  const affinity = (p: CatalogProduct) => {
    const tags = Array.isArray(p.styleTags) ? (p.styleTags as string[]) : [];
    // A product made for this style alone beats one that merely also suits it.
    return tags.includes(styleId) ? (tags[0] === styleId ? 2 : 1) : 0;
  };
  return catalog.filter((p) => p.model3dKind === RADIATOR_PRODUCT_KIND && !!p.model3dUrl).sort((a, b) => affinity(b) - affinity(a) || a.pricePerUnit - b.pricePerUnit);
}

export function isRadiatorProductKind(kind: string | null | undefined): boolean {
  return kind === RADIATOR_PRODUCT_KIND;
}

export function radiatorPoints(plan: FloorPlan): TechnicalPoint[] {
  return (plan.technical?.points ?? []).filter((p) => p.kind === 'radiator');
}

/** The room a radiator heats: the one it names, else the one it stands in. */
export function radiatorRoom(plan: FloorPlan, point: TechnicalPoint): PlanRoom | null {
  return plan.rooms.find((r) => r.id === point.roomId) ?? plan.rooms.find((r) => inside(point.position, r.polygon)) ?? nearestRoom(plan, point.position);
}

/**
 * How many sections one radiator has: what the person set, else its share of what its room
 * needs — the room's sections split evenly between the radiators standing in it.
 */
export function radiatorSections(plan: FloorPlan, point: TechnicalPoint): number {
  if (point.sections && point.sections > 0) return Math.round(point.sections);
  const room = radiatorRoom(plan, point);
  if (!room) return MIN_SECTIONS + 2;
  const siblings = radiatorPoints(plan).filter((p) => radiatorRoom(plan, p)?.id === room.id);
  const total = sectionsForRoom(plan, room, point.radiator?.wattsPerSection ?? DEFAULT_WATTS_PER_SECTION);
  if (total === 0) return MIN_SECTIONS;
  return Math.max(MIN_SECTIONS, Math.min(MAX_SECTIONS, Math.ceil(total / Math.max(1, siblings.length))));
}

/** How many radiators a room wants so that none needs more than `MAX_SECTIONS`. */
export function radiatorsNeeded(plan: FloorPlan, room: PlanRoom, wattsPerSection: number = DEFAULT_WATTS_PER_SECTION): number {
  const sections = sectionsForRoom(plan, room, wattsPerSection);
  return sections === 0 ? 0 : Math.max(1, Math.ceil(sections / MAX_SECTIONS));
}

/** The radiator as `product` (or none): its per-section facts ride along, its price is per section × sections. */
export function withRadiatorProduct(plan: FloorPlan, point: TechnicalPoint, product: CatalogProduct | null): TechnicalPoint {
  if (!product) {
    const { product: _product, radiator: _radiator, ...rest } = point;
    return rest;
  }
  const specs = radiatorSpecs(product);
  const radiator = {
    wattsPerSection: specs.wattsPerSection ?? DEFAULT_WATTS_PER_SECTION,
    sectionWidthM: (specs.sectionWidthCm ?? product.widthCm ?? DEFAULT_SECTION_WIDTH_M * 100) / 100,
    heightM: (product.heightCm ?? 60) / 100,
    depthM: (product.depthCm ?? 10) / 100,
  };
  const next: TechnicalPoint = { ...point, radiator };
  return { ...next, product: toSceneProduct(product, radiatorSections(plan, next)) };
}

/**
 * Every radiator without a product takes the catalogue's best for the style, and every one
 * with a product is priced again for the sections it has now (a room that grew, a second
 * radiator added beside it). The same plan object comes back when nothing changed.
 */
export function withRadiatorProducts(plan: FloorPlan, catalog: CatalogProduct[], styleId: StyleId): FloorPlan {
  const points = plan.technical?.points ?? [];
  if (!points.some((p) => p.kind === 'radiator')) return plan;
  const candidates = radiatorCandidates(catalog, styleId);
  let changed = false;
  // Products first, so the sections below are counted with every radiator's own watts.
  const withProducts = points.map((point) => {
    if (point.kind !== 'radiator' || point.product || candidates.length === 0) return point;
    changed = true;
    return withRadiatorProduct(plan, point, candidates[0]);
  });
  const staged: FloorPlan = { ...plan, technical: { ...plan.technical, points: withProducts } };
  const priced = withProducts.map((point) => {
    if (point.kind !== 'radiator' || !point.product) return point;
    const qty = radiatorSections(staged, point);
    if (point.product.qty === qty) return point;
    changed = true;
    return { ...point, product: { ...point.product, qty, totalPrice: Math.round(point.product.pricePerUnit * qty * 100) / 100 } };
  });
  return changed ? { ...plan, technical: { ...plan.technical, points: priced } } : plan;
}

/**
 * Radiators for the rooms that have none: under the windows of the outside walls, the way
 * they are hung — as many as the room's sections call for, never more than it has windows
 * (a room without a window gets one on its longest outside wall, or its longest wall).
 *
 * They come back as the person's own (`origin: 'user'`), not as the app's suggestions: this
 * runs when the button is pressed, and a radiator nobody asked for should not appear at
 * all — while one that was asked for has to be in the budget even in a finished home, where
 * only what the person added is new work.
 */
export function suggestRadiators(plan: FloorPlan, nextId: () => string): TechnicalPoint[] {
  const existing = radiatorPoints(plan);
  const out: TechnicalPoint[] = [];
  for (const room of plan.rooms) {
    if (!isHeatedRoom(room) || room.areaM2 < 3.5) continue;
    if (existing.some((p) => radiatorRoom(plan, p)?.id === room.id)) continue;
    const wanted = radiatorsNeeded(plan, room);
    if (wanted === 0) continue;
    const edges = roomEdges(room.polygon);
    const windows = room.openings.filter((o) => o.kind === 'window').sort((a, b) => b.widthM - a.widthM);
    const spots: Array<{ edge: PlanEdge; t: number }> = [];
    for (const window of windows.slice(0, Math.max(1, wanted))) {
      const edge = edges.find((e) => e.index === window.wallIndex);
      if (edge) spots.push({ edge, t: window.t });
    }
    if (spots.length === 0) {
      const outside = outsideEdges(plan, room);
      const pool = (outside.length > 0 ? outside : edges).filter((e) => !room.openings.some((o) => o.wallIndex === e.index && o.kind !== 'window'));
      const edge = [...(pool.length > 0 ? pool : edges)].sort((a, b) => b.length - a.length)[0];
      if (edge) spots.push({ edge, t: 0.5 });
    }
    for (const spot of spots) {
      const at = pointOnEdge(spot.edge, spot.t);
      out.push({
        id: nextId(),
        kind: 'radiator',
        roomId: room.id,
        position: { x: round2(at.x + spot.edge.inward.x * 0.08), z: round2(at.z + spot.edge.inward.z * 0.08) },
        elevationM: 0.12,
        origin: 'user',
      });
    }
  }
  return out;
}

/** Where a radiator hangs: the wall of its room nearest to its point, and the spot along it. */
export function radiatorWallSpot(plan: FloorPlan, point: TechnicalPoint): { room: PlanRoom; edge: PlanEdge; s: number } | null {
  const room = radiatorRoom(plan, point);
  if (!room) return null;
  let best: { edge: PlanEdge; s: number; distance: number } | null = null;
  for (const edge of roomEdges(room.polygon)) {
    const s = Math.max(0, Math.min(edge.length, (point.position.x - edge.a.x) * edge.dir.x + (point.position.z - edge.a.z) * edge.dir.z));
    const distance = Math.hypot(point.position.x - (edge.a.x + edge.dir.x * s), point.position.z - (edge.a.z + edge.dir.z * s));
    if (!best || distance < best.distance) best = { edge, s, distance };
  }
  return best ? { room, edge: best.edge, s: best.s } : null;
}

function inside(point: Vec2, polygon: Vec2[]): boolean {
  let within = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.z > point.z !== b.z > point.z && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x) within = !within;
  }
  return within;
}

function nearestRoom(plan: FloorPlan, point: Vec2): PlanRoom | null {
  let best: { room: PlanRoom; distance: number } | null = null;
  for (const room of plan.rooms) {
    const c = polygonCentroid(room.polygon);
    const distance = Math.hypot(c.x - point.x, c.z - point.z);
    if (!best || distance < best.distance) best = { room, distance };
  }
  return best && best.distance < 8 ? best.room : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
