/**
 * Sockets, switches and lights — planned after the furniture, the way an electrician does it.
 *
 * The relationship the plan has to make clear is furniture → sockets → lights → switches:
 * two sockets either side of the bed at bedside height, the television's sockets behind the
 * television, the kitchen's above the worktop, a switch beside every door on the handle
 * side, one main light per room. `suggestElectrical` places all of that from the furniture
 * that is already standing; every point is then a thing the person can drag, re-height or
 * delete, and the tray offers the rest (indirect strips, wall lights, furniture lighting).
 *
 * Heights follow common practice and are always editable:
 *
 *   sockets 45 cm · bedside 60 cm (50–70) · kitchen worktop 90 cm, its sockets 115 cm
 *   (110–120) · high sockets 170 cm · switches 105 cm · TV 110 cm
 *
 * Pure geometry over the plan and the placed items; no React, no THREE.
 */

import { pointOnEdge, roomEdges, type PlanEdge } from './planGeometry';
import { closestOnSegment } from './walls';
import { toSceneProduct, type CatalogProduct } from './matcher';
import type { ElectricalKind, ElectricalPoint, FloorPlan, LightCategory, PlacedItem, PlanRoom, StyleId, Vec2 } from './types';

export interface ElectricalKindInfo {
  /** On a wall, on the ceiling, or anywhere on the plan (a strip under a bed). */
  placement: 'wall' | 'ceiling' | 'any';
  defaultElevationM: number;
  light: boolean;
  category?: LightCategory;
  /** Default outlets per plate. */
  count?: number;
}

export const KITCHEN_WORKTOP_M = 0.9;
export const BEDSIDE_SOCKET_M = 0.6;
export const SOCKET_M = 0.45;
export const HIGH_SOCKET_M = 1.7;
export const KITCHEN_SOCKET_M = 1.15;
export const SWITCH_M = 1.05;
export const TV_SOCKET_M = 1.1;

export const ELECTRICAL_KINDS: Record<ElectricalKind, ElectricalKindInfo> = {
  socket: { placement: 'wall', defaultElevationM: SOCKET_M, light: false, count: 1 },
  socket_double: { placement: 'wall', defaultElevationM: SOCKET_M, light: false, count: 2 },
  socket_high: { placement: 'wall', defaultElevationM: HIGH_SOCKET_M, light: false, count: 1 },
  socket_kitchen: { placement: 'wall', defaultElevationM: KITCHEN_SOCKET_M, light: false, count: 2 },
  switch: { placement: 'wall', defaultElevationM: SWITCH_M, light: false },
  tv: { placement: 'wall', defaultElevationM: TV_SOCKET_M, light: false },
  internet: { placement: 'wall', defaultElevationM: SOCKET_M, light: false },
  light_ceiling: { placement: 'ceiling', defaultElevationM: 0, light: true, category: 'primary' },
  light_wall: { placement: 'wall', defaultElevationM: 1.8, light: true, category: 'secondary' },
  light_spot: { placement: 'ceiling', defaultElevationM: 0, light: true, category: 'secondary' },
  light_strip: { placement: 'any', defaultElevationM: 0.3, light: true, category: 'indirect' },
  light_furniture: { placement: 'wall', defaultElevationM: 1.5, light: true, category: 'furniture' },
};

export const ELECTRICAL_KIND_LIST = Object.keys(ELECTRICAL_KINDS) as ElectricalKind[];
export const LIGHT_CATEGORIES: LightCategory[] = ['primary', 'secondary', 'furniture', 'bedside', 'indirect', 'decorative'];

export function isLight(kind: ElectricalKind): boolean {
  return ELECTRICAL_KINDS[kind].light;
}

