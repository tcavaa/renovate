/**
 * The entrance hall (the rulebook, 6 Nov 2026 — E-4, E-6, E-7, E-8): one built-in wardrobe by the
 * front door, to the ceiling, its sections side by side as one piece of furniture — the boiler's
 * ventilated section, the coats, the shoes — in the joiner's material (`cabinet` decor,
 * `joinery.ts`); and a full-height mirror on the wall across from it. The coat rack and the shoe
 * cabinet the program laid out give way to the wardrobe; where the hall is too narrow for it, they
 * stay.
 *
 * The boiler (Nini, 23 Nov 2026, decision 5): where the flat's boiler (`plan.technical`) hangs in
 * this hall on the stretch of wall the wardrobe is built on, in a hall wide enough for its
 * cupboard, the wardrobe takes it in — a ventilated section of its own (`BOILER_SECTION_M`, the
 * boiler's width and its service room either side when wider), apart from the coats and the shoes,
 * where the boiler really hangs (the wardrobe run on to it along its stretch), with the coats and
 * the shoes either side — and that boiler takes no cabinet of its own (`HallResult.housed`,
 * `withHousedBoiler`): one enclosure, one charge. A separate cupboard stays only where the section
 * would cost the essential storage (the coats' 80 cm and the shoes' 60 cm no longer fit beside it)
 * or the access (the boiler half off the stretch, a wardrobe too shallow for it) — and a cabinet
 * the person chose stays theirs. A boiler that keeps its cupboard, or hangs bare, is kept clear of:
 * the wardrobe is not built over it. No section is ever built where no boiler hangs.
 * `housedBoilerSpot` says where it hangs in one.
 *
 * Pure: `generateScene` runs it after the bathroom pass.
 */

import { candidatesFor, isFullHeightMirror, quantityFor, toSceneProduct, type CatalogProduct } from './matcher';
import { pointInPolygon, pointOnEdge, wallEdges, type PlanEdge } from './planGeometry';
import { BOILER_CABINET_CLEARANCE_M, BOILER_DEFAULT_SIZE_M, BOILER_HALL_MIN_WIDTH_M, SHALLOW_WARDROBE_DEPTH_M, WARDROBE_DEPTH_M, rayToPolygon } from './rules';
import { styleRejects } from './styleGuide';
import type { CabinetSection, DecorPiece, PlacedItem, PlanRoom, StyleId, TechnicalPoint, Vec2 } from './types';
import { JOINERY_SLIVER_M, cabinetPiece, freeStretch, joineryFace, joineryMaterial, sectionSpans } from './decor/joinery';
import { freeSpans } from './decor/layout';
import type { RadiatorBody } from './radiators';
import { boilerCabinetSize } from './boilerCabinet';

/** The narrowest hall a wardrobe 60 cm deep leaves a way through (80 cm); a shallow one from 1.2 m. */
const HALL_WARDROBE_MIN_WIDTH_M = 1.4;
const HALL_SHALLOW_MIN_WIDTH_M = 1.2;
/** The sections' widths, metres. */
const BOILER_SECTION_M = 0.65;
const COATS_MIN_M = 0.8;
const COATS_MAX_M = 1.4;
const SHOES_M = 0.6;
/** The longest the wardrobe grows to on its own. */
const HALL_WARDROBE_MAX_M = 2.8;
/** The mirror across from it: door height, about 60 cm wide (E-8). */
export const HALL_MIRROR_WIDTH_M = 0.6;
export const HALL_MIRROR_HEIGHT_M = 2.0;

export interface HallInput {
  rooms: readonly PlanRoom[];
  items: PlacedItem[];
  catalog: CatalogProduct[];
  styleId: StyleId;
  /** The flat's technical points (`plan.technical.points`): where its boiler hangs. */
  technical?: readonly TechnicalPoint[];
  /** The flat's radiators (`radiatorBodies`): the wardrobe is not built over one. */
  radiators?: readonly RadiatorBody[];
}

