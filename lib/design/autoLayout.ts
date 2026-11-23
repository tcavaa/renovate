/**
 * Rule-based furniture layout.
 *
 * Given a room polygon, its doors and windows, and the room program from `catalog.ts`, this
 * decides where every piece goes. It is deliberately not an optimiser and not a model: it is
 * the handful of rules an interior designer actually applies — the bed goes on the wall you
 * see when you walk in, the sofa goes on the longest wall, the coffee table sits a metre in
 * front of it, nothing blocks a door — plus a collision pass to keep it honest.
 *
 * Deterministic unless given an `rng` (`LayoutOptions.rng`, or a stream per room — `roomRng`):
 * generating a design passes freshly seeded ones, so the same plan generated twice is laid out
 * differently — a piece goes to another
 * of the walls or spots that score close to the best, the optional decor comes and goes. Without
 * one (adding a piece, the tests) the same plan always gives the same room, so a person who swaps
 * one product does not have the rest of the furniture jump around.
 *
 * Pure: no THREE, no React, no randomness but the `rng` handed in.
 */

import { partName, partRoom, studioParts } from './studio';
import { closestOnSegment } from './walls';
import type { RoomType } from '@/lib/calculator/types';
import {
  ARCHETYPES,
  ROOM_PROGRAMS,
  getArchetype,
  mainSlot,
  resolveVariant,
  type Archetype,
  type ProgramEntry,
  type Size3,
} from './catalog';
import {
  ON_LINE_M,
  alongEdge,
  boxInPolygon,
  isOpenEdge,
  isPassage,
  pointOnEdge,
  polygonBounds,
  polygonCentroid,
  roomEdges,
  wallRun,
  type PlanEdge,
} from './planGeometry';
import type { Opening, PlacedItem, PlanRoom, SlotKind, StyleId, Vec2 } from './types';
import { isLargeSize, isTightPassage, longSideGaps } from './clearance';
import { blocksWindow, clearsUnder, pieceWall, type KeepClear } from './manipulate';
import { axisBox, backMiddle, boxesOverlap, QUAD_TOUCH_M, wallBehind } from './pieceGeometry';
import { kitchenCornerFloor, kitchenWorktopM } from './kitchenCorner';
import { anchorsFor, type TechnicalAnchor } from './technical';
import { pickNearBest, streamRng, weightedOrder, type RoomRng, type Rng } from './random';
import { LAID_TO_ANOTHER } from './kinds';
import {
  ARMCHAIR_DINING_GAP_M,
  BASIN_COMPACT_M,
  BALCONY_TWO_SEATS_M,
  BATH_PASSAGE_M,
  BATH_PASSAGE_MIN_M,
  BED_SIDE_FREE_M,
  BED_SIDE_HEIGHT_M,
  BLIND_LOWERED,
  BLIND_OVER_HEAD_M,
  BLIND_OVERLAP_M,
  COMPACT_TABLE_SIDES_M,
  CURTAIN_UNDER_CEILING_M,
  DINING_SEAT_M,
  FACING_COUNTERS_M,
  KITCHEN_CIRCULATION_M,
  KITCHEN_RUN_M,
  NARROW_DOUBLE_BED_M,
  MIRROR_NEAR_BASIN_M,
  SHALLOW_WARDROBE_DEPTH_M,
  SMALLER_WARDROBES_M,
  BATH_WITH_SHOWER_M2,
  SHOWER_ACROSS_DEPTHS_M,
  SHOWER_ACROSS_MAX_M,
  SHOWER_FIRST_STYLES,
  SHOWER_LAST_RESORT_M,
  SHOWER_LONG_M2,
  SHOWER_MIN_M,
  SHOWER_ROOMY_M2,
  SHOWER_SIZES_M,
  SOFA_TV_M,
  CONSOLE_BEHIND_SOFA_M,
  SMALL_COFFEE_TABLE_M,
  SOFA_OPEN_LINE_WAY_M,
  TV_CENTRE_M,
  TV_SIDE_MIN_M,
  TV_UNIT_CLEAR_MIN_M,
  TV_UNIT_NARROW_M,
  TV_WIDTH_PER_INCH_M,
  TWO_SEAT_SOFA_M,
  tvInchesFor,
  SPLASH_ZONE_M,
  TV_UNIT_CLEAR_M,
  WARDROBE_DEPTH_M,
  WC_AS_BUILT_DEPTH_M,
  WC_BOX_DEPTH_M,
  WC_COMPACT_DEPTH_M,
  WC_SIDE_M,
  WET_ROOM_TYPES,
  doorClearFloor,
  doorZones,
  footprintQuad,
  quadsOverlap,
  rayToPolygon,
  roomNiches,
  roomSightBands,
  windowDressing,
  type Quad,
} from './rules';

/** Axis-aligned box in the ground plane — for floor kept clear under a hung thing, with the height its bottom is at (`KeepClear`). */
interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  bottom?: number;
}

interface Pose {
  position: Vec2;
  rotation: number;
  size: Size3;
  elevationM: number;
}

export interface LayoutOptions {
  /** Leave the space in front of doors clear. */
  respectDoorSwing?: boolean;
  /** Skip decorative items (rugs, art, plants) — useful for a cheap first render. */
  skipDecor?: boolean;
  /** Per room, the technical points fixtures want to be near (the sewer for the toilet). */
  anchors?: Record<string, TechnicalAnchor[]>;
  /**
   * Per room, floor boxes nothing may stand on — the columns, the strip before each radiator — or,
   * under a hung thing (a towel rail's strip, `KeepClear.bottom`), nothing that reaches up to it.
   */
  obstacles?: Record<string, KeepClear[]>;
  /** Seeded randomness (`lib/design/random`): another good spot, optional decor or not. None: the same room every time. */
  rng?: Rng;
  /**
   * Per room, a stream of its own (`roomStreams`), in place of `rng`: each room — both halves of a
   * studio — draws from its own, so a change in one room leaves every other room laid out as it was.
   */
  roomRng?: RoomRng;
  /** Per room, what is seen coming in through the flat's front door (`entranceSightBands`): the kitchen keeps out of it. */
  entranceSight?: Record<string, Quad[]>;
  /** The flat's style: it dresses the windows (`windowDressing` — roller blinds or curtains). */
  styleId?: StyleId | null;
  /**
   * How many rooms typed bathroom the flat has (`layoutPlan` counts them): in its only bathroom the
   * basin and the shower are as important as each other, in a second the basin comes first (`wetRank`).
   * None: one.
   */
  bathrooms?: number;
}

/**
 * What the design rules (`lib/design/rules.ts`) ask of a spot, per room: the bands seen straight
 * through its doorways (no WC in one, a bed rather not) and through the flat's front door (the
 * kitchen rather not), and what is already standing (an island 120 cm off the run).
 */
interface RuleContext {
  doorBands: Quad[];
  entranceBands: Quad[];
  placed: PlacedItem[];
  /**
   * A bathroom's or toilet's free floor in front of each fixture placed so far (`BATH_PASSAGE_M`):
   * the next fixture keeps out of it, and keeps its own clear of what stands — a basin facing the
   * WC across a narrow room left nobody room to pass (the owner's screenshot).
   */
  passages: Box[];
  /**
   * For the piece being laid, where the piece the program stands against a wall off it next would
   * stand were it put at this pose — a sofa's TV unit (`layoutArea`'s dry run): the sofa's spot is
   * chosen knowing whether its unit then has a wall. None for any other piece.
   */
  screenFor?: (pose: Pose) => Pose | null;
}

/** Decor a generated room may go without, and how likely each is to be laid out when it fits. */
const OPTIONAL_DECOR: Record<string, number> = {
  artwork: 0.8,
  plant: 0.7,
  // More floor lamps (the owner's notes): a room that has room for one nearly always gets it.
  floor_lamp: 0.95,
  armchair: 0.75,
  bookshelf: 0.75,
  dresser: 0.8,
  rug: 0.85,
  rug_bed: 0.8,
  // Every window is dressed (the rulebook, G-20): curtains and blinds are never left out.
  stool: 0.6,
};

/** How high a TV over its unit reaches, metres: the band of the unit's wall that is kept clear of windows. */
const TV_TOP_M = 1.5;

/** The fixtures of a bathroom or a toilet that each want free floor in front (`BATH_PASSAGE_M`). */
const WET_FIXTURES = new Set(['toilet', 'sink', 'shower', 'bathtub', 'washer']);

/** What each of a wet room's fixtures is worth to it, for choosing among layouts (`wetScore`). */
const WET_WEIGHT: Record<string, number> = { toilet: 10, sink: 6, shower: 5, bathtub: 5, washer: 2 };

/**
 * The orders a wet room's fixtures are tried in, best first on a tie: the basin first (it takes
 * the wall seen from the door — the owner: "you could have placed the washbasin directly in front
 * of the wall you see when you open the door"), then the bath and the shower their corners, then
 * the WC; the WC after the basin; the WC first; the bath and the shower first. A WC laid out first
 * in the middle of a wall left no corner wide enough for a shower, and the shower first can leave a
 * narrow room no place for the WC. What is not a fixture (the mirror) keeps its place after them.
 */
const WET_ORDERS = [
  ['sink', 'bathtub', 'shower', 'toilet', 'washer'],
  ['sink', 'toilet', 'bathtub', 'shower', 'washer'],
  ['toilet', 'sink', 'bathtub', 'shower', 'washer'],
  ['bathtub', 'shower', 'sink', 'toilet', 'washer'],
];

function wetOrders(program: ProgramEntry[], orders: string[][] = WET_ORDERS): ProgramEntry[][] {
  const fixtures = program.filter((e) => WET_FIXTURES.has(getArchetype(e.kind)?.slot ?? ''));
  const rest = program.filter((e) => !fixtures.includes(e));
  const seen = new Set<string>();
  const out: ProgramEntry[][] = [];
  for (const kinds of orders) {
    const ordered = [...kinds.map((k) => fixtures.find((e) => e.kind === k)).filter((e): e is ProgramEntry => !!e), ...fixtures.filter((e) => !kinds.includes(e.kind))];
    const key = ordered.map((e) => e.kind).join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([...ordered, ...rest]);
  }
  return out;
}

/** How good a wet room's layout is: its fixtures by worth, less for each that leaves no way to it. */
function wetScore(items: PlacedItem[]): number {
  const fixtures = items.filter((i) => WET_FIXTURES.has(i.slot));
  let score = fixtures.reduce((sum, i) => sum + (WET_WEIGHT[i.slot] ?? 0), 0);
  for (const item of fixtures) {
    const front = clearanceBox({ position: item.position, rotation: item.rotation, size: item.size, elevationM: 0 }, BATH_PASSAGE_MIN_M - 0.02);
    if (fixtures.some((o) => o !== item && overlaps(front, boxFor({ position: o.position, rotation: o.rotation, size: o.size, elevationM: 0 })))) score -= 4;
  }
  return score;
}

/** The free floor a fixture is reached over: along its front, this wide at least (or its own width). */
const WET_ACCESS_M = 0.6;

/**
 * How many of a wet room's fixtures leave no way to them (`wetLayout`'s fallbacks take none that
 * does): the 38 cm before a fixture with no free stretch `WET_ACCESS_M` wide, or as wide as the
 * fixture, along it — a shower across the end of a room is stepped into beside the WC before part
 * of it, a basin or a WC needs its whole front.
 */
function blockedFixtures(items: PlacedItem[]): number {
  const fixtures = items.filter((i) => WET_FIXTURES.has(i.slot));
  return fixtures.filter((item) => {
    const pose = { position: item.position, rotation: item.rotation, size: item.size, elevationM: 0 };
    const front = clearanceBox(pose, BATH_PASSAGE_MIN_M - 0.02);
    // Along the fixture's width: the stretches of its front another fixture stands in.
    const across = Math.abs(Math.cos(item.rotation)) > 0.5;
    const [lo, hi] = across ? [front.minX, front.maxX] : [front.minZ, front.maxZ];
    const taken = fixtures
      .filter((o) => o !== item)
      .map((o) => boxFor({ position: o.position, rotation: o.rotation, size: o.size, elevationM: 0 }))
      .filter((box) => overlaps(front, box))
      .map((box) => (across ? [box.minX, box.maxX] : [box.minZ, box.maxZ]) as [number, number])
      .sort((a, b) => a[0] - b[0]);
    let free = 0;
    let from = lo;
    for (const [a, b] of taken) {
      free = Math.max(free, Math.min(a, hi) - from);
      from = Math.max(from, b);
    }
    free = Math.max(free, hi - from);
    return free < Math.min(WET_ACCESS_M, hi - lo) - 0.01;
  }).length;
}

/**
 * A small bathroom's fallbacks (Nini, 23 Nov 2026, decision 3.1), each tried only when the room
 * would go without an essential (`missesEssential`), in her order and each with the ones before it:
 * the shower across the end of a narrow bathroom before a corner (`acrossFirst`); a shower instead
 * of the bath (`withoutBath`: the orders laid without the bath as well — and without the shower
 * besides the bath, which has its own); a smaller WC and a compact
 * basin (`compact`); a shower of 70 × 90 cm (`smallShower`). Her first, the door's smaller clear
 * floor, is the rule for every bathroom (`doorClearFloor`); her fifth, the mirror near the basin, is
 * the mirror's own second try (`mirrorNearBasin`) — it takes no floor from anything. Her last
 * resort, a sliding or outward-opening door, is not the layout's to change.
 */
interface WetFallback {
  acrossFirst?: boolean;
  withoutBath?: boolean;
  compact?: boolean;
  smallShower?: boolean;
}

/** The draws each fallback's layout is tried with besides the best spots (`wetLayout`). */
const FALLBACK_DRAWS = [0, 1, 2, 3, 4, 5];

const WET_FALLBACKS: WetFallback[] = [
  {},
  { acrossFirst: true },
  { acrossFirst: true, withoutBath: true },
  { acrossFirst: true, withoutBath: true, compact: true },
  { acrossFirst: true, withoutBath: true, compact: true, smallShower: true },
];

/**
 * The orders a fallback tries a wet room's fixtures in: `WET_ORDERS`, and Nini's order of what
 * must be had (the WC, the basin, the shower, the washing machine, the bath: what is laid first gets
 * the floor) with the shower first too (across the end of a narrow room, the rest has a square
 * floor); without the bath as well, where the fallback takes a shower instead of it.
 */
const FALLBACK_ORDERS = [...WET_ORDERS, ['toilet', 'sink', 'shower', 'washer', 'bathtub'], ['shower', 'toilet', 'sink', 'washer', 'bathtub']];

function fallbackOrders(program: ProgramEntry[], relax: WetFallback): ProgramEntry[][] {
  const both = wetOrders(program, FALLBACK_ORDERS);
  if (!relax.withoutBath || !program.some((e) => e.kind === 'bathtub')) return both;
  // The shower instead of the bath — and the bath with no shower besides it (a bath has its own,
  // the program's rule): one of the two where the room has no floor for both and its essentials.
  const without = (kind: string) => wetOrders(program.filter((e) => e.kind !== kind), FALLBACK_ORDERS);
  return [...both, ...without('shower'), ...without('bathtub')];
}

/**
 * How a wet room's layout ranks by what it must have (Nini, decision 3.1), compared in turn: the
 * WC; the basin and a shower or a bath — the same importance in a flat's only bathroom, else the
 * basin first; the mirror; the washing machine; a bath (a larger room's); then `wetScore`.
 */
export function wetRank(items: PlacedItem[], onlyBathroom: boolean): number[] {
  const has = (...slots: string[]) => (items.some((i) => slots.includes(i.slot)) ? 1 : 0);
  const basin = has('sink');
  const wash = has('shower', 'bathtub');
  return [has('toilet'), ...(onlyBathroom ? [basin + wash] : [basin, wash]), has('mirror'), has('washer'), has('bathtub'), wetScore(items)];
}

function ranksAbove(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-9) return a[i] > b[i];
  return false;
}

/** Whether a wet room's layout goes without a piece it must have: the WC, the basin, its mirror, a bathroom's shower or bath. */
function missesEssential(room: PlanRoom, items: PlacedItem[]): boolean {
  const has = (...slots: string[]) => items.some((i) => slots.includes(i.slot));
  return !has('toilet') || !has('sink') || !has('mirror') || (room.type === 'bathroom' && !has('shower', 'bathtub'));
}

/**
 * Whether a wet room's basin keeps a stretch of its wall out of the splash zone of the shower and
 * the bath (`SPLASH_ZONE_M`), where the basin's socket goes (`electrical.ts`): with none it would
 * stand in the zone. A fallback that lays a room so is not taken (`wetLayout`).
 */
function basinSocketDry(room: PlanRoom, items: PlacedItem[]): boolean {
  const sink = items.find((i) => i.slot === 'sink');
  const wet = items.filter((i) => i.slot === 'shower' || i.slot === 'bathtub').map((i) => boxFor({ ...i, elevationM: 0 }));
  if (!sink || wet.length === 0) return true;
  const wall = wallBehind(sink, roomEdges(room.polygon), { facing: null, by: 'distance', max: 0.45 });
  if (!wall) return true;
  for (let s = 0.05; s <= wall.edge.length - 0.05 + 1e-9; s += 0.05) {
    const point = pointOnEdge(wall.edge, s / wall.edge.length);
    if (wet.every((box) => distanceToBox(point, box) >= SPLASH_ZONE_M)) return true;
  }
  return false;
}

/**
 * A wet room's fixtures as the engine lays them: in whichever of a few orders gives the best room
 * (`wetScore`), as always; and where that room goes without an essential, Nini's fallbacks in turn
 * (`WET_FALLBACKS`), each kept only when it ranks above what the room had (`wetRank`), leaves a way
 * to every fixture and the basin's socket out of the splash zone — the first that gives the room
 * every essential and every fixture it had ends the ladder. A room that has them all is laid as it
 * always was.
 */
function wetLayout(room: PlanRoom, options: LayoutOptions, idPrefix: string, doorBands: Quad[]): PlacedItem[] {
  const program = ROOM_PROGRAMS[room.type] ?? [];
  let best: { items: PlacedItem[]; score: number } | null = null;
  for (const candidate of wetOrders(program)) {
    const items = layoutArea(room, options, idPrefix, doorBands, candidate);
    const score = wetScore(items);
    if (!best || score > best.score) best = { items, score };
  }
  if (!best || !missesEssential(room, best.items)) return best?.items ?? [];
  const only = (options.bathrooms ?? 1) <= 1;
  // The room as laid gives way only to a layout with more of what it must have; one fallback's
  // layout to another's with as much and a better `wetScore` too.
  let kept = { items: best.items, rank: wetRank(best.items, only), fallback: false };
  // A room this tight has few layouts that hold everything, and one draw can miss them: each
  // fallback is laid with no draw (every piece at its best spot) and, generating, with a few draws
  // of its own — streams from a number read off the room as the draw laid it, so each is laid the
  // same whatever was tried before it, and the room's own stream is drawn no further.
  const seed = options.rng ? Math.round(best.items.reduce((sum, i) => sum + i.position.x * 7919 + i.position.z * 104729 + i.rotation * 31, 0) * 1000) : null;
  const drawsOf = (key: string): LayoutOptions[] => [{ ...options, rng: undefined }, ...(seed == null ? [] : FALLBACK_DRAWS.map((k) => ({ ...options, rng: streamRng(seed, `${key}:${k}`) })))];
  for (const [level, relax] of WET_FALLBACKS.entries()) {
    for (const candidate of fallbackOrders(program, relax)) for (const drawn of drawsOf(`${level}:${candidate.map((e) => e.kind).join(',')}`)) {
      const items = layoutArea(room, drawn, idPrefix, doorBands, candidate, relax);
      // A fallback leaves a way to every fixture and the basin's socket out of the splash zone.
      if (blockedFixtures(items) > 0 || !basinSocketDry(room, items)) continue;
      const rank = wetRank(items, only);
      const musts = rank.slice(0, -1);
      const keptMusts = kept.rank.slice(0, -1);
      if (ranksAbove(musts, keptMusts) || (kept.fallback && !ranksAbove(keptMusts, musts) && ranksAbove(rank, kept.rank))) kept = { items, rank, fallback: true };
    }
    // Done once it has every essential and every fixture it had — else on, for a layout that ranks
    // higher still (a bath given up for the mirror may come back without the shower beside it).
    if (!missesEssential(room, kept.items) && best.items.every((i) => !WET_FIXTURES.has(i.slot) || kept.items.some((k) => k.slot === i.slot))) break;
  }
  return kept.items;
}

// ---------------------------------------------------------------------------
// Kitchens: Nini's fallbacks (decision 3.5)
// ---------------------------------------------------------------------------

/**
 * A kitchen's fallbacks (Nini, 23 Nov 2026, decision 3.5), tried only where the kitchen as laid goes
 * without one of its must-haves — the run (its sink, its hob and the oven under it), the fridge, and in
 * a kitchen of its own a dining table (or an island) — or its worktop is short of the 1.8 m she
 * prefers (`KITCHEN_RUN_M`). In her order: the run on another wall, so the table fits (`runEdge`); the
 * fridge on a wall of its own (`fridgeFirst`: stood before the run, which then stops short of it); a
 * shorter run with the fridge hard beside it, slid along its wall (`shorter`, down to 1.2 m, the fridge
 * at the run's one end or its other first); a two-seat table where no table for four fits
 * (`smallTable`). Her fifth, the L's leg under a window, is
 * the corner pass's already (a leg runs under a sill at the worktop or over it, `kitchenLeg`); her
 * sixth, an island, is laid only where its 1.2 m ring fits — the room's geometry decides.
 */
interface KitchenFallback {
  runEdge?: number;
  fridgeFirst?: boolean;
  /**
   * The shortest straight run it lays is `KITCHEN_RUN_M.studio`, 1.2 m: what a kitchen is held to is
   * its worktop, the run with the leg turned round its corner (`kitchenLayout`).
   */
  shorter?: { fridgeBefore: boolean };
  smallTable?: boolean;
}

/** What a room's layout is tried with besides its program's order: a wet room's fallbacks, a kitchen's. */
type LayoutRelax = WetFallback & KitchenFallback;