/** The wall spot nearest to a world point: the edge, how far along it, and the point itself. */
export function wallSpotNear(room: PlanRoom, point: Vec2, maxDistance = Infinity): { wallIndex: number; t: number; position: Vec2; edge: PlanEdge } | null {
  let best: { wallIndex: number; t: number; position: Vec2; edge: PlanEdge; distance: number } | null = null;
  for (const edge of roomEdges(room.polygon)) {
    const hit = closestOnSegment(point, edge.a, edge.b);
    if (hit.distance <= maxDistance && (!best || hit.distance < best.distance)) {
      best = { wallIndex: edge.index, t: hit.t, position: hit.point, edge, distance: hit.distance };
    }
  }
  return best;
}

/** A point on a wall, a little inside the room so it is not buried in the plaster. */
function onWall(room: PlanRoom, edge: PlanEdge, t: number): Vec2 {
  const p = pointOnEdge(edge, Math.max(0.02, Math.min(0.98, t)));
  return { x: p.x + edge.inward.x * 0.01, z: p.z + edge.inward.z * 0.01 };
}

interface Builder {
  points: ElectricalPoint[];
  next: () => string;
}

function make(b: Builder, room: PlanRoom, kind: ElectricalKind, position: Vec2, extra: Partial<ElectricalPoint> = {}): ElectricalPoint {
  const info = ELECTRICAL_KINDS[kind];
  const point: ElectricalPoint = {
    id: b.next(),
    roomId: room.id,
    kind,
    position,
    elevationM: info.placement === 'ceiling' ? room.heightM : info.defaultElevationM,
    wallIndex: null,
    t: null,
    ...(info.count ? { count: info.count } : {}),
    ...(info.light ? { on: true, category: info.category } : {}),
    origin: 'generated',
    ...extra,
  };
  b.points.push(point);
  return point;
}

function makeOnWall(b: Builder, room: PlanRoom, kind: ElectricalKind, edge: PlanEdge, t: number, extra: Partial<ElectricalPoint> = {}): ElectricalPoint | null {
  // Not in a doorway or a window at that height.
  const height = extra.elevationM ?? ELECTRICAL_KINDS[kind].defaultElevationM;
  const blocked = room.openings.some((o) => {
    if (o.wallIndex !== edge.index) return false;
    const half = (o.widthM / 2 + 0.08) / edge.length;
    const inSpan = t > o.t - half && t < o.t + half;
    const inHeight = height >= o.sillM - 0.05 && height <= o.sillM + o.heightM + 0.05;
    return inSpan && inHeight;
  });
  if (blocked) return null;
  return make(b, room, kind, onWall(room, edge, t), { wallIndex: edge.index, t: Math.max(0.02, Math.min(0.98, t)), ...extra });
}

/** The wall an item stands against: the edge nearest to the middle of its back. */
function backWall(room: PlanRoom, item: PlacedItem): { edge: PlanEdge; t: number } | null {
  const forward = { x: Math.sin(item.rotation), z: Math.cos(item.rotation) };
  const back = { x: item.position.x - forward.x * (item.size.depth / 2), z: item.position.z - forward.z * (item.size.depth / 2) };
  const spot = wallSpotNear(room, back, 0.45);
  return spot ? { edge: spot.edge, t: spot.t } : null;
}

/** A point along an item's back wall, `lateral` metres to the item's right. */
function alongBack(item: PlacedItem, wall: { edge: PlanEdge; t: number }, lateral: number): number {
  const forward = { x: Math.sin(item.rotation), z: Math.cos(item.rotation) };
  const right = { x: forward.z, z: -forward.x };
  const sign = right.x * wall.edge.dir.x + right.z * wall.edge.dir.z >= 0 ? 1 : -1;
  return wall.t + (sign * lateral) / wall.edge.length;
}

/**
 * Sockets, switches and lights for every room, from the furniture standing in it. Rooms that
 * already carry points the person made keep them; only rooms without any are filled in.
 */