export interface HallResult {
  items: PlacedItem[];
  decor: DecorPiece[];
  /** The boiler the wardrobe's section houses (its point's id): it takes no cabinet of its own (`withHousedBoiler`). */
  housed: string | null;
}

/** The pieces a hall's wardrobe replaces. */
const REPLACED = new Set(['coat_rack', 'shoe_cabinet']);

/** A free span of a wall the wardrobe may take, `lo`/`hi` set where a boiler's enclosure cuts it. */
type Span = { a: number; b: number; lo?: number; hi?: number };
type Best = { edge: PlanEdge; from: number; to: number; depth: number; wide: boolean; score: number };

export function fitHall(input: HallInput): HallResult {
  const { rooms, catalog, styleId } = input;
  let items = [...input.items];
  const decor: DecorPiece[] = [];
  const face = joineryFace(joineryMaterial(catalog, styleId, items));
  // The hall with the front door (else the largest), the one the boiler goes to.
  const halls = rooms.filter((r) => r.type === 'hallway').sort((a, b) => Number(hasEntrance(b)) - Number(hasEntrance(a)) || b.areaM2 - a.areaM2);
  const hall = halls[0];
  if (!hall) return { items, decor, housed: null };
  // The boilers hanging in this hall; those the wardrobe may take in — not one whose cabinet the person chose.
  const boilers = (input.technical ?? []).filter((p) => p.kind === 'boiler' && (p.roomId === hall.id || (p.roomId == null && pointInPolygon(p.position, hall.polygon))));
  const takeable = boilers.filter((p) => !(p.cabinet && p.cabinetChosen));
  const replaced = items.filter((i) => i.roomId === hall.id && REPLACED.has(i.slot)).map((i) => i.id);

  // The stretch nearest the front door long enough for it — as deep as the hall's clear width in
  // front of it lets it be (`wardrobeFit`): 60 cm from 1.4 m, 35 cm from 1.2 m, else none there. A
  // hall wide enough there for the boiler's cupboard takes a wardrobe only on a stretch long enough
  // for the section, whether or not the boiler is there to take it: the coats take the room then —
  // but for a hall whose boiler keeps a cupboard of its own (`reserve` false).
  const door = hall.openings.find((o) => o.kind === 'door' && o.exterior);
  const doorAt = door ? openingPoint(hall, door) : null;
  const search = (kept: readonly TechnicalPoint[], reserve: boolean): Best | null => {
    let best: Best | null = null;
    for (const edge of wallEdges(hall)) {
      for (const span of clearOfBoilers(hall, edge, freeSpans(edge, hall.openings, 0, edge.length, 0.1), kept)) {
        const fit = wardrobeFit(hall, edge, span, items, replaced, input.radiators);
        if (!fit) continue;
        const need = COATS_MIN_M + SHOES_M + (fit.wide && reserve ? BOILER_SECTION_M : 0);
        if (fit.to - fit.from < need) continue;
        const mid = pointOnEdge(edge, (fit.from + fit.to) / 2 / edge.length);
        const score = doorAt ? -Math.hypot(mid.x - doorAt.x, mid.z - doorAt.z) : fit.to - fit.from;
        if (!best || score > best.score) best = { edge, ...fit, score };
      }
    }
    return best;
  };
  // First as though the boilers it may take in were not there; where none of them can be, again
  // kept clear of every boiler in the hall, with no room kept for a section none will fill.
  let best = search(boilers.filter((p) => !takeable.includes(p)), true);
  let built = best ? withBoilerSection(hall, best, takeable, doorAt) : null;
  if (!built && boilers.length > 0) best = search(boilers, false);
  if (!best) return { items, decor, housed: null };
  built ??= plainWardrobe(hall, best, doorAt);
  decor.push(cabinetPiece(`decor-${hall.id}-hall-wardrobe`, hall, best.edge, built.from, built.sections, face));
  items = items.filter((i) => !replaced.includes(i.id));

  // The mirror across from it: tall, flat on the facing wall's free stretch (E-8). The hall's
  // mirror as matched hangs over the console and is one that fits over it (`slotPool`); the stretch
  // is free from the floor up, so there it is the full-height one — the catalogue's, when the
  // hall's own is not.
  const hung = items.find((i) => i.roomId === hall.id && i.slot === 'mirror');
  const across = facingWall(hall, best.edge);
  if (hung && across) {
    const stretch = freeStretch(hall, across, across.length / 2, items, [hung.id], 0.2);
    if (stretch && stretch[1] - stretch[0] >= HALL_MIRROR_WIDTH_M) {
      const at = pointOnEdge(across, (stretch[0] + stretch[1]) / 2 / across.length);
      const full = hung.size.height >= 1.4 ? null : fullHeightMirror(catalog, styleId);
      const mirror = full && full.widthCm && full.depthCm && full.heightCm ? { ...hung, product: toSceneProduct(full, quantityFor(hung)), size: { width: full.widthCm / 100, depth: full.depthCm / 100, height: full.heightCm / 100 } } : hung;
      const tall = mirror.size.height >= 1.4;
      const off = mirror.size.depth / 2 + 0.005;
      items = items.map((i) =>
        i.id === mirror.id ? { ...mirror, position: { x: at.x + across.inward.x * off, z: at.z + across.inward.z * off }, rotation: across.facing, elevationM: tall ? Math.max(0.03, Math.min(0.3, HALL_MIRROR_HEIGHT_M - mirror.size.height)) : Math.max(0.3, 1.5 - mirror.size.height / 2) } : i
      );
    }
  }
  return { items, decor, housed: built.housed ?? null };
}