/**
 * How a kitchen's layout ranks (Nini, decision 3.5), compared in turn: how many of its must-haves it
 * has — the run, the fridge and, where `withTable`, a dining table or an island; they are of one
 * importance, unranked — then its worktop by `KITCHEN_RUN_M` (2 from 1.8 m, 1 from 1.5 m, else 0).
 */
export function kitchenRank(items: readonly PlacedItem[], worktopM: number, withTable: boolean): number[] {
  const has = (...slots: string[]) => (items.some((i) => slots.includes(i.slot)) ? 1 : 0);
  const musts = has('kitchen_run') + has('fridge') + (withTable ? has('dining_table', 'kitchen_island') : 0);
  const worktop = worktopM >= KITCHEN_RUN_M.preferred - 1e-6 ? 2 : worktopM >= KITCHEN_RUN_M.small - 1e-6 ? 1 : 0;
  return [musts, worktop];
}

/** Whether a layout has at least as many of every kind as another: a fallback takes no piece the room had. */
function keepsEveryPiece(had: readonly PlacedItem[], items: readonly PlacedItem[]): boolean {
  const count = (list: readonly PlacedItem[]) => list.reduce((m, i) => m.set(i.kind, (m.get(i.kind) ?? 0) + 1), new Map<string, number>());
  const now = count(items);
  return [...count(had)].every(([kind, n]) => (now.get(kind) ?? 0) >= n);
}

/**
 * A kitchen as the engine lays it: as it always was, with its draw; and where that kitchen goes
 * without a must-have or its worktop is short of 1.8 m (`kitchenRank`), Nini's fallbacks in turn
 * (`KitchenFallback`), each laid with no draw, kept only when it ranks above what the kitchen had,
 * takes none of its pieces (`keepsEveryPiece`) and makes the worktop — the run and the leg it turns
 * round its corner (`kitchenWorktopM`) — no shorter than the room's least (`KITCHEN_RUN_M`: 1.5 m, a
 * studio's kitchen 1.2 m) where it was longer: a 1.2 m run with a 1.4 m leg is a kitchen's worktop.
 * The first level that gives the kitchen everything ends the ladder. A studio's kitchen half (`idPrefix`) is held to its run and
 * its fridge: its table may be the living half's, and the studio laid as one space is still to come.
 */
function kitchenLayout(room: PlanRoom, options: LayoutOptions, idPrefix: string, doorBands: Quad[]): PlacedItem[] {
  const program = ROOM_PROGRAMS.kitchen;
  const first = layoutArea(room, options, idPrefix, doorBands, program);
  const studio = idPrefix !== '';
  const withTable = !studio;
  const least = studio ? KITCHEN_RUN_M.studio : KITCHEN_RUN_M.small;
  const judged = (items: PlacedItem[]) => {
    const worktop = kitchenWorktopM(room, items);
    return { items, worktop, rank: kitchenRank(items, worktop, withTable) };
  };
  const full = (rank: number[]) => rank[0] === (withTable ? 3 : 2) && rank[1] === 2;
  let kept = judged(first);
  if (full(kept.rank)) return first;
  const had = kept;

  const walls = roomEdges(room.polygon).filter((e) => !isOpenEdge(room, e.index) && e.length >= KITCHEN_RUN_M.studio).map((e) => e.index);
  const fridgeFirst = [...program.filter((e) => e.kind === 'fridge'), ...program.filter((e) => e.kind !== 'fridge')];
  const base: KitchenFallback[][] = [
    walls.map((runEdge) => ({ runEdge })),
    [{ fridgeFirst: true }, ...walls.map((runEdge) => ({ fridgeFirst: true, runEdge }))],
    [false, true].flatMap((fridgeBefore) => [{ shorter: { fridgeBefore } }, ...walls.map((runEdge) => ({ shorter: { fridgeBefore }, runEdge }))]),
  ];
  // Her fourth, the smaller table, with each of the three before it — and alone.
  const levels = withTable ? [...base, [{}, ...base.flat()].map((f) => ({ ...f, smallTable: true }))] : base;
  for (const level of levels) {
    for (const fallback of level) {
      const items = layoutArea(room, { ...options, rng: undefined }, idPrefix, doorBands, fallback.fridgeFirst ? fridgeFirst : program, fallback);
      const tried = judged(items);
      if (!ranksAbove(tried.rank, kept.rank) || !keepsEveryPiece(had.items, items)) continue;
      if (tried.worktop < Math.min(had.worktop, least) - 1e-6) continue;
      kept = tried;
    }
    if (full(kept.rank)) break;
  }
  return kept.items;
}

/**
 * What the layout furnishes a balcony with (Nini, 23 Nov 2026, decision 3.6): a room to sit out in,
 * whatever its size — a compact table against a wall away from the door (`roomPiece`,
 * `placeCompactTable`), two chairs at it where the balcony is deep enough and one where it is narrow
 * (`balconySeats`), and planters in its corners, off its windows and its door (`cornerCoversOpening`);
 * the furniture first. The shelf's balcony (`ROOM_PROGRAMS.balcony`) is what the studio's rooms were
 * made from, and stays as it was.
 */
const BALCONY_PROGRAM: ProgramEntry[] = [
  { kind: 'dining_table', count: 1, minAreaM2: 0 },
  { kind: 'dining_chair', count: 'fill', minAreaM2: 0 },
  { kind: 'plant', count: 2, minAreaM2: 0 },
];

/** How many sit at a balcony's table (decision 3.6): two where the balcony is `BALCONY_TWO_SEATS_M` deep or more, one where it is narrower. */
function balconySeats(room: PlanRoom): number {
  const bounds = polygonBounds(room.polygon);
  return Math.min(bounds.width, bounds.depth) >= BALCONY_TWO_SEATS_M - 1e-6 ? 2 : 1;
}

/**
 * A program's piece as this room lays it: on a balcony the dining table is a compact one against a
 * wall away from the door (`COMPACT_TABLE_SIDES_M`, `placeCompactTable`); in a kitchen trying the
 * two-seat table (`smallTable`), the table and its chairs are laid in a kitchen of any size. Anything
 * else as it is.
 */
function roomPiece(entry: ProgramEntry, room: PlanRoom, options: Pick<LayoutOptions, 'styleId' | 'skipDecor'>, relax: LayoutRelax): { kind: string; archetype: Archetype } | null {
  const dining = entry.kind === 'dining_table' || entry.kind === 'dining_chair';
  const piece = programPiece(relax.smallTable && room.type === 'kitchen' && dining ? { ...entry, minAreaM2: 0 } : entry, room, options);
  if (!piece || room.type !== 'balcony' || piece.archetype.slot !== 'dining_table') return piece;
  const side = COMPACT_TABLE_SIDES_M[0];
  return { ...piece, archetype: { ...piece.archetype, size: { width: side, depth: side, height: piece.archetype.size.height }, placement: { type: 'wall', prefer: 'opposite-door', clearanceM: 0.6 } } };
}

/**
 * A compact table against a wall (decision 3.5's two-seat table, a balcony's): the sides of
 * `COMPACT_TABLE_SIDES_M` in turn, at the wall `prefer` asks for, turned a quarter so its two seats
 * (`seatSlots`, along a square table's sides) face each other along the wall, its back to the wall
 * seating nobody. Looked for with the floor of a chair either side of it free along the wall
 * (`COMPACT_SEAT_M`), else of one chair beside it — the chairs then sit where the matcher seats them,
 * not pushed under the table past a door's clear floor. Never a table no chair can sit at.
 */
function placeCompactTable(archetype: Archetype, room: PlanRoom, walled: PlanEdge[], occupied: Box[], prefer: Parameters<typeof placeAgainstWall>[4], clearanceM: number, rng: Rng | undefined, rules: RuleContext): Pose | null {
  for (const seats of [2, 1]) {
    for (const side of COMPACT_TABLE_SIDES_M) {
      const group = placeAgainstWall({ ...archetype, size: { width: side + seats * COMPACT_SEAT_M, depth: side, height: archetype.size.height } }, room, walled, occupied, prefer, clearanceM, true, [], rng, undefined, rules);
      if (!group) continue;
      // With one chair, the table at one end of the floor found, the chair's at the other.
      const shift = seats === 1 ? COMPACT_SEAT_M / 2 : 0;
      const right = { x: Math.cos(group.rotation), z: -Math.sin(group.rotation) };
      const position = { x: group.position.x - right.x * shift, z: group.position.z - right.z * shift };
      return { ...group, position, rotation: group.rotation + Math.PI / 2, size: { width: side, depth: side, height: archetype.size.height } };
    }
  }
  return null;
}

/** The floor a chair at a compact table takes beside it along the wall: a dining chair's 50 cm, less the 12 cm it is tucked under the table (`DINING_CHAIR_TUCK_M`). */
const COMPACT_SEAT_M = 0.4;

/** A dining table seats four at least (the rulebook, K-10 and L-6). */
const MIN_DINING_TABLE_M = 1.2;
/** A living room's dining table stands this far from the sofa, its coffee table, the armchair and the TV unit. */
const DINING_LOUNGE_GAP_M = 1.0;
/** Free floor all round a kitchen island (K-6). */
export const ISLAND_CLEAR_M = 1.2;

/** How far below the best spot's score a spot may be and still be drawn (`pickNearBest`). */
const SPOT_SPREAD = 10;
/** A double bed's spread: another wall of the same merit, not another stretch of its wall. */
const BED_SPREAD = 3;

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

export function layoutPlan(rooms: PlanRoom[], given: LayoutOptions = {}): PlacedItem[] {
  const options = { ...given, bathrooms: given.bathrooms ?? rooms.filter((r) => r.type === 'bathroom').length };
  const placed = rooms.flatMap((room) => layoutRoom(room, options));
  // The washing machine is the bathroom's; when no bathroom has room for it, the hall's (by the
  // entrance, with the technical things), else the kitchen's — a studio's kitchen half is a
  // kitchen for this, as it is for everything else that is laid out — else the balcony's (Nini,
  // decision 3.6).
  if (!placed.some((p) => p.slot === 'washer') && rooms.some((r) => r.type === 'bathroom')) {
    for (const type of WASHER_FALLBACK_ROOMS) {
      const area = areasOfType(rooms, type, options).sort((a, b) => b.room.areaM2 - a.room.areaM2)[0];
      if (!area) continue;
      // On a balcony against a wall, never free in its way; and before its table and planters — the
      // flat's machine comes before them — the balcony laid again round it where it has no room left.
      if (type === 'balcony') {
        const relaid = balconyWithWasher(area.room, options);
        if (relaid) {
          placed.splice(0, placed.length, ...placed.filter((p) => p.roomId !== area.room.id), ...relaid);
          break;
        }
        continue;
      }
      // A kitchen whose run is short of a kitchen turns its corner once the flat is matched
      // (`fitKitchenCorners`): the machine stands against a wall off the floor that corner would
      // take, where the kitchen has such a wall — it stood 60 cm along the leg's wall and the
      // kitchen had no corner. Where it has none, the machine stands as it would with no corner
      // to keep (a flat keeps its washing machine).
      const whole = rooms.find((r) => r.id === area.room.id);
      const corner = whole ? kitchenCornerFloor(whole, placed) : [];
      const washer =
        (corner.length > 0 ? additionalPiece(area.room, 'washer', placed, undefined, [...area.obstacles, ...corner], false) : null) ??
        placeAdditional(area.room, 'washer', placed, undefined, area.obstacles);
      if (washer) {
        placed.push({ ...washer, id: `${area.room.id}-${area.idPrefix}washer-0` });
        break;
      }
    }
  }
  return placed;
}

/**
 * The rooms of a type as the engine furnishes them: the rooms typed so, and the halves of studios
 * that are — each half a room of its own (`partRoom`), with the whole studio's door approaches
 * among what it may not stand on, as when the half is laid out (`layoutRoom`).
 */
function areasOfType(rooms: PlanRoom[], type: RoomType, options: LayoutOptions): Array<{ room: PlanRoom; obstacles: Box[]; idPrefix: string }> {
  return rooms.flatMap((room) => {
    const obstacles = options.obstacles?.[room.id] ?? [];
    const parts = studioParts(room);
    if (!parts) return room.type === type ? [{ room, obstacles, idPrefix: '' }] : [];
    const keepouts = options.respectDoorSwing === false ? [] : doorKeepouts(room, roomEdges(room.polygon));
    return parts.filter((part) => part.type === type).map((part) => ({ room: partRoom(room, part), obstacles: [...obstacles, ...keepouts], idPrefix: `${partName(part)}-` }));
  });
}

/** Where the washing machine goes when no bathroom has room for it, in this order (Nini, decision 3.6). */
const WASHER_FALLBACK_ROOMS: RoomType[] = ['hallway', 'kitchen', 'balcony'];

/**
 * A balcony laid out with the flat's washing machine (`layoutPlan`'s last resort): the machine
 * against a wall first, then the balcony's own program round it, from the balcony's own draw. Null
 * where no wall of it takes the machine.
 */
function balconyWithWasher(room: PlanRoom, given: LayoutOptions): PlacedItem[] | null {
  const options = given.roomRng ? { ...given, rng: given.roomRng(room.id), roomRng: undefined } : given;
  const program = [{ kind: 'washer', count: 1, minAreaM2: 0 }, ...BALCONY_PROGRAM];
  const items = layoutArea(room, options, '', roomSightBands(room).map((b) => b.quad), program);
  return items.some((i) => i.slot === 'washer') ? items : null;
}

export function layoutRoom(room: PlanRoom, given: LayoutOptions = {}): PlacedItem[] {
  // The room's own stream, where generation hands one per room — and a studio's half its own
  // (`partName`): a change in the kitchen half leaves the living half's draw as it was.
  const drawn = (part?: string) => (given.roomRng ? { ...given, rng: given.roomRng(room.id, part), roomRng: undefined } : given);
  // A studio is furnished part by part: the kitchen's program in the kitchen half, the living
  // room's in the other, each half a room of its own for the engine, with the windows and doors
  // on its walls (`partRoom`). The doors belong to the whole room, so their clear approach is kept
  // free in both halves; the line between them is open, not a wall — nothing stands against it,
  // runs along it or hangs on it.
  const parts = studioParts(room);
  if (parts) {
    const keepouts = given.respectDoorSwing === false ? [] : doorKeepouts(room, roomEdges(room.polygon));
    const obstacles = [...(given.obstacles?.[room.id] ?? []), ...keepouts];
    return parts.flatMap((part) =>
      layoutArea(
        partRoom(room, part),
        { ...drawn(partName(part)), respectDoorSwing: false, obstacles: { ...given.obstacles, [room.id]: obstacles } },
        `${partName(part)}-`,
        roomSightBands(room).map((b) => b.quad)
      )
    );
  }
  return layoutArea(room, drawn(), '', roomSightBands(room).map((b) => b.quad));
}

/**
 * The piece a program entry lays in this room (a studio's half is a room of its own, `partRoom`), or
 * null where the room gets none of it: too small, a bath where the style showers, no window for a
 * curtain. What the AI designer is asked about is gated here too (`programKinds`).
 */
export function programPiece(entry: ProgramEntry, room: PlanRoom, options: Pick<LayoutOptions, 'styleId' | 'skipDecor'> = {}): { kind: string; archetype: Archetype } | null {
  const kind = windowDressing(resolveVariant(entry, room.areaM2, room.polygon), room.type, options.styleId);
  const archetype = getArchetype(kind);
  if (!archetype) return null;

  if (options.skipDecor && archetype.ghost && archetype.slot !== 'rug') return null;

  const gate = entry.minAreaM2 ?? archetype.minRoomAreaM2 ?? 0;
  if (room.areaM2 < gate) return null;
  // A Scandinavian or Industrial bathroom is a shower first: a bath only where both fit.
  if (archetype.slot === 'bathtub' && options.styleId && SHOWER_FIRST_STYLES.includes(options.styleId) && room.areaM2 < BATH_WITH_SHOWER_M2) return null;
  // A curtain or a blind needs a window: a room without one draws nothing for it.
  if (archetype.placement.type === 'window' && ownWindows(room).length === 0) return null;
  return { kind, archetype };
}

/** A small bathroom's fourth fallback (`WetFallback.compact`): the WC 48 cm deep, the basin 45 × 35 cm; anything else as it is. */
function compacted(piece: { kind: string; archetype: Archetype } | null, relax: WetFallback): { kind: string; archetype: Archetype } | null {
  if (!piece || !relax.compact) return piece;
  const { archetype } = piece;
  if (archetype.slot === 'toilet') return { ...piece, archetype: { ...archetype, size: { ...archetype.size, depth: WC_COMPACT_DEPTH_M } } };
  if (archetype.slot === 'sink') return { ...piece, archetype: { ...archetype, size: { ...archetype.size, ...BASIN_COMPACT_M } } };
  return piece;
}

function layoutArea(room: PlanRoom, options: LayoutOptions, idPrefix: string, doorBands: Quad[] = [], order?: ProgramEntry[], relax: LayoutRelax = {}): PlacedItem[] {
  // A bathroom's or a toilet's fixtures are laid out in whichever of a few orders gives the best
  // room: the WC, then the most fixtures, each with a way past it. No one order serves every room —
  // the basin first gives a narrow bathroom its basin at the end, the shower first a square one its
  // corner, and either can leave a narrow room no place for the WC.
  // Where that room goes without an essential, a small bathroom's fallbacks (`wetLayout`).
  if (!order && WET_ROOM_TYPES.includes(room.type)) return wetLayout(room, options, idPrefix, doorBands);
  // A kitchen as it always was, and where it goes without a must-have, Nini's fallbacks (`kitchenLayout`).
  if (!order && room.type === 'kitchen') return kitchenLayout(room, options, idPrefix, doorBands);
  const program = order ?? (room.type === 'balcony' ? BALCONY_PROGRAM : ROOM_PROGRAMS[room.type]) ?? [];
  const edges = roomEdges(room.polygon);
  if (edges.length === 0) return [];

  const placed: PlacedItem[] = [];
  const occupied: Box[] = [];

  // Doors need a clear approach, so their swing area is occupied before anything is placed;
  // a column is simply in the way.
  if (options.respectDoorSwing !== false) {
    for (const box of doorKeepouts(room, edges)) occupied.push(box);
  }
  for (const box of options.obstacles?.[room.id] ?? []) occupied.push(box);
  const anchors = options.anchors?.[room.id];

  let counter = 0;
  const nextId = (kind: string) => `${room.id}-${idPrefix}${kind}-${counter++}`;
  const passages: Box[] = [];
  const wet = WET_ROOM_TYPES.includes(room.type);

  // A small bathroom's smaller WC and compact basin, where its fallback has come to them (`WetFallback`).
  // A balcony's compact table, a kitchen's two-seat one where its fallback has come to it (`roomPiece`).
  const pieceOf = (entry: ProgramEntry) => compacted(roomPiece(entry, room, options, relax), relax);

  /** Stands a piece: its slot, and the floor it takes and keeps clear of what is laid after it. */
  const stand = (into: { placed: PlacedItem[]; occupied: Box[]; passages: Box[] }, archetype: Archetype, kind: string, pose: Pose, id: string) => {
    into.placed.push({
      id,
      roomId: room.id,
      slot: archetype.slot,
      kind,
      position: pose.position,
      rotation: pose.rotation,
      elevationM: pose.elevationM,
      size: pose.size,
      product: null,
      // A shower's slot is its tray and glass; the product (a column) stands at its back.
      ...(archetype.slot === 'shower' ? { areaM: { width: pose.size.width, depth: pose.size.depth } } : {}),
    });

    // A WC keeps its 40 cm either side of its centre (`WC_SIDE_M`): nothing placed after it stands there.
    if (!archetype.ghost) into.occupied.push(boxFor(archetype.slot === 'toilet' ? { ...pose, size: { ...pose.size, width: Math.max(pose.size.width, 2 * WC_SIDE_M + 0.02) } } : pose));
    // A fixture's free floor in a bathroom or a toilet: what comes after keeps out of it.
    if (wet && WET_FIXTURES.has(archetype.slot)) into.passages.push(clearanceBox(pose, BATH_PASSAGE_MIN_M));
    // The kitchen run's 1.2 m of working floor: the table and its chairs stand beyond it.
    if (archetype.slot === 'kitchen_run') into.occupied.push(clearanceBox(pose, KITCHEN_CIRCULATION_M));
    // An island's 1.2 m round it: nothing placed after it stands there (K-6).
    if (archetype.slot === 'kitchen_island') into.occupied.push(inflate(boxFor(pose), ISLAND_CLEAR_M - 0.01));
  };

  /**
   * For the piece of the program's entry `at`: where the piece stood against a wall off it next
   * would stand were it put at a pose — a sofa's TV unit, back to the wall the sofa faces. A dry
   * run of what the engine does next, by the pieces' own rules and tests: the coffee table off the
   * sofa, then the unit (inside the room, on no taken floor, 60 cm clear of the table, the window
   * rule), from what stands in `from`. Undefined for a piece nothing is stood against a wall off, and when what is laid
   * between the two is not laid off it as well — the dry run would not be what happens.
   */
  const screenAfter = (at: number, piece: { kind: string; archetype: Archetype }, from: LayoutState): RuleContext['screenFor'] => {
    const next: Array<{ kind: string; archetype: Archetype }> = [];
    for (const entry of program.slice(at + 1)) {
      const follower = pieceOf(entry);
      if (!follower) continue;
      const rule = follower.archetype.placement;
      if (rule.type !== 'relative' || rule.to !== piece.archetype.slot || entry.count !== 1 || follower.kind in OPTIONAL_DECOR) break;
      next.push(follower);
      if (rule.toWall) break;
    }
    const last = next[next.length - 1]?.archetype.placement;
    if (last?.type !== 'relative' || !last.toWall) return undefined;
    return (pose) => {
      const dry = { placed: [...from.placed], occupied: [...from.occupied], passages: [...from.passages] };
      stand(dry, piece.archetype, piece.kind, pose, 'dry-run');
      let found: Pose | null = null;
      for (const follower of next) {
        const rules: RuleContext = { doorBands, entranceBands: options.entranceSight?.[room.id] ?? [], placed: dry.placed, passages: dry.passages };
        found = resolvePose(follower.archetype, 0, room, edges, dry.placed, dry.occupied, { rules });
        if (found) stand(dry, follower.archetype, follower.kind, found, 'dry-run');
      }
      return found;
    };
  };

  /** The program's entries but `skip` into `into`, each by its rule, drawing from `rng`: what the room's loop always did. */
  const layRest = (into: LayoutState, skip: ReadonlySet<ProgramEntry> | null, rng: Rng | undefined, id: (kind: string) => string) => {
    for (const [at, entry] of program.entries()) {
      if (skip?.has(entry)) continue;
      const piece = pieceOf(entry);
      if (!piece) continue;
      const { kind, archetype } = piece;
      // A generated room varies its decor: a plant here, a print there, not every piece every time.
      if (rng && kind in OPTIONAL_DECOR && rng() > OPTIONAL_DECOR[kind]) continue;

      // A curtain or a blind at every window, not one a room (G-20).
      // A balcony's table seats two, or one where the balcony is narrow (`balconySeats`).
      const count =
        entry.count === 'fill'
          ? Math.min(seatCountFor(archetype, into.placed), room.type === 'balcony' ? balconySeats(room) : Infinity)
          : archetype.placement.type === 'window' ? ownWindows(room).length : entry.count;
      const screenFor = screenAfter(at, piece, into);

      for (let i = 0; i < count; i++) {
        const rules: RuleContext = { doorBands, entranceBands: options.entranceSight?.[room.id] ?? [], placed: into.placed, passages: into.passages, screenFor };
        const pose = resolvePose(archetype, i, room, edges, into.placed, inTheWay(into.occupied, archetype.size.height), { anchors: anchorsFor(kind, anchors), rng, rules, relax });
        // A ring of seats keeps going past a slot that hits a wall; anything else stops at the
        // first failure, because its second copy has no better chance than its first.
        if (!pose && entry.count === 'fill') continue;
        if (!pose) break;

        stand(into, archetype, kind, pose, id(kind));
      }
    }
  };

  // A living room's sofa, coffee table, TV unit and TV are laid out together, by its ladder
  // (`layoutLounge`). Where the first try — the room as it was always laid out — has its TV on a
  // wall (and a table before the sofa), that is the room; else each that may stand in for it is laid
  // out with the rest of the room, and the first that keeps every piece the first try's room had
  // (its TV unit for a TV on the wall, its coffee table for the console behind the sofa) is taken —
  // else the first that gives the room the sofa or the TV it went without; else the first try's.
  // A room whose shape takes a corner sofa (`cornerSofaFits`) keeps it where its TV then stands on a
  // wall (as the room was always laid out, or by a fallback); else the room is laid with a three-seat. Each is laid with the same draws, so
  // the decor comes and goes alike.
  if (room.type === 'living_room') {
    const tape = options.rng ? rngTape(options.rng) : null;
    const furnished = (sofaKind?: string): { items: PlacedItem[]; corner: boolean; good: boolean } | null => {
      const draws = tape?.(0);
      const lounge = layoutLounge({ room, edges, program, pieceOf, options: { ...options, rng: draws }, doorBands, state: { placed, occupied, passages }, stand, sofaKind, screenAfter: (at, piece) => screenAfter(at, piece, { placed, occupied, passages }) });
      if (!lounge) return null;
      const after = draws?.position() ?? 0;
      const corner = lounge.first.steps[0]?.kind === 'sofa_corner';
      const layWith = (laid: LoungeTrial): PlacedItem[] => {
        const into: LayoutState = { placed: [...placed], occupied: [...occupied], passages: [...passages] };
        let n = counter;
        const id = (kind: string) => `${room.id}-${idPrefix}${kind}-${n++}`;
        for (const step of laid.steps) stand(into, step.archetype, step.kind, step.pose, id(step.kind));
        into.occupied.push(...laid.keep);
        layRest(into, lounge.entries, tape?.(after), id);
        return into.placed;
      };
      const first = layWith(lounge.first);
      if (lounge.first.good && lounge.first.table) return { items: first, corner, good: true };
      const had = slotCounts(first);
      let gains: { items: PlacedItem[]; good: boolean } | null = null;
      for (let laid = lounge.next(); laid; laid = lounge.next()) {
        const whole = layWith(laid);
        const has = slotCounts(whole);
        const kept = Object.entries(had).every(([slot, n]) => (has[slot] ?? 0) >= n || (slot === 'tv_unit' && !lounge.first.good && (has.tv ?? 0) > 0) || (slot === 'coffee_table' && (has.console ?? 0) > 0));
        if (kept) return { items: whole, corner, good: laid.good };
        if (!gains && ((!had.sofa && has.sofa) || (!had.tv && has.tv))) gains = { items: whole, good: laid.good };
      }
      return { items: gains?.items ?? first, corner, good: gains?.good ?? lounge.first.good };
    };
    const laid = furnished();
    if (laid) {
      if (!laid.corner || laid.good) return laid.items;
      return furnished('sofa_3seat')?.items ?? laid.items;
    }
  }

  // A bedroom's bed, nightstands and wardrobe are laid out together, by its ladder (`layoutBedroom`).
  const together = room.type === 'bedroom' ? layoutBedroom({ room, edges, program, pieceOf, options, doorBands, state: { placed, occupied, passages }, stand, nextId }) : null;
  layRest({ placed, occupied, passages }, together, options.rng, nextId);
  return placed;
}