export function suggestElectrical(plan: FloorPlan, items: PlacedItem[], existing: ElectricalPoint[] = []): ElectricalPoint[] {
  let counter = existing.length;
  const b: Builder = { points: [], next: () => `e${Date.now().toString(36)}-${counter++}` };
  const kept = existing.filter((p) => p.origin !== 'generated');
  const skip = new Set(kept.map((p) => p.roomId));

  for (const room of plan.rooms) {
    if (skip.has(room.id)) continue;
    const edges = roomEdges(room.polygon);
    if (edges.length === 0) continue;
    const here = items.filter((i) => i.roomId === room.id);
    const centre = { x: room.polygon.reduce((s, p) => s + p.x, 0) / room.polygon.length, z: room.polygon.reduce((s, p) => s + p.z, 0) / room.polygon.length };

    // Every room: a main light and a switch on the handle side of each door.
    make(b, room, 'light_ceiling', centre);
    for (const door of room.openings.filter((o) => o.kind !== 'window')) {
      const edge = edges.find((e) => e.index === door.wallIndex);
      if (!edge) continue;
      const side = door.hinge === 'right' ? -1 : 1;
      const t = door.t + (side * (door.widthM / 2 + 0.2)) / edge.length;
      if (t <= 0.02 || t >= 0.98) makeOnWall(b, room, 'switch', edge, door.t - (side * (door.widthM / 2 + 0.2)) / edge.length);
      else makeOnWall(b, room, 'switch', edge, t);
    }

    const beds = here.filter((i) => i.slot === 'bed');
    for (const bed of beds) {
      const wall = backWall(room, bed);
      if (!wall) continue;
      for (const side of [-1, 1]) {
        const t = alongBack(bed, wall, side * (bed.size.width / 2 + 0.25));
        makeOnWall(b, room, 'socket_double', wall.edge, t, { elevationM: BEDSIDE_SOCKET_M });
        makeOnWall(b, room, 'light_wall', wall.edge, t, { elevationM: 1.45, category: 'bedside' });
      }
    }

    const tv = here.find((i) => i.slot === 'tv_unit');
    if (tv) {
      const wall = backWall(room, tv);
      if (wall) {
        makeOnWall(b, room, 'tv', wall.edge, wall.t, { elevationM: TV_SOCKET_M });
        makeOnWall(b, room, 'socket_double', wall.edge, alongBack(tv, wall, 0.3), { elevationM: TV_SOCKET_M });
        makeOnWall(b, room, 'internet', wall.edge, alongBack(tv, wall, -0.3), { elevationM: TV_SOCKET_M });
        for (const side of [-1, 1]) makeOnWall(b, room, 'socket_high', wall.edge, alongBack(tv, wall, side * 0.7), { elevationM: HIGH_SOCKET_M });
      }
    }

    const sofa = here.find((i) => i.slot === 'sofa');
    if (sofa) {
      const wall = backWall(room, sofa);
      if (wall) makeOnWall(b, room, 'socket_double', wall.edge, alongBack(sofa, wall, sofa.size.width / 2 + 0.2));
    }

    const desk = here.find((i) => i.slot === 'desk');
    if (desk) {
      const wall = backWall(room, desk);
      if (wall) {
        makeOnWall(b, room, 'socket_double', wall.edge, alongBack(desk, wall, 0.25), { elevationM: 0.75 });
        makeOnWall(b, room, 'internet', wall.edge, alongBack(desk, wall, -0.25), { elevationM: 0.75 });
      }
    }

    const run = here.find((i) => i.slot === 'kitchen_run');
    if (run) {
      const wall = backWall(room, run);
      if (wall) {
        const spread = run.size.width / 2 - 0.35;
        for (const lateral of [-spread, 0, spread]) makeOnWall(b, room, 'socket_kitchen', wall.edge, alongBack(run, wall, lateral), { elevationM: KITCHEN_SOCKET_M });
        makeOnWall(b, room, 'light_furniture', wall.edge, wall.t, { elevationM: 1.5, lengthM: Math.min(run.size.width, wall.edge.length - 0.2), category: 'furniture' });
      }
    }
    const fridge = here.find((i) => i.slot === 'fridge');
    if (fridge) {
      const wall = backWall(room, fridge);
      if (wall) makeOnWall(b, room, 'socket', wall.edge, wall.t, { elevationM: 0.3 });
    }

    const sink = here.find((i) => i.slot === 'sink');
    if (sink && (room.type === 'bathroom' || room.type === 'toilet')) {
      const wall = backWall(room, sink);
      if (wall) {
        makeOnWall(b, room, 'socket', wall.edge, alongBack(sink, wall, sink.size.width / 2 + 0.2), { elevationM: 1.1 });
        makeOnWall(b, room, 'light_wall', wall.edge, wall.t, { elevationM: 1.95, category: 'secondary' });
      }
    }

    // Living rooms and bedrooms: a general socket on each long free wall, at 45 cm.
    if (['living_room', 'bedroom', 'office', 'hallway', 'kitchen', 'studio'].includes(room.type)) {
      const used = new Set(b.points.filter((p) => p.roomId === room.id && p.wallIndex != null).map((p) => p.wallIndex));
      const free = edges.filter((e) => e.length >= 1.6 && !used.has(e.index)).sort((p, q) => q.length - p.length);
      const wanted = room.type === 'living_room' || room.type === 'studio' ? 2 : 1;
      for (const edge of free.slice(0, wanted)) makeOnWall(b, room, 'socket', edge, 0.5);
    }
  }

  return [...kept, ...b.points];
}

