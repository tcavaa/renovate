/**
 * A studio laid out as one space (Nini, 23 Nov 2026, decisions 2, 3.3 and 3.4): where its kitchen
 * goes is chosen by the room — the water, the front door, the windows, the walls — not a fixed strip
 * of a third across its longer side, and what the living part does is chosen with it.
 *
 * The engine still furnishes a studio half by half (`layoutRoom`, `partRoom`): the line between the
 * halves is what prices, finishes and wires each as its type. What this adds is the choice of that
 * line, and of how the living half's sofa stands, from a set of candidate compositions each laid out
 * whole and scored as one space (`compositionScore`): the essentials it keeps — the run, the fridge,
 * the dining table, the sofa, the TV — then the run by the water and off the front door's way, the TV
 * on a real wall at the distance the sofa asks, the sofa's back to the kitchen or its side to it,
 * never facing it; the dining table toward the kitchen and away from the sofa; and a way from the
 * door to every zone (`zonesReached`). The line it chooses is written onto the plan, so the board,
 * the estimate, the matcher, the wiring and the next steps all see the halves the flat was laid out
 * by (`RoomSplit.chosen`: the next generation may choose it again; a line the person set is kept,
 * and only the sofa's way is chosen for it). Pure and deterministic — no draw: the same plan gives
 * the same composition, whatever the seed (the AI designer's brief and the flat it lays agree).
 * Tested in tests/unit/design/studioLayout.test.ts.
 */

import { layoutRoom, type LayoutOptions } from './autoLayout';
import { DINING_SOFA_GAP_M, box, diningCluster, screenOnWall, toBox, zonesReached } from './composition';
import { kitchenWorktopM } from './kitchenCorner';
import { pointInPolygon, pointOnEdge, polygonBounds, polygonCentroid, roomEdges } from './planGeometry';
import { DEFAULT_STUDIO_PARTS, clampT, defaultSplit, effectiveSplit, lineIsTheApps, studioParts } from './studio';
import { KITCHEN_RUN_M, SOFA_TV_M, footprintQuad, isFrontDoor, quadsOverlap } from './rules';
import { QUAD_TOUCH_M } from './pieceGeometry';
import { blockedDoorSwings } from './ruleChecks';
import type { RoomSplit } from '@/lib/calculator/types';
import type { FloorPlan, PlacedItem, PlanRoom, Vec2 } from './types';

/** How deep the kitchen part is tried, metres from the studio's end: a run and its working floor (1.8 m), then room for a table in front of it. */
export const KITCHEN_PART_DEPTHS_M = [2.0, 2.4, 2.8, 3.2, 3.6] as const;
/** The living part keeps at least this much along the studio: a sofa, its table and a TV across from it. */
export const LIVING_PART_MIN_M = 2.8;
/** The water points a kitchen run is fed from and drains to. */
const WATER_KINDS = new Set(['sewer', 'water_supply', 'water_hot']);

/** One way a studio may be laid out: where its line runs, and whether the living half's sofa stands free with its back to the kitchen. */
export interface StudioComposition {
  split: RoomSplit;
  sofaFree: boolean;
}

/** What a composition was scored on — each term apart, for the tests and the audit's report. */
export interface CompositionScore {
  total: number;
  /** The run, the fridge, the dining table (or an island), the sofa, a TV: how many of the five it has. */
  essentials: number;
  /** The zones (the run, the fridge, the dining table, the sofa) a person cannot walk to from the door. */
  unreached: number;
}

/** What a studio is scored against besides its own outline: the water it may be fed from, and the wet rooms beside it. */
export interface StudioContext {
  /** The water points in the studio (`technicalAnchors`: the sewer, the cold and hot water). */
  water: Vec2[];
  /** The bathrooms' and toilets' outlines: a wall shared with one carries the flat's pipes. */
  wetRooms: Vec2[][];
  /** What is seen coming in through the front door (`entranceSightBands`): the kitchen keeps out of it. */
  entrance: Vec2[][];
}

const sameSplit = (a: RoomSplit, b: RoomSplit) => a.axis === b.axis && Math.abs(a.t - b.t) < 0.002 && a.parts[0] === b.parts[0] && a.parts[1] === b.parts[1];

/**
 * The lines a studio's kitchen part is tried at: across either axis, the kitchen at either end, each
 * of `KITCHEN_PART_DEPTHS_M` deep where the living part keeps `LIVING_PART_MIN_M` — and the app's
 * first line (a third, across the longer side), so a composition is never worse than it was.
 */