/** The catalogue's full-height mirror for a flat of this style: the style's own first, none the style keeps out. */
function fullHeightMirror(catalog: CatalogProduct[], styleId: StyleId): CatalogProduct | null {
  const all = candidatesFor('mirror', catalog, styleId).filter(isFullHeightMirror);
  return all.find((p) => !styleRejects(p, styleId)) ?? all[0] ?? null;
}

/**
 * Where the boiler hangs in a hall wardrobe's boiler section (the middle of it, in front of the
 * wall), or null when the flat's joinery has none.
 */
export function housedBoilerSpot(rooms: readonly PlanRoom[], decor: readonly DecorPiece[] = []): { room: PlanRoom; position: Vec2 } | null {
  for (const piece of decor) {
    if (piece.family !== 'cabinet' || piece.wallIndex == null) continue;
    const span = sectionSpans(piece).find((s) => s.section.kind === 'boiler');
    const room = rooms.find((r) => r.id === piece.roomId);
    const edge = room ? wallEdges(room).find((e) => e.index === piece.wallIndex) : undefined;
    if (!span || !room || !edge) continue;
    const at = pointOnEdge(edge, (span.x0 + span.x1) / 2 / edge.length);
    return { room, position: { x: Math.round((at.x + edge.inward.x * 0.2) * 100) / 100, z: Math.round((at.z + edge.inward.z * 0.2) * 100) / 100 } };
  }
  return null;
}

const mm = (m: number) => Math.round(m * 1000);

function hasEntrance(room: PlanRoom): boolean {
  return room.openings.some((o) => o.kind === 'door' && o.exterior);
}

/**
 * The wardrobe the free span `[a, b]` of `edge` (clear of its doors and windows) takes: 60 cm deep
 * where the hall's clear width in front of the span is 1.4 m or more (80 cm left to pass), 35 cm
 * where it is 1.2 m or more, none narrower — on the stretch of the span it then has clear
 * (`freeStretch`), short of a boiler's enclosure that cuts the span (`lo`, `hi`). `wide`: wide
 * enough there for the boiler's cupboard.
 */
