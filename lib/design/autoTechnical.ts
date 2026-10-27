/**
 * Where the water, the drains, the panel, the gas, the extractors and the air conditioners
 * go, by the rules a fitter would use.
 *
 * Marking a flat's technical points by hand is the step people skip — it is the least
 * rewarding part of the journey and the easiest to get wrong, and a flat with none of them
 * is priced as though it needed no plumbing at all. So this places the ones that follow from
 * the plan: a bathroom needs water, a drain and an extractor, a kitchen needs water, waste
 * and gas, the panel goes by the front door, a living room and a bedroom get an air
 * conditioner, and one boiler serves the flat — on an outside wall, where its flue can leave, in
 * a utility room, else on the balcony, else in the kitchen or the bathroom (`BOILER_ROOMS`). A
 * kitchen's pipes come to the end of the run the sink is taken to be at, its gas and its hood to
 * the hob (`kitchenRunZones`).
 *
 * It places what the rules can decide and **nothing else**. A point that would be a guess —
 * a second boiler, gas in a flat with no kitchen run, a drain in a room the plan does not
 * call a bathroom — is simply not placed; the person puts it where they know it is. Every
 * point comes out `origin: 'user'`, because asking for them is asking to pay for them.
 *
 * Pure geometry over the plan and the furniture; no React, no store.
 */

import { pointOnEdge, wallEdges, type PlanEdge } from './planGeometry';
import { HOOD_ROOM_TYPES, TECHNICAL_KINDS, technicalElevation } from './technical';
import { dividerSegments, studioParts } from './studio';
import { outsideEdges } from './radiators';
import { BOILER_PIPES_BELOW_M, BOILER_ROOMS, DISHWASHER_WATER, KITCHEN_SINK_WATER, WATER_NEEDS, WATER_HEIGHT_REACH_M, WATER_PAIR_SPACING_M, WATER_POINT_REACH_M, alongWall, kitchenRunZones, type WaterNeed } from './rules';
import type { FloorPlan, PlacedItem, PlanRoom, TechnicalKind, TechnicalPoint, Vec2 } from './types';

/** How far inside the room a wall-mounted point stands, so it reads as *on* that wall. */
const OFF_WALL_M = 0.08;
/** A room smaller than this is a cupboard, not a room to service. */
const MIN_ROOM_M2 = 1.2;

/** What a room of this type gets, in the order it is placed. */
const BY_ROOM: Partial<Record<PlanRoom['type'], TechnicalKind[]>> = {
  bathroom: ['sewer', 'floor_drain', 'extractor'],
  toilet: ['sewer', 'extractor'],
  kitchen: ['sewer', 'gas', 'extractor'],
  living_room: ['ac_unit'],
  // A studio is serviced part by part (`servicedAreas`); this is only its fallback.
  studio: ['sewer', 'gas', 'extractor', 'ac_unit'],
  bedroom: ['ac_unit'],
  office: ['ac_unit'],
};

/**
 * The water a room gets before it is furnished: a kitchen's sink and a bathroom's basin take
 * cold and hot, a toilet's WC cold. Once it is furnished, every fixture gets its own (`WATER_NEEDS`).
 */
const ROOM_WATER: Partial<Record<PlanRoom['type'], WaterNeed>> = {
  kitchen: KITCHEN_SINK_WATER,
  bathroom: WATER_NEEDS.sink!,
  toilet: WATER_NEEDS.toilet!,
};

/** One per flat, in the first room of this list that the flat has. */
const ONE_PER_FLAT: Array<{ kind: TechnicalKind; rooms: Array<PlanRoom['type']> }> = [
  { kind: 'electrical_panel', rooms: ['hallway', 'living_room', 'studio', 'kitchen'] },
];

export interface AutoTechnicalResult {
  points: TechnicalPoint[];
  /** What was placed, by kind, for the message afterwards. */
  counts: Partial<Record<TechnicalKind, number>>;
}

/**
 * The technical points the plan implies, leaving out every kind a room already has. Rooms
 * keep whatever is already marked: this fills the gaps, it does not tidy up after anyone.
 */
