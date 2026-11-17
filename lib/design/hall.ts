/**
 * The entrance hall (the rulebook, 6 Nov 2026 — E-4, E-6, E-7, E-8): one built-in wardrobe by the
 * front door, to the ceiling, its sections side by side as one piece of furniture — the boiler's
 * ventilated cupboard, the coats, the shoes — in the joiner's material (`cabinet` decor,
 * `joinery.ts`); and a full-height mirror on the wall across from it. The coat rack and the shoe
 * cabinet the program laid out give way to the wardrobe; where the hall is too narrow for it, they
 * stay.
 *
 * The boiler's section is there only where the flat's boiler (`plan.technical`) hangs in this hall,
 * a hall wide enough for its cupboard, at the wardrobe — the section at the end it hangs at — with no
 * cabinet of its own (`cabinet` absent or null): the wardrobe is then its cupboard. A boiler with a
 * cabinet, one in another room and none at all get no section (it was built in every hall wardrobe,
 * and paid for twice beside a boiler's own cabinet). `housedBoilerSpot` says where it hangs in one.
 *
 * Pure: `generateScene` runs it after the bathroom pass.
 */

import { candidatesFor, isFullHeightMirror, quantityFor, toSceneProduct, type CatalogProduct } from './matcher';
import { pointInPolygon, pointOnEdge, wallEdges, type PlanEdge } from './planGeometry';
import { BOILER_HALL_MIN_WIDTH_M, SHALLOW_WARDROBE_DEPTH_M, WARDROBE_DEPTH_M, rayToPolygon } from './rules';
import { styleRejects } from './styleGuide';
import type { CabinetSection, DecorPiece, PlacedItem, PlanRoom, StyleId, TechnicalPoint, Vec2 } from './types';
import { JOINERY_SLIVER_M, cabinetPiece, freeStretch, joineryFace, joineryMaterial, sectionSpans } from './decor/joinery';
import { freeSpans } from './decor/layout';
import type { RadiatorBody } from './radiators';

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

/** The pieces a hall's wardrobe replaces. */
const REPLACED = new Set(['coat_rack', 'shoe_cabinet']);