function wardrobeFit(hall: PlanRoom, edge: PlanEdge, span: Span, items: readonly PlacedItem[], replaced: readonly string[], radiators: readonly RadiatorBody[] | undefined): { from: number; to: number; depth: number; wide: boolean } | null {
  const { a, b } = span;
  const width = widthInFront(hall, edge, a, b);
  if (width < HALL_SHALLOW_MIN_WIDTH_M - 1e-6) return null;
  const depth = width >= HALL_WARDROBE_MIN_WIDTH_M - 1e-6 ? WARDROBE_DEPTH_M : SHALLOW_WARDROBE_DEPTH_M;
  const stretch = freeStretch(hall, edge, (a + b) / 2, items, replaced, depth, [], [], { radiators, strict: true });
  if (!stretch) return null;
  const from = span.lo != null ? Math.max(stretch[0], span.lo) : stretch[0];
  const to = span.hi != null ? Math.min(stretch[1], span.hi) : stretch[1];
  return to - from > 0.05 ? { from, to, depth, wide: width >= BOILER_HALL_MIN_WIDTH_M - 1e-6 } : null;
}

/** A millimetre: how far in from a wall or a corner the hall's width is measured. */
const MEASURE_IN_M = 0.001;

/**
 * The hall's clear width in front of `edge` from `from` to `to` along it: the least distance, square
 * off the wall, to the outline across — measured at the stretch's ends and either side of every
 * corner of the outline that falls along it (where the width can change), so an L-shaped hall's
 * narrow arm is read as narrow, not as its bounding box's width.
 */
export function widthInFront(room: Pick<PlanRoom, 'polygon'>, edge: PlanEdge, from: number, to: number): number {
  const along = (p: Vec2) => (p.x - edge.a.x) * edge.dir.x + (p.z - edge.a.z) * edge.dir.z;
  const lo = from + MEASURE_IN_M;
  const hi = to - MEASURE_IN_M;
  if (hi < lo) return 0;
  const spots = [lo, hi, ...room.polygon.flatMap((p) => [along(p) - MEASURE_IN_M, along(p) + MEASURE_IN_M])].filter((s) => s >= lo - 1e-9 && s <= hi + 1e-9);
  let least = Infinity;
  for (const s of spots) {
    const start = { x: edge.a.x + edge.dir.x * s + edge.inward.x * MEASURE_IN_M, z: edge.a.z + edge.dir.z * s + edge.inward.z * MEASURE_IN_M };
    const hit = rayToPolygon(start, edge.inward, room.polygon);
    if (hit != null) least = Math.min(least, hit + MEASURE_IN_M);
  }
  return least;
}

function openingPoint(room: PlanRoom, opening: PlanRoom['openings'][number]): Vec2 | null {
  const edge = wallEdges(room).find((e) => e.index === opening.wallIndex);
  return edge ? pointOnEdge(edge, opening.t) : null;
}

function distanceAlong(edge: PlanEdge, p: Vec2, s: number): number {
  const at = pointOnEdge(edge, s / edge.length);
  return Math.hypot(at.x - p.x, at.z - p.z);
}

/** The wall across the room from `edge`: facing it, the nearest such. */
function facingWall(room: PlanRoom, edge: PlanEdge): PlanEdge | null {
  const opposite = wallEdges(room).filter((e) => e.inward.x * edge.inward.x + e.inward.z * edge.inward.z < -0.9);
  return opposite.sort((a, b) => b.length - a.length)[0] ?? null;
}

/** A wardrobe as built: where it starts along its wall, its sections left to right, and the boiler its section houses. */
type Built = { from: number; sections: CabinetSection[]; housed?: string };

/** The wardrobe on `best` with no boiler's section: as long as the stretch, to 2.8 m, from the end nearer the door; the coats by the door, the shoes past them. */
function plainWardrobe(hall: PlanRoom, best: Best, doorAt: Vec2 | null): Built {
  let length = Math.min(HALL_WARDROBE_MAX_M, best.to - best.from);
  if (best.to - best.from - length < JOINERY_SLIVER_M) length = best.to - best.from;
  const nearStart = doorAt ? distanceAlong(best.edge, doorAt, best.from) <= distanceAlong(best.edge, doorAt, best.to) : true;
  const from = nearStart ? best.from : best.to - length;
  const coats = Math.min(COATS_MAX_M + (length > HALL_WARDROBE_MAX_M ? length - HALL_WARDROBE_MAX_M : 0), Math.max(COATS_MIN_M, length - SHOES_M));
  const shoes = Math.max(SHOES_M, length - coats);
  const rest = storage(hall, best.depth, coats, shoes);
  return { from, sections: nearStart ? rest : [...rest].reverse() };
}

