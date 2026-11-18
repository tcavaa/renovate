/**
 * The AI interior designer: one Claude call per generation that furnishes and finishes the whole
 * flat — product picks per room and kind, a floor and a wall per room, custom wall decor as
 * intents — from lists the server prepared. Server only (it holds the API key).
 *
 * The model never hands over coordinates that are trusted (docs/design-studio/ai-layout-plan.md):
 * it names products by id from the candidates offered, finishes from the room's own pools, decor
 * by family, anchor and material ids; every id it returns is checked against what it was offered
 * (`validateProposal`), and the engine and `lib/design/decor/resolve` turn the rest into
 * geometry the studio checks like its own. No key, an error, a refusal or an answer that does not
 * validate → the caller falls back to the engine, silently.
 */

import Anthropic from '@anthropic-ai/sdk';
import referenceLibrary from './decor/reference-library.json';
import { ROOM_PROGRAMS, getArchetype } from './catalog';
import { programPiece } from './autoLayout';
import { isStudio, partAt, partOfId, partRoom, studioParts } from './studio';
import { generationWeight, kindPool, placeFitting, slotPool, type BudgetLevel, type CatalogProduct } from './matcher';
import { randomSeed, seededRng, weightedOrder } from './random';
import { styleAffinity } from './styles';
import { flatFinishRoom, isClosedKitchen, isWetRoomType, sharesFlatFinish } from './surfaces';
import { decorFit, finishCandidates, MAX_DECOR_PER_ROOM, ONE_DECOR_ROOMS, TALL_HEADBOARD_M, type AiProposal, type AiRoomProposal } from './aiProposal';

export { MAX_DECOR_PER_ROOM, maxDecor } from './aiProposal';
import { layOutFlat, type LaidOutFlat } from './generateScene';
import { pieceWall } from './manipulate';
import { roomEdges, wallEdges, type PlanEdge } from './planGeometry';
import { freeSpans } from './decor/layout';
import { AI_DECOR_FAMILIES, DECOR_FAMILIES, STYLE_DECOR_FAMILIES, decorSlots, slotTakes, styleTakesLed } from './decor/families';
import { DECOR_ANCHORS, defaultHeight, type DecorIntent } from './decor/resolve';
import { decorMaterialKind, decorSpecs, isDecorMaterial } from './decor/materials';
import type { DecorFamily, DecorParams, DecorPiece, DecorSlot, FloorPlan, PlacedItem, PlanRoom, StyleId, StyleProfile } from './types';
import type { RoomType } from '@/lib/calculator/types';
import { MissingApiKeyError } from './aiPlan';
import { styleGuideText, subStyleFor } from './styleGuide';
import { CUSTOM_KITCHEN_KINDS } from './kinds';
import { BASIN_TOP_M, BLIND_ROOMS, BLIND_STYLES, NEUTRAL_LIGHT_K, SHALLOW_WARDROBE_DEPTH_M, SHOWER_MIN_M, SHOWER_SIZES_M, WARDROBE_DEPTH_M, WARM_LIGHT_K, underCeiling } from './rules';

/** The model: the same one that reads plans. A constant, chosen by evaluation, never a guess in code. */
export const DESIGN_MODEL = 'claude-opus-5-5';

export interface AiDesignRequest {
  plan: FloorPlan;
  styleId: StyleId;
  styleProfile?: StyleProfile | null;
  budgetGel?: number | null;
  locale: 'ka' | 'en' | 'ru';
  catalog: CatalogProduct[];
  /**
   * The draw for this generation (`lib/design/random`): which products, finishes and direction the
   * designer is offered. A fresh one every time — the same style on two flats, or one flat generated
   * twice, is offered different lists and designed differently. Fixed only to reproduce a run.
   */
  seed?: number;
  /** What the flat's last design used — offered far less often, and named so the designer moves on from it. */
  previous?: { productIds: number[]; decorFamilies: string[] } | null;
  /**
   * The flat as the engine lays it out with no proposal (`layOutFlat`, from this generation's seed
   * and with the calculation's picks): the brief names its real slots and walls. The layout does not
   * depend on the designer's answer, so the generation job lays it out before the paid call and
   * hands it over; without it the brief lays it out itself from `seed`.
   */
  engine?: LaidOutFlat;
  apiKey?: string;
  model?: string;
  /** Lets the call go — the server's generation job gives it a deadline inside its function's 300 s. */
  signal?: AbortSignal;
}

export interface AiDesignUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  durationMs: number;
  model: string;
  /** What the call cost at the model's list price, US dollars (Opus 5.5: $4 / $20 per million, cache reads $0.20). */
  costUsd: number;
  /** The draw it was offered (`AiDesignRequest.seed`), to reproduce a run. */
  seed: number;
}

// ---------------------------------------------------------------------------
// What the model is offered
// ---------------------------------------------------------------------------

/** What the engine furnishes itself and the designer is never offered: the kitchen made to measure (`CUSTOM_KITCHEN_KINDS`). */
const KINDS_FURNISHED_BY_ENGINE: ReadonlySet<string> = CUSTOM_KITCHEN_KINDS;
/** Products offered per piece and finishes per surface: a random draw from the whole catalogue each time, not the same top few. */
const CANDIDATES_PER_KIND = 12;
const FINISHES_PER_SURFACE = 10;
/** How much less often something the last design used is drawn again. */
const PREVIOUS_WEIGHT = 0.04;

/**
 * A direction for each generation — a palette and a mood within the style, drawn at random — so the
 * designer does not settle on one favourite look per style: two Scandinavian flats come out pale
 * oak and sage, or birch and dusty blue.
 */
const DIRECTIONS: Record<StyleId, string[]> = {
  modern: [
    'warm greige and walnut with black metal accents',
    'cool white, concrete grey and smoked glass',
    'taupe, travertine and brushed brass',
    'graphite, light oak and deep olive accents',
    'soft white and warm sand with bouclé textures',
    'charcoal, marble and caramel leather',
  ],
  scandinavian: [
    'pale oak, warm white and sage green',
    'birch, linen and dusty blue',
    'ash, oatmeal textiles and black accents',
    'smoked oak, clay and cream',
    'white-washed wood, soft greys and rattan',
    'light walnut, mustard and off-white',
  ],
  industrial: [
    'black steel, red brick and cognac leather',
    'concrete grey, walnut and charcoal',
    'raw oak, blackened metal and olive',
    'smoked glass, grey brick and rust tones',
    'dark timber, graphite and warm amber light',
    'microcement, black-stained oak and tan',
  ],
  vintage: [
    'walnut, cream and deep green velvet',
    'mahogany, ivory mouldings and brass',
    'warm cherry, dusty rose and gold',
    'dark oak, navy and botanical prints',
    'ochre, terracotta and carved wood',
    'cream panelling, sage and antique bronze',
  ],
};