/** How many pieces of each slot a room was laid. */
function slotCounts(items: readonly PlacedItem[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) counts[item.slot] = (counts[item.slot] ?? 0) + 1;
  return counts;
}

/**
 * A stream's numbers kept as they are drawn, so the same numbers can be read again: `tape(at)` reads
 * from the `at`-th on (drawing more from the stream when it runs past), and says where it is.
 */
function rngTape(source: Rng): (at: number) => Rng & { position: () => number } {
  const drawn: number[] = [];
  return (at) => {
    let i = at;
    const read = () => {
      while (i >= drawn.length) drawn.push(source());
      return drawn[i++];
    };
    return Object.assign(read, { position: () => i });
  };
}

/** The floor between a sofa (its middle at `centre`, facing `facing`) and the wall `ahead` metres in front of its back, as wide as the sofa. */
function viewingQuad(centre: Vec2, facing: number, width: number, depth: number, ahead: number): Quad {
  const f = { x: Math.sin(facing), z: Math.cos(facing) };
  const r = { x: f.z, z: -f.x };
  const near = depth / 2 + 0.05;
  const far = Math.max(near + 0.1, ahead - 0.45);
  const at = (u: number, v: number): Vec2 => ({ x: centre.x + r.x * u + f.x * v, z: centre.z + r.z * u + f.z * v });
  return [at(-width / 2, near), at(width / 2, near), at(width / 2, far), at(-width / 2, far)];
}

/** The ways through a room: a strip 70 cm wide from each doorway's inside point to every other's. */
function passagePaths(doorPoints: Vec2[]): Quad[] {
  const out: Quad[] = [];
  for (let i = 0; i < doorPoints.length; i++) {
    for (let j = i + 1; j < doorPoints.length; j++) {
      const a = doorPoints[i];
      const b = doorPoints[j];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 0.3) continue;
      const n = { x: -(b.z - a.z) / len * 0.35, z: (b.x - a.x) / len * 0.35 };
      out.push([{ x: a.x + n.x, z: a.z + n.z }, { x: b.x + n.x, z: b.z + n.z }, { x: b.x - n.x, z: b.z - n.z }, { x: a.x - n.x, z: a.z - n.z }]);
    }
  }
  return out;
}

/** How far a box's nearest side is from the room's walls (the outline's edges), metres. */
function toWalls(box: Box, polygon: Vec2[]): number {
  const corners = [{ x: box.minX, z: box.minZ }, { x: box.maxX, z: box.minZ }, { x: box.maxX, z: box.maxZ }, { x: box.minX, z: box.maxZ }];
  let best = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    for (const c of corners) best = Math.min(best, closestOnSegment(c, a, b).distance);
  }
  return best;
}

/** 0.8 when a piece turned `rotation` has its width along the room's longer side, else 0. */
function alongLength(rotation: number, room: PlanRoom): number {
  const b = polygonBounds(room.polygon);
  const wide = b.maxX - b.minX >= b.maxZ - b.minZ;
  // A piece's width runs along its right: across x when it faces ±z.
  const widthAlongX = Math.abs(Math.cos(rotation)) > 0.7;
  return widthAlongX === wide ? 0.8 : 0;
}

/**
 * Finds room for one more item of `kind` among what is already placed — the user's own bed
 * for a room whose program had no bed. Same rules, same keepouts; null when it will not fit.
 */
export function placeAdditional(room: PlanRoom, kind: string, existing: PlacedItem[], size?: PlacedItem['size'], obstacles: Box[] = []): PlacedItem | null {
  return additionalPiece(room, kind, existing, size, obstacles, true);
}

/** `placeAdditional`; with `anywhere` off, only a spot the piece's own rule gives it — never the last resort of any free floor. */
function additionalPiece(room: PlanRoom, kind: string, existing: PlacedItem[], size: PlacedItem['size'] | undefined, obstacles: Box[], anywhere: boolean): PlacedItem | null {
  const registered = getArchetype(kind);
  if (!registered) return null;
  // The spot is found for the real product when its size is known, not for the archetype's
  // typical one: a 1.9 m cabinet dropped where a 1 m one fits overlapped its neighbours and
  // came up red the moment it landed. Runs and rugs keep being sized to the room.
  const exact = !!size && registered.placement.type !== 'wall-run' && !LAID_TO_ANOTHER.has(registered.slot);
  const archetype = exact ? { ...registered, size: size! } : registered;
  const edges = roomEdges(room.polygon);
  if (edges.length === 0) return null;

  const placed = existing.filter((i) => i.roomId === room.id);
  const occupied: Box[] = [
    ...doorKeepouts(room, edges),
    ...inTheWay(obstacles, archetype.size.height),
    ...placed
      .filter((i) => !ARCHETYPES[i.kind]?.ghost)
      .map((i) => boxFor({ position: i.position, rotation: i.rotation, size: i.size, elevationM: i.elevationM })),
  ];
  const index = placed.filter((i) => i.kind === kind).length;
  const pose = resolvePose(archetype, index, room, edges, placed, occupied, { exact }) ?? (anywhere ? placeAnywhere(archetype, room, edges, occupied) : null);
  if (!pose) return null;
  return {
    id: `${room.id}-${kind}-extra-${index}`,
    roomId: room.id,
    slot: archetype.slot,
    kind,
    position: pose.position,
    rotation: pose.rotation,
    elevationM: pose.elevationM,
    size: pose.size,
    product: null,
  };
}

// ---------------------------------------------------------------------------
// Bedrooms: the bed, the nightstands and the wardrobe together
// ---------------------------------------------------------------------------

/** What a room's layout has stood so far: its pieces, the floor taken, a wet room's passages. */
interface LayoutState {
  placed: PlacedItem[];
  occupied: Box[];
  passages: Box[];
}

/** One way a bedroom's bed is tried (`bedRungs`): its kind, its width, and whether its long side is on a wall. */
export interface BedRung {
  kind: 'bed_double' | 'bed_single';
  width: number;
  alongWall: boolean;
}

/**
 * The beds a bedroom is tried with, in Nini's order (decision 3.2), the first that stands taken: the
 * double 1.6 m wide with its head on a wall, then 1.4 m wide (`NARROW_DOUBLE_BED_M`), then each with
 * its long side on a wall — one side reachable, the nightstand on the free side — and last a single,
 * head on a wall, then along one. A room under 11 m² (`SINGLE_BED_UNDER_M2`, `resolveVariant`) is
 * given the single's two alone. (The door's clear floor, her first fallback, is decision 12's.)
 */
export function bedRungs(kind: string): BedRung[] {
  const double = ARCHETYPES.bed_double.size.width;
  const single = ARCHETYPES.bed_single.size.width;
  const singles: BedRung[] = [{ kind: 'bed_single', width: single, alongWall: false }, { kind: 'bed_single', width: single, alongWall: true }];
  if (kind !== 'bed_double') return singles;
  return [
    { kind: 'bed_double', width: double, alongWall: false },
    { kind: 'bed_double', width: NARROW_DOUBLE_BED_M, alongWall: false },
    { kind: 'bed_double', width: double, alongWall: true },
    { kind: 'bed_double', width: NARROW_DOUBLE_BED_M, alongWall: true },
    ...singles,
  ];
}

/** A piece a trial stood, in order: what `layoutBedroom` stands for real once it has chosen. */
interface TrialStep {
  kind: string;
  archetype: Archetype;
  pose: Pose;
}

/** What laying a bedroom out with one bed (`BedRung`) gave: the pieces in order, and what of the essentials stood. */
interface BedroomTrial {
  steps: TrialStep[];
  bed: boolean;
  nightstands: number;
  wardrobe: boolean;
}

/**
 * A bedroom's essentials laid out together (Nini, 23 Nov 2026, decision 3.2: "the wardrobe has to be
 * in a bedroom, but smaller"): the bed by its ladder (`bedRungs`), its nightstands, and the wardrobe —
 * the usual one, else a compact or a shallow one (`SMALLER_WARDROBES_M`), else with one nightstand in
 * place of two, else with the next bed of the ladder. The first bed with which a wardrobe and a
 * nightstand stand is taken; with none, the first with a wardrobe, then the first with a nightstand,
 * then the first bed that stands at all (the bed always comes first); with no bed, the wardrobe
 * alone. A 1.6 m double that keeps only one nightstand gives way to the 1.4 m one where that keeps
 * both (her 1.4 m double ranks before one nightstand).
 *
 * The essentials take the floor before anything decorative (a chest of drawers, the rug, the lamps,
 * the plant, the stool): they come first in the room's program, and the rest is laid out round them.
 *
 * The first try is the room as it was always laid out, with the room's draw; every fallback is laid
 * at its best spot without a draw, so the room's decor is drawn from the same numbers whichever bed
 * it got. Stands the chosen pieces into `state`; returns the program's entries it laid (none when
 * the room's program has no bed).
 */
function layoutBedroom(ctx: {
  room: PlanRoom;
  edges: PlanEdge[];
  program: ProgramEntry[];
  pieceOf: (entry: ProgramEntry) => { kind: string; archetype: Archetype } | null;
  options: LayoutOptions;
  doorBands: Quad[];
  state: LayoutState;
  stand: (into: LayoutState, archetype: Archetype, kind: string, pose: Pose, id: string) => void;
  nextId: (kind: string) => string;
}): Set<ProgramEntry> {
  const { room, edges, program, pieceOf, options, doorBands, state, stand } = ctx;
  const slotOf = (entry: ProgramEntry) => getArchetype(entry.kind)?.slot;
  const bedEntry = program.find((e) => slotOf(e) === 'bed');
  const bedPiece = bedEntry ? pieceOf(bedEntry) : null;
  if (!bedEntry || !bedPiece) return new Set();
  const nightstandEntry = program.find((e) => slotOf(e) === 'nightstand');
  const nightstand = nightstandEntry ? pieceOf(nightstandEntry) : null;
  const nightstands = nightstandEntry && typeof nightstandEntry.count === 'number' ? nightstandEntry.count : 0;
  const wardrobeEntry = program.find((e) => slotOf(e) === 'wardrobe');
  const wardrobe = wardrobeEntry ? pieceOf(wardrobeEntry) : null;
  const walled = edges.filter((e) => !isOpenEdge(room, e.index));
  const anchors = options.anchors?.[room.id];

  const copy = (from: LayoutState): LayoutState => ({ placed: [...from.placed], occupied: [...from.occupied], passages: [...from.passages] });
  const rulesOf = (into: LayoutState): RuleContext => ({ doorBands, entranceBands: options.entranceSight?.[room.id] ?? [], placed: into.placed, passages: into.passages });
  const put = (into: LayoutState, steps: TrialStep[], step: TrialStep) => {
    stand(into, step.archetype, step.kind, step.pose, 'trial');
    steps.push(step);
  };

  /** The bed of `rung` into `into`, with the room's draw or (`rng` undefined) at its best spot. */
  const layBed = (into: LayoutState, rung: BedRung, rng: Rng | undefined): TrialStep | null => {
    const own = getArchetype(rung.kind)!;
    const archetype = rung.width === own.size.width ? own : { ...own, size: { ...own.size, width: rung.width } };
    const occupied = inTheWay(into.occupied, archetype.size.height);
    const pose = rung.alongWall
      ? placeBedAlongWall(archetype, room, walled, occupied, rulesOf(into))
      : resolvePose(archetype, 0, room, edges, into.placed, occupied, { anchors: anchorsFor(rung.kind, anchors), rng, rules: rulesOf(into) });
    return pose ? { kind: rung.kind, archetype, pose } : null;
  };

  /** The nightstands of `indices` (0 its right, 1 its left first) beside the bed just stood. */
  const layNightstands = (into: LayoutState, steps: TrialStep[], indices: number[], rng: Rng | undefined): number => {
    if (!nightstand) return 0;
    let count = 0;
    for (const i of indices) {
      const pose = resolvePose(nightstand.archetype, i, room, edges, into.placed, inTheWay(into.occupied, nightstand.archetype.size.height), { anchors: anchorsFor(nightstand.kind, anchors), rng, rules: rulesOf(into) });
      // As in the program's loop: the second has no better chance than the first.
      if (!pose) break;
      put(into, steps, { kind: nightstand.kind, archetype: nightstand.archetype, pose });
      count++;
    }
    return count;
  };

  /**
   * The wardrobe: the usual one (into a niche, else 1.8 m narrowed to 1.17) with `rng` — the room's
   * draw where a wardrobe was always laid (a room of its archetype's 8 m² or more), else none — then
   * the smaller ones at their best spot.
   */
  const layWardrobe = (into: LayoutState, rng: Rng | undefined): TrialStep | null => {
    if (!wardrobe) return null;
    const base = wardrobe.archetype;
    const drawn = room.areaM2 >= (base.minRoomAreaM2 ?? 0) ? rng : undefined;
    const usual = resolvePose(base, 0, room, edges, into.placed, inTheWay(into.occupied, base.size.height), { anchors: anchorsFor(wardrobe.kind, anchors), rng: drawn, rules: rulesOf(into) });
    if (usual) return { kind: wardrobe.kind, archetype: base, pose: usual };
    for (const size of SMALLER_WARDROBES_M) {
      const archetype = { ...base, size: { ...base.size, ...size } };
      const pose = resolvePose(archetype, 0, room, edges, into.placed, inTheWay(into.occupied, archetype.size.height), { exact: true, rules: rulesOf(into) });
      if (pose) return { kind: wardrobe.kind, archetype, pose };
    }
    return null;
  };

  /** The room laid out with one bed: the bed, both nightstands and a wardrobe — else one nightstand, so the wardrobe stands. */
  const trial = (rung: BedRung, rng: Rng | undefined): BedroomTrial => {
    const withBed = copy(state);
    const bedSteps: TrialStep[] = [];
    const bed = layBed(withBed, rung, rng);
    if (!bed) return { steps: [], bed: false, nightstands: 0, wardrobe: false };
    put(withBed, bedSteps, bed);
    const into = copy(withBed);
    const steps = [...bedSteps];
    const count = layNightstands(into, steps, Array.from({ length: nightstands }, (_, i) => i), rng);
    const robe = layWardrobe(into, rng);
    if (robe) return { steps: [...steps, robe], bed: true, nightstands: count, wardrobe: true };
    // One nightstand instead of two (decision 3.2's fifth fallback), either side, so the wardrobe
    // stands; else none — the wardrobe is a must, and the ladder's next bed may give one back.
    const fewer = [...(count > 1 ? [[0], [1]] : []), ...(count > 0 ? [[]] : [])];
    for (const sides of fewer) {
      const less = copy(withBed);
      const lessSteps = [...bedSteps];
      const kept = layNightstands(less, lessSteps, sides, undefined);
      const smaller = layWardrobe(less, undefined);
      if (smaller) return { steps: [...lessSteps, smaller], bed: true, nightstands: kept, wardrobe: true };
    }
    return { steps, bed: true, nightstands: count, wardrobe: false };
  };

  const rungs = bedRungs(bedPiece.kind);
  const tried: BedroomTrial[] = [];
  for (const [i, rung] of rungs.entries()) {
    const result = trial(rung, i === 0 ? options.rng : undefined);
    tried.push(result);
    if (result.bed && result.wardrobe && result.nightstands > 0) break;
  }
  // The first bed with which its wardrobe and a nightstand stand — the essentials (a double "fits"
  // when they do; else the single, "a single bed when no double fits"); else the first with its
  // wardrobe (a must), the first with a nightstand, the first bed at all (the bed comes first);
  // else the wardrobe alone.
  const first = (test: (t: BedroomTrial) => boolean) => tried.find((t) => t.bed && test(t)) ?? null;
  let chosen: BedroomTrial | null = first((t) => t.wardrobe && t.nightstands > 0) ?? first((t) => t.wardrobe) ?? first((t) => t.nightstands > 0) ?? first(() => true);
  // A 1.6 m double with one nightstand: the 1.4 m one, where it keeps both and the wardrobe.
  if (chosen && chosen === tried[0] && rungs[1]?.width === NARROW_DOUBLE_BED_M && !rungs[1].alongWall && chosen.nightstands < nightstands) {
    const narrow = tried[1] ?? trial(rungs[1], undefined);
    if (narrow.bed && narrow.wardrobe && narrow.nightstands > chosen.nightstands) chosen = narrow;
  }
  if (!chosen) {
    const alone = copy(state);
    const robe = layWardrobe(alone, options.rng);
    chosen = { steps: robe ? [robe] : [], bed: false, nightstands: 0, wardrobe: !!robe };
  }
  for (const step of chosen.steps) stand(state, step.archetype, step.kind, step.pose, ctx.nextId(step.kind));
  return new Set([bedEntry, ...(nightstandEntry ? [nightstandEntry] : []), ...(wardrobeEntry ? [wardrobeEntry] : [])]);
}

