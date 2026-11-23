/**
 * A bedroom's wall of wardrobe (the rulebook, 6 Nov 2026 — B-9, B-10): when the wall the wardrobe
 * stands on is otherwise empty — its free stretch is the whole side, or a niche — the joiner builds
 * a wardrobe on it, to the ceiling, in the flat's joinery material (`cabinet` decor, `joinery.ts`),
 * in place of the shop's wardrobe; and a room with a full-length wardrobe has no chest of drawers
 * besides (a desk or a dressing table with its mirror may stay).
 *
 * Its doors open into the room, so the floor before it is judged with the bed and the nightstands
 * standing where the layout put them (Nini, 23 Nov 2026, decision 4): 75 cm clear for hinged doors
 * (what the layout keeps before a shop's wardrobe), 60 cm for sliding doors
 * (`SLIDING_WARDROBE_CLEAR_M`, `params.sliding`). Where the whole wall's front is not clear the
 * wardrobe is built shorter, on the run of the wall whose front is clear; where no 60 cm deep one
 * fits, a shallow one (`SHALLOW_WARDROBE_DEPTH_M`); else the shop's wardrobe stays
 * (`wallOfWardrobeFit`). It never takes the floor the bed's sides or a nightstand need: they stand
 * in that front, so the run stops short of them.
 *
 * Pure: `generateScene` runs it after the hall pass.
 */

import { getArchetype } from './catalog';
import type { CatalogProduct } from './matcher';
import type { PlanEdge } from './planGeometry';
import { floorTaken } from './shower';
import type { CabinetSection, DecorPiece, PlacedItem, PlanRoom, StyleId } from './types';
import { footprintQuad, quadsOverlap, SHALLOW_WARDROBE_DEPTH_M, SLIDING_WARDROBE_CLEAR_M, WARDROBE_DEPTH_M } from './rules';
import { cabinetPiece, freeStretch, joineryFace, joineryMaterial, wallOf } from './decor/joinery';
import type { RadiatorBody } from './radiators';
import { LIES_FLAT } from './kinds';

/** The share of the wall the free stretch must take to count as "the whole side". */
const WHOLE_SIDE = 0.85;
/** Narrower than this a wall of wardrobe is not worth building. */
export const MIN_BUILT_M = 1.2;
/** The longest one section runs before the next begins (the joiner's carcasses). */
const SECTION_MAX_M = 1.2;

export interface BedroomInput {
  rooms: readonly PlanRoom[];
  items: PlacedItem[];
  catalog: CatalogProduct[];
  styleId: StyleId;
  /** The flat's radiators (`radiatorBodies`): a wall of wardrobe is not built over one. */
  radiators?: readonly RadiatorBody[];
}

export function fitWardrobes(input: BedroomInput): { items: PlacedItem[]; decor: DecorPiece[] } {
  const { rooms, catalog, styleId } = input;
  let items = [...input.items];
  const decor: DecorPiece[] = [];
  const face = joineryFace(joineryMaterial(catalog, styleId, items));
  for (const room of rooms) {
    if (room.type !== 'bedroom') continue;
    const wardrobe = items.find((i) => i.roomId === room.id && i.slot === 'wardrobe');
    if (!wardrobe) continue;
    // A chest of drawers gives way to a wall of wardrobe the whole wall long (B-10), and stands in
    // nobody's way then; beside a shorter one it stays, and its doors are kept clear of it.
    const whole = wallOfWardrobeFit(room, wardrobe, items, input.radiators, true);
    const fit = whole?.whole ? whole : wallOfWardrobeFit(room, wardrobe, items, input.radiators, false);
    if (!fit) continue;
    const length = fit.to - fit.from;
    // Sections of equal width, none over 1.2 m: the inside divided as the joiner builds it — to the
    // millimetre of the run, the last taking what is left, so the wardrobe ends where its run does.
    const count = Math.max(1, Math.ceil(length / SECTION_MAX_M - 1e-6));
    const total = Math.round(length * 1000);
    const each = Math.floor(total / count);
    const sections: CabinetSection[] = Array.from({ length: count }, (_, i) => ({ kind: 'doors' as const, widthMm: i === count - 1 ? total - each * (count - 1) : each, heightMm: Math.round(room.heightM * 1000), depthMm: Math.round(fit.depth * 1000) }));
    const piece = cabinetPiece(`decor-${room.id}-wardrobe-wall`, room, fit.edge, fit.from, sections, face);
    decor.push(fit.sliding ? { ...piece, params: { ...piece.params, sliding: true } } : piece);
    // The shop's wardrobe gives way to it, and so does a chest of drawers when it is the whole wall long (B-10).
    items = items.filter((i) => i.id !== wardrobe.id && !(fit.whole && i.roomId === room.id && i.slot === 'dresser'));
  }
  return { items, decor };
}

/** Where a wall of wardrobe goes: its wall, its run along it, how deep, and whether its doors slide. */
export interface WardrobeWallFit {
  edge: PlanEdge;
  from: number;
  to: number;
  depth: number;
  sliding: boolean;
  /** As long as the wall's free stretch: a full-length wardrobe, not one built shorter. */
  whole: boolean;
}