/** The coats and the shoes, in that order: two sections of the hall's height. */
function storage(hall: PlanRoom, depth: number, coats: number, shoes: number): CabinetSection[] {
  return [section(hall, depth, 'coats', coats), section(hall, depth, 'shoes', shoes)];
}

function section(hall: PlanRoom, depth: number, kind: CabinetSection['kind'], width: number): CabinetSection {
  return { kind, widthMm: mm(width), heightMm: Math.round(hall.heightM * 1000), depthMm: Math.round(depth * 1000) };
}

/** The boiler's width and depth: its product's, else a wall-hung combi's. */
function boilerSize(point: TechnicalPoint): { width: number; depth: number } {
  return point.sizeM ?? BOILER_DEFAULT_SIZE_M;
}

/** Where a boiler hangs along `edge`, when it hangs on that wall within `depth` of it. */
function boilerAlong(edge: PlanEdge, point: TechnicalPoint, depth: number): number | null {
  const off = (point.position.x - edge.a.x) * edge.inward.x + (point.position.z - edge.a.z) * edge.inward.z;
  const along = (point.position.x - edge.a.x) * edge.dir.x + (point.position.z - edge.a.z) * edge.dir.z;
  return off >= -0.05 && off <= depth && along >= 0 && along <= edge.length ? along : null;
}

/**
 * The wardrobe on `best` with a ventilated section round a boiler that hangs on its stretch (one
 * of `boilers`), or null where none does or none can be taken in (decision 5): the section where
 * the boiler hangs, its width `BOILER_SECTION_M` or the boiler's and its service room either side,
 * the boiler wholly on the stretch and the wardrobe deep enough to take it with that room in
 * front; the wardrobe as long as it would be without it (`plainWardrobe`), run on along the
 * stretch to the section; a bit of wall under `JOINERY_SLIVER_M` beside the section joined to it.
 * Either side of it the coats (80 cm at least, by the door where they fit) and the shoes (60 cm):
 * on the two sides, or both on one and a plain cupboard on the other. Where they no longer fit,
 * null — the boiler keeps a cupboard of its own.
 */
function withBoilerSection(hall: PlanRoom, best: Best, boilers: readonly TechnicalPoint[], doorAt: Vec2 | null): Built | null {
  if (!best.wide) return null;
  const c = BOILER_CABINET_CLEARANCE_M;
  for (const boiler of boilers) {
    const at = boilerAlong(best.edge, boiler, best.depth);
    if (at == null || at < best.from - 1e-6 || at > best.to + 1e-6) continue;
    const size = boilerSize(boiler);
    // Its access: the boiler wholly on the stretch, and its service room in front of it inside.
    if (size.depth + c > best.depth + 1e-6 || at - size.width / 2 < best.from - 1e-6 || at + size.width / 2 > best.to + 1e-6) continue;
    const width = Math.max(BOILER_SECTION_M, size.width + 2 * c);
    let s0 = Math.min(Math.max(best.from, at - width / 2), best.to - width);
    let s1 = s0 + width;
    // As long as it would be without the boiler, from the end nearer the door — run on to the section.
    const plain = plainWardrobe(hall, best, doorAt);
    const plainTo = plain.from + plain.sections.reduce((s, x) => s + x.widthMm, 0) / 1000;
    let from = Math.min(plain.from, s0);
    let to = Math.max(plainTo, s1);
    if (from - best.from < JOINERY_SLIVER_M) from = best.from;
    if (best.to - to < JOINERY_SLIVER_M) to = best.to;
    // No sliver of cupboard beside the section: the section takes it.
    if (s0 - from < JOINERY_SLIVER_M) s0 = from;
    if (to - s1 < JOINERY_SLIVER_M) s1 = to;
    const nearStart = doorAt ? distanceAlong(best.edge, doorAt, best.from) <= distanceAlong(best.edge, doorAt, best.to) : true;
    const sides = besideBoiler(hall, best.depth, s0 - from, to - s1, nearStart);
    if (!sides) continue;
    return { from, sections: [...sides.left, section(hall, best.depth, 'boiler', s1 - s0), ...sides.right], housed: boiler.id };
  }
  return null;
}