/**
 * A bed with its long side on a wall (decision 3.2's third fallback): its side 2 cm off the wall, the
 * wall's window sills over the mattress (`BED_SIDE_HEIGHT_M`), never along a door; best with its head
 * in the corner on the wall there (no window behind the headboard), its open side free 60 cm for the
 * step in and the nightstand (`BED_SIDE_FREE_M`), away from the door and out of its sight. Null where
 * no wall takes it. No draw: the best spot.
 */
function placeBedAlongWall(archetype: Archetype, room: PlanRoom, edges: PlanEdge[], occupied: Box[], rules: RuleContext): Pose | null {
  const { width, depth, height } = archetype.size;
  const doorPoints = openingPoints(room, edges, isPassage);
  const spots: Array<{ value: Pose; score: number }> = [];
  for (const edge of edges) {
    if (edge.length < depth) continue;
    const blocked = room.openings.filter((o) => o.wallIndex === edge.index);
    for (const t of sampleAlong(edge, depth)) {
      if (coversOpening(edge, t, depth, BED_SIDE_HEIGHT_M, blocked)) continue;
      const anchor = pointOnEdge(edge, t);
      const position = { x: anchor.x + edge.inward.x * (width / 2 + 0.02), z: anchor.z + edge.inward.z * (width / 2 + 0.02) };
      for (const way of [1, -1]) {
        // Its foot towards `way` along the wall, its head the other way.
        const rotation = Math.atan2(edge.dir.x * way, edge.dir.z * way);
        const pose: Pose = { position, rotation, size: { width, depth, height }, elevationM: 0 };
        if (!fitsInRoom(pose, room.polygon) || overlapsAny(boxFor(pose), occupied)) continue;
        if (blocksWindow({ ...pose, slot: archetype.slot }, room)) continue;
        const back = { x: -Math.sin(rotation), z: -Math.cos(rotation) };
        const head = { x: position.x + back.x * (depth / 2), z: position.z + back.z * (depth / 2) };
        let score = (rayToPolygon(head, back, room.polygon) ?? Infinity) < 0.05 ? 10 : 0;
        const open: Pose = { position: { x: position.x + edge.inward.x * (width / 2 + BED_SIDE_FREE_M / 2), z: position.z + edge.inward.z * (width / 2 + BED_SIDE_FREE_M / 2) }, rotation, size: { width: BED_SIDE_FREE_M, depth, height }, elevationM: 0 };
        if (fitsInRoom(open, room.polygon) && !overlapsAny(boxFor(open), occupied)) score += 12;
        score += minDistance(position, doorPoints) * 3;
        if (inSight(pose, rules.doorBands)) score -= 12;
        spots.push({ value: pose, score });
      }
    }
  }
  return pickNearBest(spots, 0);
}

// ---------------------------------------------------------------------------
// Living rooms: the sofa, the coffee table, the TV unit and the TV together
// ---------------------------------------------------------------------------

/** One way a living room's sofa and TV are tried (`loungeRungs`). */
export interface LoungeRung {
  /** The room's own sofa (a corner one where its shape takes one, else a three-seat), a three-seat, or a two-seat (`TWO_SEAT_SOFA_M`). */
  sofa: 'own' | 'three' | 'two';
  /** The TV unit's width, metres; null: no unit, the TV hung on the wall. */
  unitM: number | null;
  /** The unit, or the TV, on any wall in front of the sofa — a side wall too — not only the one straight ahead. */
  side: boolean;
  /** Floor kept between the coffee table and the unit. */
  clearM: number;
  /** No coffee table: a console table behind the sofa (`CONSOLE_BEHIND_SOFA_M`). */
  console: boolean;
}

/**
 * The ways a living room's sofa and TV are tried, in Nini's order (decision 3.3), the first that
 * stands the TV on a wall taken (`layoutLounge`): the room as it was always laid; a 1.2 m TV unit
 * (`TV_UNIT_NARROW_M`); a smaller sofa — a corner sofa's three-seat, then a two-seat; the unit on
 * another wall in front of the sofa, a side wall too; 45 cm between the coffee table and the unit
 * (`TV_UNIT_CLEAR_MIN_M`); a TV on the wall with no unit; and last no coffee table, a console table
 * behind the sofa. Each fallback is tried on its own first, then with the ones before it.
 */
export function loungeRungs(sofaKind: string): LoungeRung[] {
  const base: LoungeRung = { sofa: 'own', unitM: ARCHETYPES.tv_unit.size.width, side: false, clearM: TV_UNIT_CLEAR_M, console: false };
  const narrow = TV_UNIT_NARROW_M;
  const corner = sofaKind === 'sofa_corner';
  return [
    base,
    { ...base, unitM: narrow },
    ...(corner ? [{ ...base, sofa: 'three' as const }, { ...base, sofa: 'three' as const, unitM: narrow }] : []),
    { ...base, sofa: 'two' },
    { ...base, sofa: 'two', unitM: narrow },
    { ...base, side: true },
    { ...base, side: true, unitM: narrow, sofa: 'two' },
    { ...base, clearM: TV_UNIT_CLEAR_MIN_M },
    { ...base, clearM: TV_UNIT_CLEAR_MIN_M, unitM: narrow, sofa: 'two', side: true },
    { ...base, unitM: null },
    { ...base, unitM: null, sofa: 'two', side: true },
    { ...base, console: true, clearM: TV_UNIT_CLEAR_MIN_M, unitM: narrow, sofa: 'two', side: true },
  ];
}

/** What laying a living room's lounge out one way (`LoungeRung`) gave: the pieces in order, the floor kept, and what of it stood. */
interface LoungeTrial {
  rung: LoungeRung;
  steps: TrialStep[];
  /** Floor nothing laid after may take: the way behind a sofa standing free. */
  keep: Box[];
  sofa: boolean;
  /** A coffee table, or the console behind the sofa in its place. */
  table: boolean;
  unit: boolean;
  tv: boolean;
  /** The TV stands on a unit with the whole of its back on a wall, or hangs on a wall: a real wall behind the screen. */
  good: boolean;
  /** Where the screen is (the unit, or the TV with none), for the sofa's distance to it. */
  screen: Pose | null;
}

/**
 * What `layoutLounge` offers a living room: the program's entries it lays, the first try (the room
 * as it was always laid out), and, one by one, what may stand in for it (`next`), best first.
 */
interface LoungePlan {
  entries: Set<ProgramEntry>;
  first: LoungeTrial;
  next: () => LoungeTrial | null;
}

/**
 * A living room's sofa, coffee table, TV unit and TV laid out together (Nini, 23 Nov 2026, decisions
 * 1, 2 and 3.3). The first try is the room as it was always laid out — the sofa where its unit then
 * stands on a wall (`RuleContext.screenFor`), with the room's draw. Where the TV does not then stand
 * or hang on a real wall, the sofa may stand free, its back to the room separator's open line with
 * the way kept behind it (`SOFA_OPEN_LINE_WAY_M`), facing the TV on a wall (decision 2); and where
 * neither does, her fallbacks in her order (`loungeRungs`), each laid at its best spot without a draw.
 * What may stand in for the first try (`LoungePlan.next`): each fallback that stands the TV on a wall
 * (with the sofa); where the first try has no sofa, the first fallback with one. `layoutArea` lays
 * each out with the rest of the room and keeps the first that keeps the room's pieces.
 *
 * Where no coffee table stands, a smaller one (`SMALL_COFFEE_TABLE_M` — a round, nesting or side
 * table) in front of the sofa, else — Nini's preference to no table — the same way laid with a
 * console table behind the sofa, where that keeps its sofa, unit and TV. Stands nothing into `state`
 * (it is what stands before the lounge); null when the room's program has no sofa.
 */
function layoutLounge(ctx: {
  room: PlanRoom;
  edges: PlanEdge[];
  program: ProgramEntry[];
  pieceOf: (entry: ProgramEntry) => { kind: string; archetype: Archetype } | null;
  options: LayoutOptions;
  doorBands: Quad[];
  state: LayoutState;
  stand: (into: LayoutState, archetype: Archetype, kind: string, pose: Pose, id: string) => void;
  screenAfter: (at: number, piece: { kind: string; archetype: Archetype }) => RuleContext['screenFor'];
  /** The sofa in place of the room's own (a three-seat where its shape took a corner one). */
  sofaKind?: string;
}): LoungePlan | null {
  const { room, edges, program, pieceOf, options, doorBands, state, stand } = ctx;
  const slotOf = (entry: ProgramEntry) => getArchetype(entry.kind)?.slot;
  const at = program.findIndex((e) => slotOf(e) === 'sofa');
  const sofaEntry = program[at];
  const resolved = sofaEntry ? pieceOf(sofaEntry) : null;
  const own = resolved && ctx.sofaKind && getArchetype(ctx.sofaKind) ? { kind: ctx.sofaKind, archetype: getArchetype(ctx.sofaKind)! } : resolved;
  if (!sofaEntry || !own) return null;
  const entryOf = (slot: SlotKind) => program.find((e) => slotOf(e) === slot);
  const coffeeEntry = entryOf('coffee_table');
  const unitEntry = entryOf('tv_unit');
  const tvEntry = entryOf('tv');
  const coffee = coffeeEntry ? pieceOf(coffeeEntry) : null;
  const unitPiece = unitEntry ? pieceOf(unitEntry) : null;
  const tvPiece = tvEntry ? pieceOf(tvEntry) : null;
  const walled = edges.filter((e) => !isOpenEdge(room, e.index));
  const anchors = options.anchors?.[room.id];
  const doorPoints = openingPoints(room, edges, isPassage);
  const consoleArchetype = getArchetype('console_table');

  const copy = (from: LayoutState): LayoutState => ({ placed: [...from.placed], occupied: [...from.occupied], passages: [...from.passages] });
  const rulesOf = (into: LayoutState): RuleContext => ({ doorBands, entranceBands: options.entranceSight?.[room.id] ?? [], placed: into.placed, passages: into.passages });
  const put = (into: LayoutState, steps: TrialStep[], step: TrialStep) => {
    stand(into, step.archetype, step.kind, step.pose, 'trial');
    steps.push(step);
  };

  type LoungeSofa = { kind: string; archetype: Archetype; widths: number[] | null };
  /** The sofa a rung lays: the room's own, a three-seat, or a three-seat's slot laid as wide as a two-seat. */
  const sofaOf = (rung: LoungeRung): LoungeSofa => {
    const piece = rung.sofa === 'own' ? own : { kind: 'sofa_3seat', archetype: getArchetype('sofa_3seat')! };
    return { ...piece, widths: rung.sofa === 'two' ? [...TWO_SEAT_SOFA_M] : null };
  };
  /** The floor a sofa is looked for as: with the console behind it, the two as one block. */
  const blockDepth = (sofa: Archetype, rung: LoungeRung) => sofa.size.depth + (rung.console && consoleArchetype ? CONSOLE_BEHIND_SOFA_M.depth + 0.02 : 0);
  const none = (rung: LoungeRung): LoungeTrial => ({ rung, steps: [], keep: [], sofa: false, table: false, unit: false, tv: false, good: false, screen: null });

  /**
   * Lays the rest of the lounge off a sofa whose floor (with the console behind it, when the rung has
   * one) is `block`: the coffee table, then the unit and the TV over it — or the TV on the wall —
   * straight ahead, then (`side`) on another wall in front. `way`: the floor kept behind a free sofa.
   */
  const layFrom = (rung: LoungeRung, sofa: LoungeSofa, block: Pose, way: Box | null): LoungeTrial => {
    const into = copy(state);
    const steps: TrialStep[] = [];
    const forward = { x: Math.sin(block.rotation), z: Math.cos(block.rotation) };
    const depth = sofa.archetype.size.depth;
    const behind = block.size.depth - depth;
    const sofaArchetype = { ...sofa.archetype, size: { ...block.size, depth } };
    const sofaPose: Pose = { ...block, size: sofaArchetype.size, position: { x: block.position.x + (forward.x * behind) / 2, z: block.position.z + (forward.z * behind) / 2 } };
    put(into, steps, { kind: sofa.kind, archetype: sofaArchetype, pose: sofaPose });
    let table = false;
    if (behind > 0 && consoleArchetype) {
      const size = { ...consoleArchetype.size, width: Math.min(CONSOLE_BEHIND_SOFA_M.width, block.size.width - 0.2), depth: CONSOLE_BEHIND_SOFA_M.depth };
      const off = (block.size.depth - size.depth) / 2;
      put(into, steps, { kind: 'console_table', archetype: { ...consoleArchetype, size }, pose: { position: { x: block.position.x - forward.x * off, z: block.position.z - forward.z * off }, rotation: block.rotation, size, elevationM: 0 } });
      table = true;
    }
    const keep = way ? [way] : [];
    into.occupied.push(...keep);
    if (!rung.console && coffee) {
      const pose = resolvePose(coffee.archetype, 0, room, edges, into.placed, inTheWay(into.occupied, coffee.archetype.size.height));
      if (pose) {
        put(into, steps, { kind: coffee.kind, archetype: coffee.archetype, pose });
        table = true;
      }
    }
    const result = { rung, keep, sofa: true, table };
    const bare = { ...result, steps, unit: false, tv: false, good: false, screen: null };
    if (!tvPiece) return bare;

    if (rung.unitM == null) {
      // A TV on the wall with no unit (the fifth fallback): straight ahead first, then (`side`) on another wall in front.
      const hung = frontWallSpots(tvPiece.archetype, sofaPose, room, walled, into.placed, [], rung.clearM, true).find((s) => rung.side || s.ahead)?.pose;
      if (!hung) return bare;
      put(into, steps, { kind: tvPiece.kind, archetype: tvPiece.archetype, pose: hung });
      return { ...result, steps, unit: false, tv: true, good: true, screen: hung };
    }
    if (!unitPiece) return bare;

    const unitArchetype = rung.unitM === unitPiece.archetype.size.width ? unitPiece.archetype : { ...unitPiece.archetype, size: { ...unitPiece.archetype.size, width: rung.unitM } };
    const occupied = inTheWay(into.occupied, unitArchetype.size.height);
    // As the engine always stood it — the wall straight ahead (`placeRelative`) — then any wall in front.
    const ahead = placeRelative(unitArchetype, 0, room, into.placed, occupied, rung.clearM);
    const coffeeBox = into.placed.filter((p) => p.slot === 'coffee_table').map((p) => boxFor({ position: p.position, rotation: p.rotation, size: p.size, elevationM: 0 }));
    const tries = [...(ahead ? [ahead] : []), ...(rung.side ? frontWallSpots(unitArchetype, sofaPose, room, walled, into.placed, occupied, rung.clearM, false, coffeeBox).map((s) => s.pose) : [])];
    let found: { steps: TrialStep[]; unit: Pose; tv: boolean; good: boolean } | null = null;
    for (const unitPose of tries) {
      const withUnit = copy(into);
      const unitSteps = [...steps];
      put(withUnit, unitSteps, { kind: unitPiece.kind, archetype: unitArchetype, pose: unitPose });
      const tvPose = resolvePose(tvPiece.archetype, 0, room, edges, withUnit.placed, inTheWay(withUnit.occupied, tvPiece.archetype.size.height));
      if (tvPose) put(withUnit, unitSteps, { kind: tvPiece.kind, archetype: tvPiece.archetype, pose: tvPose });
      const good = !!tvPose && standingWall(unitPose, room, walled) != null;
      if (good || !found) found = { steps: unitSteps, unit: unitPose, tv: !!tvPose, good };
      if (good) break;
    }
    if (!found) return bare;
    return { ...result, steps: found.steps, unit: true, tv: found.tv, good: found.good, screen: found.unit };
  };

  /** A free spot's worth by its screen (`bestAlongWalls`' own measure): 2.5–3.5 m to the screen's back, the floor between off the ways between doors. */
  const viewing = (sofa: Pose, screen: Pose) => {
    const back = backMiddle({ position: screen.position, rotation: screen.rotation, size: screen.size });
    const d = Math.hypot(back.x - sofa.position.x, back.z - sofa.position.z) - 0.05;
    const off = d < SOFA_TV_M.min ? SOFA_TV_M.min - d : d > SOFA_TV_M.max ? d - SOFA_TV_M.max : 0;
    let worth = off === 0 ? 10 : -off * 16;
    const view = viewingQuad(sofa.position, sofa.rotation, sofa.size.width, sofa.size.depth, d + 0.05);
    if (passagePaths(doorPoints).some((path) => quadsOverlap(path, view, QUAD_TOUCH_M))) worth -= 25;
    return worth;
  };

  /** The sofa of a rung against a wall, as the engine always looked for it: its screen's wall in the scoring (`screenFor`). */
  const againstWall = (rung: LoungeRung, sofa: LoungeSofa, rng: Rng | undefined, screenFor: RuleContext['screenFor']): Pose | null => {
    for (const width of sofa.widths ?? [sofa.archetype.size.width]) {
      const archetype = { ...sofa.archetype, size: { ...sofa.archetype.size, width, depth: blockDepth(sofa.archetype, rung) } };
      const exact = sofa.widths != null || rung.console;
      const pose = resolvePose(archetype, 0, room, edges, state.placed, inTheWay(state.occupied, archetype.size.height), { exact, anchors: anchorsFor(sofa.kind, anchors), rng, rules: { ...rulesOf(state), screenFor } });
      if (pose) return pose;
    }
    return null;
  };

  /** The sofa of a rung standing free, its back to an open line (decision 2): the best spot whose TV is on a wall. */
  const standingFree = (rung: LoungeRung, sofa: LoungeSofa): LoungeTrial | null => {
    if (!room.open?.length) return null;
    for (const width of sofa.widths ?? [sofa.archetype.size.width]) {
      const size = { ...sofa.archetype.size, width, depth: blockDepth(sofa.archetype, rung) };
      let best: { trial: LoungeTrial; score: number } | null = null;
      for (const spot of freeSofaSpots(size, room, edges, inTheWay(state.occupied, size.height))) {
        const trial = layFrom(rung, sofa, spot.pose, spot.way);
        if (!trial.good || !trial.screen) continue;
        const score = viewing(trial.steps[0].pose, trial.screen) - (spot.gap - SOFA_OPEN_LINE_WAY_M[0]) * 2 + spot.centred * 3;
        if (!best || score > best.score) best = { trial, score };
      }
      if (best) return best.trial;
    }
    return null;
  };

  /** One rung: the sofa against a wall; where its TV is not then on a wall, standing free; else the wall's as it is. */
  const trial = (rung: LoungeRung, rng: Rng | undefined, first: boolean): LoungeTrial => {
    const sofa = sofaOf(rung);
    // The first try is the engine's own dry run (`screenAfter`): the unit on a wall wherever any spot gives it one.
    const screenFor: RuleContext['screenFor'] = first
      ? ctx.screenAfter(at, own)
      : (pose) => {
          const t = layFrom(rung, sofa, pose, null);
          return t.good ? t.screen : null;
        };
    const pose = againstWall(rung, sofa, rng, screenFor);
    const onWall = pose ? layFrom(rung, sofa, pose, null) : null;
    if (onWall?.good) return onWall;
    return standingFree(rung, sofa) ?? onWall ?? none(rung);
  };

  /**
   * No coffee table: a smaller one — a round, nesting or side table — in front of the sofa, clear of
   * the unit by the rung's floor; else the same way laid with a console behind the sofa (Nini: rather
   * that than no table), where that keeps its sofa, unit and TV. Else as it is.
   */
  const withTable = (laid: LoungeTrial): LoungeTrial => {
    if (!laid.sofa || laid.table || !coffee) return laid;
    const into = copy(state);
    for (const step of laid.steps) stand(into, step.archetype, step.kind, step.pose, 'trial');
    const small = { ...coffee.archetype, size: { ...coffee.archetype.size, ...SMALL_COFFEE_TABLE_M } };
    const units = into.placed.filter((p) => p.slot === 'tv_unit').map((p) => inflate(boxFor({ position: p.position, rotation: p.rotation, size: p.size, elevationM: 0 }), laid.rung.clearM - 0.01));
    const pose = resolvePose(small, 0, room, edges, into.placed, [...inTheWay(into.occupied, small.size.height), ...units]);
    if (pose) {
      // Before the unit and the TV, as the coffee table is laid.
      const at = laid.steps.findIndex((s) => s.archetype.slot === 'tv_unit' || s.archetype.slot === 'tv');
      const table = { kind: coffee.kind, archetype: small, pose };
      return { ...laid, table: true, steps: at < 0 ? [...laid.steps, table] : [...laid.steps.slice(0, at), table, ...laid.steps.slice(at)] };
    }
    if (laid.rung.console || !consoleArchetype) return laid;
    const behind = trial({ ...laid.rung, console: true }, undefined, false);
    return behind.sofa && behind.table && behind.tv >= laid.tv && behind.unit >= laid.unit && behind.good >= laid.good ? behind : laid;
  };

  const rungs = loungeRungs(own.kind);
  const base = trial(rungs[0], options.rng, true);
  const first = withTable(base);
  // What may stand in for the first try, in order: the first try with a console behind its sofa where
  // no table of any size stood in front of it; then, where its TV is not on a wall, each fallback that
  // stands it on one; then, where it has no sofa, the first fallback with one.
  const queue: Array<() => LoungeTrial | null> = [];
  if (!first.table && first.sofa && !first.rung.console) {
    queue.push(() => {
      const behind = trial({ ...base.rung, console: true }, undefined, false);
      return behind.sofa && behind.table && behind.tv >= base.tv && behind.unit >= base.unit && behind.good >= base.good ? behind : null;
    });
  }
  let withSofa: LoungeTrial | null = null;
  if (!base.good) {
    for (const rung of rungs.slice(1)) {
      queue.push(() => {
        const result = trial(rung, undefined, false);
        if (result.sofa) withSofa ??= result;
        return result.sofa && result.good ? withTable(result) : null;
      });
    }
  }
  if (!base.sofa) queue.push(() => (withSofa ? withTable(withSofa) : null));
  return {
    entries: new Set([sofaEntry, ...[coffeeEntry, unitEntry, tvEntry].filter((e): e is ProgramEntry => !!e)]),
    first,
    next: () => {
      while (queue.length > 0) {
        const found = queue.shift()!();
        if (found) return found;
      }
      return null;
    },
  };
}