export function suggestTechnical(plan: FloorPlan, items: PlacedItem[], nextId: () => string): AutoTechnicalResult {
  const existing = plan.technical?.points ?? [];
  const points: TechnicalPoint[] = [];
  const counts: Partial<Record<TechnicalKind, number>> = {};
  const has = (kind: TechnicalKind, roomId?: string) =>
    [...existing, ...points].some((p) => p.kind === kind && (roomId === undefined || p.roomId === roomId));

  const add = (room: PlanRoom, kind: TechnicalKind, position: Vec2, elevationM: number) => {
    points.push({ id: nextId(), kind, roomId: room.id, position, elevationM, origin: 'user' });
    counts[kind] = (counts[kind] ?? 0) + 1;
  };
  const place = (room: PlanRoom, kind: TechnicalKind, notOn: Array<[Vec2, Vec2]> = [], prefer: PlanEdge[] = []) => {
    if (has(kind, room.id)) return;
    const position = spotFor(plan, room, kind, items, notOn, [...existing, ...points], prefer);
    if (!position) return;
    add(room, kind, position, technicalElevation(kind, room));
  };
  // A cold (and a hot) point on the wall at `s` along `edge`: hot on the left, cold on the right
  // as one faces the wall, 15 cm apart. One of the kind already within reach, at about that
  // height, counts as placed (a WC's pipe low on the wall is not the boiler's above it).
  const pipes = (room: PlanRoom, edge: PlanEdge, s: number, need: WaterNeed, elevationM = need.elevationM) => {
    const right = { x: edge.inward.z, z: -edge.inward.x };
    const sign = right.x * edge.dir.x + right.z * edge.dir.z >= 0 ? 1 : -1;
    const wanted: Array<[TechnicalKind, number]> = need.hot
      ? [
          ['water_supply', s + (sign * WATER_PAIR_SPACING_M) / 2],
          ['water_hot', s - (sign * WATER_PAIR_SPACING_M) / 2],
        ]
      : [['water_supply', s]];
    for (const [kind, at] of wanted) {
      const position = offInto(edge, Math.max(0.02, Math.min(0.98, at / edge.length)));
      const near = [...existing, ...points].some((p) => p.kind === kind && Math.hypot(p.position.x - position.x, p.position.z - position.z) < WATER_POINT_REACH_M && Math.abs((p.elevationM ?? 0) - elevationM) < WATER_HEIGHT_REACH_M);
      if (!near) add(room, kind, position, elevationM);
    }
  };
  // Every fixture its water (the brief's sanitary plan); a room not furnished yet, its sink's or
  // its WC's. A room that already has water of its own and no fixtures to go by is left alone.
  const water = (room: PlanRoom, notOn: Array<[Vec2, Vec2]> = []) => {
    const edges = wallEdges(room).filter((edge) => !notOn.some(([a, b]) => onSegment(pointOnEdge(edge, 0.5), a, b)));
    if (edges.length === 0) return;
    const here = items.filter((i) => i.roomId === room.id && (WATER_NEEDS[i.slot] || i.slot === 'kitchen_run'));
    for (const item of here) {
      if (item.slot === 'kitchen_run') {
        const zones = kitchenRunZones(room, item, [...existing, ...points], items);
        if (!zones) continue;
        pipes(room, zones.edge, zones.sinkS, KITCHEN_SINK_WATER);
        if (zones.dishwasherS !== null) pipes(room, zones.edge, zones.dishwasherS, DISHWASHER_WATER);
        continue;
      }
      const edge = nearestEdge(edges, item.position);
      if (edge) pipes(room, edge, alongWall(edge, item.position), WATER_NEEDS[item.slot]!);
    }
    const need = ROOM_WATER[room.type];
    if (here.length > 0 || !need || has('water_supply', room.id)) return;
    const at = spotFor(plan, room, 'water_supply', items, notOn, [...existing, ...points]);
    const edge = at ? nearestEdge(edges, at) : null;
    if (at && edge) pipes(room, edge, alongWall(edge, at), need);
  };

  for (const room of plan.rooms) {
    if (room.areaM2 < MIN_ROOM_M2) continue;
    // A studio's kitchen half gets the kitchen's water and gas, its living half the living
    // room's air conditioner — each on a wall of its own half, never on the line between them.
    const parts = studioParts(room);
    if (parts) {
      for (const part of parts) {
        const area: PlanRoom = { ...room, type: part.type, polygon: part.polygon, areaM2: part.areaM2, openings: [], split: undefined };
        for (const kind of BY_ROOM[part.type] ?? []) place(area, kind, dividerSegments(room));
        water(area, dividerSegments(room));
      }
      continue;
    }
    for (const kind of BY_ROOM[room.type] ?? []) place(room, kind);
    water(room);
  }

  for (const { kind, rooms } of ONE_PER_FLAT) {
    if (has(kind)) continue;
    // The first room of the preferred type that the flat actually has; none, and it is skipped.
    const room = rooms.map((type) => plan.rooms.find((r) => r.type === type && r.areaM2 >= MIN_ROOM_M2)).find(Boolean);
    if (room) place(room, kind);
  }

  if (!has('boiler')) {
    const spot = boilerRoom(plan);
    if (spot) place(spot.room, 'boiler', [], spot.outside);
  }
  // The boiler's cold in and hot out, under it.
  for (const boiler of [...existing, ...points].filter((p) => p.kind === 'boiler')) {
    const room = plan.rooms.find((r) => r.id === boiler.roomId);
    const edge = room ? nearestEdge(wallEdges(room), boiler.position) : null;
    if (room && edge) pipes(room, edge, alongWall(edge, boiler.position), { hot: true, elevationM: 0 }, Math.max(0.3, Math.round(((boiler.elevationM ?? 1.6) - BOILER_PIPES_BELOW_M) * 100) / 100));
  }

  return { points, counts };
}

