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
 * Heights follow the design rules (`lib/design/rules.ts`, the owner's brief) and are always
 * editable:
 *
 *   sockets 45 cm · bedside 35 cm, or 10 cm over a nightstand (45–75) · kitchen worktop 90 cm,
 *   its sockets 105 cm (100–110), the appliances' 30 cm, the hood's 215 cm, the fridge's 40 cm ·
 *   high sockets 170 cm · switches 105 cm (two-way by a bed and along a long hallway) · TV 110 cm
 *
 * Pure geometry over the plan and the placed items; no React, no THREE.
 */

import { isPassage, openingSpanUp, pointOnEdge, polygonBounds, roomEdges, wallEdges, type PlanEdge } from './planGeometry';
import { closestOnSegment } from './walls';
import { toSceneProduct, type CatalogProduct } from './matcher';
import {
  APPLIANCE_SOCKET_M,
  BEDSIDE_LOW_SOCKET_M,
  BEDSIDE_SWITCH_M,
  CABINET_LIGHT_SOCKET_M,
  DESK_SOCKET_ABOVE_M,
  FRIDGE_SOCKET_M,
  HALL_LIGHT_SPACING_M,
  HIGH_SOCKET_M,
  HOOD_SOCKET_M,
  KITCHEN_SOCKET_M,
  KITCHEN_SPOT_AHEAD_M,
  KITCHEN_SPOT_SPACING_M,
  NIGHTSTAND_SOCKET_ABOVE_M,
  NIGHTSTAND_SOCKET_RANGE_M,
  SOCKET_M,
  SWITCH_FROM_OPENING_M,
  SWITCH_M,
  TRACK_SPOT_SPACING_M,
  TRACK_SPOTS,
  TV_SOCKET_M,
  TWO_WAY_CORRIDOR_M,
  WALL_UNIT_BOTTOM_M,
  roomLightK,
  underCeiling,
  kitchenRunZones,
} from './rules';
import type { ElectricalKind, ElectricalPoint, FloorPlan, LightCategory, PlacedItem, PlanRoom, StyleId, TechnicalPoint, Vec2 } from './types';

export { KITCHEN_SOCKET_M, KITCHEN_WORKTOP_M, HIGH_SOCKET_M, SOCKET_M, SWITCH_M, TV_SOCKET_M } from './rules';

export interface ElectricalKindInfo {
  /** On a wall, on the ceiling, or anywhere on the plan (a strip under a bed). */
  placement: 'wall' | 'ceiling' | 'any';
  defaultElevationM: number;
  light: boolean;
  category?: LightCategory;
  /** Default outlets per plate. */
  count?: number;
}

export const ELECTRICAL_KINDS: Record<ElectricalKind, ElectricalKindInfo> = {
  socket: { placement: 'wall', defaultElevationM: SOCKET_M, light: false, count: 1 },
  socket_double: { placement: 'wall', defaultElevationM: SOCKET_M, light: false, count: 2 },
  socket_high: { placement: 'wall', defaultElevationM: HIGH_SOCKET_M, light: false, count: 1 },
  socket_kitchen: { placement: 'wall', defaultElevationM: KITCHEN_SOCKET_M, light: false, count: 2 },
  switch: { placement: 'wall', defaultElevationM: SWITCH_M, light: false },
  switch_two_way: { placement: 'wall', defaultElevationM: SWITCH_M, light: false },
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

/** A switch, one-way or two-way (pass-through). */
export function isSwitch(kind: ElectricalKind): boolean {
  return kind === 'switch' || kind === 'switch_two_way';
}

/** The wall spot nearest to a world point: the edge, how far along it, and the point itself. */
export function wallSpotNear(room: PlanRoom, point: Vec2, maxDistance = Infinity): { wallIndex: number; t: number; position: Vec2; edge: PlanEdge } | null {
  let best: { wallIndex: number; t: number; position: Vec2; edge: PlanEdge; distance: number } | null = null;
  // A room separator is no wall: nothing is fixed to it.
  for (const edge of wallEdges(room)) {
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
  // Not in a doorway or a window at that height — nor anywhere over a railing, where there is no wall.
  const height = extra.elevationM ?? ELECTRICAL_KINDS[kind].defaultElevationM;
  const blocked = room.openings.some((o) => {
    if (o.wallIndex !== edge.index) return false;
    const half = (o.widthM / 2 + 0.08) / edge.length;
    const inSpan = t > o.t - half && t < o.t + half;
    const gap = openingSpanUp(o, room.heightM);
    const inHeight = height >= gap.bottom - 0.05 && height <= gap.top + 0.05;
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

/** Where along a wall a point falls, metres from its first corner. */
function along(edge: PlanEdge, point: { x: number; z: number }): number {
  return (point.x - edge.a.x) * edge.dir.x + (point.z - edge.a.z) * edge.dir.z;
}

/** A point along an item's back wall, `lateral` metres to the item's right. */
function alongBack(item: PlacedItem, wall: { edge: PlanEdge; t: number }, lateral: number): number {
  const forward = { x: Math.sin(item.rotation), z: Math.cos(item.rotation) };
  const right = { x: forward.z, z: -forward.x };
  const sign = right.x * wall.edge.dir.x + right.z * wall.edge.dir.z >= 0 ? 1 : -1;
  return wall.t + (sign * lateral) / wall.edge.length;
}

/**
 * What a suggestion leaves as it is: a room the person has wired by hand, whole — their points
 * and the ones the app gave it alike. Adding one socket to a room must not cost it the ceiling
 * light and the switches it already had (they used to go, and the calculation's board and the
 * design made from it then counted that room differently). Every other room is filled in again.
 */
function wiredByHand(existing: ElectricalPoint[]): { kept: ElectricalPoint[]; skip: Set<string> } {
  const skip = new Set(existing.filter((p) => p.origin !== 'generated').map((p) => p.roomId));
  return { kept: existing.filter((p) => skip.has(p.roomId)), skip };
}

/**
 * Sockets, switches and lights for every room: the standard ones every room of its kind gets
 * (`standardElectrical`), then what the furniture standing in it calls for. A room the person
 * has wired by hand is kept as it is (`wiredByHand`); only the others are filled in.
 */
export function suggestElectrical(plan: FloorPlan, items: PlacedItem[], existing: ElectricalPoint[] = [], styleId?: StyleId | null): ElectricalPoint[] {
  let counter = existing.length;
  const b: Builder = { points: [], next: () => `e${Date.now().toString(36)}-${counter++}` };
  const { kept, skip } = wiredByHand(existing);

  for (const room of plan.rooms) {
    if (skip.has(room.id)) continue;
    if (wallEdges(room).length === 0) continue;
    // Ceiling lights at the ceiling one sees — a new one hangs lower than the slab.
    const ceiled = underCeiling(room, plan);
    standardFor(b, ceiled);
    furnitureFor(b, ceiled, items.filter((i) => i.roomId === room.id), plan.technical?.points ?? [], styleId ?? null);
  }

  return [...kept, ...b.points];
}

/**
 * The fittings every room gets by the standard rules, whatever furniture it will hold: a main
 * light, a switch on the handle side of each door, and a general socket at 45 cm on the long
 * walls of the rooms people live in. What the calculator places on its board — it has no
 * furniture — and the part of a design's fittings the calculator's estimate is the same as;
 * the design's furniture then adds its own (`suggestElectrical`). A room the person has wired
 * by hand is kept as it is (`wiredByHand`).
 */
export function standardElectrical(plan: FloorPlan, existing: ElectricalPoint[] = []): ElectricalPoint[] {
  let counter = existing.length;
  const b: Builder = { points: [], next: () => `e${Date.now().toString(36)}-${counter++}` };
  const { kept, skip } = wiredByHand(existing);
  for (const room of plan.rooms) {
    if (skip.has(room.id) || wallEdges(room).length === 0) continue;
    standardFor(b, underCeiling(room, plan));
  }
  return [...kept, ...b.points];
}

/**
 * One room's standard fittings. Decided by the room alone — never by the furniture — so the
 * calculator, which has none, places exactly what the design does before its furniture adds
 * its own: the general sockets keep off the walls the switches are on, and nothing else.
 */
function standardFor(b: Builder, room: PlanRoom): void {
  const edges = wallEdges(room);
  const centre = { x: room.polygon.reduce((s, p) => s + p.x, 0) / room.polygon.length, z: room.polygon.reduce((s, p) => s + p.z, 0) / room.polygon.length };
  const before = b.points.length;

  // Every room: a main light — a hallway one every 3 m or nearer, evenly down its middle (the
  // owner: one light is not enough for a hallway) — and a switch on the handle side of each door,
  // 20 cm from the opening.
  if (room.type === 'hallway') for (const at of hallLightSpots(room)) make(b, room, 'light_ceiling', at);
  else make(b, room, 'light_ceiling', centre);
  for (const door of room.openings.filter(isPassage)) {
    const edge = edges.find((e) => e.index === door.wallIndex);
    if (!edge) continue;
    const side = door.hinge === 'right' ? -1 : 1;
    const offset = (door.widthM / 2 + SWITCH_FROM_OPENING_M) / edge.length;
    const t = door.t + side * offset;
    if (t <= 0.02 || t >= 0.98) makeOnWall(b, room, 'switch', edge, door.t - side * offset);
    else makeOnWall(b, room, 'switch', edge, t);
  }
  if (room.type === 'hallway') twoWayCorridor(b, room, edges, before);

  // The rooms people live in: a general socket on each long free wall, at 45 cm.
  if (['living_room', 'bedroom', 'office', 'hallway', 'kitchen', 'studio'].includes(room.type)) {
    const used = new Set(b.points.slice(before).filter((p) => p.wallIndex != null).map((p) => p.wallIndex));
    const free = edges.filter((e) => e.length >= 1.6 && !used.has(e.index)).sort((p, q) => q.length - p.length);
    const wanted = room.type === 'living_room' || room.type === 'studio' ? 2 : 1;
    for (const edge of free.slice(0, wanted)) makeOnWall(b, room, 'socket', edge, 0.5);
  }
}

/**
 * Where a hallway's lights go: one every `HALL_LIGHT_SPACING_M` or nearer along its length, evenly
 * spaced, each in the middle of the hallway's width where it stands (an L's arm too).
 */
export function hallLightSpots(room: PlanRoom): Vec2[] {
  const bounds = polygonBounds(room.polygon);
  const alongX = bounds.maxX - bounds.minX >= bounds.maxZ - bounds.minZ;
  const from = alongX ? bounds.minX : bounds.minZ;
  const length = alongX ? bounds.maxX - bounds.minX : bounds.maxZ - bounds.minZ;
  const n = Math.max(1, Math.ceil(length / HALL_LIGHT_SPACING_M - 1e-6));
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const u = from + ((i + 0.5) * length) / n;
    const middle = crossMiddle(room.polygon, alongX, u);
    if (middle != null) out.push(alongX ? { x: u, z: middle } : { x: middle, z: u });
  }
  return out;
}

/** The middle of the widest stretch of the outline across the line at `u` (x = u, or z = u). */
function crossMiddle(polygon: Vec2[], alongX: boolean, u: number): number | null {
  const hits: number[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const [ua, ub, va, vb] = alongX ? [a.x, b.x, a.z, b.z] : [a.z, b.z, a.x, b.x];
    if ((ua <= u && ub > u) || (ub <= u && ua > u)) hits.push(va + ((u - ua) / (ub - ua)) * (vb - va));
  }
  hits.sort((p, q) => p - q);
  let best: [number, number] | null = null;
  for (let i = 0; i + 1 < hits.length; i += 2) if (!best || hits[i + 1] - hits[i] > best[1] - best[0]) best = [hits[i], hits[i + 1]];
  return best ? (best[0] + best[1]) / 2 : null;
}

/**
 * A hallway 4 m or longer is switched from both ends: the light goes on at one end and off at
 * the other. The door switches furthest apart along the hallway become a two-way pair when
 * they are near its two ends; otherwise a two-way switch is added on the wall at the far end.
 */
function twoWayCorridor(b: Builder, room: PlanRoom, edges: PlanEdge[], from: number): void {
  const bounds = polygonBounds(room.polygon);
  const alongX = bounds.maxX - bounds.minX >= bounds.maxZ - bounds.minZ;
  const length = alongX ? bounds.maxX - bounds.minX : bounds.maxZ - bounds.minZ;
  if (length < TWO_WAY_CORRIDOR_M) return;
  const at = (p: Vec2) => (alongX ? p.x - bounds.minX : p.z - bounds.minZ);
  const switches = b.points.slice(from).filter((p) => p.roomId === room.id && p.kind === 'switch').sort((p, q) => at(p.position) - at(q.position));
  if (switches.length === 0) return;
  const first = switches[0];
  const last = switches[switches.length - 1];
  const nearEnd = (d: number) => d <= length * 0.25;
  if (switches.length >= 2 && nearEnd(at(first.position)) && nearEnd(length - at(last.position))) {
    first.kind = 'switch_two_way';
    last.kind = 'switch_two_way';
    return;
  }
  // The end the switches are not at: a switch on the wall closing it, else on a side wall near it.
  const farLow = at(first.position) > length - at(last.position);
  const target = alongX
    ? { x: farLow ? bounds.minX + 0.3 : bounds.maxX - 0.3, z: (bounds.minZ + bounds.maxZ) / 2 }
    : { x: (bounds.minX + bounds.maxX) / 2, z: farLow ? bounds.minZ + 0.3 : bounds.maxZ - 0.3 };
  const spot = edges
    .map((edge) => ({ edge, hit: closestOnSegment(target, edge.a, edge.b) }))
    .sort((p, q) => p.hit.distance - q.hit.distance);
  for (const { edge, hit } of spot) {
    const added = makeOnWall(b, room, 'switch_two_way', edge, hit.t);
    if (!added) continue;
    (farLow ? last : first).kind = 'switch_two_way';
    return;
  }
}

/** A bedside socket's height: 10 cm over that side's nightstand, within 45–75 cm; 35 cm with none. */
export function bedsideSocketHeight(stand: PlacedItem | undefined): number {
  if (!stand) return BEDSIDE_LOW_SOCKET_M;
  const top = stand.elevationM + stand.size.height;
  return Math.round(Math.max(NIGHTSTAND_SOCKET_RANGE_M.min, Math.min(NIGHTSTAND_SOCKET_RANGE_M.max, top + NIGHTSTAND_SOCKET_ABOVE_M)) * 100) / 100;
}

/** The room's one ceiling light (the standard fittings') swapped for spots at these points — the main light all the same. */
function replaceMainLight(b: Builder, room: PlanRoom, spots: Vec2[]): void {
  const at = b.points.findIndex((p) => p.roomId === room.id && p.kind === 'light_ceiling');
  if (at >= 0) b.points.splice(at, 1);
  for (const spot of spots) make(b, room, 'light_spot', spot, { category: 'primary' });
}

/** What the furniture standing in a room calls for: sockets and lamps by the bed, the TV, the sofa, the desk, the kitchen, the basin. */
function furnitureFor(b: Builder, room: PlanRoom, here: PlacedItem[], technical: TechnicalPoint[], styleId: StyleId | null = null): void {
  const beds = here.filter((i) => i.slot === 'bed');
  // An industrial bedroom's main light is a track of cylinder spots across the room's middle,
  // square to the bed (the owner's notes), not the one ceiling light.
  if (room.type === 'bedroom' && styleId === 'industrial' && beds.length > 0) {
    const centre = { x: room.polygon.reduce((sum, p) => sum + p.x, 0) / room.polygon.length, z: room.polygon.reduce((sum, p) => sum + p.z, 0) / room.polygon.length };
    const across = { x: Math.cos(beds[0].rotation), z: -Math.sin(beds[0].rotation) };
    replaceMainLight(b, room, Array.from({ length: TRACK_SPOTS }, (_, i) => {
      const off = (i - (TRACK_SPOTS - 1) / 2) * TRACK_SPOT_SPACING_M;
      return { x: centre.x + across.x * off, z: centre.z + across.z * off };
    }));
  }
  for (const bed of beds) {
    const wall = backWall(room, bed);
    if (!wall) continue;
    const double = bed.size.width >= 1.2;
    const sides: Array<{ side: number; t: number; stand: PlacedItem | undefined }> = [];
    for (const side of [-1, 1]) {
      const t = alongBack(bed, wall, side * (bed.size.width / 2 + 0.25));
      // Off the wall's end there is no bedside: a bed pushed against the side wall has none there.
      if (t * wall.edge.length < 0.15 || (1 - t) * wall.edge.length < 0.15) continue;
      const stand = here.find((i) => i.slot === 'nightstand' && Math.sign(along(wall.edge, i.position) - along(wall.edge, bed.position)) === Math.sign((t - wall.t) || side));
      sides.push({ side, t, stand });
      makeOnWall(b, room, 'socket_double', wall.edge, t, { elevationM: bedsideSocketHeight(stand) });
      // The reading lamp over that side's nightstand when there is one, else beside the bed.
      const lampT = stand ? along(wall.edge, stand.position) / wall.edge.length : t;
      makeOnWall(b, room, 'light_wall', wall.edge, lampT, { elevationM: 1.45, category: 'bedside' });
    }
    // Two-way switching: the light goes on at the door and off from the bed — from both sides
    // of a double bed, from the open side of a single one. The door's switches join the pair.
    if (room.type !== 'bedroom' || sides.length === 0) continue;
    const reach = double ? sides : [sides.sort((p, q) => Math.abs(q.t - 0.5) - Math.abs(p.t - 0.5)).at(-1)!];
    let added = 0;
    for (const { t } of reach) if (makeOnWall(b, room, 'switch_two_way', wall.edge, t, { elevationM: BEDSIDE_SWITCH_M })) added += 1;
    if (added > 0) for (const p of b.points) if (p.roomId === room.id && p.kind === 'switch') p.kind = 'switch_two_way';
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
      // Just above the desktop, where a charger reaches.
      const height = Math.round((desk.elevationM + desk.size.height + DESK_SOCKET_ABOVE_M) * 100) / 100;
      makeOnWall(b, room, 'socket_double', wall.edge, alongBack(desk, wall, 0.25), { elevationM: height });
      makeOnWall(b, room, 'internet', wall.edge, alongBack(desk, wall, -0.25), { elevationM: height });
    }
  }

  const run = here.find((i) => i.slot === 'kitchen_run');
  const zones = run ? kitchenRunZones(room, run, technical, here) : null;
  if (run && zones) {
    const { edge } = zones;
    const at = (s: number) => s / edge.length;
    // The worktop: two or three double sockets at 105 cm — the prep zone between sink and hob,
    // the coffee/kettle zone past the hob, and one more in the longer of the two.
    const stretches = [...zones.worktop];
    const worktop = stretches.map(([p, q]) => (p + q) / 2);
    const longest = stretches.sort((p, q) => q[1] - q[0] - (p[1] - p[0]))[0];
    if (longest && longest[1] - longest[0] >= 0.9) {
      const [p, q] = longest;
      worktop.splice(worktop.indexOf((p + q) / 2), 1, p + (q - p) / 3, p + (2 * (q - p)) / 3);
    }
    for (const s of worktop) makeOnWall(b, room, 'socket_kitchen', edge, at(s), { elevationM: KITCHEN_SOCKET_M });
    // In the base units, behind the appliances: the dishwasher by the sink, the oven and the
    // gas hob's ignition under the hob.
    if (zones.dishwasherS !== null) makeOnWall(b, room, 'socket', edge, at(zones.dishwasherS), { elevationM: APPLIANCE_SOCKET_M });
    makeOnWall(b, room, 'socket', edge, at(zones.hobS - 0.12), { elevationM: APPLIANCE_SOCKET_M });
    makeOnWall(b, room, 'socket', edge, at(zones.hobS + 0.12), { elevationM: APPLIANCE_SOCKET_M });
    // The hood's, high over the hob; the under-cabinet light's, in the wall cabinets at the far end.
    makeOnWall(b, room, 'socket_high', edge, at(zones.hobS), { elevationM: HOOD_SOCKET_M });
    makeOnWall(b, room, 'socket_high', edge, at(zones.farEndS - Math.sign(zones.farEndS - zones.sinkS) * 0.3), { elevationM: CABINET_LIGHT_SOCKET_M });
    const wallT = along(edge, run.position) / edge.length;
    makeOnWall(b, room, 'light_furniture', edge, wallT, { elevationM: WALL_UNIT_BOTTOM_M, lengthM: Math.min(run.size.width, edge.length - 0.2), category: 'furniture' });
    // The main light: spots in a row over the working floor, just in front of the worktop, one
    // every 90 cm of the run — kept to the run, apart from the pendant over the table (the owner's
    // three layers: the table's pendant, the main light, the light under the cabinets). A
    // kitchen's own ceiling light gives way to them; a studio's stays for its living half.
    const forward = { x: Math.sin(run.rotation), z: Math.cos(run.rotation) };
    const right = { x: forward.z, z: -forward.x };
    const n = Math.max(2, Math.round(run.size.width / KITCHEN_SPOT_SPACING_M));
    const ahead = run.size.depth / 2 + KITCHEN_SPOT_AHEAD_M;
    const spots = Array.from({ length: n }, (_, i) => {
      const lateral = ((i + 0.5) / n - 0.5) * run.size.width;
      return { x: run.position.x + forward.x * ahead + right.x * lateral, z: run.position.z + forward.z * ahead + right.z * lateral };
    });
    if (room.type === 'kitchen') replaceMainLight(b, room, spots);
    else for (const at of spots) make(b, room, 'light_spot', at, { category: 'primary' });
  }
  const fridge = here.find((i) => i.slot === 'fridge');
  if (fridge) {
    const wall = backWall(room, fridge);
    if (wall) makeOnWall(b, room, 'socket', wall.edge, wall.t, { elevationM: FRIDGE_SOCKET_M });
  }

  const sink = here.find((i) => i.slot === 'sink');
  if (sink && (room.type === 'bathroom' || room.type === 'toilet')) {
    const wall = backWall(room, sink);
    if (wall) {
      makeOnWall(b, room, 'socket', wall.edge, alongBack(sink, wall, sink.size.width / 2 + 0.2), { elevationM: 1.1 });
      makeOnWall(b, room, 'light_wall', wall.edge, wall.t, { elevationM: 1.95, category: 'secondary' });
    }
  }
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
    if (isSwitch(p.kind)) counts.switches += 1;
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
  switch_two_way: 'switch_two_way',
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

/**
 * The catalogue's products for a kind of point, the style's first, the cheapest next. A lamp for a
 * room goes before one of the same style whose colour temperature (`specs.cct`) is outside the
 * room's range (`roomLightK`: warm where people live, neutral in a kitchen or an office); a lamp
 * that does not say comes between.
 */
export function fixtureCandidates(kind: ElectricalKind, catalog: CatalogProduct[], styleId: StyleId, roomType?: PlanRoom['type'] | null): CatalogProduct[] {
  const wanted = FIXTURE_PRODUCT_KIND[kind];
  const affinity = (p: CatalogProduct) => (Array.isArray(p.styleTags) && (p.styleTags as string[]).includes(styleId) ? 1 : 0);
  const range = roomType && ELECTRICAL_KINDS[kind].light ? roomLightK(roomType) : null;
  const light = (p: CatalogProduct) => {
    if (!range) return 0;
    const cct = lampCct(p);
    return cct == null ? 0 : cct >= range.min && cct <= range.max ? 1 : -1;
  };
  // Industrial lights are cylinders (the owner's notes): a spot or a ceiling light whose name says so first.
  const shape = (p: CatalogProduct) => (styleId === 'industrial' && (kind === 'light_spot' || kind === 'light_ceiling') && CYLINDER_WORDS.test(`${p.slug} ${p.nameKa} ${(p as { nameEn?: string | null }).nameEn ?? ''}`) ? 1 : 0);
  return catalog.filter((p) => !!p.model3dUrl && p.model3dKind === wanted).sort((a, b) => affinity(b) - affinity(a) || shape(b) - shape(a) || light(b) - light(a) || a.pricePerUnit - b.pricePerUnit);
}

/** What a cylinder light is called in a product's name or slug. */
const CYLINDER_WORDS = /cylind|tube|tubular|track|ცილინდრ|цилиндр|трек/i;

/** A lamp's colour temperature in kelvin, when its specs say (`specs.cct`). */
export function lampCct(product: Pick<CatalogProduct, 'specs'>): number | null {
  const specs = product.specs;
  const cct = specs && typeof specs === 'object' ? (specs as { cct?: unknown }).cct : null;
  return typeof cct === 'number' && cct > 1000 ? cct : null;
}

/** How many of the product one point needs: a double socket is two plates; a strip is bought by the metre. */
export function fixtureQuantity(point: ElectricalPoint): number {
  if (point.kind === 'light_strip' || point.kind === 'light_furniture') return Math.round((point.lengthM ?? 1.5) * 10) / 10;
  if (isSwitch(point.kind) || point.kind === 'tv' || point.kind === 'internet' || ELECTRICAL_KINDS[point.kind].light) return 1;
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

/**
 * Gives every point without a product the best one the catalogue has, and re-prices the
 * ones that have one (a socket that became a double needs two). A product that is not of
 * the point's kind any more (the kind was changed) is replaced.
 */
export function withFixtureProducts(points: ElectricalPoint[], catalog: CatalogProduct[], styleId: StyleId, rooms: readonly PlanRoom[] = []): ElectricalPoint[] {
  if (catalog.length === 0) return points;
  const typeOf = new Map(rooms.map((r) => [r.id, r.type]));
  return points.map((point) => {
    const candidates = fixtureCandidates(point.kind, catalog, styleId, typeOf.get(point.roomId));
    const current = point.product ? candidates.find((c) => c.id === point.product?.productId) : undefined;
    const chosen = current ?? candidates[0] ?? null;
    if (!chosen) return point.product ? withFixtureProduct(point, null) : point;
    const priced = withFixtureProduct(point, chosen);
    return priced.product?.qty === point.product?.qty && current ? point : priced;
  });
}