/**
 * Where a sofa may stand free with its back to a room separator's open line (decision 2): along each
 * open line, square to it, the way behind it 90 or 80 cm (`SOFA_OPEN_LINE_WAY_M`) — or further in,
 * where that brings it about 3 m from the wall ahead — the sofa and the way on the room's floor.
 */
function freeSofaSpots(size: Size3, room: PlanRoom, edges: PlanEdge[], occupied: Box[]): Array<{ pose: Pose; way: Box; gap: number; centred: number }> {
  const out: Array<{ pose: Pose; way: Box; gap: number; centred: number }> = [];
  for (const edge of edges) {
    if (!isOpenEdge(room, edge.index) || edge.length < size.width) continue;
    // Square to the room where the line is within a few degrees of it, as the walls are.
    const square = Math.round(edge.facing / (Math.PI / 2)) * (Math.PI / 2);
    const rotation = Math.abs(edge.facing - square) < 0.05 ? square : edge.facing;
    for (const t of sampleAlong(edge, size.width)) {
      const anchor = pointOnEdge(edge, t);
      const reach = rayToPolygon({ x: anchor.x + edge.inward.x * 0.01, z: anchor.z + edge.inward.z * 0.01 }, edge.inward, room.polygon) ?? 0;
      // The sofa's middle 3 m (and the unit's depth) from the wall ahead.
      const inFrom = Math.round((reach - 3 - ARCHETYPES.tv_unit.size.depth - size.depth / 2) * 100) / 100;
      const gaps = [...SOFA_OPEN_LINE_WAY_M, ...(inFrom > SOFA_OPEN_LINE_WAY_M[0] ? [inFrom] : [])];
      for (const gap of gaps) {
        const pose: Pose = { position: { x: anchor.x + edge.inward.x * (gap + size.depth / 2), z: anchor.z + edge.inward.z * (gap + size.depth / 2) }, rotation, size, elevationM: 0 };
        if (!fitsInRoom(pose, room.polygon) || overlapsAny(boxFor(pose), occupied)) continue;
        // The way: from 5 cm off the line (a line a degree off square) to the sofa's back.
        const way: Pose = { position: { x: anchor.x + edge.inward.x * ((gap + 0.05) / 2), z: anchor.z + edge.inward.z * ((gap + 0.05) / 2) }, rotation, size: { width: size.width, depth: gap - 0.07, height: 0.01 }, elevationM: 0 };
        if (!fitsInRoom(way, room.polygon)) continue;
        out.push({ pose, way: boxFor(way), gap, centred: 1 - Math.abs(t - 0.5) * 2 });
      }
    }
  }
  return out;
}

/**
 * The spots on the walls in front of a sofa for its TV unit — or, `hung`, its TV with no unit — best
 * first (the living room's third and fifth fallbacks): on a wall facing the sofa or across its line of
 * sight (a side wall), ahead of the sofa's front and at least `TV_SIDE_MIN_M` from its middle; a unit
 * on the floor clear of what stands and `clearM` off the coffee table (`keepFrom`), and a TV — over the
 * unit or hung — clear of the windows; scored 2.5–3.5 m from the sofa, by how squarely it faces it and,
 * on a wall facing the sofa, by how near its line of sight. `ahead`: on a wall facing the sofa.
 */
function frontWallSpots(archetype: Archetype, sofa: Pose, room: PlanRoom, walls: PlanEdge[], placed: PlacedItem[], occupied: Box[], clearM: number, hung: boolean, keepFrom: Box[] = []): Array<{ pose: Pose; ahead: boolean }> {
  const forward = { x: Math.sin(sofa.rotation), z: Math.cos(sofa.rotation) };
  const { width, depth, height } = archetype.size;
  const spots: Array<{ value: { pose: Pose; ahead: boolean }; score: number }> = [];
  for (const edge of walls) {
    if (edge.length < width) continue;
    const facing = facesWay(edge.facing, sofa.rotation + Math.PI);
    if (!facing && !facesWay(edge.facing, sofa.rotation + Math.PI / 2) && !facesWay(edge.facing, sofa.rotation - Math.PI / 2)) continue;
    const blocked = room.openings.filter((o) => o.wallIndex === edge.index);
    for (const t of sampleAlong(edge, width)) {
      const anchor = pointOnEdge(edge, t);
      const out = depth / 2 + (hung ? 0.01 : 0.02);
      const pose: Pose = { position: { x: anchor.x + edge.inward.x * out, z: anchor.z + edge.inward.z * out }, rotation: edge.facing, size: archetype.size, elevationM: hung ? TV_CENTRE_M - height / 2 : 0 };
      const off = { x: pose.position.x - sofa.position.x, z: pose.position.z - sofa.position.z };
      const ahead = off.x * forward.x + off.z * forward.z;
      const distance = Math.hypot(off.x, off.z);
      if (ahead < sofa.size.depth / 2 + 0.5 || distance < TV_SIDE_MIN_M) continue;
      if (hung) {
        if (coversOpening(edge, t, width, TV_CENTRE_M + height / 2, blocked) || hangsIntoFloorPiece(pose, placed)) continue;
      } else {
        if (!fitsInRoom(pose, room.polygon) || overlapsAny(boxFor(pose), occupied)) continue;
        if (keepFrom.length > 0 && overlapsAny(inflate(boxFor(pose), clearM - 0.01), keepFrom)) continue;
        if (coversOpening(edge, t, width, height, blocked)) continue;
        if (blocksWindow({ ...pose, slot: archetype.slot, size: { ...pose.size, height: TV_TOP_M } }, room)) continue;
      }
      const away = distance < SOFA_TV_M.min ? SOFA_TV_M.min - distance : distance > SOFA_TV_M.max ? distance - SOFA_TV_M.max : 0;
      // On a wall facing the sofa, as near its line of sight as it will go: 2.5 m straight ahead
      // rather than in range off to one side.
      const lateral = Math.abs(off.x * forward.z - off.z * forward.x);
      spots.push({ value: { pose, ahead: facing }, score: (away === 0 ? 10 : -away * 16) + (ahead / distance) * 10 - (facing ? lateral * 16 : 0) });
    }
  }
  return spots.sort((a, b) => b.score - a.score).map((s) => s.value);
}

/** The width of a TV as large as its distance from the sofa asks (`tvInchesFor`) over this unit; the unit's own width from 4.2 m. */
function tvWidthFor(unit: PlacedItem, placed: PlacedItem[]): number {
  const sofa = placed.find((p) => p.roomId === unit.roomId && p.slot === 'sofa');
  if (!sofa) return 0;
  const inches = tvInchesFor(Math.hypot(unit.position.x - sofa.position.x, unit.position.z - sofa.position.z));
  return Number.isFinite(inches) ? inches * TV_WIDTH_PER_INCH_M : unit.size.width;
}

// ---------------------------------------------------------------------------
// Placement resolution
// ---------------------------------------------------------------------------

function resolvePose(
  archetype: Archetype,
  index: number,
  room: PlanRoom,
  edges: PlanEdge[],
  placed: PlacedItem[],
  occupied: Box[],
  options: { exact?: boolean; anchors?: TechnicalAnchor[]; rng?: Rng; rules?: RuleContext; relax?: LayoutRelax } = {}
): Pose | null {
  const rule = archetype.placement;
  const rng = options.rng;
  const rules = options.rules ?? { doorBands: [], entranceBands: [], placed, passages: [] };
  // A room separator is no wall: nothing stands against it, runs along it or hangs on it.
  const walled = edges.filter((e) => !isOpenEdge(room, e.index));

  switch (rule.type) {
    case 'wall': {
      // A wardrobe goes into a niche when the room has one it fits (the brief: use the niches for it).
      if (archetype.slot === 'wardrobe' && !options.exact) {
        const inNiche = placeInNiche(archetype, room, occupied);
        if (inNiche) return inNiche;
      }
      const beside = rule.beside ? placed.find((p) => p.slot === rule.beside) : undefined;
      // A table laid against a wall (a balcony's) is a compact one, its two seats along the wall.
      if (archetype.slot === 'dining_table' && !options.exact) return placeCompactTable(archetype, room, walled, occupied, rule.prefer, rule.clearanceM, rng, rules);
      return placeAgainstWall(archetype, room, walled, occupied, rule.prefer, rule.clearanceM, options.exact ?? false, options.anchors ?? [], rng, beside, rules);
    }
    case 'wall-run': {
      // The fridge's end of the wall is left only for a fridge still to come: one a kitchen's
      // fallback stood first (`KitchenFallback.fridgeFirst`) has its own wall.
      const relax = options.relax ?? {};
      const leaveFor = rule.leaveFor && !placed.some((p) => p.roomId === room.id && p.slot === rule.leaveFor) ? rule.leaveFor : undefined;
      const leave = leaveFor ? Object.values(ARCHETYPES).find((a) => a.slot === leaveFor)?.size : undefined;
      // A kitchen's first fallback lays the run on the wall it is given (`KitchenFallback.runEdge`).
      const walls = relax.runEdge != null ? walled.filter((e) => e.index === relax.runEdge) : walled;
      return placeWallRun(archetype, room, walls, occupied, rule.prefer, rule.clearanceM, options.anchors ?? [], rng, leave, rules.entranceBands, relax.shorter ? { leastM: KITCHEN_RUN_M.studio, ...relax.shorter } : undefined);
    }
    case 'center':
      // A table with no room to stand free (1.2 m round it in a kitchen) stands against a wall
      // instead (the rulebook, K-11) — seats on its three open sides — never a smaller one.
      // Where no table for four fits even so, a kitchen's fourth fallback (`KitchenFallback.smallTable`)
      // stands a two-seat one against a wall, turned so its two chairs face each other along it.
      return (
        placeCentre(archetype, room, occupied, rules.placed) ??
        (archetype.slot === 'dining_table' && !options.exact
          ? placeAgainstWall({ ...archetype, size: { width: MIN_DINING_TABLE_M, depth: 0.82, height: archetype.size.height } }, room, walled, occupied, 'any', 0.7, true, [], rng, undefined, rules)
          : null) ??
        (archetype.slot === 'dining_table' && !options.exact && options.relax?.smallTable ? placeCompactTable(archetype, room, walled, occupied, 'any', 0.7, rng, rules) : null)
      );
    case 'relative':
      return placeRelative(archetype, index, room, placed, occupied);
    case 'corner':
      return archetype.slot === 'shower'
        ? placeShower(archetype, room, walled, occupied, rule.clearanceM, rng, rules, options.relax ?? {})
        : placeInCorner(archetype, room, walled, occupied, rule.clearanceM, rng, rules);
    case 'ceiling':
      return placeOnCeiling(archetype, room, placed);
    case 'wall-mounted':
      // Over its piece when the room has one (the wall cabinets over the run, the mirror over the
      // basin, a print over the bed, the TV over its unit), else on a wall — the TV nowhere.
      // A bathroom's mirror hangs over its basin, else on another stretch of wall near it (Nini's
      // fifth fallback, `mirrorNearBasin`), and nowhere else.
      if (archetype.slot === 'mirror' && WET_ROOM_TYPES.includes(room.type)) return placeAbove(archetype, room, walled, placed, rule) ?? mirrorNearBasin(archetype, room, walled, placed, rule);
      return (rule.above ? placeAbove(archetype, room, walled, placed, rule) : null) ?? (rule.onlyAbove ? null : placeOnWall(archetype, index, room, walled, rule.heightM, placed, rng));
    case 'under':
      return placeUnder(archetype, room, placed);
    case 'window':
      return placeAtWindow(archetype, index, room, edges);
    case 'entrance':
      return placeAtEntrance(archetype, room, edges);
    default:
      return null;
  }
}

/** Stands the item flat against the best available wall. */
function placeAgainstWall(
  archetype: Archetype,
  room: PlanRoom,
  edges: PlanEdge[],
  occupied: Box[],
  prefer: 'longest' | 'opposite-door' | 'beside-window' | 'shortest' | 'any' | 'near-entrance',
  clearanceM: number,
  exact = false,
  anchors: TechnicalAnchor[] = [],
  rng?: Rng,
  beside?: PlacedItem,
  rules?: RuleContext
): Pose | null {
  const doorPoints = openingPoints(room, edges, isPassage);
  const windowPoints = openingPoints(room, edges, (o) => o.kind === 'window');

  // A wardrobe comes in many widths; a bed does not. When the standard width finds no wall,
  // storage tries narrower slots before giving up — the matcher then prefers a product that
  // fits the slot it was given. Not when the size is a real product's (`exact`): a 1.9 m
  // cabinet handed a 1.2 m slot lands on its neighbours.
  const widths = !exact && NARROWABLE.has(archetype.kind)
    ? [1, 0.8, 0.65].map((f) => archetype.size.width * f)
    : [archetype.size.width];

  for (const width of widths) {
    // A WC is placed with 40 cm from its centre to either side (`WC_SIDE_M`): its spot is looked
    // for as that wide, then it stands at its own size in the middle of it. And as deep as it will
    // stand once the box of its cistern is built behind it (`WC_AS_BUILT_DEPTH_M`, `wcBoxes`), so
    // the box does not stand it out into a door's clear floor or the fixture laid before it; it is
    // put with its back on the wall, the rest of that depth in front of it. A small bathroom's
    // smaller WC (`WC_COMPACT_DEPTH_M`) is its own depth and the box's.
    const wc = archetype.slot === 'toilet';
    const builtDepth = Math.max(archetype.size.depth, Math.min(archetype.size.depth, WC_AS_BUILT_DEPTH_M - WC_BOX_DEPTH_M) + WC_BOX_DEPTH_M);
    const search = wc ? { ...archetype.size, width: Math.max(width, 2 * WC_SIDE_M), depth: builtDepth } : { ...archetype.size, width };
    const found = bestAlongWalls(archetype, search, room, edges, occupied, prefer, clearanceM, doorPoints, windowPoints, anchors, rng, beside, rules);
    if (found && wc) {
      const back = (search.depth - archetype.size.depth) / 2;
      return { ...found, position: { x: found.position.x - Math.sin(found.rotation) * back, z: found.position.z - Math.cos(found.rotation) * back }, size: { ...found.size, width, depth: archetype.size.depth } };
    }
    if (found) return found;
  }
  return null;
}

/**
 * A wardrobe built into a niche: the recess's whole width (less 2 cm each side), 60 cm deep, or a
 * shallow 38 cm one in a recess under 60 cm (`roomNiches`, the widest first). Null when the room
 * has no niche it fits.
 */
function placeInNiche(archetype: Archetype, room: PlanRoom, occupied: Box[]): Pose | null {
  for (const niche of roomNiches(room)) {
    const depth = niche.depthM >= WARDROBE_DEPTH_M ? WARDROBE_DEPTH_M : niche.depthM >= SHALLOW_WARDROBE_DEPTH_M ? SHALLOW_WARDROBE_DEPTH_M : null;
    if (depth === null) continue;
    const size = { width: niche.widthM - 0.04, depth, height: archetype.size.height };
    const anchor = pointOnEdge(niche.back, 0.5);
    const pose: Pose = {
      position: { x: anchor.x + niche.back.inward.x * (depth / 2 + 0.02), z: anchor.z + niche.back.inward.z * (depth / 2 + 0.02) },
      rotation: niche.back.facing,
      size,
      elevationM: 0,
    };
    if (!fitsInRoom(pose, room.polygon) || overlapsAny(boxFor(pose), occupied)) continue;
    if (coversOpening(niche.back, 0.5, size.width, size.height, room.openings.filter((o) => o.wallIndex === niche.back.index))) continue;
    return pose;
  }
  return null;
}

/** Whether a pose stands in one of these bands (what is seen straight through a doorway). */
function inSight(pose: Pose, bands: Quad[]): boolean {
  if (bands.length === 0) return false;
  const quad = footprintQuad(pose);
  return bands.some((band) => quadsOverlap(quad, band, QUAD_TOUCH_M));
}

/** Whether a wall faces this way (within a few degrees). */
function facesWay(facing: number, way: number): boolean {
  const turn = facing - way;
  return Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) < 0.1;
}

/** How far a pose's footprint overlaps a piece's width, across the piece's facing — whether it stands in front of it. */
function acrossOverlap(pose: Pose, piece: PlacedItem): number {
  const right = { x: Math.cos(piece.rotation), z: -Math.sin(piece.rotation) };
  const along = (p: Vec2) => (p.x - piece.position.x) * right.x + (p.z - piece.position.z) * right.z;
  const centre = along(pose.position);
  const half = (Math.abs(Math.cos(pose.rotation - piece.rotation)) * pose.size.width + Math.abs(Math.sin(pose.rotation - piece.rotation)) * pose.size.depth) / 2;
  return Math.min(centre + half, piece.size.width / 2) - Math.max(centre - half, -piece.size.width / 2);
}

/** The width beside a double bed for a nightstand and the step to it: 60–70 cm free (`BED_SIDE_FREE_M`). */
const BEDSIDE_M = BED_SIDE_FREE_M;

const NARROWABLE = new Set([
  'wardrobe', 'bookshelf', 'storage_shelf', 'dresser', 'tv_unit', 'console_table', 'shoe_cabinet', 'desk', 'sofa_3seat',
]);