/** A point the person places by hand, on the nearest wall of its room where the kind wants a wall. */
export function placeElectrical(room: PlanRoom, kind: ElectricalKind, at: Vec2, id: string): ElectricalPoint {
  const info = ELECTRICAL_KINDS[kind];
  const base: ElectricalPoint = {
    id,
    roomId: room.id,
    kind,
    position: at,
    elevationM: info.placement === 'ceiling' ? room.heightM : info.defaultElevationM,
    wallIndex: null,
    t: null,
    ...(info.count ? { count: info.count } : {}),
    ...(info.light ? { on: true, category: info.category } : {}),
    origin: 'user',
  };
  if (info.placement !== 'wall') return base;
  const spot = wallSpotNear(room, at);
  if (!spot) return base;
  return { ...base, position: onWall(room, spot.edge, spot.t), wallIndex: spot.wallIndex, t: Math.max(0.02, Math.min(0.98, spot.t)) };
}

/**
 * The footprint a fitting takes on the wall it is on, in metres.
 *
 * A bought fitting knows its real size; one that is still an estimate is given the plate it
 * would have — a single socket, a double one twice as wide, a strip as long as it was drawn.
 * Only used to keep two fittings off the same piece of wall, so it errs on the generous side.
 */
export function fittingFootprintM(point: Pick<ElectricalPoint, 'kind' | 'sizeM' | 'count' | 'lengthM'>): { width: number; height: number } {
  if (point.sizeM) return { width: point.sizeM.width, height: point.sizeM.height };
  if (point.lengthM) return { width: point.lengthM, height: DEFAULT_PLATE_M };
  const plate = DEFAULT_PLATE_M;
  return { width: plate * Math.max(1, point.count ?? 1), height: plate };
}

/** What a fitting with no product of its own measures: the usual 8 cm plate. */
const DEFAULT_PLATE_M = 0.08;
/** Fittings may touch, but not bury each other — a hair of daylight between the plates. */
const FITTING_GAP_M = 0.01;

/**
 * Whether a fitting would land on top of one already there.
 *
 * Two on the same wall clash when their plates overlap both along the wall and in height —
 * a socket at 45 cm and a switch at 105 cm on the same spot are fine, one above the other,
 * but two sockets a centimetre apart are one plate sunk into another. Two that are not on a
 * wall (a ceiling light, a floor strip) clash when their footprints overlap in plan.
 *
 * `ignoreId` is the fitting being moved, which must not be measured against itself.
 */