export function splitCandidates(room: Pick<PlanRoom, 'polygon'>): RoomSplit[] {
  const bounds = polygonBounds(room.polygon);
  const out: RoomSplit[] = [{ ...defaultSplit(room), chosen: true }];
  for (const axis of ['x', 'z'] as const) {
    const extent = axis === 'x' ? bounds.width : bounds.depth;
    for (const depth of KITCHEN_PART_DEPTHS_M) {
      if (extent - depth < LIVING_PART_MIN_M) continue;
      for (const low of [true, false]) {
        const t = clampT(room, axis, low ? depth / extent : 1 - depth / extent);
        const parts: RoomSplit['parts'] = low ? [...DEFAULT_STUDIO_PARTS] : [DEFAULT_STUDIO_PARTS[1], DEFAULT_STUDIO_PARTS[0]];
        const split: RoomSplit = { axis, t, parts, chosen: true };
        if (!out.some((s) => sameSplit(s, split))) out.push(split);
      }
    }
  }
  return out;
}

/** The water and the wet rooms a studio is scored against (`StudioContext`). */
export function studioContext(plan: Pick<FloorPlan, 'rooms'>, room: PlanRoom, anchors: LayoutOptions['anchors'], entranceSight?: LayoutOptions['entranceSight']): StudioContext {
  return {
    water: (anchors?.[room.id] ?? []).filter((a) => WATER_KINDS.has(a.kind)).map((a) => a.point),
    wetRooms: plan.rooms.filter((r) => r.id !== room.id && (r.type === 'bathroom' || r.type === 'toilet')).map((r) => r.polygon),
    entrance: entranceSight?.[room.id] ?? [],
  };
}

/** How far a point is from a polygon's outline (0 inside it). */
function toPolygon(p: Vec2, polygon: Vec2[]): number {
  if (pointInPolygon(p, polygon)) return 0;
  let best = Infinity;
  for (const edge of roomEdges(polygon)) {
    const along = Math.max(0, Math.min(edge.length, (p.x - edge.a.x) * edge.dir.x + (p.z - edge.a.z) * edge.dir.z));
    best = Math.min(best, Math.hypot(p.x - (edge.a.x + edge.dir.x * along), p.z - (edge.a.z + edge.dir.z * along)));
  }
  return best;
}

/**
 * A studio laid out one way, scored as one space. Higher is better; the essentials outweigh all the
 * rest. The terms, each as the decisions ask:
 * - 100 for each essential it has: the run, the fridge, a dining table or an island, the sofa, a TV;
 * - its worktop: 10 from 1.8 m, 5 from 1.5 m (`KITCHEN_RUN_M`);
 * - the water: the run within 30 cm of a water point it has (6 a metre past it, at most 30), else
 *   by a wet room's wall (3 a metre from the nearest bathroom or toilet, at most 15);
 * - the front door: the run out of what is seen coming in (25) and 1.5 m from the door (20 a metre nearer);
 * - the TV: 25 on a real wall (`screenOnWall`), 10 at 2.5–3.5 m from the sofa, 15 a metre off it;
 * - the sofa: 10 its side to the kitchen (the sofa on one wall, the TV across, the kitchen along the
 *   third — Nini's "better still"), 8 its back to it (the divider), 15 off facing the kitchen;
 * - the dining table out of the sitting group (`diningCluster`, no clustering — decision 3.3): 20 a
 *   metre nearer the sofa than 1.2 m, 30 for each metre short of the distance wanted; and toward the
 *   kitchen, 4 a metre further than 2.5 m from the run;
 * - 25 for each zone a person cannot walk to from the door (`zonesReached`), 15 for each door whose
 *   leaf a piece stands in the swing of (`blockedDoorSwings`);
 * - the kitchen part no larger than it needs: 20 for each whole of the studio its share is off a third.
 */