function bestAlongWalls(
  archetype: Archetype,
  size: Size3,
  room: PlanRoom,
  edges: PlanEdge[],
  occupied: Box[],
  prefer: 'longest' | 'opposite-door' | 'beside-window' | 'shortest' | 'any' | 'near-entrance',
  clearanceM: number,
  doorPoints: Vec2[],
  windowPoints: Vec2[],
  anchors: TechnicalAnchor[] = [],
  rng?: Rng,
  beside?: PlacedItem,
  rules?: RuleContext
): Pose | null {
  const { width, depth, height } = size;
  const anchorPoints = anchors.map((a) => a.point);
  const spots: Array<{ value: Pose; score: number; seen?: boolean; cramped?: boolean; screen?: { ahead: number; wall: number | null } }> = [];
  const bounds = polygonBounds(room.polygon);
  // In a bathroom or a toilet each fixture keeps free floor in front of it, and out of the others'.
  const wetFixture = WET_ROOM_TYPES.includes(room.type) && WET_FIXTURES.has(archetype.slot);
  const standing = (rules?.placed ?? []).filter((p) => p.roomId === room.id && !ARCHETYPES[p.kind]?.ghost).map((p) => boxFor({ position: p.position, rotation: p.rotation, size: p.size, elevationM: 0 }));
  const sofa = rules?.placed.find((p) => p.roomId === room.id && p.slot === 'sofa');
  const bed = rules?.placed.find((p) => p.roomId === room.id && p.slot === 'bed');
  const entrancePoints = openingPoints(room, edges, (o) => o.kind === 'door' && !!o.exterior);

  for (const edge of edges) {
    // A piece that fits its wall may stand on it, corner to corner (`sampleAlong`).
    if (edge.length < width) continue;

    // Don't stand a wardrobe in a doorway or across a window.
    const blocked = room.openings.filter((o) => o.wallIndex === edge.index);
    // Hard against an end of the piece it goes beside, when that piece stands on this wall.
    const ends = beside ? besideSpots(edge, beside, width) : [];

    for (const t of [...ends, ...sampleAlong(edge, width)]) {
      const anchor = pointOnEdge(edge, t);
      const centre = {
        x: anchor.x + edge.inward.x * (depth / 2 + 0.02),
        z: anchor.z + edge.inward.z * (depth / 2 + 0.02),
      };

      const pose: Pose = {
        position: centre,
        rotation: edge.facing,
        size,
        elevationM: 0,
      };

      if (!fitsInRoom(pose, room.polygon)) continue;
      if (overlapsAny(boxFor(pose), occupied)) continue;
      if (coversOpening(edge, t, width, height, blocked)) continue;

      let score = 0;
      if (prefer === 'longest') score += edge.length * 3;
      if (prefer === 'shortest') score += 30 - edge.length * 3;
      // The wall furthest from the door, not that wall's far corner: a bed pushed into the corner
      // left room for one nightstand.
      if (prefer === 'opposite-door') score += minDistance(pointOnEdge(edge, 0.5), doorPoints) * 6;
      if (prefer === 'beside-window') score += 24 - minDistance(centre, windowPoints) * 5;
      if (prefer === 'any') score += edge.length;
      // By the flat's front door (coats where one comes in).
      if (prefer === 'near-entrance') score += entrancePoints.length > 0 ? 24 - minDistance(centre, entrancePoints) * 6 : edge.length;
      // A WC stands in the middle of its wall (the rulebook, BA-5), not pushed to one end.
      if (archetype.slot === 'toilet') score += (1 - Math.abs(t - 0.5) * 2) * 8;

      // Centred on the wall looks deliberate; jammed in a corner looks accidental.
      score += (1 - Math.abs(t - 0.5) * 2) * 3;
      // A double bed wants a nightstand each side: room for both on this wall — clear of a door's
      // swing too, which pushed a bed 45 cm off the far wall and left one nightstand a sliver —
      // the bed in the middle.
      if (archetype.kind === 'bed_double') {
        const heads = { width: width + 2 * BEDSIDE_M, depth: 0.45, height: 0.6 };
        const headPose: Pose = {
          position: { x: anchor.x + edge.inward.x * (heads.depth / 2 + 0.02), z: anchor.z + edge.inward.z * (heads.depth / 2 + 0.02) },
          rotation: edge.facing,
          size: heads,
          elevationM: 0,
        };
        if (fitsInRoom(headPose, room.polygon) && !overlapsAny(boxFor(headPose), occupied) && !coversOpening(edge, t, heads.width, heads.height, blocked)) score += 14;
        // Strong enough that a draw (`BED_SPREAD`) keeps it within about 25 cm of the middle.
        score += (1 - Math.abs(t - 0.5) * 2) * 20;
      }
      // A big piece leaves room to walk past its long sides, or none at all: the gap the studio
      // warns of (`tightSpots`) — a bed 45 cm off the side wall — is the last choice.
      if (isLargeSize(size) && longSideGaps(boxFor(pose), bounds).some(isTightPassage)) score -= 16;

      // Reward keeping the walking space in front of the item genuinely clear.
      const approach = clearanceBox(pose, clearanceM);
      if (fitsInRoom({ ...pose, position: boxCentre(approach), size: boxSize(approach, height) }, room.polygon)) {
        score += 8;
      }
      if (!overlapsAny(approach, occupied)) score += 12;

      // The fridge at the end of the run: above every preference but the pipes.
      if (ends.includes(t)) score += 40;

      // Seen straight through a doorway: a WC never when anything else fits (below), a bed rather
      // not — though it is no fault if it is.
      const seen = inSight(pose, rules?.doorBands ?? []);
      if (seen && archetype.slot === 'bed') score -= 12;
      // Opening a bathroom's door one sees the basin, the shower or the bath; and the long walls
      // take the basin and the bath, the WC the rest.
      if (wetFixture && (archetype.slot === 'sink' || archetype.slot === 'bathtub')) {
        if (seen) score += 6;
        score += edge.length * 2;
      }
      // Less than `BATH_PASSAGE_MIN_M` in front of it (or standing in another's) is no way past;
      // less than the full `BATH_PASSAGE_M` is tight, and taken only when nothing roomier is.
      const cramped = wetFixture && (overlapsAny(clearanceBox(pose, BATH_PASSAGE_MIN_M), standing) || overlapsAny(boxFor(pose), rules?.passages ?? []));
      if (wetFixture && !cramped && overlapsAny(clearanceBox(pose, Math.max(clearanceM, BATH_PASSAGE_M)), standing)) score -= 10;
      // A bookcase beside or behind the sofa, not in its line of sight (on the TV's wall).
      if (archetype.kind === 'bookshelf' && sofa) {
        if (facesWay(edge.facing, sofa.rotation + Math.PI)) score -= 20;
        else score += facesWay(edge.facing, sofa.rotation) ? 8 : 4;
      }
      // A wardrobe beside the bed, never facing it from the foot.
      if (archetype.slot === 'wardrobe' && bed) {
        if (facesWay(edge.facing, bed.rotation + Math.PI) && acrossOverlap(pose, bed) > 0.2) score -= 20;
        else if (!facesWay(edge.facing, bed.rotation)) score += 6;
      }
      // The sofa 2.5–3.5 m from the screen on the wall it faces.
      let screen: { ahead: number; wall: number | null } | undefined;
      if (archetype.slot === 'sofa') {
        const forward = { x: Math.sin(edge.facing), z: Math.cos(edge.facing) };
        // What it faces is the first thing ahead, a wall or a room separator's open line; the wall
        // its screen is on is the one its TV unit would stand against, when it would against one.
        const outline = rayToPolygon(centre, forward, room.polygon);
        const facing = (ahead: number): number => {
          let worth = 0;
          const off = ahead - 0.05 < SOFA_TV_M.min ? SOFA_TV_M.min - (ahead - 0.05) : ahead - 0.05 > SOFA_TV_M.max ? ahead - 0.05 - SOFA_TV_M.max : 0;
          worth += off === 0 ? 10 : -off * 16;
          // It faces the TV, which hangs on the wall ahead: not a wall of windows.
          const tvPose = { position: { x: centre.x + forward.x * (ahead - 0.25), z: centre.z + forward.z * (ahead - 0.25) }, rotation: edge.facing + Math.PI, size: { width: 1.6, depth: 0.4, height: TV_TOP_M }, elevationM: 0 };
          if (blocksWindow({ ...tvPose, slot: 'tv_unit' }, room)) worth -= 14;
          // Nobody walks between the sofa and the TV to get through the room (the rulebook, L-5):
          // the floor between them stays off the way from one door to another.
          const view = viewingQuad(centre, edge.facing, width, depth, ahead);
          if (passagePaths(doorPoints).some((path) => quadsOverlap(path, view, QUAD_TOUCH_M))) worth -= 25;
          return worth;
        };
        const unit = rules?.screenFor?.(pose) ?? null;
        const behind = unit ? standingWall(unit, room, edges) : null;
        // Straight ahead, how far ahead its wall is; on a side wall (the living room's third
        // fallback, `frontWallSpots`), how far its back is.
        const away = (screenPose: Pose, gap: number) => {
          if (facesWay(screenPose.rotation, edge.facing + Math.PI)) return (screenPose.position.x - centre.x) * forward.x + (screenPose.position.z - centre.z) * forward.z + screenPose.size.depth / 2 + gap;
          const back = backMiddle(screenPose);
          return Math.hypot(back.x - centre.x, back.z - centre.z);
        };
        screen = {
          ahead: outline != null ? facing(outline) : 0,
          wall: unit && behind ? facing(away(unit, behind.gap)) : null,
        };
      }

      // A fixture wants its pipe: the toilet by the sewer, the sink by the water. Strong
      // enough to outweigh the wall preferences, which are about looks, not plumbing.
      if (anchorPoints.length > 0) score += Math.max(0, 40 - minDistance(centre, anchorPoints) * 12);

      spots.push({ value: pose, score, seen, cramped, screen });
    }
  }

  // A sofa's TV unit stands on a wall: where some spot of the sofa gives it one, the sofa takes
  // one of those, scored by its distance to that wall. Where none does — every wall ahead too
  // near, or a separator's line — the room is laid as it always was, the screen whatever the sofa
  // faces: what stands there instead is a rule of the room's still to be written.
  if (spots.some((s) => s.screen)) {
    const walled = spots.filter((s) => s.screen?.wall != null);
    if (walled.length > 0) spots.splice(0, spots.length, ...walled);
    for (const spot of spots) spot.score += walled.length > 0 ? spot.screen!.wall! : spot.screen?.ahead ?? 0;
  }
  // A fixture that would leave no way past it goes only when nothing else fits.
  if (wetFixture && spots.some((s) => !s.cramped)) spots.splice(0, spots.length, ...spots.filter((s) => !s.cramped));
  // A WC is not what the door opens onto: the spots seen through a doorway go, unless no other fits.
  if (archetype.slot === 'toilet' && spots.some((s) => !s.seen)) return pickNearBest(spots.filter((s) => !s.seen), SPOT_SPREAD, rng);

  // The best spot; generating, any spot close to it — another wall of similar merit, another
  // stretch of the same wall. A fixture by its pipe keeps it: the anchor's pull is far above the spread.
  // A double bed keeps to the middle of its wall with a nightstand each side: a draw within the
  // usual spread put one 80 cm off the middle, and a wider real bed then left room for one.
  return pickNearBest(spots, archetype.kind === 'bed_double' ? BED_SPREAD : SPOT_SPREAD, rng);
}

/** Kitchen counters: stretch along the wall rather than sitting at a fixed width. */
function placeWallRun(
  archetype: Archetype,
  room: PlanRoom,
  edges: PlanEdge[],
  occupied: Box[],
  prefer: 'longest' | 'shortest',
  clearanceM: number,
  anchors: TechnicalAnchor[] = [],
  rng?: Rng,
  leave?: Size3,
  entranceBands: Quad[] = [],
  shorter?: ShorterRun
): Pose | null {
  // Out of sight of the flat's front door first; only when no wall works out of it, in sight.
  for (const hidden of entranceBands.length > 0 ? [true, false] : [false]) {
    const pose = placeWallRunOnce(archetype, room, edges, occupied, prefer, clearanceM, anchors, rng, leave, hidden ? entranceBands : [], shorter);
    if (pose) return pose;
  }
  return null;
}

function placeWallRunOnce(
  archetype: Archetype,
  room: PlanRoom,
  edges: PlanEdge[],
  occupied: Box[],
  prefer: 'longest' | 'shortest',
  clearanceM: number,
  anchors: TechnicalAnchor[],
  rng: Rng | undefined,
  leave: Size3 | undefined,
  avoid: Quad[],
  shorter?: ShorterRun
): Pose | null {
  const least = shorter?.leastM;
  const { depth, height } = archetype.size;
  // The kitchen run goes on the wall the water comes to, when the plan says where that is.
  const anchorPoints = anchors.map((a) => a.point);
  const nearAnchor = (edge: PlanEdge) => (anchorPoints.length === 0 ? 0 : minDistance(pointOnEdge(edge, 0.5), anchorPoints));
  // A wall with no window comes first: the wall cabinets and the backsplash need the wall over the
  // worktop — the run used to go under a window, the cabinets shortened round it or none at all.
  const clean = (edge: PlanEdge) => edge.length >= 2.2 && !room.openings.some((o) => o.wallIndex === edge.index && o.kind === 'window');
  const sorted = [...edges].sort((a, b) => {
    if (anchorPoints.length > 0) {
      const byAnchor = nearAnchor(a) - nearAnchor(b);
      if (Math.abs(byAnchor) > 0.5) return byAnchor;
    }
    if (clean(a) !== clean(b)) return clean(a) ? -1 : 1;
    return prefer === 'longest' ? b.length - a.length : a.length - b.length;
  });
  // Generating with no water point to follow, the run may take any long enough wall, the longer the
  // likelier — the walls with no window first.
  const weight = (e: PlanEdge) => (prefer === 'longest' ? e.length : 1 / Math.max(e.length, 0.5));
  const order = rng && anchorPoints.length === 0 ? [...weightedOrder(sorted.filter(clean), weight, rng), ...weightedOrder(sorted.filter((e) => !clean(e)), weight, rng)] : sorted;

  for (const edge of order) {
    const blocked = room.openings.filter((o) => o.wallIndex === edge.index);
    // Standing against this wall at `t`, `size` big — or null where it would not stand.
    const standing = (t: number, size: Size3, clearance: number): Pose | null => {
      if (coversOpening(edge, t, size.width, size.height, blocked)) return null;
      const anchor = pointOnEdge(edge, t);
      const pose: Pose = {
        position: { x: anchor.x + edge.inward.x * (size.depth / 2 + 0.02), z: anchor.z + edge.inward.z * (size.depth / 2 + 0.02) },
        rotation: edge.facing,
        size,
        elevationM: 0,
      };
      if (!fitsInRoom(pose, room.polygon) || overlapsAny(boxFor(pose), occupied)) return null;
      if (clearance > 0 && overlapsAny(clearanceBox(pose, clearance), occupied)) return null;
      if (inSight(pose, avoid)) return null;
      return pose;
    };

    // From one corner, the other end of the wall left for the fridge (`leaveFor`): the run, the
    // fridge and the wall cabinets on one wall, the way a small kitchen is fitted — the cabinets
    // used to hang over the fridge the room put at the run's end afterwards.
    // A kitchen's third fallback (`KitchenFallback.shorter`): shorter runs, down to `least`, each slid
    // along the wall with the fridge hard beside it, at the end the fallback asks first — not only the
    // one length from either corner, which any keep-clear floor in a corner refused.
    // The fridge's room is its own width and 2 cm, the pieces a centimetre apart and off the wall's
    // ends: a 1.98 m wall takes a 1.2 m run and a 72 cm fridge (RK1 — the corners' two tries keep 8 cm).
    if (leave && least != null) {
      const spare = { ...leave, width: leave.width + 0.02 };
      for (const runLength of shorterRuns(Math.min(edge.length - spare.width - 0.03, archetype.size.width * 1.6), least)) {
        for (const from of slideStarts(edge.length, runLength + 0.01 + spare.width)) {
          for (const fridgeBefore of shorter?.fridgeBefore ? [true, false] : [false, true]) {
            const runFrom = fridgeBefore ? from + spare.width + 0.01 : from;
            const fridgeFrom = fridgeBefore ? from : from + runLength + 0.01;
            const pose = standing((runFrom + runLength / 2) / edge.length, { width: runLength, depth, height }, clearanceM * 0.4);
            if (pose && standing((fridgeFrom + spare.width / 2) / edge.length, spare, 0)) return pose;
          }
        }
      }
    }
    if (leave) {
      const runLength = Math.min(edge.length - leave.width - 0.08, archetype.size.width * 1.6);
      const spare = { ...leave, width: leave.width + 0.04 };
      for (const fromStart of runLength >= KITCHEN_RUN_M.studio ? [true, false] : []) {
        const t = fromStart ? (0.02 + runLength / 2) / edge.length : 1 - (0.02 + runLength / 2) / edge.length;
        const pose = standing(t, { width: runLength, depth, height }, clearanceM * 0.4);
        const end = fromStart ? 1 - (0.02 + spare.width / 2) / edge.length : (0.02 + spare.width / 2) / edge.length;
        if (pose && standing(end, spare, 0)) return pose;
      }
    }

    // Try the full wall first, then progressively shorter runs — a counter that has to stop
    // short of a doorway is still a counter.
    // A kitchen's third fallback tries 1.5 m and a studio's kitchen 1.2 m too (`least`).
    const shortest = least == null ? [] : [KITCHEN_RUN_M.small, KITCHEN_RUN_M.studio].filter((m) => m >= least - 1e-6);
    for (const target of [edge.length - 0.3, edge.length * 0.7, edge.length * 0.5, KITCHEN_RUN_M.preferred, ...shortest]) {
      const runLength = Math.min(target, archetype.size.width * 1.6);
      if (runLength < (least ?? KITCHEN_RUN_M.studio)) continue;

      for (const t of sampleAlong(edge, runLength)) {
        const pose = standing(t, { width: runLength, depth, height }, clearanceM * 0.4);
        if (pose) return pose;
      }
    }
  }

  return null;
}

/** A kitchen's shorter-run fallback (`KitchenFallback.shorter`): the shortest run it lays, and which end of the run its fridge is tried at first. */
interface ShorterRun {
  leastM: number;
  fridgeBefore: boolean;
}

/** The run lengths a kitchen's shorter-run fallback tries: the longest, then every 15 cm down to `least`, longest first. */
function shorterRuns(longest: number, least: number): number[] {
  const out: number[] = [];
  for (let m = Math.floor(longest * 20) / 20; m >= least - 1e-6; m = Math.round((m - 0.15) * 100) / 100) out.push(m);
  if (out.length > 0 && out[out.length - 1] > least + 1e-6) out.push(least);
  return out;
}

/** Where along a wall `length` long a group `width` wide may begin, a centimetre off its ends: either corner first, then every 10 cm between. */
function slideStarts(length: number, width: number): number[] {
  const last = length - width - 0.01;
  if (last < 0.01 - 1e-6) return [];
  const out = [0.01, last];
  for (let s = 0.11; s < last - 1e-6; s += 0.1) out.push(s);
  return out;
}

/**
 * Where a piece `width` wide stands hard against either end of `piece` along this wall (2 cm
 * apart), as positions along the edge — none when `piece` does not stand against this wall.
 */
function besideSpots(edge: PlanEdge, piece: PlacedItem, width: number): number[] {
  // Its back within 10 cm of this wall's line, square to it within 0.05 rad.
  if (!wallBehind(piece, [edge], { facing: Math.cos(0.05), by: 'gap', min: -0.1, max: 0.1 })) return [];
  const along = (piece.position.x - edge.a.x) * edge.dir.x + (piece.position.z - edge.a.z) * edge.dir.z;
  const reach = piece.size.width / 2 + 0.02 + width / 2;
  return [along - reach, along + reach].map((a) => a / edge.length).filter((t) => t - width / 2 / edge.length >= -1e-6 && t + width / 2 / edge.length <= 1 + 1e-6);
}

/** Free-standing in the middle, nudged outward until it stops colliding. */
function placeCentre(archetype: Archetype, room: PlanRoom, occupied: Box[], placed: PlacedItem[] = []): Pose | null {
  const island = archetype.slot === 'kitchen_island';
  const table = archetype.slot === 'dining_table';
  // An island keeps 120 cm from the run it faces (`FACING_COUNTERS_M`) — and from every wall and
  // piece round it (the rulebook, K-6): it never stands against a wall.
  const runs = island ? placed.filter((p) => p.roomId === room.id && p.slot === 'kitchen_run').map((p) => boxFor({ position: p.position, rotation: p.rotation, size: p.size, elevationM: 0 })) : [];
  const standing = placed.filter((p) => p.roomId === room.id && !ARCHETYPES[p.kind]?.ghost).map((p) => boxFor({ position: p.position, rotation: p.rotation, size: p.size, elevationM: 0 }));
  // A living room's table stands well away from the sofa and its coffee table (L-6, L-8).
  const lounge = table ? placed.filter((p) => p.roomId === room.id && (p.slot === 'sofa' || p.slot === 'coffee_table' || p.slot === 'armchair' || p.slot === 'tv_unit')).map((p) => inflate(boxFor({ position: p.position, rotation: p.rotation, size: p.size, elevationM: 0 }), DINING_LOUNGE_GAP_M)) : [];
  const centroid = polygonCentroid(room.polygon);
  const bounds = polygonBounds(room.polygon);

  // Lay the long axis of the item along the long axis of the room.
  const rotation = bounds.width >= bounds.depth ? 0 : Math.PI / 2;

  // A dining table seats four at least — never a small table and one chair (K-10, L-6: 1.2 m or
  // more) — and a long kitchen takes a long table (K-12). Smaller sizes and a tighter walking gap
  // are tried before giving up; anything else keeps the old shrinking search.
  const long = Math.max(bounds.width, bounds.depth) / Math.max(0.1, Math.min(bounds.width, bounds.depth)) >= 1.6;
  const tries: Array<[Size3, number]> = table
    ? ([...(long ? [[1.8, 0.9, 0.45]] : []), [1.6, 0.9, 0.45], [1.6, 0.9, 0.32], [1.4, 0.85, 0.32], [MIN_DINING_TABLE_M, 0.82, 0.3]] as Array<[number, number, number]>).map(([w, d, g]): [Size3, number] => [{ width: w, depth: d, height: archetype.size.height }, g])
    : ([[1, 0.45], [1, 0.32], [0.85, 0.32], [0.72, 0.26]] as const).map(([shrink, g]): [Size3, number] => [{ width: archetype.size.width * shrink, depth: archetype.size.depth * shrink, height: archetype.size.height }, g]);

  for (const [size, gap] of tries) {
    // A kitchen's table stands beyond the run's working floor (in `occupied`) and as far from the
    // run as it can — at the short wall of a long kitchen, not in the middle of the cooking. A
    // living room's in the middle of the floor left free: the spot with the most room round it.
    const run = table ? placed.find((p) => p.roomId === room.id && p.slot === 'kitchen_run') : undefined;
    let best: { pose: Pose; score: number } | null = null;
    for (const offset of spiralOffsets(Math.max(1.8, Math.max(bounds.width, bounds.depth) / 2), 0.3)) {
      for (const rot of [rotation, rotation + Math.PI / 2]) {
        const pose: Pose = {
          position: { x: centroid.x + offset.x, z: centroid.z + offset.z },
          rotation: rot,
          size,
          elevationM: 0,
        };
        if (!fitsInRoom(pose, room.polygon)) continue;
        if (island) {
          const ring = boxFor({ ...pose, size: { ...size, width: size.width + 2 * ISLAND_CLEAR_M, depth: size.depth + 2 * ISLAND_CLEAR_M } });
          if (!fitsInRoom({ ...pose, size: boxSize(ring, size.height) }, room.polygon)) continue;
          if (overlapsAny(boxFor(pose), occupied) || overlapsAny(ring, standing)) continue;
        } else if (overlapsAny(inflate(boxFor(pose), gap), occupied)) continue;
        // A free-standing table has room for a chair on every side (else it stands against a wall — K-11).
        if (table && toWalls(boxFor(pose), room.polygon) < 0.42) continue;
        if (runs.length > 0 && overlapsAny(inflate(boxFor(pose), FACING_COUNTERS_M - 0.01), runs)) continue;
        if (lounge.length > 0 && overlapsAny(boxFor(pose), lounge)) continue;
        const score = run
          ? Math.hypot(pose.position.x - run.position.x, pose.position.z - run.position.z)
          : table && lounge.length > 0
            ? Math.min(5, toWalls(boxFor(pose), room.polygon), ...standing.map((b) => distanceToBox(pose.position, b))) - Math.hypot(offset.x, offset.z) * 0.05
            : -Math.hypot(offset.x, offset.z);
        if (!best || score > best.score + 1e-6) best = { pose, score };
        if (!run && !(table && lounge.length > 0)) break;
      }
      if (best && !run && !(table && lounge.length > 0)) return best.pose;
    }
    if (best) return best.pose;
  }

  return null;
}