export function fittingClashes(room: PlanRoom, candidate: ElectricalPoint, others: ElectricalPoint[], ignoreId?: string): ElectricalPoint | null {
  const mine = fittingFootprintM(candidate);
  for (const other of others) {
    if (other.id === ignoreId || other.id === candidate.id) continue;
    if (other.roomId !== candidate.roomId) continue;
    const theirs = fittingFootprintM(other);
    const apartInHeight = Math.abs((other.elevationM ?? 0) - (candidate.elevationM ?? 0)) + FITTING_GAP_M >= (mine.height + theirs.height) / 2;
    if (apartInHeight) continue;
    const onSameWall = candidate.wallIndex != null && other.wallIndex === candidate.wallIndex;
    const along = onSameWall ? alongWallDistance(room, candidate, other) : Math.hypot(other.position.x - candidate.position.x, other.position.z - candidate.position.z);
    if (along === null) continue;
    if (along + FITTING_GAP_M < (mine.width + theirs.width) / 2) return other;
  }
  return null;
}

/** How far apart two points on the same wall are, measured along it. */
function alongWallDistance(room: PlanRoom, a: ElectricalPoint, b: ElectricalPoint): number | null {
  const edge = roomEdges(room.polygon).find((e) => e.index === a.wallIndex);
  if (!edge) return null;
  return Math.abs((a.t ?? 0) - (b.t ?? 0)) * edge.length;
}

/**
 * Slides a wall-mounted point along the wall it is on to `t` (0..1 of the edge), keeping its
 * height and kind; a point that is not on a wall comes back unchanged.
 */
export function slideAlongWall(room: PlanRoom, point: ElectricalPoint, t: number): ElectricalPoint {
  if (point.wallIndex == null) return point;
  const edge = roomEdges(room.polygon).find((e) => e.index === point.wallIndex);
  if (!edge) return point;
  const clamped = Math.max(0.02, Math.min(0.98, t));
  return { ...point, position: onWall(room, edge, clamped), t: clamped };
}

/** Re-projects a wall-mounted point onto its room's current outline (after a wall moved). */
export function reprojectElectrical(points: ElectricalPoint[], plan: FloorPlan): ElectricalPoint[] {
  return points.flatMap((p) => {
    const room = plan.rooms.find((r) => r.id === p.roomId);
    if (!room) return [];
    if (p.wallIndex == null) return [p];
    const spot = wallSpotNear(room, p.position, 1.2);
    if (!spot) return [];
    return [{ ...p, position: onWall(room, spot.edge, spot.t), wallIndex: spot.wallIndex, t: Math.max(0.02, Math.min(0.98, spot.t)) }];
  });
}

export interface ElectricalCounts {
  /** Outlets, counting a double socket as two. */
  outlets: number;
  switches: number;
  lightPoints: number;
  /** Metres of LED strip. */
  stripM: number;
  /** TV and internet outlets. */
  dataPoints: number;
}

export function electricalCounts(points: ElectricalPoint[]): ElectricalCounts {
  const counts: ElectricalCounts = { outlets: 0, switches: 0, lightPoints: 0, stripM: 0, dataPoints: 0 };
  for (const p of points) {
    if (p.kind === 'switch') counts.switches += 1;
    else if (p.kind === 'tv' || p.kind === 'internet') counts.dataPoints += 1;
    else if (p.kind === 'light_strip') counts.stripM += p.lengthM ?? 1.5;
    else if (isLight(p.kind)) counts.lightPoints += 1;
    else counts.outlets += p.count ?? 1;
  }
  counts.stripM = Math.round(counts.stripM * 10) / 10;
  return counts;
}

// ---------------------------------------------------------------------------
// Fittings as products
// ---------------------------------------------------------------------------

/**
 * Every fitting is bought as a product: the kind a socket, switch or lamp carries in the
 * catalogue (`products.model3dKind`) for each kind of point. The four socket kinds are one
 * product — a double socket is two of it — while a TV or data outlet is its own plate, and
 * every light its own fitting. A point whose kind has no product in the catalogue yet stays
 * an estimate (`ELECTRICAL_MATERIAL_GEL`) and is drawn with the default fixture model.
 */