/**
 * The sections either side of a boiler's: the coats and the shoes in the `left` and `right` widths
 * (one of them may be nothing), the coats nearer the door (`nearStart`: the door at the left end)
 * where they fit — on two sides, or both on one with a plain cupboard on the other. Null where the
 * coats' 80 cm and the shoes' 60 cm do not both fit.
 */
function besideBoiler(hall: PlanRoom, depth: number, left: number, right: number, nearStart: boolean): { left: CabinetSection[]; right: CabinetSection[] } | null {
  const doorSide = nearStart ? left : right;
  const farSide = nearStart ? right : left;
  const one = (width: number, kind: CabinetSection['kind']) => (width > 0.0005 ? [section(hall, depth, kind, width)] : []);
  // Both on one side: the coats as the wardrobe without a boiler has them, the shoes the rest; coats by the door.
  const both = (width: number) => {
    const coats = Math.min(COATS_MAX_M + (width > HALL_WARDROBE_MAX_M ? width - HALL_WARDROBE_MAX_M : 0), Math.max(COATS_MIN_M, width - SHOES_M));
    const pair = storage(hall, depth, coats, width - coats);
    // Left to right: the coats first where the door is to the left.
    return nearStart ? pair : [...pair].reverse();
  };
  let door: CabinetSection[];
  let far: CabinetSection[];
  if (doorSide >= COATS_MIN_M - 1e-6 && farSide >= SHOES_M - 1e-6) [door, far] = [one(doorSide, 'coats'), one(farSide, 'shoes')];
  else if (farSide >= COATS_MIN_M - 1e-6 && doorSide >= SHOES_M - 1e-6) [door, far] = [one(doorSide, 'shoes'), one(farSide, 'coats')];
  else if (doorSide >= COATS_MIN_M + SHOES_M - 1e-6) [door, far] = [both(doorSide), one(farSide, 'doors')];
  else if (farSide >= COATS_MIN_M + SHOES_M - 1e-6) [door, far] = [one(doorSide, 'doors'), both(farSide)];
  else return null;
  return nearStart ? { left: door, right: far } : { left: far, right: door };
}

/**
 * The free spans of `edge` less the floor a boiler hanging on it takes — its cupboard's width
 * (`boilerCabinetSize`), a bare one's as wide — for each of `kept`: the boilers the wardrobe is not
 * to be built over. Where a span is cut, the cut end is marked (`lo`, `hi`).
 */
const SPAN_MARGIN_M = 0.1;

function clearOfBoilers(hall: PlanRoom, edge: PlanEdge, spans: Array<[number, number]>, kept: readonly TechnicalPoint[]): Span[] {
  let out: Span[] = spans.map(([a, b]) => ({ a, b }));
  for (const boiler of kept) {
    const at = boilerAlong(edge, boiler, WARDROBE_DEPTH_M);
    if (at == null) continue;
    const half = boilerCabinetSize(boiler, hall).width / 2;
    out = out.flatMap((s) => {
      // The joinery's stretch reaches a little past the span (`freeStretch` keeps 5 cm off an
      // opening, the span 10 cm): a cupboard just past its end still cuts it.
      if (at + half <= s.a - SPAN_MARGIN_M || at - half >= s.b + SPAN_MARGIN_M) return [s];
      const parts: Span[] = [];
      if (at - half > s.a + 0.05) parts.push({ ...s, b: Math.min(s.b, at - half), hi: Math.min(s.hi ?? Infinity, at - half) });
      if (at + half < s.b - 0.05) parts.push({ ...s, a: Math.max(s.a, at + half), lo: Math.max(s.lo ?? -Infinity, at + half) });
      return parts;
    });
  }
  return out;
}