export function fitHall(input: HallInput): { items: PlacedItem[]; decor: DecorPiece[] } {
  const { rooms, catalog, styleId } = input;
  let items = [...input.items];
  const decor: DecorPiece[] = [];
  const face = joineryFace(joineryMaterial(catalog, styleId, items));
  // The hall with the front door (else the largest), the one the boiler goes to.
  const halls = rooms.filter((r) => r.type === 'hallway').sort((a, b) => Number(hasEntrance(b)) - Number(hasEntrance(a)) || b.areaM2 - a.areaM2);
  const hall = halls[0];
  if (!hall) return { items, decor };
  // The flat's boiler, where it hangs in this hall with no cabinet of its own: the wardrobe is its
  // cupboard, with a section for it where it hangs — where the hall is wide enough for one there.
  const hallBoiler = (input.technical ?? []).find((p) => p.kind === 'boiler' && p.cabinet == null && (p.roomId === hall.id || (p.roomId == null && pointInPolygon(p.position, hall.polygon))));
  const replaced = items.filter((i) => i.roomId === hall.id && REPLACED.has(i.slot)).map((i) => i.id);

  // The stretch nearest the front door long enough for it — as deep as the hall's clear width in
  // front of it lets it be (`wardrobeFit`): 60 cm from 1.4 m, 35 cm from 1.2 m, else none there. A
  // hall wide enough there for the boiler's cupboard takes a wardrobe only on a stretch long enough
  // for the section, whether or not the boiler is there to take it: the coats take the room then.
  const door = hall.openings.find((o) => o.kind === 'door' && o.exterior);
  const doorAt = door ? openingPoint(hall, door) : null;
  let best: { edge: PlanEdge; from: number; to: number; depth: number; wide: boolean; score: number } | null = null;
  for (const edge of wallEdges(hall)) {
    for (const [a, b] of freeSpans(edge, hall.openings, 0, edge.length, 0.1)) {
      const fit = wardrobeFit(hall, edge, a, b, items, replaced, input.radiators);
      if (!fit) continue;
      const need = COATS_MIN_M + SHOES_M + (fit.wide ? BOILER_SECTION_M : 0);
      if (fit.to - fit.from < need) continue;
      const mid = pointOnEdge(edge, (fit.from + fit.to) / 2 / edge.length);
      const score = doorAt ? -Math.hypot(mid.x - doorAt.x, mid.z - doorAt.z) : fit.to - fit.from;
      if (!best || score > best.score) best = { edge, ...fit, score };
    }
  }
  if (!best) return { items, decor };
  const { depth } = best;
  const boiler = best.wide ? hallBoiler : undefined;
  /** Where the boiler is along a wall, when it hangs on it within the wardrobe's depth. */
  const boilerOn = (edge: PlanEdge): number | null => {
    if (!boiler) return null;
    const off = (boiler.position.x - edge.a.x) * edge.inward.x + (boiler.position.z - edge.a.z) * edge.inward.z;
    const along = (boiler.position.x - edge.a.x) * edge.dir.x + (boiler.position.z - edge.a.z) * edge.dir.z;
    return off >= -0.05 && off <= depth && along >= 0 && along <= edge.length ? along : null;
  };

  // As long as the stretch, to 2.8 m; from the end nearer the door.
  let length = Math.min(HALL_WARDROBE_MAX_M, best.to - best.from);
  if (best.to - best.from - length < JOINERY_SLIVER_M) length = best.to - best.from;
  const nearStart = doorAt ? distanceAlong(best.edge, doorAt, best.from) <= distanceAlong(best.edge, doorAt, best.to) : true;
  const from = nearStart ? best.from : best.to - length;
  // The boiler's section at the end of the wardrobe the boiler hangs at — when it hangs there.
  const at = boilerOn(best.edge);
  const boilerEnd = at == null ? null : at >= from && at <= from + BOILER_SECTION_M ? 'start' : at >= from + length - BOILER_SECTION_M && at <= from + length ? 'end' : null;
  const withBoiler = boilerEnd != null && length >= COATS_MIN_M + SHOES_M + BOILER_SECTION_M;
  // The coats take what is left.
  const coats = Math.min(COATS_MAX_M + (length > HALL_WARDROBE_MAX_M ? length - HALL_WARDROBE_MAX_M : 0), Math.max(COATS_MIN_M, length - SHOES_M - (withBoiler ? BOILER_SECTION_M : 0)));
  const shoes = Math.max(SHOES_M, length - coats - (withBoiler ? BOILER_SECTION_M : 0));
  const height = Math.round(hall.heightM * 1000);
  const deep = Math.round(depth * 1000);
  const boilerSection: CabinetSection = { kind: 'boiler', widthMm: mm(BOILER_SECTION_M), heightMm: height, depthMm: deep };
  // The coats by the door, the shoes past them.
  const rest: CabinetSection[] = [
    { kind: 'coats', widthMm: mm(coats), heightMm: height, depthMm: deep },
    { kind: 'shoes', widthMm: mm(shoes), heightMm: height, depthMm: deep },
  ];
  const along = nearStart ? rest : [...rest].reverse();
  const ordered = !withBoiler ? along : boilerEnd === 'start' ? [boilerSection, ...along] : [...along, boilerSection];
  decor.push(cabinetPiece(`decor-${hall.id}-hall-wardrobe`, hall, best.edge, from, ordered, face));
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
  return { items, decor };
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
 * (`freeStretch`). `wide`: wide enough there for the boiler's cupboard.
 */
function wardrobeFit(hall: PlanRoom, edge: PlanEdge, a: number, b: number, items: readonly PlacedItem[], replaced: readonly string[], radiators: readonly RadiatorBody[] | undefined): { from: number; to: number; depth: number; wide: boolean } | null {
  const width = widthInFront(hall, edge, a, b);
  if (width < HALL_SHALLOW_MIN_WIDTH_M - 1e-6) return null;
  const depth = width >= HALL_WARDROBE_MIN_WIDTH_M - 1e-6 ? WARDROBE_DEPTH_M : SHALLOW_WARDROBE_DEPTH_M;
  const stretch = freeStretch(hall, edge, (a + b) / 2, items, replaced, depth, [], [], { radiators, strict: true });
  return stretch ? { from: stretch[0], to: stretch[1], depth, wide: width >= BOILER_HALL_MIN_WIDTH_M - 1e-6 } : null;
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
