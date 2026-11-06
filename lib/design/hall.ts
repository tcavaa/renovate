/**
 * The entrance hall (the rulebook, 6 Nov 2026 — E-4, E-6, E-7, E-8): one built-in wardrobe by the
 * front door, to the ceiling, its sections side by side as one piece of furniture — the boiler's
 * ventilated cupboard, the coats, the shoes — in the joiner's material (`cabinet` decor,
 * `joinery.ts`); and a full-height mirror on the wall across from it. The coat rack and the shoe
 * cabinet the program laid out give way to the wardrobe; where the hall is too narrow for it, they
 * stay.
 *
 * The boiler's section is there when the flat's boiler is the hall's (a hall wide enough for its
 * cupboard — the design rules' order); the technical placement then hangs the boiler in it
 * (`housedBoilerSpot`) and the boiler takes no cabinet of its own (`withBoilerCabinets` leaves one
 * with `cabinet: null`).
 *
 * Pure: `generateScene` runs it after the bathroom pass.
 */

import type { CatalogProduct } from './matcher';
import { pointOnEdge, wallEdges, type PlanEdge } from './planGeometry';
import { BOILER_HALL_MIN_WIDTH_M, SHALLOW_WARDROBE_DEPTH_M, WARDROBE_DEPTH_M } from './rules';
import type { CabinetSection, DecorPiece, PlacedItem, PlanRoom, StyleId, Vec2 } from './types';
import { JOINERY_SLIVER_M, cabinetPiece, freeStretch, joineryFace, joineryMaterial, sectionSpans } from './decor/joinery';
import { freeSpans } from './decor/layout';

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
  const narrow = narrowSide(hall);
  if (narrow < HALL_SHALLOW_MIN_WIDTH_M) return { items, decor };
  const depth = narrow >= HALL_WARDROBE_MIN_WIDTH_M ? WARDROBE_DEPTH_M : SHALLOW_WARDROBE_DEPTH_M;
  const withBoiler = narrow >= BOILER_HALL_MIN_WIDTH_M;
  const replaced = items.filter((i) => i.roomId === hall.id && REPLACED.has(i.slot)).map((i) => i.id);
  const need = COATS_MIN_M + SHOES_M + (withBoiler ? BOILER_SECTION_M : 0);

  // The stretch nearest the front door long enough for it.
  const door = hall.openings.find((o) => o.kind === 'door' && o.exterior);
  const doorAt = door ? openingPoint(hall, door) : null;
  let best: { edge: PlanEdge; from: number; to: number; score: number } | null = null;
  for (const edge of wallEdges(hall)) {
    for (const [a, b] of freeSpans(edge, hall.openings, 0, edge.length, 0.1)) {
      const stretch = freeStretch(hall, edge, (a + b) / 2, items, replaced, depth);
      if (!stretch || stretch[1] - stretch[0] < need) continue;
      const mid = pointOnEdge(edge, (stretch[0] + stretch[1]) / 2 / edge.length);
      const score = doorAt ? -Math.hypot(mid.x - doorAt.x, mid.z - doorAt.z) : stretch[1] - stretch[0];
      if (!best || score > best.score) best = { edge, from: stretch[0], to: stretch[1], score };
    }
  }
  if (!best) return { items, decor };

  // As long as the stretch, to 2.8 m; from the end nearer the door. The coats take what is left.
  let length = Math.min(HALL_WARDROBE_MAX_M, best.to - best.from);
  if (best.to - best.from - length < JOINERY_SLIVER_M) length = best.to - best.from;
  const coats = Math.min(COATS_MAX_M + (length > HALL_WARDROBE_MAX_M ? length - HALL_WARDROBE_MAX_M : 0), Math.max(COATS_MIN_M, length - SHOES_M - (withBoiler ? BOILER_SECTION_M : 0)));
  const shoes = Math.max(SHOES_M, length - coats - (withBoiler ? BOILER_SECTION_M : 0));
  const height = Math.round(hall.heightM * 1000);
  const deep = Math.round(depth * 1000);
  const sections: CabinetSection[] = [
    ...(withBoiler ? [{ kind: 'boiler' as const, widthMm: mm(BOILER_SECTION_M), heightMm: height, depthMm: deep }] : []),
    { kind: 'coats', widthMm: mm(coats), heightMm: height, depthMm: deep },
    { kind: 'shoes', widthMm: mm(shoes), heightMm: height, depthMm: deep },
  ];
  // The boiler's end of the wardrobe towards the door.
  const nearStart = doorAt ? distanceAlong(best.edge, doorAt, best.from) <= distanceAlong(best.edge, doorAt, best.to) : true;
  const from = nearStart ? best.from : best.to - length;
  const ordered = nearStart ? sections : [...sections].reverse();
  decor.push(cabinetPiece(`decor-${hall.id}-hall-wardrobe`, hall, best.edge, from, ordered, face));
  items = items.filter((i) => !replaced.includes(i.id));

  // The mirror across from it: tall, flat on the facing wall's free stretch (E-8).
  const mirror = items.find((i) => i.roomId === hall.id && i.slot === 'mirror');
  const across = facingWall(hall, best.edge);
  if (mirror && across) {
    const stretch = freeStretch(hall, across, across.length / 2, items, [mirror.id], 0.2);
    if (stretch && stretch[1] - stretch[0] >= HALL_MIRROR_WIDTH_M) {
      const at = pointOnEdge(across, (stretch[0] + stretch[1]) / 2 / across.length);
      const tall = mirror.size.height >= 1.4;
      const off = mirror.size.depth / 2 + 0.005;
      items = items.map((i) =>
        i.id === mirror.id ? { ...mirror, position: { x: at.x + across.inward.x * off, z: at.z + across.inward.z * off }, rotation: across.facing, elevationM: tall ? Math.max(0.03, Math.min(0.3, HALL_MIRROR_HEIGHT_M - mirror.size.height)) : Math.max(0.3, 1.5 - mirror.size.height / 2) } : i
      );
    }
  }
  return { items, decor };
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

function narrowSide(room: PlanRoom): number {
  const xs = room.polygon.map((p) => p.x);
  const zs = room.polygon.map((p) => p.z);
  return Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
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
