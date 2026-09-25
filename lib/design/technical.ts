/**
 * The technical setup: what the building provides before anything is designed.
 *
 * Pipes, drains, the panel, radiators, air conditioning — each is a point on the plan with a
 * kind and a height. They do two things downstream: the layout engine keeps the toilet by
 * the sewer and the sink by the water (`technicalAnchors`), and the budget counts every
 * point as work to be done. The works list (`WORK_ITEMS`) is the other half of the step: the
 * phases the renovation needs, pre-ticked from the home state and editable, which replace
 * the home state's fixed phase list in the estimate.
 *
 * Pure data and pure functions; the editor and the layout engine read them.
 */

import type { HomeState, RoomType } from '@/lib/calculator/types';
import { HOME_STATES } from '@/lib/calculator/constants';
import { pointInPolygon, roomEdges } from './planGeometry';
import { closestOnSegment, DEFAULT_WALL_HEIGHT_M } from './walls';
import type { FloorPlan, PlacedItem, PlanRoom, TechnicalKind, TechnicalPoint, Vec2 } from './types';

export interface TechnicalKindInfo {
  /** Where it sits: on a wall, on the floor, or either. */
  placement: 'wall' | 'floor' | 'any';
  /** Usual height of the point above the floor. */
  defaultElevationM: number;
  /** The rooms it usually belongs to; the tray lists these first. */
  rooms: RoomType[];
  /** The archetypes that want to stand near this point. */
  attracts: string[];
}

export const TECHNICAL_KINDS: Record<TechnicalKind, TechnicalKindInfo> = {
  water_supply: { placement: 'wall', defaultElevationM: 0.5, rooms: ['bathroom', 'toilet', 'kitchen', 'studio'], attracts: ['sink', 'shower', 'bathtub', 'washer', 'kitchen_run', 'kitchen_island'] },
  sewer: { placement: 'any', defaultElevationM: 0, rooms: ['bathroom', 'toilet', 'kitchen', 'studio'], attracts: ['toilet', 'sink', 'shower', 'bathtub', 'washer', 'kitchen_run'] },
  floor_drain: { placement: 'floor', defaultElevationM: 0, rooms: ['bathroom', 'toilet'], attracts: ['shower', 'bathtub', 'washer'] },
  electrical_panel: { placement: 'wall', defaultElevationM: 1.4, rooms: ['hallway'], attracts: [] },
  gas: { placement: 'wall', defaultElevationM: 1.0, rooms: ['kitchen', 'studio'], attracts: ['kitchen_run'] },
  radiator: { placement: 'wall', defaultElevationM: 0.15, rooms: ['living_room', 'bedroom', 'kitchen', 'office', 'bathroom', 'hallway', 'studio'], attracts: [] },
  ac_unit: { placement: 'wall', defaultElevationM: 2.1, rooms: ['living_room', 'bedroom', 'office', 'studio'], attracts: [] },
  extractor: { placement: 'wall', defaultElevationM: 2.2, rooms: ['bathroom', 'toilet', 'kitchen', 'studio'], attracts: [] },
  boiler: { placement: 'wall', defaultElevationM: 1.6, rooms: ['kitchen', 'bathroom', 'balcony', 'studio'], attracts: [] },
  heating_pipe: { placement: 'any', defaultElevationM: 0, rooms: ['living_room', 'bedroom', 'kitchen', 'hallway', 'studio'], attracts: [] },
};

export const TECHNICAL_KIND_LIST = Object.keys(TECHNICAL_KINDS) as TechnicalKind[];

/**
 * A wall split unit's own height — what hangs below the bracket.
 */
export const AC_UNIT_HEIGHT_M = 0.3;
/**
 * How much room is left above it. A split unit draws its air in through the top, so it is
 * hung a hand's width under the ceiling — 15 to 20 cm is the fitter's rule, and this is the
 * middle of it. Any lower and it blows along the ceiling badly; any higher and it starves.
 */
export const AC_CEILING_GAP_M = 0.18;
/** However low the ceiling, the unit does not come down to head height. */
export const AC_MIN_ELEVATION_M = 1.8;

/**
 * Where a point of this kind sits above the floor in *this* room.
 *
 * Every other kind has one usual height — a socket is a socket whatever the ceiling. An air
 * conditioner is the exception: it is hung from the ceiling down, not from the floor up, so
 * in a 3.2 m room it belongs 40 cm higher than in a 2.8 m one. The number is the bottom of
 * the unit, which is what the 3D view and the inspector both read, and the person can
 * change it afterwards like any other height.
 */