/**
 * The room the flat's boiler goes in, and its outside walls: the first type of `BOILER_ROOMS`
 * the flat has — a utility (storage) room only with an outside wall, the others preferring one
 * that has (the biggest when several do).
 */
function boilerRoom(plan: FloorPlan): { room: PlanRoom; outside: PlanEdge[] } | null {
  for (const type of BOILER_ROOMS) {
    const rooms = plan.rooms
      .filter((r) => r.type === type && r.areaM2 >= MIN_ROOM_M2)
      .map((room) => ({ room, outside: outsideEdges(plan, room) }))
      .sort((a, b) => Number(b.outside.length > 0) - Number(a.outside.length > 0) || b.room.areaM2 - a.room.areaM2);
    const best = rooms[0];
    if (!best) continue;
    if (type === 'storage' && best.outside.length === 0) continue;
    return best;
  }
  return null;
}

/**
 * Where one point goes in one room: at the fixture it serves when the room has one, and
 * otherwise on the wall a fitter would choose — the longest one with no door in it, so the
 * pipe or the duct has a clear run.
 */
function spotFor(plan: FloorPlan, room: PlanRoom, kind: TechnicalKind, items: PlacedItem[], notOn: Array<[Vec2, Vec2]> = [], placed: TechnicalPoint[] = [], prefer: PlanEdge[] = []): Vec2 | null {
  const info = TECHNICAL_KINDS[kind];
  // A studio's dividing line is not a wall: nothing is fixed to it.
  // Nor is a room separator (`wallEdges`).
  const edges = wallEdges(room).filter((edge) => !notOn.some(([a, b]) => onSegment(pointOnEdge(edge, 0.5), a, b)));
  if (edges.length === 0) return null;

  // The fixture this kind serves, biggest first — a bath before a basin. A kitchen's extractor
  // is a cooker hood (`lib/design/equipment`): it serves the run, the hob being on it.
  const hood = isHood(room, kind);
  const served = items
    .filter((i) => i.roomId === room.id && (info.attracts.includes(i.kind) || (hood && i.kind === 'kitchen_run')))
    .sort((a, b) => b.size.width * b.size.depth - a.size.width * a.size.depth)[0];

  if (served && served.slot === 'kitchen_run') {
    // A kitchen run is one piece: its water and waste go to the sink's end, its gas and its hood
    // to the hob (`kitchenRunZones` — the same order the run's sockets are placed by).
    const zones = kitchenRunZones(room, served, placed, items);
    if (zones) {
      const s = kind === 'water_supply' || kind === 'water_hot' || kind === 'sewer' ? zones.sinkS : zones.hobS;
      return offInto(zones.edge, s / zones.edge.length);
    }
  }

  if (served) {
    // Waste and drains sit under the fixture; everything else comes to the wall behind it.
    if (info.placement !== 'wall') return round(served.position);
    const edge = nearestEdge(edges, served.position);
    return edge ? offInto(edge, projectOnto(edge, served.position)) : round(served.position);
  }

  if (info.placement === 'floor') return round(centroid(room.polygon));
  // An outside wall when the kind wants one (the boiler's flue) and the room has one.
  const outside = edges.filter((e) => prefer.some((p) => p.index === e.index));
  const edge = bestWall(room, outside.length > 0 ? outside : edges, kind);
  return edge ? offInto(edge, 0.5) : null;
}