/**
 * The wall of wardrobe the shop's `wardrobe` can give way to, or null where it stays (decision 4's
 * order): on the wardrobe's wall, otherwise empty (its free stretch the whole side), at the
 * wardrobe's depth — then, for a 60 cm one, shallow — the longest run whose front is clear for
 * hinged doors (75 cm) or for sliding doors (60 cm), the hinged one unless sliding doors give a
 * longer run: the whole wall where its front is clear, else shorter. A run is taken only when it is
 * as long as the narrowest wall of wardrobe worth building (`MIN_BUILT_M`) and as the shop's
 * wardrobe it replaces, so the room keeps its storage. `dresserGivesWay`: a chest of drawers in front
 * is no obstacle (it goes with a full-length one).
 */
export function wallOfWardrobeFit(room: PlanRoom, wardrobe: PlacedItem, items: readonly PlacedItem[], radiators?: readonly RadiatorBody[], dresserGivesWay = true): WardrobeWallFit | null {
  const wall = wallOf(wardrobe, room);
  if (!wall) return null;
  const hinged = wardrobeClearance();
  const least = Math.max(MIN_BUILT_M, wardrobe.size.width) - 1e-6;
  const deep = wardrobe.size.depth < 0.5 ? SHALLOW_WARDROBE_DEPTH_M : WARDROBE_DEPTH_M;
  for (const depth of deep > SHALLOW_WARDROBE_DEPTH_M ? [deep, SHALLOW_WARDROBE_DEPTH_M] : [deep]) {
    const stretch = freeStretch(room, wall.edge, wall.along, items, [wardrobe.id], depth, [], [], { radiators, strict: true });
    if (!stretch || stretch[1] - stretch[0] < wall.edge.length * WHOLE_SIDE - 1e-6) continue;
    const longest = (clear: number) => longestRun(clearRuns(room, wall.edge, stretch, depth, clear, items, [wardrobe.id], dresserGivesWay));
    const swing = longest(hinged);
    const slide = longest(SLIDING_WARDROBE_CLEAR_M);
    const best = slide && (!swing || slide[1] - slide[0] > swing[1] - swing[0] + 1e-6) ? { run: slide, sliding: true } : swing ? { run: swing, sliding: false } : null;
    if (!best || best.run[1] - best.run[0] < least) continue;
    const whole = best.run[0] <= stretch[0] + 0.001 && best.run[1] >= stretch[1] - 0.001;
    return { edge: wall.edge, from: best.run[0], to: best.run[1], depth, sliding: best.sliding, whole };
  }
  return null;
}

function longestRun(runs: Array<[number, number]>): [number, number] | null {
  return runs.reduce<[number, number] | null>((best, run) => (!best || run[1] - run[0] > best[1] - best[0] ? run : best), null);
}

/** The clear floor the layout keeps before a wardrobe (its archetype's `clearanceM`): what hinged doors need. */
function wardrobeClearance(): number {
  const rule = getArchetype('wardrobe')?.placement;
  return rule && 'clearanceM' in rule ? rule.clearanceM : 0;
}


/** What stands on the floor before joinery `depth` deep on `edge` over `stretch`, up to `clear` in front of its face: the pieces in its doors' way — not what lies flat or dresses a window (`LIES_FLAT`), nor a chest of drawers that gives way to it (`dresserGivesWay`). */
function inFront(room: PlanRoom, edge: PlanEdge, stretch: readonly [number, number], depth: number, clear: number, items: readonly PlacedItem[], except: readonly string[], dresserGivesWay: boolean): PlacedItem[] {
  const at = (s: number, off: number) => ({ x: edge.a.x + edge.dir.x * s + edge.inward.x * off, z: edge.a.z + edge.dir.z * s + edge.inward.z * off });
  const band = [at(stretch[0], depth), at(stretch[1], depth), at(stretch[1], depth + clear), at(stretch[0], depth + clear)];
  return items.filter((i) => i.roomId === room.id && !except.includes(i.id) && i.elevationM < 0.05 && !LIES_FLAT.has(i.slot) && !(dresserGivesWay && i.slot === 'dresser') && quadsOverlap(band, footprintQuad(floorTaken(i))));
}

/**
 * The runs of `stretch` whose front is clear `clear` deep before joinery `depth` deep: the stretch
 * less, along the wall, every piece standing in that front (the bed, a nightstand, a desk) — where
 * a shorter wall of wardrobe stands with its doors free. `[from, to]` along the wall, in order, to
 * the millimetre on the clear side.
 */
export function clearRuns(room: PlanRoom, edge: PlanEdge, stretch: readonly [number, number], depth: number, clear: number, items: readonly PlacedItem[], except: readonly string[] = [], dresserGivesWay = true): Array<[number, number]> {
  const along = (p: { x: number; z: number }) => (p.x - edge.a.x) * edge.dir.x + (p.z - edge.a.z) * edge.dir.z;
  const taken = inFront(room, edge, stretch, depth, clear, items, except, dresserGivesWay)
    .map((i) => footprintQuad(floorTaken(i)).map(along))
    .map((s): [number, number] => [Math.min(...s), Math.max(...s)])
    .sort((a, b) => a[0] - b[0]);
  const runs: Array<[number, number]> = [];
  let from = stretch[0];
  for (const [lo, hi] of taken) {
    if (lo > from + 1e-6) runs.push([from, Math.min(lo, stretch[1])]);
    from = Math.max(from, hi);
    if (from >= stretch[1]) break;
  }
  if (stretch[1] > from + 1e-6) runs.push([from, stretch[1]]);
  return runs.map(([a, b]): [number, number] => [Math.ceil(a * 1000 - 1e-6) / 1000, Math.floor(b * 1000 + 1e-6) / 1000]).filter(([a, b]) => b - a > 0.05);
}