export function technicalElevation(kind: TechnicalKind, room?: { heightM?: number } | null): number {
  const info = TECHNICAL_KINDS[kind];
  if (kind !== 'ac_unit') return info.defaultElevationM;
  const ceiling = room?.heightM ?? DEFAULT_WALL_HEIGHT_M;
  return round2(Math.max(AC_MIN_ELEVATION_M, ceiling - AC_CEILING_GAP_M - AC_UNIT_HEIGHT_M));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The works a renovation may need, in the order they happen; `phase` is the calculator's phase number. */
export interface WorkItem {
  key: string;
  phase: number;
}

/** One work per phase of the renovation team's book (`lib/calculator/constants`), in the team's order. */
export const WORK_ITEMS: WorkItem[] = [
  { key: 'strip_out', phase: 0 },
  { key: 'walls', phase: 1 },
  { key: 'heating', phase: 2 },
  { key: 'screed', phase: 3 },
  { key: 'electrical', phase: 4 },
  { key: 'plastering', phase: 5 },
  { key: 'painting', phase: 6 },
  { key: 'plumbing', phase: 7 },
  { key: 'bathroom_prep', phase: 8 },
  { key: 'bathroom_tiling', phase: 9 },
  { key: 'kitchen_tiling', phase: 10 },
  { key: 'flooring', phase: 11 },
  { key: 'ceiling', phase: 12 },
  { key: 'doors', phase: 13 },
  { key: 'debris', phase: 14 },
];

/**
 * The works of the book before the team's, as a saved plan may still carry them, and what
 * each became. Works that no longer exist (insulation, the furniture "phase") map to nothing.
 */
const LEGACY_WORKS: Record<string, string[]> = {
  demolition: [],
  insulation: [],
  waterproofing: ['bathroom_prep'],
  tiling: ['bathroom_tiling', 'kitchen_tiling'],
  doors_windows: ['doors'],
  electrical_finish: ['electrical'],
  plumbing_finish: ['plumbing'],
  sanitary: ['plumbing'],
  furniture: [],
  cleaning: ['debris'],
};

/** A stored works list in today's keys: old keys translated, unknown ones dropped, no repeats. */
export function normalizeWorks(works: readonly string[]): string[] {
  const known = new Set(WORK_ITEMS.map((w) => w.key));
  const out = new Set<string>();
  for (const key of works) {
    for (const next of LEGACY_WORKS[key] ?? [key]) if (known.has(next)) out.add(next);
  }
  return WORK_ITEMS.filter((w) => out.has(w.key)).map((w) => w.key);
}

/**
 * The works grouped by the stage of the house they take it through — the team's own lists
 * set side by side: from an old renovation back to bare walls (the strip-out), what a black
 * frame needs that a white one does not (the walls, the screed, the plaster), what a white
 * frame needs that a green one does not (heating, wiring, plumbing, the bathroom's floor and
 * walls, the doors), and what every one of them still needs to be finished. The checklist
 * offers each stage as its own group, so the person ticks what their renovation needs by
 * where their home stands today.
 */
export interface WorkStage {
  /** The home state the stage starts from — its name is the group's title. */
  homeState: HomeState;
  phases: number[];
}

export const WORK_STAGES: WorkStage[] = [
  { homeState: 'old_renovation', phases: [0] },
  { homeState: 'black_frame', phases: [1, 3, 5] },
  { homeState: 'white_frame', phases: [2, 4, 7, 8, 13] },
  { homeState: 'green_frame', phases: [6, 9, 10, 11, 12, 14] },
];

/** The works of one stage, in the order they happen. */
export function worksForStage(stage: WorkStage): WorkItem[] {
  return WORK_ITEMS.filter((w) => stage.phases.includes(w.phase));
}

/** The works a home state implies — the starting point of the checklist. */
export function defaultWorksForHomeState(homeState: HomeState): string[] {
  const phases = new Set(HOME_STATES[homeState].includedPhases);
  return WORK_ITEMS.filter((w) => phases.has(w.phase)).map((w) => w.key);
}

/** The calculator's phase numbers for a list of works. */
export function phasesForWorks(works: string[]): number[] {
  const wanted = new Set(normalizeWorks(works));
  return WORK_ITEMS.filter((w) => wanted.has(w.key)).map((w) => w.phase);
}

/**
 * The phases an estimate should run: the ticked works when there are any, the home state
 * otherwise — and the home state too when a stored list names nothing that still exists, so
 * every part of the budget works from the same phases.
 */
export function effectivePhases(homeState: HomeState, works?: string[] | null): number[] {
  const ticked = works && works.length > 0 ? phasesForWorks(works) : [];
  return ticked.length > 0 ? ticked : HOME_STATES[homeState].includedPhases;
}

// ---------------------------------------------------------------------------
// Anchors for the layout engine
// ---------------------------------------------------------------------------

export interface TechnicalAnchor {
  kind: TechnicalKind;
  point: Vec2;
}

/** The technical points that belong to a room: inside it, or within reach of its walls. */
export function technicalPointsIn(plan: FloorPlan, room: PlanRoom, reachM = 0.35): TechnicalPoint[] {
  const points = plan.technical?.points ?? [];
  return points.filter((p) => {
    if (p.roomId === room.id) return true;
    if (p.roomId && p.roomId !== room.id) return false;
    if (pointInPolygon(p.position, room.polygon)) return true;
    return roomEdges(room.polygon).some((e) => closestOnSegment(p.position, e.a, e.b).distance <= reachM);
  });
}

/** Per room, the points each archetype wants to be near. */
export function technicalAnchors(plan: FloorPlan): Record<string, TechnicalAnchor[]> {
  const out: Record<string, TechnicalAnchor[]> = {};
  for (const room of plan.rooms) {
    const points = technicalPointsIn(plan, room);
    if (points.length > 0) out[room.id] = points.map((p) => ({ kind: p.kind, point: p.position }));
  }
  return out;
}

/** The anchors an archetype cares about, nearest first. */
export function anchorsFor(kind: string, anchors: TechnicalAnchor[] | undefined): TechnicalAnchor[] {
  if (!anchors) return [];
  return anchors.filter((a) => TECHNICAL_KINDS[a.kind].attracts.includes(kind));
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

export interface TechnicalSuggestion {
  code: 'far_from_sewer' | 'far_from_water' | 'radiator_not_exterior' | 'no_extractor' | 'no_drain';
  roomId: string;
  itemId?: string;
  pointId?: string;
  distanceM?: number;
}

/** Furniture is a fixture: how far it may stand from the pipe it needs before we say so. */
export const MAX_FIXTURE_DISTANCE_M = 1.6;

/**
 * What the technical setup says about the design as it stands: a toilet far from the sewer,
 * a sink far from the water, a radiator on an interior wall, a bathroom with no extractor.
 * Hints, not rules — the person decides.
 */
export function technicalSuggestions(plan: FloorPlan, items: PlacedItem[]): TechnicalSuggestion[] {
  const out: TechnicalSuggestion[] = [];
  const anchors = technicalAnchors(plan);
  for (const room of plan.rooms) {
    const here = anchors[room.id] ?? [];
    const sewer = here.filter((a) => a.kind === 'sewer' || a.kind === 'floor_drain');
    const water = here.filter((a) => a.kind === 'water_supply');
    for (const item of items.filter((i) => i.roomId === room.id)) {
      if (['toilet', 'shower', 'bathtub'].includes(item.slot) && sewer.length > 0) {
        const d = nearest(item.position, sewer);
        if (d > MAX_FIXTURE_DISTANCE_M) out.push({ code: 'far_from_sewer', roomId: room.id, itemId: item.id, distanceM: round1(d) });
      }
      if (['sink', 'kitchen_run', 'washer'].includes(item.slot) && water.length > 0) {
        const d = nearest(item.position, water);
        if (d > MAX_FIXTURE_DISTANCE_M + 0.6) out.push({ code: 'far_from_water', roomId: room.id, itemId: item.id, distanceM: round1(d) });
      }
    }
    const points = technicalPointsIn(plan, room);
    for (const point of points) {
      if (point.kind !== 'radiator') continue;
      // A radiator belongs under a window, on an exterior wall.
      const edges = roomEdges(room.polygon);
      const near = edges
        .map((e) => ({ e, d: closestOnSegment(point.position, e.a, e.b).distance }))
        .sort((p, q) => p.d - q.d)[0];
      if (!near || near.d > 0.4) continue;
      const exterior = room.openings.some((o) => o.wallIndex === near.e.index && o.exterior);
      if (!exterior) out.push({ code: 'radiator_not_exterior', roomId: room.id, pointId: point.id });
    }
    if (room.type === 'bathroom' || room.type === 'toilet') {
      if (!points.some((p) => p.kind === 'extractor')) out.push({ code: 'no_extractor', roomId: room.id });
      if (room.type === 'bathroom' && !points.some((p) => p.kind === 'floor_drain' || p.kind === 'sewer')) out.push({ code: 'no_drain', roomId: room.id });
    }
  }
  return out;
}

function nearest(point: Vec2, anchors: TechnicalAnchor[]): number {
  return Math.min(...anchors.map((a) => Math.hypot(a.point.x - point.x, a.point.z - point.z)));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