/**
 * The wall a fitter would run it to: no door in it, and as long as possible. A bathroom's fan
 * and an air conditioner prefer an outside wall, which is where the duct and the pipes go; a
 * cooker hood is hung over a hob, which is not put under a window.
 */
function bestWall(room: PlanRoom, edges: PlanEdge[], kind: TechnicalKind): PlanEdge | null {
  const doored = new Set(room.openings.filter((o) => o.kind !== 'window').map((o) => o.wallIndex));
  const windowed = new Set(room.openings.filter((o) => o.kind === 'window').map((o) => o.wallIndex));
  const hood = isHood(room, kind);
  const outside = (kind === 'extractor' && !hood) || kind === 'ac_unit';
  const score = (edge: PlanEdge) => edge.length + (doored.has(edge.index) ? -20 : 0) + (windowed.has(edge.index) ? (outside ? 6 : hood ? -6 : 0) : 0);
  return [...edges].sort((a, b) => score(b) - score(a))[0] ?? null;
}

/** An extractor in a kitchen (or a studio's kitchen half) is a cooker hood. */
function isHood(room: PlanRoom, kind: TechnicalKind): boolean {
  return kind === 'extractor' && HOOD_ROOM_TYPES.includes(room.type);
}

function onSegment(p: Vec2, a: Vec2, b: Vec2): boolean {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  if (length < 1e-9) return false;
  const s = ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / length;
  const d = Math.abs((p.x - a.x) * (b.z - a.z) - (p.z - a.z) * (b.x - a.x)) / length;
  return d < 0.01 && s >= -0.01 && s <= length + 0.01;
}

function nearestEdge(edges: PlanEdge[], point: Vec2): PlanEdge | null {
  let best: { edge: PlanEdge; distance: number } | null = null;
  for (const edge of edges) {
    const s = Math.max(0, Math.min(edge.length, (point.x - edge.a.x) * edge.dir.x + (point.z - edge.a.z) * edge.dir.z));
    const distance = Math.hypot(point.x - (edge.a.x + edge.dir.x * s), point.z - (edge.a.z + edge.dir.z * s));
    if (!best || distance < best.distance) best = { edge, distance };
  }
  return best?.edge ?? null;
}

/** Where along an edge a point falls, as 0..1. */
function projectOnto(edge: PlanEdge, point: Vec2): number {
  const s = (point.x - edge.a.x) * edge.dir.x + (point.z - edge.a.z) * edge.dir.z;
  return Math.max(0.05, Math.min(0.95, s / Math.max(edge.length, 1e-6)));
}

/** A spot on a wall, pushed just inside the room so it reads as standing on that wall. */
function offInto(edge: PlanEdge, t: number): Vec2 {
  const at = pointOnEdge(edge, t);
  return round({ x: at.x + edge.inward.x * OFF_WALL_M, z: at.z + edge.inward.z * OFF_WALL_M });
}

function centroid(polygon: Vec2[]): Vec2 {
  return { x: polygon.reduce((s, p) => s + p.x, 0) / polygon.length, z: polygon.reduce((s, p) => s + p.z, 0) / polygon.length };
}

function round(p: Vec2): Vec2 {
  return { x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 };
}