export const FIXTURE_PRODUCT_KIND: Record<ElectricalKind, string> = {
  socket: 'socket',
  socket_double: 'socket',
  socket_high: 'socket',
  socket_kitchen: 'socket',
  switch: 'switch',
  tv: 'socket_tv',
  internet: 'socket_data',
  light_ceiling: 'light_ceiling',
  light_wall: 'light_wall',
  light_spot: 'light_spot',
  light_strip: 'light_strip',
  light_furniture: 'light_furniture',
};

export const FIXTURE_PRODUCT_KINDS: string[] = [...new Set(Object.values(FIXTURE_PRODUCT_KIND))];

/** True for a product kind that is a fitting, not a piece of furniture. */
export function isFixtureProductKind(kind: string | null | undefined): boolean {
  return !!kind && FIXTURE_PRODUCT_KINDS.includes(kind);
}

/** The catalogue's products for a kind of point, the style's first, the cheapest next. */
export function fixtureCandidates(kind: ElectricalKind, catalog: CatalogProduct[], styleId: StyleId): CatalogProduct[] {
  const wanted = FIXTURE_PRODUCT_KIND[kind];
  const affinity = (p: CatalogProduct) => (Array.isArray(p.styleTags) && (p.styleTags as string[]).includes(styleId) ? 1 : 0);
  return catalog.filter((p) => !!p.model3dUrl && p.model3dKind === wanted).sort((a, b) => affinity(b) - affinity(a) || a.pricePerUnit - b.pricePerUnit);
}

/** How many of the product one point needs: a double socket is two plates; a strip is bought by the metre. */
export function fixtureQuantity(point: ElectricalPoint): number {
  if (point.kind === 'light_strip' || point.kind === 'light_furniture') return Math.round((point.lengthM ?? 1.5) * 10) / 10;
  if (point.kind === 'switch' || point.kind === 'tv' || point.kind === 'internet' || ELECTRICAL_KINDS[point.kind].light) return 1;
  return Math.max(1, point.count ?? 1);
}

/** The point with `product` as its fitting (or none), priced for its quantity and carrying the product's size. */
export function withFixtureProduct(point: ElectricalPoint, product: CatalogProduct | null): ElectricalPoint {
  if (!product) {
    const { product: _dropped, sizeM: _size, ...rest } = point;
    return rest;
  }
  const sizeM = product.widthCm && product.heightCm && product.depthCm ? { width: product.widthCm / 100, depth: product.depthCm / 100, height: product.heightCm / 100 } : undefined;
  return { ...point, product: toSceneProduct(product, fixtureQuantity(point)), ...(sizeM ? { sizeM } : {}) };
}

/** The best product for a point, or null when the catalogue has none of its kind. */
export function fixtureProductFor(point: ElectricalPoint, catalog: CatalogProduct[], styleId: StyleId): CatalogProduct | null {
  return fixtureCandidates(point.kind, catalog, styleId)[0] ?? null;
}

/**
 * Gives every point without a product the best one the catalogue has, and re-prices the
 * ones that have one (a socket that became a double needs two). A product that is not of
 * the point's kind any more (the kind was changed) is replaced.
 */
export function withFixtureProducts(points: ElectricalPoint[], catalog: CatalogProduct[], styleId: StyleId): ElectricalPoint[] {
  if (catalog.length === 0) return points;
  return points.map((point) => {
    const candidates = fixtureCandidates(point.kind, catalog, styleId);
    const current = point.product ? candidates.find((c) => c.id === point.product?.productId) : undefined;
    const chosen = current ?? candidates[0] ?? null;
    if (!chosen) return point.product ? withFixtureProduct(point, null) : point;
    const priced = withFixtureProduct(point, chosen);
    return priced.product?.qty === point.product?.qty && current ? point : priced;
  });
}