export function compositionScore(room: PlanRoom, items: readonly PlacedItem[], context: StudioContext): CompositionScore {
  const own = items.filter((i) => i.roomId === room.id);
  const first = (...slots: string[]) => own.find((i) => slots.includes(i.slot));
  const run = own.find((i) => i.slot === 'kitchen_run' && !i.legOf);
  const sofa = first('sofa');
  const dining = first('dining_table', 'kitchen_island');
  const tv = first('tv');
  const essentials = [run, first('fridge'), dining, sofa, tv].filter(Boolean).length;
  let total = essentials * 100;

  const worktop = kitchenWorktopM(room, own);
  total += worktop >= KITCHEN_RUN_M.preferred - 1e-6 ? 10 : worktop >= KITCHEN_RUN_M.small - 1e-6 ? 5 : 0;

  const edges = roomEdges(room.polygon);
  if (run) {
    const runBox = box(run);
    if (context.water.length > 0) total -= Math.min(60, 15 * Math.max(0, Math.min(...context.water.map((p) => toBox(p, runBox))) - 0.3));
    else if (context.wetRooms.length > 0) {
      const middle = run.position;
      total -= Math.min(15, 3 * Math.min(...context.wetRooms.map((poly) => toPolygon(middle, poly))));
    }
    // Not what one sees first coming in (the rulebook's kitchen out of the entrance's sight).
    if (context.entrance.some((band) => quadsOverlap(footprintQuad(run), band, QUAD_TOUCH_M))) total -= 25;
    for (const door of room.openings.filter((o) => isFrontDoor(room, o))) {
      const edge = edges.find((e) => e.index === door.wallIndex);
      if (!edge) continue;
      total -= 20 * Math.max(0, 1.5 - toBox(pointOnEdge(edge, door.t), runBox));
    }
  }

  if (tv) total += screenOnWall(room, own) ? 25 : 0;
  const screen = first('tv_unit') ?? tv;
  if (sofa && screen) {
    const d = Math.hypot(sofa.position.x - screen.position.x, sofa.position.z - screen.position.z);
    total += d >= SOFA_TV_M.min && d <= SOFA_TV_M.max ? 10 : -15 * (d < SOFA_TV_M.min ? SOFA_TV_M.min - d : d - SOFA_TV_M.max);
  }

  const parts = studioParts(room);
  const kitchen = parts?.find((p) => p.type === 'kitchen');
  const living = parts?.find((p) => p.type !== 'kitchen');
  if (sofa && kitchen && living) {
    const k = polygonCentroid(kitchen.polygon);
    const l = polygonCentroid(living.polygon);
    const len = Math.hypot(k.x - l.x, k.z - l.z) || 1;
    const facing = (Math.sin(sofa.rotation) * (k.x - l.x) + Math.cos(sofa.rotation) * (k.z - l.z)) / len;
    total += facing > 0.5 ? -15 : facing < -0.5 ? 8 : 10;
  }

  // No clustering (decision 3.3), measured as the whole-flat check measures it (`diningCluster`).
  const cluster = diningCluster(room, own);
  if (cluster) total -= 20 * Math.max(0, DINING_SOFA_GAP_M - cluster.gap) + 30 * Math.max(0, cluster.wanted - cluster.apart);
  // Toward the kitchen: the table within 2.5 m of the run, 4 a metre further.
  if (dining && run) total -= 4 * Math.max(0, toBox(dining.position, box(run)) - 2.5);

  // A door's leaf stopped by a piece in its swing (the rule check's `door_swing_blocked`).
  total -= 15 * blockedDoorSwings(room, own);

  const { unreached } = zonesReached(room, own, ['kitchen_run', 'fridge', 'dining_table', 'kitchen_island', 'sofa']);
  total -= 25 * unreached.length;

  if (kitchen) {
    const share = kitchen.areaM2 / Math.max(1e-6, room.areaM2);
    total -= Math.abs(share - 0.35) * 20;
  }
  return { total, essentials, unreached: unreached.length };
}

/**
 * The best way to lay a studio out (`StudioComposition`), each candidate laid out with the flat's
 * own options but no draw and scored (`compositionScore`): every line of `splitCandidates` where the
 * line is the app's (`lineIsTheApps`), else the person's line alone; each with the living half's sofa
 * against a wall and standing free, its back to the kitchen. Null for a room that is not a studio.
 */
export function bestComposition(room: PlanRoom, options: LayoutOptions, context: StudioContext): (StudioComposition & { score: CompositionScore }) | null {
  if (room.type !== 'studio' || room.polygon.length < 3) return null;
  const base: LayoutOptions = { ...options, rng: undefined, roomRng: undefined };
  const splits = lineIsTheApps(room) ? splitCandidates(room) : [effectiveSplit(room)];
  const scored = (split: RoomSplit, sofaFree: boolean) => {
    const laid = { ...room, split };
    const items = layoutRoom(laid, { ...base, sofaFree: sofaFree ? { [room.id]: true } : undefined });
    return { split, sofaFree, score: compositionScore(laid, items, context) };
  };
  // Ties go to the first tried: the sofa against a wall, the app's first line.
  const tried = [...splits.map((split) => scored(split, false)), ...splits.map((split) => scored(split, true))];
  return tried.reduce((best, c) => (c.score.total > best.score.total + 1e-6 ? c : best));
}

/**
 * The plan with each studio's composition chosen (`bestComposition`): its line written onto the room
 * (`chosen`, where it was the app's to place), and the studios whose sofa stands free, for the layout
 * (`LayoutOptions.sofaFree`). Every other room as it was.
 */
export function composeStudios(plan: FloorPlan, options: LayoutOptions): { plan: FloorPlan; sofaFree: Record<string, boolean> } {
  const sofaFree: Record<string, boolean> = {};
  let changed = false;
  const rooms = plan.rooms.map((room) => {
    const best = bestComposition(room, options, studioContext(plan, room, options.anchors, options.entranceSight));
    if (!best) return room;
    if (best.sofaFree) sofaFree[room.id] = true;
    if (room.split && sameSplit(room.split, best.split) && !!room.split.chosen === !!best.split.chosen) return room;
    changed = true;
    return { ...room, split: best.split };
  });
  return { plan: changed ? { ...plan, rooms } : plan, sofaFree };
}