/** Positioned off an already-placed anchor (coffee table off the sofa, chairs off the table). */
function placeRelative(
  archetype: Archetype,
  index: number,
  room: PlanRoom,
  placed: PlacedItem[],
  occupied: Box[],
  clearM = TV_UNIT_CLEAR_M
): Pose | null {
  const rule = archetype.placement;
  if (rule.type !== 'relative') return null;

  const anchor = [...placed].reverse().find((p) => p.slot === rule.to);
  if (!anchor) return null;

  // Dining chairs are the one case that wants a ring rather than a single offset.
  if (archetype.slot === 'dining_chair') {
    return placeSeatAroundTable(archetype, index, anchor, room, occupied);
  }

  const forward = { x: Math.sin(anchor.rotation), z: Math.cos(anchor.rotation) };
  const right = { x: forward.z, z: -forward.x };

  // Paired items (two nightstands) mirror across the anchor; a single item will take
  // whichever side is free.
  const preferredSide = index % 2 === 0 ? 1 : -1;

  let rotation = anchor.rotation;
  if (rule.align === 'facing') rotation = anchor.rotation + Math.PI;
  if (rule.align === 'sideways') rotation = anchor.rotation + Math.PI / 2;

  // A desk chair stands with its seat under the desk (`gapM` below zero): like the chairs at a
  // table, it is tested against everything but the piece it slides under.
  const anchorBox = boxFor({ position: anchor.position, rotation: anchor.rotation, size: anchor.size, elevationM: 0 });
  // An armchair keeps its distance from the dining table and its chairs.
  const dining = archetype.slot === 'armchair' ? placed.filter((p) => p.roomId === room.id && (p.slot === 'dining_table' || p.slot === 'dining_chair')).map((p) => inflate(boxFor({ position: p.position, rotation: p.rotation, size: p.size, elevationM: 0 }), ARMCHAIR_DINING_GAP_M)) : [];
  const others = [...(rule.gapM != null && rule.gapM < 0 ? occupied.filter((b) => !overlaps(b, anchorBox)) : occupied), ...dining];

  // An armchair beside the sofa, turned about 45° towards the TV (the owner's notes): either end
  // of the sofa, a little ahead of its front, turned in towards the middle.
  if (archetype.slot === 'armchair' && rule.to === 'sofa') {
    for (const side of [preferredSide, -preferredSide]) {
      for (const ahead of [anchor.size.depth / 2 + 0.15, anchor.size.depth / 2 + 0.45, anchor.size.depth / 2 - 0.05]) {
        const lateral = side * (anchor.size.width / 2 + archetype.size.width * 0.62 + 0.12);
        const pose: Pose = {
          position: { x: anchor.position.x + forward.x * ahead + right.x * lateral, z: anchor.position.z + forward.z * ahead + right.z * lateral },
          rotation: anchor.rotation - side * (Math.PI / 4),
          size: archetype.size,
          elevationM: 0,
        };
        if (fitsInRoom(pose, room.polygon) && !overlapsAny(boxFor(pose), others)) return pose;
      }
    }
  }

  // The TV unit leaves 60 cm of floor (`TV_UNIT_CLEAR_M`) before the coffee table; with no spot
  // that does, there is no TV unit.
  const coffee = archetype.slot === 'tv_unit' ? placed.find((p) => p.roomId === room.id && p.slot === 'coffee_table') : undefined;
  const coffeeBox = coffee ? [boxFor({ position: coffee.position, rotation: coffee.rotation, size: coffee.size, elevationM: 0 })] : [];

  const tries = relativeSpots(archetype, rule, anchor, room, preferredSide, clearM);
  // The TV unit: the TV hangs over it, so a stretch of its wall with no window over it comes
  // first — a low unit may stand under a sill, the TV over it may not (`placeAbove`).
  let underWindow: Pose | null = null;
  for (const { forward: ahead, lateral } of tries) {
    const position = {
      x: anchor.position.x + forward.x * ahead + right.x * lateral,
      z: anchor.position.z + forward.z * ahead + right.z * lateral,
    };
    const pose: Pose = { position, rotation, size: archetype.size, elevationM: 0 };
    if (!fitsInRoom(pose, room.polygon)) continue;
    if (overlapsAny(boxFor(pose), others)) continue;
    if (coffeeBox.length > 0 && overlapsAny(inflate(boxFor(pose), clearM - 0.01), coffeeBox)) continue;
    if (rule.toWall && blocksWindow({ ...pose, slot: archetype.slot, size: { ...pose.size, height: TV_TOP_M } }, room)) {
      underWindow ??= pose;
      continue;
    }
    return pose;
  }

  return underWindow;
}

/**
 * Where a piece placed off another may stand, best first, as (metres ahead of the anchor's
 * centre, metres to its right). Measured from both pieces' sizes where the rule says so
 * (`gapM`, `beside`, `toWall`), so the pair still looks arranged when products of other sizes
 * fill them: the matcher re-measures with the real sizes (`relativeOffset`).
 */
function relativeSpots(
  archetype: Archetype,
  rule: Extract<Archetype['placement'], { type: 'relative' }>,
  anchor: PlacedItem,
  room: PlanRoom,
  preferredSide: number,
  clearM = TV_UNIT_CLEAR_M
): Array<{ forward: number; lateral: number }> {
  const out: Array<{ forward: number; lateral: number }> = [];
  const size = archetype.size;
  if (rule.beside != null) {
    // A nightstand: its back in line with the bed's back (the wall), just off the bed's side.
    const ahead = -anchor.size.depth / 2 + size.depth / 2;
    for (const extra of [0, 0.1]) {
      const lateral = anchor.size.width / 2 + size.width / 2 + rule.beside + extra;
      out.push({ forward: ahead, lateral: lateral * preferredSide }, { forward: ahead, lateral: -lateral * preferredSide });
    }
    return out;
  }
  const laterals =
    rule.lateral === 0
      ? [0, 0.45, -0.45, 0.9, -0.9]
      : [rule.lateral * preferredSide, -rule.lateral * preferredSide];
  if (rule.toWall) {
    // The TV unit: back to the wall the sofa faces, when that wall is a sensible way off. The
    // sofa was stood where this lands the unit on a wall, when its room has such a spot
    // (`bestAlongWalls`); in a room with none, what it faces may be a room separator's open line,
    // and the unit stands there as it always did — until the room has a rule of its own for it.
    const forward = { x: Math.sin(anchor.rotation), z: Math.cos(anchor.rotation) };
    const reach = rayToPolygon(anchor.position, forward, room.polygon);
    if (reach != null) {
      const ahead = reach - size.depth / 2 - 0.02;
      const clear = ahead - size.depth / 2 - anchor.size.depth / 2;
      // 1.5 m of floor before the sofa at least — 15 cm less where the unit may keep 45 cm from the
      // coffee table rather than 60 (the living room's fourth fallback).
      if (clear >= 1.5 - (TV_UNIT_CLEAR_M - clearM) && clear <= 4.2) for (const lateral of laterals) out.push({ forward: ahead, lateral });
    }
  }
  if (rule.gapM != null) {
    // The coffee table this far off the sofa's front (a little nearer or further when it must).
    const base = anchor.size.depth / 2 + rule.gapM + size.depth / 2;
    for (const ahead of [base, base - 0.08, base + 0.12, base + 0.25]) for (const lateral of laterals) out.push({ forward: ahead, lateral });
    return out;
  }
  // If the ideal spot is taken, pull the item in towards the anchor before giving up.
  // A centred item (lateral 0) is instead nudged sideways in growing steps — a television
  // a little off the sofa's axis beats no television, and it is usually a door that sits
  // exactly on that axis.
  for (const shrink of [1, 0.82, 0.66, 0.5, 0.38]) for (const lateral of laterals) out.push({ forward: rule.forward * shrink, lateral });
  return out;
}

/**
 * The wall a piece stands on with the whole of its back: the wall it has its back to (`pieceWall`)
 * — one of `walls`, never a room separator's open line — with its back inside that wall's length,
 * the edges that run on from it in line counted as the same wall (`wallRun`). Null for a piece
 * standing free, on a separator, or across the end of its wall.
 */
function standingWall(piece: Pick<PlacedItem, 'position' | 'rotation' | 'size'>, room: PlanRoom, walls: PlanEdge[]): { edge: PlanEdge; gap: number } | null {
  const wall = pieceWall(piece, room);
  if (!wall || !walls.some((e) => e.index === wall.edge.index)) return null;
  const run = wallRun(wall.edge, walls);
  if (wall.along - piece.size.width / 2 < run.from - ON_LINE_M || wall.along + piece.size.width / 2 > run.to + ON_LINE_M) return null;
  return wall;
}

/** Seats spaced around a table, each turned to face it. */
function placeSeatAroundTable(
  archetype: Archetype,
  index: number,
  table: PlacedItem,
  room: PlanRoom,
  occupied: Box[]
): Pose | null {
  const seats = seatSlots(table, archetype.size.depth);
  if (index >= seats.length) return null;

  const slot = seats[index];
  const tableBox = boxFor({ position: table.position, rotation: table.rotation, size: table.size, elevationM: 0 });
  // Chairs tuck under the table, so only test against everything else.
  const others = occupied.filter((b) => !overlaps(b, tableBox));

  // Every chair stands a little under the table already (`seatSlots`); it is pushed in further
  // each time the room turns out to be tight — a chair half under the table is what a tight
  // kitchen looks like anyway.
  const toTable = normalise({ x: table.position.x - slot.position.x, z: table.position.z - slot.position.z });
  for (const tuck of [0, 0.1, 0.18]) {
    const pose: Pose = {
      position: { x: slot.position.x + toTable.x * tuck, z: slot.position.z + toTable.z * tuck },
      rotation: slot.rotation,
      size: archetype.size,
      elevationM: 0,
    };
    if (!fitsInRoom(pose, room.polygon)) continue;
    if (overlapsAny(boxFor(pose), others)) continue;
    return pose;
  }
  return null;
}

/**
 * How far a dining chair's seat stands under its table's edge, as the table is laid: pushed
 * in, the way chairs are left at a table — a chair standing clear of the edge looked set out
 * for a photograph rather than lived with.
 */
export const DINING_CHAIR_TUCK_M = 0.12;

/**
 * Seat positions around a rectangular table: along both long sides first, then the ends, each
 * chair (`chairDepth` deep) with its seat `DINING_CHAIR_TUCK_M` under the edge, 60 cm of the
 * table's width a person (`DINING_SEAT_M`).
 */
export function seatSlots(table: Pick<PlacedItem, 'position' | 'rotation' | 'size'>, chairDepth = 0.5): Array<{ position: Vec2; rotation: number }> {
  const forward = { x: Math.sin(table.rotation), z: Math.cos(table.rotation) };
  const right = { x: forward.z, z: -forward.x };

  const perSide = Math.max(1, Math.min(4, Math.floor(table.size.width / DINING_SEAT_M + 1e-6)));
  const out = chairDepth / 2 - DINING_CHAIR_TUCK_M;
  const sideOffset = table.size.depth / 2 + out;
  const endOffset = table.size.width / 2 + out;

  const slots: Array<{ position: Vec2; rotation: number }> = [];

  for (let side = 0; side < 2; side++) {
    const sign = side === 0 ? 1 : -1;
    for (let i = 0; i < perSide; i++) {
      const spread = (i - (perSide - 1) / 2) * (table.size.width / perSide);
      slots.push({
        position: {
          x: table.position.x + right.x * spread + forward.x * sideOffset * sign,
          z: table.position.z + right.z * spread + forward.z * sideOffset * sign,
        },
        rotation: table.rotation + (sign === 1 ? Math.PI : 0),
      });
    }
  }

  if (table.size.depth >= 0.82) {
    for (const sign of [1, -1]) {
      slots.push({
        position: {
          x: table.position.x + right.x * endOffset * sign,
          z: table.position.z + right.z * endOffset * sign,
        },
        rotation: table.rotation + (sign === 1 ? -Math.PI / 2 : Math.PI / 2),
      });
    }
  }

  // Interleave the two long sides so a table that only fits four seats still looks balanced.
  const ordered: typeof slots = [];
  for (let i = 0; i < perSide; i++) {
    ordered.push(slots[i]);
    if (slots[perSide + i]) ordered.push(slots[perSide + i]);
  }
  ordered.push(...slots.slice(perSide * 2));
  return ordered;
}

function seatCountFor(archetype: Archetype, placed: PlacedItem[]): number {
  const table = [...placed].reverse().find((p) => p.slot === 'dining_table');
  if (!table) return 0;
  return seatSlots(table).length;
}

/**
 * A shower: in a corner, the largest area the bathroom allows (`placeInCorner`). Where a small
 * bathroom's fallbacks have come to them (`WetFallback`): across the end of a narrow room before any
 * corner (`placeShowerAcross`); and at the last the smaller shower first — 70 cm deep across the
 * end, then 70 × 90 in a corner (`SHOWER_LAST_RESORT_M`) — since the larger ones left the room
 * without an essential.
 */
function placeShower(
  archetype: Archetype,
  room: PlanRoom,
  walled: PlanEdge[],
  occupied: Box[],
  clearanceM: number,
  rng: Rng | undefined,
  rules: RuleContext,
  relax: WetFallback
): Pose | null {
  const across = (depths: readonly number[]) => placeShowerAcross(archetype, room, walled, occupied, depths, rng, rules);
  const small = () => across([SHOWER_LAST_RESORT_M.depth]) ?? placeInCorner(archetype, room, walled, occupied, clearanceM, rng, rules, [{ ...SHOWER_LAST_RESORT_M, height: archetype.size.height }]);
  const usual = () => (relax.acrossFirst ? across(SHOWER_ACROSS_DEPTHS_M) : null) ?? placeInCorner(archetype, room, walled, occupied, clearanceM, rng, rules);
  if (!relax.smallShower) return usual();
  // Laid first, the smaller shower leaves the others their floor; laid after them, the largest that
  // still fits what they left.
  const first = !rules.placed.some((p) => p.roomId === room.id && WET_FIXTURES.has(p.slot));
  return first ? (small() ?? usual()) : (usual() ?? small());
}

/**
 * A shower across the end of a narrow bathroom (Nini's second fallback): wall to wall on a short
 * wall (`SHOWER_ACROSS_MAX_M` at most, no longer than the room runs from it), both walls beside it
 * walls, so its glass is its front alone (`showerGlass`); `depths` deep, the deepest that leaves a
 * way past it, the last one any. As a corner's shower, it keeps clear of what stands and is kept
 * clear, and is rather seen from the door.
 */
function placeShowerAcross(archetype: Archetype, room: PlanRoom, walled: PlanEdge[], occupied: Box[], depths: readonly number[], rng: Rng | undefined, rules: RuleContext): Pose | null {
  const standing = rules.placed.filter((p) => p.roomId === room.id && !ARCHETYPES[p.kind]?.ghost).map((p) => boxFor({ position: p.position, rotation: p.rotation, size: p.size, elevationM: 0 }));
  const isWalled = new Set(walled.map((e) => e.index));
  const n = room.polygon.length;
  const square = (a: PlanEdge, b: PlanEdge) => Math.abs(a.dir.x * b.dir.x + a.dir.z * b.dir.z) < 0.05;
  const all = new Map(roomEdges(room.polygon).map((e) => [e.index, e]));
  for (const depth of depths) {
    const spots: Array<{ value: Pose; score: number; cramped: boolean }> = [];
    for (const edge of walled) {
      const width = edge.length - 0.02;
      if (edge.length > SHOWER_ACROSS_MAX_M + 1e-6 || width < (depth < SHOWER_MIN_M ? SHOWER_LAST_RESORT_M.width : SHOWER_MIN_M) - 1e-6) continue;
      const before = all.get((edge.index - 1 + n) % n);
      const after = all.get((edge.index + 1) % n);
      if (!before || !after || !isWalled.has(before.index) || !isWalled.has(after.index) || !square(before, edge) || !square(after, edge)) continue;
      const mid = pointOnEdge(edge, 0.5);
      // The end of a room that runs on from it at least as far as the wall is long: a narrow room's.
      const reach = rayToPolygon({ x: mid.x + edge.inward.x * 0.01, z: mid.z + edge.inward.z * 0.01 }, edge.inward, room.polygon);
      if (reach == null || reach < edge.length) continue;
      const pose: Pose = {
        position: { x: mid.x + edge.inward.x * (depth / 2 + 0.01), z: mid.z + edge.inward.z * (depth / 2 + 0.01) },
        rotation: edge.facing,
        size: { width, depth, height: archetype.size.height },
        elevationM: 0,
      };
      if (!fitsInRoom(pose, room.polygon) || overlapsAny(boxFor(pose), occupied)) continue;
      const crowding = occupied.reduce((sum, box) => sum + 1 / (1 + distanceToBox(pose.position, box)), 0);
      const seen = inSight(pose, rules.doorBands);
      const cramped = overlapsAny(clearanceBox(pose, BATH_PASSAGE_MIN_M), standing) || overlapsAny(boxFor(pose), rules.passages);
      spots.push({ value: pose, score: -crowding + (seen ? 1.5 : 0), cramped });
    }
    const open = spots.filter((s) => !s.cramped);
    if (open.length > 0) return pickNearBest(open, 1, rng);
    if (depth === depths[depths.length - 1] && spots.length > 0) return pickNearBest(spots, 1, rng);
  }
  return null;
}

/**
 * A bathroom's mirror where the wall over its basin cannot take it — a window over the basin, the
 * door beside it (Nini's fifth fallback): on the stretch of wall nearest the basin, its middle within
 * `MIRROR_NEAR_BASIN_M` of the basin's, at the height it hangs over a basin, across no opening and
 * with nothing standing under it or before it but the basin — no mirror over the WC or the machine.
 * Null with no basin, or no such stretch.
 */
function mirrorNearBasin(archetype: Archetype, room: PlanRoom, walled: PlanEdge[], placed: PlacedItem[], rule: Extract<Archetype['placement'], { type: 'wall-mounted' }>): Pose | null {
  const basin = placed.find((p) => p.roomId === room.id && p.slot === 'sink');
  if (!basin) return null;
  const { width, depth, height } = archetype.size;
  const middle = rule.aboveHeightM ?? rule.heightM;
  const others = placed
    .filter((p) => p.roomId === room.id && p !== basin && !ARCHETYPES[p.kind]?.ghost && p.elevationM < 0.05)
    .map((p) => boxFor({ position: p.position, rotation: p.rotation, size: p.size, elevationM: 0 }));
  let best: { pose: Pose; distance: number } | null = null;
  for (const edge of walled) {
    if (edge.length < width) continue;
    const blocked = room.openings.filter((o) => o.wallIndex === edge.index);
    for (const t of sampleAlong(edge, width)) {
      if (coversOpening(edge, t, width, middle + height / 2, blocked)) continue;
      const anchor = pointOnEdge(edge, t);
      const distance = Math.hypot(anchor.x - basin.position.x, anchor.z - basin.position.z);
      if (distance > MIRROR_NEAR_BASIN_M || (best && distance >= best.distance)) continue;
      const pose: Pose = {
        position: { x: anchor.x + edge.inward.x * (depth / 2 + 0.01), z: anchor.z + edge.inward.z * (depth / 2 + 0.01) },
        rotation: edge.facing,
        size: archetype.size,
        elevationM: middle - height / 2,
      };
      if (hangsIntoFloorPiece(pose, placed)) continue;
      const floor = { ...pose, elevationM: 0 };
      if (overlapsAny(boxFor(floor), others) || overlapsAny(clearanceBox(floor, BATH_PASSAGE_MIN_M), others)) continue;
      best = { pose, distance };
    }
  }
  return best?.pose ?? null;
}

/** Tucks the item into whichever corner has the most room left; a shower in the largest of the sizes it may take (or `only` these). */
function placeInCorner(
  archetype: Archetype,
  room: PlanRoom,
  walled: PlanEdge[],
  occupied: Box[],
  clearanceM: number,
  rng?: Rng,
  rules?: RuleContext,
  only?: Size3[]
): Pose | null {
  // A shower takes the largest area the bathroom allows, 80 × 80 at least (`SHOWER_SIZES_M`).
  const shower = archetype.slot === 'shower';
  const sizes: Size3[] = only ?? (shower
    ? SHOWER_SIZES_M.filter((s) => (room.areaM2 >= SHOWER_ROOMY_M2 || s.width <= 0.9) && (room.areaM2 >= SHOWER_LONG_M2 || s.width <= 1.2)).map((s) => ({ ...s, height: archetype.size.height }))
    : [archetype.size]);
  const wetFixture = WET_ROOM_TYPES.includes(room.type) && WET_FIXTURES.has(archetype.slot);
  const standing = (rules?.placed ?? []).filter((p) => p.roomId === room.id && !ARCHETYPES[p.kind]?.ghost).map((p) => boxFor({ position: p.position, rotation: p.rotation, size: p.size, elevationM: 0 }));
  const all = roomEdges(room.polygon);
  const byIndex = new Map(all.map((e) => [e.index, e]));
  const isWalled = new Set(walled.map((e) => e.index));
  const n = room.polygon.length;

  for (const size of sizes) {
    const spots: Array<{ value: Pose; score: number; cramped: boolean }> = [];
    for (let i = 0; i < n; i++) {
      const corner = room.polygon[i];
      const prev = byIndex.get((i - 1 + n) % n);
      const next = byIndex.get(i);
      if (!prev || !next || !isWalled.has(prev.index) || !isWalled.has(next.index)) continue;
      // Square into the corner: its back on one of the two walls, its side on the other.
      // A centimetre off both walls, so a box on the wall's line does not count as through it.
      const w = size.width / 2 + 0.01;
      const d = size.depth / 2 + 0.01;
      const candidates: Pose[] = [
        { position: { x: corner.x + next.dir.x * w + next.inward.x * d, z: corner.z + next.dir.z * w + next.inward.z * d }, rotation: next.facing, size, elevationM: 0 },
        { position: { x: corner.x - prev.dir.x * w + prev.inward.x * d, z: corner.z - prev.dir.z * w + prev.inward.z * d }, rotation: prev.facing, size, elevationM: 0 },
      ];
      for (const [k, pose] of candidates.entries()) {
        if (!fitsInRoom(pose, room.polygon)) continue;
        if (overlapsAny(boxFor(pose), occupied)) continue;
        // A balcony's planter keeps off its windows and its door (Nini, decision 3.6: the light and
        // the way in): on neither wall of its corner does it stand across one.
        if (room.type === 'balcony' && cornerCoversOpening(room, k === 0 ? next : prev, k === 0 ? prev : next, corner, size)) continue;
        // Prefer the emptiest corner; a bathroom's shower one seen from the door.
        const crowding = occupied.reduce((sum, box) => sum + 1 / (1 + distanceToBox(pose.position, box)), 0);
        const seen = shower && inSight(pose, rules?.doorBands ?? []);
        const cramped = wetFixture && (overlapsAny(clearanceBox(pose, BATH_PASSAGE_MIN_M), standing) || overlapsAny(boxFor(pose), rules?.passages ?? []));
        const tight = wetFixture && overlapsAny(clearanceBox(pose, Math.max(clearanceM, BATH_PASSAGE_M)), standing);
        // A long shower runs along the room's length, not across it (the rulebook, BA-11).
        const along = shower && size.width > size.depth ? alongLength(pose.rotation, room) : 0;
        spots.push({ value: pose, score: -crowding + (seen ? 1.5 : 0) - (tight ? 1 : 0) + along, cramped });
      }
    }
    const open = spots.filter((s) => !s.cramped);
    // The largest size with a corner that leaves a way past it; the last size takes any corner.
    if (open.length > 0) return pickNearBest(open, 1, rng);
    if (size === sizes[sizes.length - 1] && spots.length > 0) return pickNearBest(spots, 1, rng);
  }
  return null;
}

/**
 * Whether a piece squared into the corner at `corner` — its back on `back`, its side on `side` —
 * stands across a window or a door of either wall that it is tall enough to block (`coversOpening`).
 * Not a railing: a planter stands against a balcony's railing, the light comes in over it.
 */