/** A piece the room cannot hold is not offered: its footprint must fit inside the room's outline. */
export function fitsRoom(p: CatalogProduct, room: PlanRoom): boolean {
  if (!p.widthCm || !p.depthCm) return true;
  const xs = room.polygon.map((v) => v.x);
  const zs = room.polygon.map((v) => v.z);
  const long = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
  const short = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
  const a = Math.max(p.widthCm, p.depthCm) / 100;
  const b = Math.min(p.widthCm, p.depthCm) / 100;
  return a <= long - 0.2 && b <= short - 0.5;
}

export interface Offer {
  /** Per room: kind → product ids offered. */
  furniture: Map<string, Map<string, Set<number>>>;
  floors: Map<string, Set<number>>;
  walls: Map<string, Set<number>>;
  decorMaterials: Map<number, CatalogProduct>;
  referenceIds: Set<string>;
  /**
   * Per room: wall index → the decor families a piece asked for on that wall is fitted with in the
   * flat as laid out (`decorFit`): what the brief told the designer each wall takes. A record, not
   * a filter — the flat as built, with the designer's picks, decides (`proposalDecor`). Absent for an
   * offer made without a layout.
   */
  decorWalls?: Map<string, Map<number, Set<DecorFamily>>>;
}

/** Which side of the plan a wall is on, as the drawing shows it. */
export function side(edge: PlanEdge): string {
  if (edge.inward.z > 0.5) return 'top';
  if (edge.inward.z < -0.5) return 'bottom';
  if (edge.inward.x > 0.5) return 'left';
  return 'right';
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The rooms the engine furnishes a room as: itself, or a studio's two halves, each a room of its own (`partRoom`). */
function furnishedAs(room: PlanRoom): PlanRoom[] {
  const parts = studioParts(room);
  return parts ? parts.map((part) => partRoom(room, part)) : [room];
}

/**
 * The kinds the engine lays out in a room — or in each half of a studio — by its program, as the
 * engine's own gate decides (`programPiece`: the room's size, a bath only where the style takes one,
 * a curtain only at a window), its windows dressed for the style; the kitchen's own pieces included.
 */
function laidKinds(room: PlanRoom, styleId?: StyleId): string[] {
  const kinds = new Set<string>();
  for (const area of furnishedAs(room)) {
    for (const entry of ROOM_PROGRAMS[area.type] ?? []) {
      const piece = programPiece(entry, area, { styleId });
      if (piece) kinds.add(piece.kind);
    }
  }
  return [...kinds];
}

/** The kinds the designer is asked to choose a product for: what the engine lays out in the room, but the kitchen it makes itself. */
export function programKinds(room: PlanRoom, styleId?: StyleId): string[] {
  return laidKinds(room, styleId).filter((k) => !KINDS_FURNISHED_BY_ENGINE.has(k));
}

/**
 * The products the matcher takes as a designer's pick for `slot` in `room` (`MatchOptions.picks`):
 * the kind's own pool for the style (`kindPool` — the style's own for the big pieces, nothing the
 * style keeps out), held to what the slot can hold as laid out (`slotPool`: a countertop basin on a
 * bathroom's vanity, a flat bathroom mirror, a pendant that clears a head, the bath of the style) —
 * and, as the matcher does, none at all for a TV, a towel shelf or an island the slot cannot hold.
 * A pick outside it is never taken, so the designer is offered from it, and so is the check (its
 * alternatives). `settled`: the room's other pieces as they stand.
 */
export function pickPool(slot: PlacedItem, room: PlanRoom, catalog: CatalogProduct[], styleId: StyleId, settled: PlacedItem[] = [], level?: BudgetLevel): CatalogProduct[] {
  const pool = kindPool(slot.kind, catalog, styleId).first;
  if (pool.length === 0) return [];
  const fitting = slotPool(slot, pool, room, settled, styleId, level);
  if (fitting.length === 0 && (slot.slot === 'tv' || slot.slot === 'towel_rack' || slot.slot === 'kitchen_island')) return [];
  return fitting.length > 0 ? fitting : pool;
}

/** A slot the engine laid, and the piece it became once matched and fitted. */
interface LaidSlot {
  slot: PlacedItem;
  item: PlacedItem;
}

/**
 * The pieces of a room the designer chooses a product for, by kind: every slot the layout laid
 * there (`placed`) that the matcher filled with a product of the slot's own kind from the kind's
 * own pool and that stands in the flat as fitted. A slot the matcher could fill only by a way out —
 * a smaller kind, another style (`slotSteps`) — takes no pick (picks are the first step's), and a
 * slot the passes replaced (the coat rack by the hall's wardrobe, the wardrobe by a wall of
 * wardrobe) or that got no product is not there; the kitchen is the engine's.
 */
function laidSlots(engine: LaidOutFlat, roomId: string, catalog: CatalogProduct[], styleId: StyleId): Map<string, LaidSlot[]> {
  const byKind = new Map<string, LaidSlot[]>();
  const pools = new Map<string, Set<number>>();
  const own = (kind: string) => {
    let ids = pools.get(kind);
    if (!ids) pools.set(kind, (ids = new Set(kindPool(kind, catalog, styleId).first.map((p) => p.id))));
    return ids;
  };
  for (const slot of engine.placed) {
    if (slot.roomId !== roomId || KINDS_FURNISHED_BY_ENGINE.has(slot.kind)) continue;
    const item = engine.items.find((i) => i.id === slot.id);
    if (!item?.product || item.kind !== slot.kind || !own(slot.kind).has(item.product.productId)) continue;
    // A piece whose product a pass chose again (the hall's full-height mirror) is the pass's.
    if (engine.matched.find((i) => i.id === slot.id)?.product?.productId !== item.product.productId) continue;
    byKind.set(slot.kind, [...(byKind.get(slot.kind) ?? []), { slot, item }]);
  }
  return byKind;
}

/**
 * What the matcher takes as a pick for a kind in a room, as the flat is laid out: for each of its
 * slots, the slot as laid with the pieces matched before it as they were matched (`pickPool`, the
 * matcher's own pool and `slotPool` at the flat's budget level) — and, where the engine's own
 * product fits the place keeping clear all the matcher keeps clear (its first pass, `placeFitting`
 * with the floor kept clear, every piece as built), only what fits it so too: there a pick that
 * does not loses to a product that does. The products every slot of the kind would take, else the
 * first slot's. Lazy: `wanted` products are looked for, in `order`.
 */
function laidPool(slots: LaidSlot[], room: PlanRoom, engine: LaidOutFlat, catalog: CatalogProduct[], styleId: StyleId): (order: (pool: CatalogProduct[]) => CatalogProduct[], wanted: number) => CatalogProduct[] {
  const index = new Map(engine.placed.map((p, i) => [p.id, i]));
  const slotsById = new Map(engine.placed.map((p) => [p.id, p]));
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const parts = isStudio(room) ? studioParts(room) : null;
  const tests = slots.map(({ slot, item }) => {
    const at = index.get(slot.id) ?? 0;
    const settled = engine.matched.filter((i) => !!i.product && (index.get(i.id) ?? Infinity) < at);
    const pool = pickPool(slot, room, catalog, styleId, settled, engine.level);
    // A chair's place is its seat at the table as matched, not the slot: its pool alone.
    if (slot.slot === 'dining_chair') return { pool, fits: () => true };
    const others = [...settled, ...engine.placed.slice(at + 1)];
    // A studio's piece is fitted inside the half that laid it first.
    const within = parts ? partRoom(room, parts[partOfId(room.id, slot.id) ?? partAt(room, slot.position)]) : room;
    const keepClear = engine.kept[room.id] ?? [];
    const own = item.product ? byId.get(item.product.productId) : undefined;
    if (!own || placeFitting(slot, own, [], room, others, slotsById, settled, keepClear, true, within)?.product.id !== own.id) return { pool, fits: () => true };
    // Tried before the engine's own, as the matcher tries a pick before the rest: taken only where it fits.
    return { pool, fits: (product: CatalogProduct) => placeFitting(slot, product, [own], room, others, slotsById, settled, keepClear, true, within)?.product.id === product.id };
  });
  return (order, wanted) => {
    const [first, ...rest] = tests;
    if (!first) return [];
    const inEvery = first.pool.filter((p) => rest.every((t) => t.pool.some((q) => q.id === p.id)));
    const out: CatalogProduct[] = [];
    for (const p of order(inEvery.length > 0 ? inEvery : first.pool)) {
      if (out.length >= wanted) break;
      if ((inEvery.length > 0 ? tests : [first]).every((t) => t.fits(p))) out.push(p);
    }
    return out;
  };
}

const cm = (m: number) => Math.round(m * 100);
const label = (kind: string) => kind.replace(/_/g, ' ');

/** Where along an edge a point falls, metres from its first corner. */
function alongEdge(edge: PlanEdge, point: { x: number; z: number }): number {
  return (point.x - edge.a.x) * edge.dir.x + (point.z - edge.a.z) * edge.dir.z;
}

/** The wall a piece stands or hangs against (its back within 30 cm), and the stretch of it the piece takes. */
function onWall(item: PlacedItem, room: PlanRoom): { edge: PlanEdge; from: number; to: number } | null {
  const wall = pieceWall(item, room, 0.3);
  if (!wall) return null;
  const at = alongEdge(wall.edge, item.position);
  return { edge: wall.edge, from: Math.max(0, at - item.size.width / 2), to: Math.min(wall.edge.length, at + item.size.width / 2) };
}

/** Where a piece is, in words: against or on which wall and where along it, from the ceiling, under another piece, or free in the room. */
function placeText(item: PlacedItem, room: PlanRoom): string {
  const rule = getArchetype(item.kind)?.placement;
  if (rule?.type === 'ceiling') return 'from the ceiling';
  if (rule?.type === 'under') return `under the ${label(rule.to)}`;
  const wall = onWall(item, room);
  if (!wall) return 'free in the room';
  const hung = item.elevationM >= 0.05 ? `, hung ${r2(item.elevationM)}–${r2(item.elevationM + item.size.height)} m up` : '';
  return `${rule?.type === 'window' ? 'at the window of' : 'against'} wall ${wall.edge.index} at ${r2(wall.from)}–${r2(wall.to)} m${hung}`;
}

/** What the engine built on a wall, in words: the hall's or a bedroom's wardrobe, a vanity, a column, a WC's or a bath's box. */
function builtText(piece: DecorPiece): string {
  const what = piece.family === 'box' ? (piece.anchor === 'wc' ? "the WC's box" : piece.anchor === 'bath' ? "the bath's box" : 'a box') : 'built-in cabinets';
  return `${what} ${r2(Math.min(piece.span.from, piece.span.to))}–${r2(Math.max(piece.span.from, piece.span.to))} m, up to ${r2(piece.height.to)} m`;
}

/**
 * Whether decor goes behind a room's bed, in words (the rulebook's B-6, `proposalDecor`: a bed
 * `TALL_HEADBOARD_M` tall or more has a headboard of its own and takes none): the bed the engine laid,
 * and which of the beds offered are low enough to take it. Null for a room with no bed.
 */
function bedText(items: PlacedItem[], roomId: string, offered: Map<string, Set<number>>, catalog: CatalogProduct[]): string | null {
  const bed = items.find((i) => i.roomId === roomId && i.slot === 'bed' && !!i.product);
  if (!bed) return null;
  const tall = TALL_HEADBOARD_M;
  const laid = bed.size.height < tall ? 'takes decor behind it' : `has a headboard of its own (a bed ${r2(tall)} m tall or more does) and takes no decor behind it`;
  const ids = [...(offered.get(bed.kind) ?? [])];
  const heights = new Map(catalog.filter((p) => ids.includes(p.id)).map((p) => [p.id, (p.heightCm ?? 0) / 100]));
  const low = ids.filter((id) => (heights.get(id) ?? 0) < tall);
  const choice = ids.length === 0 ? '' : low.length === ids.length ? `; every bed offered is under ${r2(tall)} m and takes it` : low.length ? `; of the beds offered, only ${low.join(', ')} are under ${r2(tall)} m and take it` : `; no bed offered is under ${r2(tall)} m: none takes it`;
  return `Decor behind the bed (anchor bed): the bed laid here (${r2(bed.size.height)} m tall) ${laid}${choice}.`;
}

/**
 * What a room's floor and walls are in the flat, in words: its own (a wet room's tiles, a balcony,
 * a closed kitchen's tiled floor), or the flat's one floor and walls — chosen in the room that
 * leads them (`flatFinishRoom`) and laid in every room that shares them (`sharesFlatFinish`).
 */
function finishNote(room: PlanRoom, lead: PlanRoom | null): string {
  if (isWetRoomType(room.type)) return 'its own, tiled, from its own lists.';
  if (room.type === 'balcony') return 'its own, from its own lists.';
  if (isClosedKitchen(room)) return 'a closed kitchen: its own, its floor tiled, from its own lists.';
  if (lead && room.id === lead.id) return "this room leads the flat's one floor and walls: the floor and wall chosen here are laid in every room that shares them.";
  if (lead && sharesFlatFinish(room)) return `${room.type === 'kitchen' ? 'an open kitchen: ' : ''}the flat's one floor and walls — room ${lead.id}'s choice is laid here (its lists are this room's).`;
  return 'from its own lists.';
}

/** The decor families the designer may ask for on a wall of a room in this style: what the style takes, a tiled field not where the walls are tiled already or where tiles are the kitchen's backsplash, no light line, mouldings anywhere. */
function wallFamilies(room: PlanRoom, styleId: StyleId): DecorFamily[] {
  return AI_DECOR_FAMILIES.filter((f) => STYLE_DECOR_FAMILIES[styleId].includes(f) && f !== 'light' && f !== 'moulding' && !(f === 'tile' && (isWetRoomType(room.type) || room.type === 'kitchen')));
}

/**
 * A wall of the flat as laid out, in words for the brief: what stands against it and what hangs on
 * it in order along it, the joinery and boxes built on it, and the stretch each decor family asked
 * for on it is fitted to (`decorFit`) — or that it takes none. Returns the lines and the families it takes.
 */
function wallText(edge: PlanEdge, room: PlanRoom, items: PlacedItem[], built: readonly DecorPiece[], styleId: StyleId): { lines: string[]; takes: Set<DecorFamily> } {
  const lines: string[] = [];
  const mine = items
    .filter((i) => i.roomId === room.id && i.slot !== 'rug' && getArchetype(i.kind)?.placement.type !== 'ceiling')
    .map((i) => ({ item: i, wall: onWall(i, room) }))
    .filter((x) => x.wall?.edge.index === edge.index)
    .sort((a, b) => a.wall!.from - b.wall!.from);
  const standing = mine.filter((x) => x.item.elevationM < 0.05).map((x) => `${label(x.item.kind)} ${r2(x.wall!.from)}–${r2(x.wall!.to)} (${r2(x.item.size.height)} m high)`);
  const hanging = mine.filter((x) => x.item.elevationM >= 0.05).map((x) => `${label(x.item.kind)} ${r2(x.wall!.from)}–${r2(x.wall!.to)} at ${r2(x.item.elevationM)}–${r2(x.item.elevationM + x.item.size.height)} m`);
  const joinery = built.filter((d) => d.roomId === room.id && d.wallIndex === edge.index && (d.family === 'cabinet' || d.family === 'box')).map(builtText);
  const parts = [standing.length ? `against it: ${standing.join(', ')}` : '', hanging.length ? `on it: ${hanging.join(', ')}` : '', joinery.length ? `built in: ${joinery.join(', ')}` : ''].filter(Boolean);
  if (parts.length) lines.push(`  ${parts.join('; ')}`);
  // Each family where it would be fitted, families fitted alike named together.
  const takes = new Set<DecorFamily>(STYLE_DECOR_FAMILIES[styleId].includes('moulding') ? ['moulding'] : []);
  const bySpan = new Map<string, DecorFamily[]>();
  const none: DecorFamily[] = [];
  for (const family of wallFamilies(room, styleId)) {
    const fit = decorFit(family, edge.index, room, items, built);
    if (!fit) {
      none.push(family);
      continue;
    }
    takes.add(family);
    const span = `${r2(fit.span.from)}–${r2(fit.span.to)} m`;
    bySpan.set(span, [...(bySpan.get(span) ?? []), family]);
  }
  const fits = [...bySpan.entries()].map(([span, families]) => `${families.join(', ')} on ${span}`);
  // A niche and a panel take a whole stretch of a length the others do not need: said where they do not fit.
  const whole = none.filter((f) => f === 'niche' || f === 'panel');
  if (fits.length) lines.push(`  decor here: ${fits.join('; ')}${whole.length ? ` (no ${whole.join(' or ')}: no stretch long enough${whole.includes('niche') ? ', a niche with nothing standing against the wall' : ''})` : ''}`);
  else if (none.length) lines.push('  decor here: none');
  return { lines, takes };
}

/**
 * A room's outline in words: rectangular, L-shaped (six square corners) or so many corners, and the
 * box it fits in — "rectangular, 4.2 × 3.1 m", "L-shaped, 6 corners, within 5.2 × 4 m", "8 corners,
 * within 6 × 5 m", "4 corners, not square, within 3.9 × 3 m".
 */
export function outlineText(room: Pick<PlanRoom, 'polygon'>): string {
  const xs = room.polygon.map((v) => v.x);
  const zs = room.polygon.map((v) => v.z);
  const box = `${r2(Math.max(...xs) - Math.min(...xs))} × ${r2(Math.max(...zs) - Math.min(...zs))} m`;
  // A wall drawn as two edges runs straight on through the point between them: that is no corner.
  const all = roomEdges(room.polygon);
  const straightOn = (a: PlanEdge, b: PlanEdge) => Math.abs(a.dir.x * b.dir.z - a.dir.z * b.dir.x) < 0.02 && a.dir.x * b.dir.x + a.dir.z * b.dir.z > 0;
  const edges = all.filter((e, i) => !straightOn(all[(i - 1 + all.length) % all.length], e));
  const square = edges.length > 0 && edges.every((e, i) => {
    const next = edges[(i + 1) % edges.length];
    return Math.abs(e.dir.x * next.dir.x + e.dir.z * next.dir.z) < 0.02;
  });
  const corners = edges.length;
  if (corners === 4 && square) return `rectangular, ${box}`;
  if (corners === 6 && square) return `L-shaped, 6 corners, within ${box}`;
  return `${corners} corners${square ? '' : ', not square'}, within ${box}`;
}

export function productLine(p: CatalogProduct): string {
  const size = p.widthCm && p.depthCm && p.heightCm ? `${Math.round(p.widthCm)}×${Math.round(p.depthCm)}×${Math.round(p.heightCm)}cm` : '';
  const styles = Array.isArray(p.styleTags) ? (p.styleTags as string[]).slice(0, 3).join('/') : '';
  return `${p.id} | ${p.nameEn ?? p.nameKa} | ${size} | ${Math.round(p.pricePerUnit)}₾ | ${styles}${p.colorHex ? ` | ${p.colorHex}` : ''}`;
}

/** The flat as the model reads it, and what it may choose from. */
export function buildBrief(request: AiDesignRequest): { text: string; offer: Offer; seed: number } {
  const { plan, styleId, catalog } = request;
  const seed = request.seed ?? randomSeed();
  const rng = seededRng(seed);
  const used = new Set(request.previous?.productIds ?? []);
  // The flat as the engine lays it out — the slots, the products matched to them, the joinery —
  // which the designer's answer does not change: what it is asked about is what will be there.
  const engine = request.engine ?? layOutFlat({ plan, styleId, budgetGel: request.budgetGel ?? null, catalog, proposal: null, calculatorPicks: null, seed });
  const fresh = (p: CatalogProduct) => (used.has(p.id) ? PREVIOUS_WEIGHT : 1);
  const offer: Offer = { furniture: new Map(), floors: new Map(), walls: new Map(), decorMaterials: new Map(), referenceIds: new Set(), decorWalls: new Map() };
  const products = new Map<number, CatalogProduct>();
  const lines: string[] = [];
  const roomName = new Map(plan.rooms.map((r) => [r.id, r.name]));
  // Each room's finishes: a draw from what the engine would lay there (`finishCandidates`), the
  // style's own likelier, the last design's rarely. The flat's one floor and walls are chosen in the
  // room that leads them and laid in every room that shares them (`withFlatFinish`): drawn once.
  const finishLists = (room: PlanRoom) => {
    const draw = (surface: 'floor' | 'wall') => weightedOrder(finishCandidates(catalog, room, surface, styleId, plan.rooms), (p) => ([1, 3, 8][styleAffinity(styleId, p.styleTags, p.tags)] ?? 1) * fresh(p), rng).slice(0, FINISHES_PER_SURFACE);
    return { floor: draw('floor'), wall: draw('wall') };
  };
  const lead = flatFinishRoom(plan.rooms);
  const shared = lead ? finishLists(lead) : null;

  for (const planRoom of plan.rooms) {
    const room = engine.rooms.find((r) => r.id === planRoom.id) ?? underCeiling(planRoom, plan);
    lines.push(`\n## Room ${room.id} — "${room.name}" (${room.type}), ${r2(room.areaM2)} m², ceiling ${r2(planRoom.heightM)} m, ${outlineText(room)}`);
    const walls = new Map<number, Set<DecorFamily>>();
    for (const edge of wallEdges(room)) {
      const openings = room.openings
        .filter((o) => o.wallIndex === edge.index)
        .map((o) => {
          const at = o.t * edge.length;
          const span = `${r2(at - o.widthM / 2)}–${r2(at + o.widthM / 2)} m`;
          if (o.kind === 'window') return `window ${span}, sill ${r2(o.sillM)} m, head ${r2(o.sillM + o.heightM)} m`;
          if (o.kind === 'railing') return `balcony railing ${span}`;
          const to = o.connectsToRoomId ? ` to "${roomName.get(o.connectsToRoomId) ?? 'another room'}"` : o.exterior ? ' (entrance)' : '';
          return `${o.kind} ${span}${to}`;
        });
      const clear = freeSpans(edge, room.openings, 0, edge.length, 0.1).map(([a, b]) => `${r2(a)}–${r2(b)}`);
      lines.push(`- wall ${edge.index} (${side(edge)} side), ${r2(edge.length)} m: ${openings.length ? openings.join('; ') : 'solid'}${clear.length ? `; clear stretches ${clear.join(', ')} m` : '; no clear stretch'}`);
      // What stands and hangs on it as the engine laid the flat out, what it built there, and the decor it takes.
      const wall = wallText(edge, room, engine.items, engine.built, styleId);
      lines.push(...wall.lines);
      walls.set(edge.index, wall.takes);
    }
    offer.decorWalls!.set(room.id, walls);
    // The pieces the engine laid out here, each slot as laid, with the products that may fill it.
    const byKind = new Map<string, Set<number>>();
    const pieces: string[] = [];
    for (const [kind, slots] of laidSlots(engine, room.id, catalog, styleId)) {
      // A fresh draw from what the matcher would take as a pick for these slots (`laidPool`) that
      // fits the room: the style's own and the well-priced more likely (`generationWeight`), any of
      // them possible, the last design's rarely.
      const draw = laidPool(slots, room, engine, catalog, styleId);
      const ranked = draw((pool) => weightedOrder(pool.filter((p) => fitsRoom(p, room)), (p) => generationWeight(p, styleId, 'balanced', undefined, false) * fresh(p), rng), CANDIDATES_PER_KIND);
      if (ranked.length === 0) continue;
      byKind.set(kind, new Set(ranked.map((p) => p.id)));
      for (const p of ranked) products.set(p.id, p);
      const { slot } = slots[0];
      const where = [...new Set(slots.map(({ item }) => placeText(item, room)))];
      pieces.push(`- ${kind}${slots.length > 1 ? ` ×${slots.length}` : ''}, a ${cm(slot.size.width)}×${cm(slot.size.depth)} cm place ${where.join('; ')}: [${ranked.map((p) => p.id).join(', ')}]`);
    }
    offer.furniture.set(room.id, byKind);
    if (pieces.length) lines.push(`Pieces the engine laid out (choose a product for each; the matcher takes it where it fits the place):\n${pieces.join('\n')}`);
    const bed = bedText(engine.items, room.id, byKind, catalog);
    if (bed) lines.push(bed);
    // The lead room and every room that shares the flat's floor and walls are offered the one draw
    // (`shared`): the lead's choice is laid in each of them.
    const follows = !!lead && planRoom.id !== lead.id && sharesFlatFinish(planRoom);
    const lists = shared && (follows || planRoom.id === lead!.id) ? shared : finishLists(planRoom);
    for (const surface of ['floor', 'wall'] as const) {
      const pool = lists[surface];
      (surface === 'floor' ? offer.floors : offer.walls).set(room.id, new Set(pool.map((p) => p.id)));
      if (!follows && pool.length) lines.push(`${surface} finishes: ${pool.map((p) => `${p.id} ${p.nameEn ?? p.nameKa}${p.colorHex ? ` ${p.colorHex}` : ''}`).join('; ')}`);
    }
    lines.push(`Floor and walls: ${finishNote(planRoom, lead)}`);
  }

  const productList = [...products.values()].map(productLine).join('\n');

  // Not the joiner's materials: the made-to-measure cabinets are the engine's, not the designer's to compose.
  for (const p of catalog) if (isDecorMaterial(p) && decorMaterialKind(p) !== 'joinery') offer.decorMaterials.set(p.id, p);
  // In no particular order, so the list's first lines are not the designer's habit.
  const materialList = weightedOrder([...offer.decorMaterials.values()], () => 1, rng)
    .map((p) => `${p.id} | ${decorMaterialKind(p)} | ${p.nameEn ?? p.nameKa} | ${Math.round(p.pricePerUnit)}₾/${p.unit === 'linear_m' ? 'm' : p.unit === 'piece' ? 'pc' : 'm²'} | ${p.colorHex ?? ''}${decorSpecs(p).tintable ? ' | tintable' : ''}`)
    .join('\n');

  const types = new Set(plan.rooms.map((r) => r.type));
  const entries = referenceLibrary.entries.filter((e) => e.style === styleId && types.has(e.room_type as RoomType));
  for (const e of entries) offer.referenceIds.add(e.id);
  // Each entry's concepts in a random order: the first is this flat's lean, not always the same one.
  const library = entries
    .map((e) => `- ${e.id}: ${weightedOrder(e.concepts, () => 1, rng).join(' / ')} | families ${e.families.join(', ')} | ${e.composition_rule} | ${e.room_constraint}`)
    .join('\n');
  const direction = DIRECTIONS[styleId][Math.floor(rng() * DIRECTIONS[styleId].length)];
  const previous = request.previous && (request.previous.productIds.length || request.previous.decorFamilies.length)
    ? `\nThis flat's previous design used products ${request.previous.productIds.slice(0, 60).join(', ') || 'none'}${request.previous.decorFamilies.length ? ` and decor families ${[...new Set(request.previous.decorFamilies)].join(', ')}` : ''}. The person asked for a new design: choose differently wherever the lists allow.`
    : '';

  const profile = request.styleProfile ? `Style test answers: ${JSON.stringify(request.styleProfile.answers)}.` : '';
  // The owner's style guide and the sub-style the answers point to (drawn when there are none).
  const guide = styleGuideText(styleId, subStyleFor(styleId, request.styleProfile, rng));
  const text = [
    `Style: ${styleId}. ${profile} Furniture budget: ${request.budgetGel ? `${request.budgetGel} GEL for the whole flat` : 'not set (mid-range)'}. Write every note and concept in ${request.locale === 'ka' ? 'Georgian' : request.locale === 'ru' ? 'Russian' : 'English'}.`,
    guide,
    `Direction for this flat: ${direction}. Interpret it within the style and its sub-style through the products, the finishes and the decor.${previous}`,
    `\n# The flat${lines.join('\n')}`,
    `\n# Products offered (id | name | W×D×H | price | styles | colour)\n${productList}`,
    `\n# Decor materials (id | kind | name | price per unit | colour | tintable)\n${materialList}`,
    `\n# Decor references for this style and these rooms (realise one concept per piece; they are starting points, not rules)\n${library}`,
  ].join('\n');
  return { text, offer, seed };
}

// ---------------------------------------------------------------------------
// The prompt and the answer's shape
// ---------------------------------------------------------------------------

const SLOT_KINDS = AI_DECOR_FAMILIES.map((f) => `${f}: ${decorSlots(f).map((s) => `${s} (${DECOR_FAMILIES[f].slots[s]!.kinds.join('/')}${DECOR_FAMILIES[f].slots[s]!.optional ? ', optional' : ''})`).join(', ')}`).join('\n');

/** Words joined as a list: "a, b and c" (or "a, b or c"). */
export function listText(words: readonly string[], last: 'and' | 'or' = 'and'): string {
  return words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} ${last} ${words[words.length - 1]}`;
}
const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
/** The largest square shower the layout tries: what the rules call preferable to the smallest. */
const SQUARE_SHOWER_M = Math.max(...SHOWER_SIZES_M.filter((s) => s.width === s.depth).map((s) => s.width));
/** A family's default band of height as the engine fits it (`defaultHeight`), under a ceiling high enough not to cut it. */
const band = (family: DecorFamily, anchor: DecorIntent['anchor']) => {
  const { from, to } = defaultHeight(family, anchor, Infinity);
  return `${r2(from)}–${r2(to)} m`;
};
/** How far under the ceiling slats behind a bed stop by default (`defaultHeight` stops them that far below any ceiling). */
const SLATS_UNDER_CEILING_M = -defaultHeight('slats', 'bed', 0).to;

/**
 * The designer's rules, the numbers in them read from `lib/design/rules.ts` and the decor's own
 * defaults — a number changed there is changed in what the designer is told.
 */
export const DESIGN_PROMPT = `You are the interior designer of a Georgian home renovation platform. After a person takes the style test, you furnish and finish their whole flat at once — coherently, like one designer's work — and add custom wall decor that is built to measure (slatted panels, stone slabs, mouldings, niches, light lines, upholstered or relief panels, cladding, murals, tiled fields).

Everything you choose is real and purchasable: you pick products and materials only by the ids offered, never invent one. You decide intent; the platform's engine decides exact geometry and checks it (it has laid the furniture out in each room — the flat below shows each piece where it stands, and what it built in — and it fits your decor to the walls around doors, windows and what stands there). So you never give coordinates — you give anchors, walls and sizes in metres.

## Furniture and finishes
- For each room, choose one product per piece listed under "Pieces the engine laid out", from that piece's ids: each is a place of that size where the engine laid it, and every id offered fits it. Leave a piece out to let the engine choose. The lists are a fresh random draw from the catalogue for every flat and in no order: consider every id, not the first ones, and follow the flat's direction — no two flats should come out alike. Pieces in one room should belong together (materials, colours, scale); keep a palette of at most 3–4 colour families per room, consistent across the flat, and respect the budget (mid-range when none is set).
- Choose one floor and one wall finish per room from its own lists (0 keeps the style's default); each list holds what the engine lays in that room (tiles in a bathroom, a toilet, a closed kitchen and on a balcony). The flat has one floor and one wall finish through it: the room whose "Floor and walls" says it leads them chooses them, and its choice is laid in every room that shares them (their lists are its lists: give the same ids, or 0); a bathroom, a toilet, a balcony and a closed kitchen have their own — keep them in the flat's palette, so the materials never become a mixture.
- Follow the style guide and the flat's sub-style (given with the flat): its palette, materials, furniture, kitchen, lighting and walls.
- The owner's design rules: one palette of 2–3 main colours plus one accent, repeating materials across rooms for continuity; light in three layers (ambient, task, accent), warm (${WARM_LIGHT_K.min}–${WARM_LIGHT_K.max} K) in living rooms and bedrooms, neutral (${NEUTRAL_LIGHT_K.min}–${NEUTRAL_LIGHT_K.max} K) in kitchens and offices; curtains floor-length from just under the ceiling, roller blinds instead in a ${listText(BLIND_STYLES.map(capital), 'or')} flat and over every ${listText(BLIND_ROOMS.map((t) => `${t}'s`))} window; a shower at least ${cm(SHOWER_MIN_M)}×${cm(SHOWER_MIN_M)} cm (better ${cm(SQUARE_SHOWER_M)}×${cm(SQUARE_SHOWER_M)}), a basin's top at ${cm(BASIN_TOP_M)} cm, a wardrobe ${cm(WARDROBE_DEPTH_M)} cm deep (${cm(SHALLOW_WARDROBE_DEPTH_M)} cm when shallow); hidden storage in the entrance, the kitchen and the bedrooms. The engine already keeps the WC out of the door's sight, the bed preferably too, the kitchen out of the entrance's, and the sizes between pieces.

## Custom wall decor
- Realise concepts from the decor references for the style. Use 1–2 pieces in living rooms, bedrooms, offices and studios; at most one in a ${listText(ONE_DECOR_ROOMS, 'or')} (only the first that can be built is kept); none is fine (storage, closets, toilets, balconies usually get none). Never more than ${MAX_DECOR_PER_ROOM} in a room, never two on the same stretch of wall.
- Decor by style (the owner's rules): Vintage takes the most decor and characterful details; Modern (minimalist) stays clean — decor used selectively, and the only style with wall panels and with LED (light lines, coves, a lit niche or slab); Scandinavian has no mouldings and no decorative wall treatments — at most a timber slat wall or a niche, and plants and floor lamps rather than decor; Industrial has no mouldings and no concealed or LED light. The families a style does not take are dropped.
- anchor: bed | tv | sofa | desk | dining | kitchen — centred on that piece, on the wall it stands against (only for pieces the room has: bed in bedrooms — only where "Decor behind the bed" says the bed takes it: a bed ${r2(TALL_HEADBOARD_M)} m tall or more has a headboard of its own and takes none, so choose a lower bed for decor behind it —, tv/sofa in living rooms, desk in offices, dining where a dining table is laid out, kitchen = the kitchen run: a tile or slab backsplash from the worktop to the wall cabinets, the whole length of the run — tiles in a kitchen always go there, and so does a slab on the run's wall or no higher than 1.8 m); wall — on wall "wallIndex" (the wall numbers above; it is fitted to that wall's longest clear stretch — each wall says under "decor here" which families it takes and on what stretch, as the flat is laid out: ask a wall only for what it takes — a niche or a panel asked on a wall that does not take it is left out; -1 with any other anchor); room — a light cove round the ceiling (rectangular rooms only).
- widthM: 0 lets the engine size it (the anchor's width plus a margin, or the whole clear stretch); give a number only when the design needs it. heightFromM / heightToM: -1 for the family's default (a slab behind a TV ${band('slab', 'tv')}, slats behind a bed from ${r2(defaultHeight('slats', 'bed', Infinity).from)} m to ${cm(SLATS_UNDER_CEILING_M)} cm under the ceiling, an upholstered headboard panel ${band('panel', 'bed')}, a tiled field up to ${r2(defaultHeight('tile', 'wall', Infinity).to)} m, a kitchen backsplash from the worktop to the wall cabinets, everything else floor to ceiling); give numbers for a half-height wainscot or a panel above a headboard. A niche is a wall built out about ${(DECOR_FAMILIES.niche.params.depthMm ?? 0) / 10} cm: it goes only on a wall stretch with nothing standing against it (never behind a bath, a washing machine, a bed or a cabinet). Decor never covers a window or a door, and furniture is never hidden by it.
- Families and the materials each part takes (slot (material kinds)):
${SLOT_KINDS}
  For each slot give a material id of a kind it takes (leave an optional slot out to go without it), and colorHex only for a tintable material (paint, lacquer, dyed fabric) — a hex colour that suits the palette; \"\" otherwise.
- params (\"auto\", 0 or -1 for the default; yes/no for switches): slats slatWidthMm 20–45, gapMm 10–25, depthMm 10–30, backing yes/no (no = a see-through screen); led none|bottom|top|halo|inside where the family has a led slot (halo behind a stood-off slab, inside a niche, bottom/top along slats or panels) — keep light out of eyes over a bed's pillows; moulding dadoMm 900–1100, bayWidthMm 600–1000, upper/lower/rail yes/no; niche shape arch|rect, count 1–3, nicheWidthMm 500–1000, nicheHeightMm 1200–2200, shelves 0–4, mantel yes only for a pair of niches either side of a decorative mantel on a wall of at least 3.2 m; panel style upholstered|fluted|flat, moduleWidthMm (upholstered channels 120–300, flutes 40–80); slab moduleWidthMm/moduleHeightMm the slab size (seams fall there); tile border yes/no; light path cove|line.
- Follow each reference's composition rule and room constraint: centre a feature on its focal piece, keep sockets, doors, windows and circulation clear, wet-zone materials in bathrooms (stone, niches; no timber, wallpaper or fabric in a shower) — a bathroom's and a toilet's walls are already tiled as their wall finish, so never a tiled field (tile) there, nothing projecting over a bed's pillows.
- Each decor piece: referenceId (the reference you realised, or \"\"), concept (a short title in the person's language), note (one sentence on why, in the person's language).

## Notes
- Per room, note: one or two sentences in the person's language on the idea of the room (palette, materials, the feature wall). Plain, warm, specific; no marketing.`;

/*
 * The answer's shape. Structured output allows at most 16 nullable (union) fields in a schema, so
 * nothing here is nullable: "use the default" is a sentinel instead — 0 for a number, "" for a
 * string, "auto" for a choice — and `validateProposal` reads the sentinels back as absent.
 */
const AUTO = 'auto';
const choice = (values: string[]) => ({ type: 'string', enum: [AUTO, ...values] });
const yesNo = choice(['yes', 'no']);

const PARAMS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['slatWidthMm', 'gapMm', 'depthMm', 'backing', 'led', 'dadoMm', 'bayWidthMm', 'upper', 'lower', 'rail', 'shape', 'count', 'nicheWidthMm', 'nicheHeightMm', 'shelves', 'mantel', 'moduleWidthMm', 'moduleHeightMm', 'style', 'border', 'path'],
  properties: {
    slatWidthMm: { type: 'number' },
    gapMm: { type: 'number' },
    depthMm: { type: 'number' },
    backing: yesNo,
    led: choice(['none', 'bottom', 'top', 'halo', 'inside']),
    dadoMm: { type: 'number' },
    bayWidthMm: { type: 'number' },
    upper: yesNo,
    lower: yesNo,
    rail: yesNo,
    shape: choice(['arch', 'rect']),
    count: { type: 'integer' },
    nicheWidthMm: { type: 'number' },
    nicheHeightMm: { type: 'number' },
    shelves: { type: 'integer', description: '-1 for the default' },
    mantel: yesNo,
    moduleWidthMm: { type: 'number' },
    moduleHeightMm: { type: 'number' },
    style: choice(['upholstered', 'fluted', 'flat']),
    border: yesNo,
    path: choice(['cove', 'line']),
  },
};

export const DESIGN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['rooms'],
  properties: {
    rooms: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['roomId', 'note', 'furniture', 'floor', 'wall', 'decor'],
        properties: {
          roomId: { type: 'string' },
          note: { type: 'string' },
          furniture: {
            type: 'array',
            items: { type: 'object', additionalProperties: false, required: ['kind', 'productId'], properties: { kind: { type: 'string' }, productId: { type: 'integer' } } },
          },
          floor: { type: 'integer', description: '0 keeps the style default' },
          wall: { type: 'integer', description: '0 keeps the style default' },
          decor: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['family', 'referenceId', 'concept', 'anchor', 'wallIndex', 'widthM', 'heightFromM', 'heightToM', 'params', 'materials', 'note'],
              properties: {
                family: { type: 'string', enum: AI_DECOR_FAMILIES },
                referenceId: { type: 'string', description: '"" when none' },
                concept: { type: 'string' },
                anchor: { type: 'string', enum: [...DECOR_ANCHORS] },
                wallIndex: { type: 'integer', description: '-1 unless anchor is wall' },
                widthM: { type: 'number', description: '0 lets the engine size it' },
                heightFromM: { type: 'number', description: '-1 for the default' },
                heightToM: { type: 'number', description: '-1 for the default' },
                params: PARAMS_SCHEMA,
                materials: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['slot', 'productId', 'colorHex'],
                    properties: {
                      slot: { type: 'string', enum: ['face', 'backing', 'led', 'profile', 'body', 'shelf', 'surround', 'border', 'trim'] },
                      productId: { type: 'integer' },
                      colorHex: { type: 'string', description: '"" unless the material is tintable' },
                    },
                  },
                },
                note: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Checking the answer
// ---------------------------------------------------------------------------

interface RawDecor {
  family: string;
  referenceId: string;
  concept: string;
  anchor: string;
  wallIndex: number;
  widthM: number;
  heightFromM: number;
  heightToM: number;
  params: Record<string, string | number>;
  materials: Array<{ slot: string; productId: number; colorHex: string }>;
  note: string;
}

interface RawRoom {
  roomId: string;
  note: string;
  furniture: Array<{ kind: string; productId: number }>;
  floor: number;
  wall: number;
  decor: RawDecor[];
}

/** The answer's knobs with its sentinels ("auto", 0, -1) read as absent, its yes/no as booleans. */
function readParams(raw: Record<string, string | number> | undefined): DecorParams {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (value === AUTO || value === '' || value == null) continue;
    if (value === 'yes' || value === 'no') out[key] = value === 'yes';
    else if (typeof value === 'number') {
      if (key === 'shelves' ? value >= 0 : value > 0) out[key] = value;
    } else out[key] = value;
  }
  return out as DecorParams;
}

const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/**
 * Keeps only what was offered: rooms of the plan, products from their room's kind lists, finishes
 * from the room's pools, decor of a known family with materials of a kind its slot takes and
 * references for this style — the first `MAX_DECOR_PER_ROOM` asked. Whether a piece fits its wall,
 * and how many a room keeps (`maxDecor`), is the flat's as built (`proposalDecor`): the designer's
 * picks change the products' sizes from the engine's flat the brief described.
 * Throws when nothing usable is left — the caller falls back.
 */
export function validateProposal(raw: { rooms?: RawRoom[] }, plan: FloorPlan, offer: Offer, model: string, styleId?: StyleId): AiProposal {
  const roomIds = new Set(plan.rooms.map((r) => r.id));
  const wet = new Set(plan.rooms.filter((r) => isWetRoomType(r.type)).map((r) => r.id));
  const rooms: AiRoomProposal[] = [];
  for (const room of raw.rooms ?? []) {
    if (!room || !roomIds.has(room.roomId)) continue;
    const kinds = offer.furniture.get(room.roomId) ?? new Map<string, Set<number>>();
    const furniture = (room.furniture ?? []).filter((f) => kinds.get(f.kind)?.has(f.productId));
    const floor = room.floor && offer.floors.get(room.roomId)?.has(room.floor) ? room.floor : null;
    const wall = room.wall && offer.walls.get(room.roomId)?.has(room.wall) ? room.wall : null;
    const decor: DecorIntent[] = [];
    // The first usable ones asked, as many as the prompt allows a room; how many of them a room
    // keeps (`maxDecor`: one in a hall, a kitchen or a bathroom) is held on what can be built there
    // (`proposalDecor`), so a piece the flat cannot take does not stand in for one it can.
    for (const d of room.decor ?? []) {
      if (decor.length >= MAX_DECOR_PER_ROOM) break;
      if (!d || !AI_DECOR_FAMILIES.includes(d.family as DecorFamily) || !(DECOR_ANCHORS as readonly string[]).includes(d.anchor)) continue;
      // A bathroom's and a toilet's walls are tiled as their finish: a tiled field on them is the work twice.
      if (d.family === 'tile' && wet.has(room.roomId)) continue;
      const family = d.family as DecorFamily;
      // What the style takes (panels only in Modern, nothing decorative in Scandinavian…).
      if (styleId && !STYLE_DECOR_FAMILIES[styleId].includes(family)) continue;
      const materials = (d.materials ?? [])
        .filter((m) => {
          if (!m || !decorSlots(family).includes(m.slot as DecorSlot) || !m.productId) return false;
          const product = offer.decorMaterials.get(m.productId);
          return !!product && slotTakes(family, m.slot as DecorSlot, decorMaterialKind(product));
        })
        .map((m) => ({ slot: m.slot as DecorSlot, productId: m.productId, colorHex: /^#[0-9a-f]{6}$/i.test(m.colorHex ?? '') ? m.colorHex : null }));
      decor.push({
        family,
        referenceId: d.referenceId && offer.referenceIds.has(d.referenceId) ? d.referenceId : null,
        concept: text(d.concept, 120),
        anchor: d.anchor as DecorIntent['anchor'],
        wallIndex: typeof d.wallIndex === 'number' && d.wallIndex >= 0 ? d.wallIndex : null,
        widthM: typeof d.widthM === 'number' && d.widthM > 0 ? d.widthM : null,
        heightFromM: typeof d.heightFromM === 'number' && d.heightFromM >= 0 ? d.heightFromM : null,
        heightToM: typeof d.heightToM === 'number' && d.heightToM > 0 ? d.heightToM : null,
        // LED only in Modern: elsewhere a piece's light is switched off.
        params: styleId && !styleTakesLed(styleId) ? { ...readParams(d.params), led: 'none' } : readParams(d.params),
        materials,
        note: text(d.note, 400),
      });
    }
    rooms.push({ roomId: room.roomId, note: text(room.note, 1200), furniture, floor, wall, decor });
  }
  if (rooms.length === 0) throw new Error('The designer returned no usable room');
  return { model, rooms };
}

// ---------------------------------------------------------------------------
// The call
// ---------------------------------------------------------------------------

/** List prices, US dollars per million tokens: what a generation costs, logged with it. */
export const PRICE_PER_MTOK: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
};

export async function designWithClaude(request: AiDesignRequest): Promise<{ proposal: AiProposal; usage: AiDesignUsage }> {
  const apiKey = request.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new MissingApiKeyError();
  const model = request.model ?? DESIGN_MODEL;
  const { text, offer, seed } = buildBrief(request);
  const client = new Anthropic({ apiKey });
  const started = Date.now();

  // Streamed to keep a long answer clear of the HTTP timeout; used whole. The rules part of the
  // prompt is cached: every generation shares it.
  const stream = client.beta.messages.stream({
    model,
    max_tokens: 32000,
    ...(model.startsWith('claude-haiku') ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }),
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: DESIGN_SCHEMA as unknown as Record<string, unknown> } },
    system: [{ type: 'text', text: DESIGN_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: [{ type: 'text', text: `Design this flat.\n${text}` }] }],
  }, { signal: request.signal });
  const response = await stream.finalMessage();
  if (response.stop_reason === 'refusal') throw new Error('The designer declined');
  if (response.stop_reason === 'max_tokens') throw new Error('The designer ran out of room');
  const block = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text');
  if (!block) throw new Error(`The designer returned nothing (stop_reason: ${response.stop_reason})`);

  const proposal = validateProposal(JSON.parse(block.text) as { rooms?: RawRoom[] }, request.plan, offer, response.model, request.styleId);
  const u = response.usage;
  const price = PRICE_PER_MTOK[model] ?? PRICE_PER_MTOK[DESIGN_MODEL];
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const costUsd = (u.input_tokens * price.input + u.output_tokens * price.output + cacheRead * price.cacheRead + cacheWrite * price.cacheWrite) / 1_000_000;
  return {
    proposal,
    usage: { inputTokens: u.input_tokens, outputTokens: u.output_tokens, cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite, durationMs: Date.now() - started, model: response.model, costUsd: Math.round(costUsd * 10000) / 10000, seed },
  };
}