function cornerCoversOpening(room: PlanRoom, back: PlanEdge, side: PlanEdge, corner: Vec2, size: Size3): boolean {
  const on = (edge: PlanEdge, reach: number) => {
    const from = Math.hypot(corner.x - edge.a.x, corner.z - edge.a.z) < 0.01 ? 0 : edge.length - reach;
    return coversOpening(edge, (from + reach / 2) / edge.length, reach, size.height, room.openings.filter((o) => o.wallIndex === edge.index && o.kind !== 'railing'));
  };
  return on(back, size.width + 0.01) || on(side, size.depth + 0.01);
}

/**
 * Any free floor at all, for a piece the wall rules could not seat. A grid over the room in
 * both orientations; the spot nearest a wall wins and turns to face into the room, the middle
 * of the floor is the last resort. Explicit adds only — the initial layout has taste, this
 * has patience — and it never returns a spot that overlaps anything, so an add that does land
 * is a valid placement, not a red one.
 */
function placeAnywhere(archetype: Archetype, room: PlanRoom, edges: PlanEdge[], occupied: Box[]): Pose | null {
  const { width, depth } = archetype.size;
  const bounds = polygonBounds(room.polygon);
  const step = 0.1;
  const margin = 0.02;
  let best: { pose: Pose; score: number } | null = null;

  for (const rotation of [0, Math.PI / 2]) {
    const sideways = rotation !== 0;
    const halfX = (sideways ? depth : width) / 2;
    const halfZ = (sideways ? width : depth) / 2;
    for (let x = bounds.minX + halfX + margin; x <= bounds.maxX - halfX - margin + 1e-9; x += step) {
      for (let z = bounds.minZ + halfZ + margin; z <= bounds.maxZ - halfZ - margin + 1e-9; z += step) {
        const pose: Pose = { position: { x, z }, rotation, size: archetype.size, elevationM: 0 };
        if (!fitsInRoom(pose, room.polygon)) continue;
        if (overlapsAny(boxFor(pose), occupied)) continue;

        // Distance from the item's back to the nearest wall it is parallel to.
        let nearest: { edge: PlanEdge; gap: number } | null = null;
        for (const edge of edges) {
          const parallel = Math.abs(Math.abs(Math.sin(edge.facing)) - Math.abs(Math.sin(rotation))) < 1e-6;
          if (!parallel) continue;
          const toItem = { x: pose.position.x - edge.a.x, z: pose.position.z - edge.a.z };
          const gap = toItem.x * edge.inward.x + toItem.z * edge.inward.z - depth / 2;
          if (gap < -1e-6) continue;
          if (!nearest || gap < nearest.gap) nearest = { edge, gap };
        }
        const score = -(nearest?.gap ?? 100);
        if (!best || score > best.score) {
          // Against a wall the piece turns its back to it, like everything the layout places.
          const facing = nearest && nearest.gap < 0.3 ? nearest.edge.facing : rotation;
          best = { pose: { ...pose, rotation: facing }, score };
        }
      }
    }
  }

  return best?.pose ?? null;
}

function placeOnCeiling(
  archetype: Archetype,
  room: PlanRoom,
  placed: PlacedItem[]
): Pose | null {
  // Hang it over the table if there is one, otherwise over the middle of the room.
  const table = placed.find((p) => p.slot === 'dining_table' || p.slot === 'kitchen_island');
  const position = table ? table.position : polygonCentroid(room.polygon);

  return {
    position,
    rotation: 0,
    size: archetype.size,
    elevationM: room.heightM - archetype.size.height,
  };
}

function placeOnWall(
  archetype: Archetype,
  index: number,
  room: PlanRoom,
  edges: PlanEdge[],
  heightM: number,
  placed: PlacedItem[] = [],
  rng?: Rng
): Pose | null {
  const { width, depth, height } = archetype.size;
  const longestFirst = edges.filter((e) => e.length >= width + 0.3).sort((a, b) => b.length - a.length);
  // Generating, a print or a mirror may hang on any wall wide enough, the longer the likelier.
  const candidates = rng ? weightedOrder(longestFirst, (e) => e.length, rng) : longestFirst;

  // A small bathroom has an opening on nearly every wall, so look for a clear stretch of
  // wall rather than a wall with nothing on it at all.
  let skipped = 0;
  for (const edge of candidates) {
    const blocked = room.openings.filter((o) => o.wallIndex === edge.index);
    for (const t of sampleAlong(edge, width)) {
      if (coversOpening(edge, t, width, heightM + height / 2, blocked)) continue;

      const anchor = pointOnEdge(edge, t);
      const pose: Pose = {
        position: {
          x: anchor.x + edge.inward.x * (depth / 2 + 0.01),
          z: anchor.z + edge.inward.z * (depth / 2 + 0.01),
        },
        rotation: edge.facing,
        size: archetype.size,
        elevationM: heightM - height / 2,
      };
      // Not into what stands below it: a mirror hung over the washing machine, a print behind the wardrobe.
      if (hangsIntoFloorPiece(pose, placed)) continue;
      if (skipped++ < index) continue;
      return pose;
    }
  }

  return null;
}

/**
 * Hung over a piece standing against a wall — the wall cabinets over the kitchen run, the mirror
 * over the basin, a print over the bed: on the same wall and centred over it, its middle at
 * `aboveHeightM` (or `heightM`) and at least 15 cm over the piece's top. The cabinets are as long
 * as the run (`stretch`), shortened and slid along it where the full length would cross a window
 * or a door; anything else keeps its own width, no wider than the piece — the TV (`onlyAbove`)
 * smaller and slid along its unit too. Null when the room has none of those pieces, or no stretch
 * over it is clear.
 */
function placeAbove(
  archetype: Archetype,
  room: PlanRoom,
  edges: PlanEdge[],
  placed: PlacedItem[],
  rule: Extract<Archetype['placement'], { type: 'wall-mounted' }>
): Pose | null {
  const slots = Array.isArray(rule.above) ? rule.above : rule.above ? [rule.above] : [];
  const under = slots.map((slot) => placed.find((p) => p.slot === slot)).find(Boolean);
  if (!under) return null;
  const { depth, height } = archetype.size;
  const middle = Math.max(rule.aboveHeightM ?? rule.heightM, rule.stretch ? 0 : under.size.height + (rule.aboveGapM ?? 0.15) + height / 2);
  // The wall it stands against: one that faces as it does (within 0.1 rad), the nearest to its back, within 30 cm.
  const behind = wallBehind(under, edges, { facing: Math.cos(0.1), by: 'distance', max: 0.3 });
  // Where along it the back's middle is, as a share of its length — measured as the slots along it are.
  const back = backMiddle(under);
  const wall = behind && { edge: behind.edge, t: ((back.x - behind.edge.a.x) * (behind.edge.b.x - behind.edge.a.x) + (back.z - behind.edge.a.z) * (behind.edge.b.z - behind.edge.a.z)) / (behind.edge.length * behind.edge.length) };
  if (!wall) {
    // A TV unit standing free in the room (its back to no wall, facing a sofa across a big room): a
    // TV on its stand on its top, in the middle — the matcher gives such a slot only a TV on a stand.
    if (!rule.onlyAbove) return null;
    return { position: { ...under.position }, rotation: under.rotation, size: { ...archetype.size, width: Math.min(archetype.size.width, under.size.width) }, elevationM: under.size.height };
  }
  const { edge, t: centre } = wall;
  // The wall is that edge and the edges that run on from it in line: a unit across the joint of
  // two of them has one wall behind it, and the windows and doors of each are in the way.
  const run = wallRun(edge, edges);
  // A piece that goes nowhere else (`onlyAbove`: the TV) may also be smaller and slide along its
  // piece: a TV centred on a unit that runs past a window would cover the window.
  const own = Math.min(archetype.size.width, Math.max(under.size.width, 0.4));
  // A TV as large as its distance from the sofa asks (decision 1, `tvInchesFor`) where that is wider
  // than the archetype's 65″, no wider than its unit — first, then as before.
  const larger = archetype.slot === 'tv' ? Math.min(under.size.width, tvWidthFor(under, placed)) : 0;
  const widths = rule.stretch
    ? [1, 0.75, 0.5].map((f) => under.size.width * f).filter((w) => w >= 0.6)
    : rule.onlyAbove
      ? [...(larger > own + 0.01 ? [larger] : []), own, own * 0.85, own * 0.7]
      : [own];
  for (const width of widths) {
    const slack = rule.stretch || rule.onlyAbove ? (under.size.width - width) / 2 : 0;
    for (const offset of [0, -slack, slack, -slack / 2, slack / 2]) {
      const t = centre + offset / edge.length;
      if (t - width / 2 / edge.length < run.from / edge.length || t + width / 2 / edge.length > run.to / edge.length) continue;
      const anchor = pointOnEdge(edge, t);
      if (run.edges.some((part) => coversOpening(part, alongEdge(part, anchor) / part.length, width, middle + height / 2, room.openings.filter((o) => o.wallIndex === part.index)))) continue;
      const pose: Pose = {
        position: { x: anchor.x + edge.inward.x * (depth / 2 + 0.01), z: anchor.z + edge.inward.z * (depth / 2 + 0.01) },
        rotation: edge.facing,
        size: { ...archetype.size, width },
        elevationM: middle - height / 2,
      };
      if (hangsIntoFloorPiece(pose, placed.filter((p) => p !== under))) continue;
      return pose;
    }
  }
  return null;
}

/** Whether a piece hung on a wall would cut into something standing on the floor below it. */
function hangsIntoFloorPiece(pose: Pose, placed: PlacedItem[]): boolean {
  const box = boxFor(pose);
  return placed.some((p) => {
    if (ARCHETYPES[p.kind]?.ghost || p.elevationM > 0.05) return false;
    if (p.size.height <= pose.elevationM - 0.02) return false;
    return overlaps(box, boxFor({ position: p.position, rotation: p.rotation, size: p.size, elevationM: 0 }));
  });
}

/** Rugs: sized to the item they sit under, clamped so they stay inside the room. */
function placeUnder(
  archetype: Archetype,
  room: PlanRoom,
  placed: PlacedItem[]
): Pose | null {
  const rule = archetype.placement;
  if (rule.type !== 'under') return null;

  // Under its piece — or, in a room with none of it, under the piece the room is laid out round
  // (`mainSlot`): an office has no coffee table, but a rug under the desk is still the right idea.
  // Never under whatever happens to stand first: with no bed laid that was the wardrobe, with no
  // sofa a bookcase. A room with neither has no rug.
  const main = mainSlot(room.type);
  const anchor = [...placed].reverse().find((p) => p.slot === rule.to) ?? (main ? placed.find((p) => p.slot === main) : undefined);
  if (!anchor) return null;

  const bounds = polygonBounds(room.polygon);
  const size: Size3 = {
    width: Math.min(anchor.size.width + rule.padM * 2, bounds.width - 0.5),
    depth: Math.min(anchor.size.depth + rule.padM * 2, bounds.depth - 0.5),
    height: archetype.size.height,
  };

  // A rug centred on a bed would run halfway into the wall behind it, so the rug is allowed
  // to slide out into the room until it sits fully on the floor.
  const forward = { x: Math.sin(anchor.rotation), z: Math.cos(anchor.rotation) };

  for (const shrink of [1, 0.85, 0.7]) {
    for (const slide of [0, 0.3, 0.6, 0.9, 1.2]) {
      const pose: Pose = {
        position: {
          x: anchor.position.x + forward.x * slide,
          z: anchor.position.z + forward.z * slide,
        },
        rotation: anchor.rotation,
        size: { ...size, width: size.width * shrink, depth: size.depth * shrink },
        elevationM: 0,
      };
      if (fitsInRoom(pose, room.polygon)) return pose;
    }
  }

  return null;
}

/** A door mat on the floor just inside the flat's front door, centred on it; null in a room it does not open into. */
function placeAtEntrance(archetype: Archetype, room: PlanRoom, edges: PlanEdge[]): Pose | null {
  const door = room.openings.find((o) => o.kind === 'door' && o.exterior && !o.reachesIn);
  const edge = door && edges.find((e) => e.index === door.wallIndex);
  if (!door || !edge) return null;
  const at = pointOnEdge(edge, door.t);
  const size = { ...archetype.size, width: Math.min(archetype.size.width, Math.max(0.5, door.widthM)) };
  const inset = size.depth / 2 + 0.03;
  const pose: Pose = { position: { x: at.x + edge.inward.x * inset, z: at.z + edge.inward.z * inset }, rotation: edge.facing, size, elevationM: 0 };
  return fitsInRoom(pose, room.polygon) ? pose : null;
}

function placeAtWindow(
  archetype: Archetype,
  index: number,
  room: PlanRoom,
  edges: PlanEdge[]
): Pose | null {
  const windows = ownWindows(room);
  const opening = windows[index];
  if (!opening) return null;

  const edge = edges.find((e) => e.index === opening.wallIndex);
  if (!edge) return null;

  const anchor = pointOnEdge(edge, opening.t);
  if (archetype.kind === 'blind') {
    // A roller blind: its cassette on the wall just over the window's head (under the ceiling),
    // a little wider than the window, let down a third of the way.
    const top = Math.min(opening.sillM + opening.heightM + BLIND_OVER_HEAD_M, room.heightM - 0.02);
    const height = top - (opening.sillM + opening.heightM * (1 - BLIND_LOWERED));
    return {
      position: {
        x: anchor.x + edge.inward.x * (archetype.size.depth / 2 + 0.01),
        z: anchor.z + edge.inward.z * (archetype.size.depth / 2 + 0.01),
      },
      rotation: edge.facing,
      size: { width: opening.widthM + 2 * BLIND_OVERLAP_M, depth: archetype.size.depth, height: Math.round(height * 100) / 100 },
      elevationM: Math.round((top - height) * 100) / 100,
    };
  }
  return {
    position: {
      x: anchor.x + edge.inward.x * (archetype.size.depth / 2 + 0.03),
      z: anchor.z + edge.inward.z * (archetype.size.depth / 2 + 0.03),
    },
    rotation: edge.facing,
    size: {
      width: opening.widthM + 0.45,
      depth: archetype.size.depth,
      // From just under the ceiling to the floor: it makes the room look taller.
      height: room.heightM - CURTAIN_UNDER_CEILING_M,
    },
    elevationM: 0,
  };
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/**
 * Sample positions along a wall, centre first so centred placements win ties.
 * The range runs corner to corner — pushing a wardrobe into the corner of a busy wall is a
 * perfectly good answer, and often the only one.
 */
function sampleAlong(edge: PlanEdge, itemWidth: number): number[] {
  const margin = itemWidth / 2 / edge.length;
  if (margin >= 0.5) return [0.5];

  const lo = margin;
  const hi = 1 - margin;
  const steps = 13;
  const out = [0.5];
  for (let i = 0; i < steps; i++) {
    const t = lo + ((hi - lo) * i) / (steps - 1);
    if (Math.abs(t - 0.5) > 0.015) out.push(t);
  }
  return out.filter((t) => t >= lo - 1e-9 && t <= hi + 1e-9);
}

function boxFor(pose: Pose): Box {
  // The bounding box of the turned footprint (`axisBox`, the cosine and sine as they come): exact
  // at right angles (rooms are rectilinear), and the whole of an armchair turned 45° towards the TV.
  return axisBox(pose.position, pose.size, pose.rotation, false);
}

/** The walking space an item needs in front of it. */
function clearanceBox(pose: Pose, clearanceM: number): Box {
  const forward = { x: Math.sin(pose.rotation), z: Math.cos(pose.rotation) };
  const own = boxFor(pose);
  const centre = {
    x: pose.position.x + forward.x * (pose.size.depth / 2 + clearanceM / 2),
    z: pose.position.z + forward.z * (pose.size.depth / 2 + clearanceM / 2),
  };
  const halfX = Math.abs(forward.x) > 0.5 ? clearanceM / 2 : (own.maxX - own.minX) / 2;
  const halfZ = Math.abs(forward.z) > 0.5 ? clearanceM / 2 : (own.maxZ - own.minZ) / 2;
  return {
    minX: centre.x - halfX,
    maxX: centre.x + halfX,
    minZ: centre.z - halfZ,
    maxZ: centre.z + halfZ,
  };
}

function boxCentre(box: Box): Vec2 {
  return { x: (box.minX + box.maxX) / 2, z: (box.minZ + box.maxZ) / 2 };
}

function boxSize(box: Box, height: number): Size3 {
  return { width: box.maxX - box.minX, depth: box.maxZ - box.minZ, height };
}

function inflate(box: Box, by: number): Box {
  return {
    minX: box.minX - by,
    maxX: box.maxX + by,
    minZ: box.minZ - by,
    maxZ: box.maxZ + by,
  };
}

/** The floor in the way of a piece `height` tall: all of it but what it stands under (`clearsUnder` — the strip before a towel rail hung higher than the piece). */
function inTheWay(boxes: Box[], height: number): Box[] {
  return boxes.some((box) => box.bottom != null) ? boxes.filter((box) => !clearsUnder(box, height)) : boxes;
}

/** Two boxes reaching into each other at all (`boxesOverlap`, no tolerance: touching is none). */
function overlaps(a: Box, b: Box): boolean {
  return boxesOverlap(a, b, 0);
}

function overlapsAny(box: Box, boxes: Box[]): boolean {
  return boxes.some((other) => overlaps(box, other));
}

/**
 * Every corner of the footprint inside the room, not just its centre, and no wall running
 * through it (`boxInPolygon`). The corners alone stood a TV unit on the tip of a diagonal
 * partial wall, and a rug under it: all four corners were on the floor.
 */
function fitsInRoom(pose: Pose, polygon: Vec2[]): boolean {
  return boxInPolygon(boxFor(pose), polygon);
}

/** Blocks the approach to every door so furniture never lands in a doorway: its clear floor (`doorZones`). */
function doorKeepouts(room: PlanRoom, edges: PlanEdge[]): Box[] {
  const boxes: Box[] = [];

  for (const opening of room.openings) {
    if (!isPassage(opening)) continue;
    const edge = edges.find((e) => e.index === opening.wallIndex);
    if (!edge) continue;

    // The door's clear floor by the room (`doorClearFloor`: a bathroom's 70 cm × the door, another
    // room's 90 cm × the door and 10 cm either side, an archway's 55 cm, and the leaf's sweep of a
    // door opening into the room where it reaches further), each rectangle squared onto the room's
    // axes by the way the wall runs.
    const floors = doorZones(edge, opening, room.type);
    doorClearFloor(room.type, opening).forEach(({ widthAlong, depth }, k) => {
      const centre = floors[k].ahead(depth / 2);
      const halfAlong = widthAlong / 2;
      const sideways = Math.abs(edge.dir.x) > 0.5;
      boxes.push({
        minX: centre.x - (sideways ? halfAlong : depth / 2),
        maxX: centre.x + (sideways ? halfAlong : depth / 2),
        minZ: centre.z - (sideways ? depth / 2 : halfAlong),
        maxZ: centre.z + (sideways ? depth / 2 : halfAlong),
      });
    });
  }

  return boxes;
}

/**
 * Would an item spanning `width` at position `t` block one of these openings?
 *
 * Doors always block. Windows only block something tall enough to reach them — a sofa under
 * a window is exactly where a sofa belongs, whereas a wardrobe there is not — and a railing
 * only something taller than it: an armchair against a balcony's railing is fine.
 */
function coversOpening(
  edge: PlanEdge,
  t: number,
  width: number,
  itemHeight: number,
  openings: Opening[]
): boolean {
  const half = width / 2 / edge.length;
  const lo = t - half;
  const hi = t + half;
  return openings.some((o) => {
    if (o.kind === 'window' && itemHeight <= o.sillM + 0.05) return false;
    if (o.kind === 'railing' && itemHeight <= o.heightM + 0.05) return false;
    const oHalf = o.widthM / 2 / edge.length;
    return lo < o.t + oHalf && hi > o.t - oHalf;
  });
}

/**
 * The windows a room dresses and is laid out by: its own. In a studio's half the stretch of the
 * other half's window that reaches across the line (`Opening.reachesIn`) is only in the way of
 * what stands or hangs over it (`coversOpening`) — its curtain is the other half's to hang.
 */
function ownWindows(room: PlanRoom): Opening[] {
  return room.openings.filter((o) => o.kind === 'window' && !o.reachesIn);
}

/** Where a room's own openings of a kind are, as points on its walls (not a stretch that reaches in from a studio's other half). */
function openingPoints(
  room: PlanRoom,
  edges: PlanEdge[],
  filter: (o: Opening) => boolean
): Vec2[] {
  return room.openings.filter((o) => !o.reachesIn && filter(o)).flatMap((o) => {
    const edge = edges.find((e) => e.index === o.wallIndex);
    return edge ? [pointOnEdge(edge, o.t)] : [];
  });
}

function minDistance(point: Vec2, others: Vec2[]): number {
  if (others.length === 0) return 0;
  return Math.min(...others.map((o) => Math.hypot(o.x - point.x, o.z - point.z)));
}

function distanceToBox(point: Vec2, box: Box): number {
  const dx = Math.max(box.minX - point.x, 0, point.x - box.maxX);
  const dz = Math.max(box.minZ - point.z, 0, point.z - box.maxZ);
  return Math.hypot(dx, dz);
}

function normalise(v: Vec2): Vec2 {
  const len = Math.hypot(v.x, v.z) || 1;
  return { x: v.x / len, z: v.z / len };
}

/** Offsets spiralling out from the origin — used to nudge a blocked centre placement. */
function spiralOffsets(maxRadius: number, step: number): Vec2[] {
  const out: Vec2[] = [{ x: 0, z: 0 }];
  for (let r = step; r <= maxRadius; r += step) {
    const points = Math.max(4, Math.round((2 * Math.PI * r) / step / 2));
    for (let i = 0; i < points; i++) {
      const angle = (i / points) * Math.PI * 2;
      out.push({ x: Math.cos(angle) * r, z: Math.sin(angle) * r });
    }
  }
  return out;
}

/** Room types the studio knows how to furnish. */
export const FURNISHABLE_ROOM_TYPES = Object.keys(ROOM_PROGRAMS) as RoomType[];

export { ARCHETYPES };
export type { ProgramEntry };
