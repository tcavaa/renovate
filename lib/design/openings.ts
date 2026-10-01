/**
 * Editing doors and windows after the plan is laid out.
 *
 * Openings live on a room's polygon edge as (wallIndex, t). A wall between two rooms exists
 * twice — each room extrudes its own — so an interior door is *two* openings, one per room,
 * that must stay on the same spot in the world. Every move here keeps the pair together:
 * the twin is found by the plan's naming convention (`${roomA}-${roomB}-d` ↔
 * `${roomB}-${roomA}-d`) or, for doors added later, by projecting the door's world point
 * onto the neighbour's edge.
 *
 * A railing (მოაჯირი) is an opening too: a balcony's open side, drawn along one of its outer
 * walls from where it starts to where it ends, running into the corners if it likes. The wall
 * is gone there floor to ceiling (`openingSpanUp` in planGeometry), so it comes off the wall's
 * area, and a railing stands in the gap. It is never sold and never has a twin.
 *
 * Pure functions over `PlanRoom[]`; the store wraps them.
 */
import type { RoomType } from '@/lib/calculator/types';
import { alongEdge, edgesParallel, roomEdges, pointOnEdge, wallEdges, type PlanEdge } from './planGeometry';
import { toSceneProduct, type CatalogProduct } from './matcher';
import type { FloorPlan, Opening, OpeningKind, PlanRoom, StyleId, Vec2 } from './types';

export const OPENING_DEFAULTS: Record<OpeningKind, { widthM: number; heightM: number; sillM: number }> = {
  door: { widthM: 0.9, heightM: 2.05, sillM: 0 },
  window: { widthM: 1.4, heightM: 1.4, sillM: 0.9 },
  archway: { widthM: 1.6, heightM: 2.2, sillM: 0 },
  // A balcony railing is a metre high; its width is what was drawn (the whole wall from a card).
  railing: { widthM: 1.2, heightM: 1.0, sillM: 0 },
};

/** Smallest gap kept between an opening's edge and the wall's corner, metres. */
const CORNER_MARGIN_M = 0.15;

/** How close to a corner an opening may come: a railing runs right into it, anything else keeps a hand's breadth. */
export function cornerMargin(kind: OpeningKind): number {
  return kind === 'railing' ? 0 : CORNER_MARGIN_M;
}

/** The shortest railing worth drawing, metres. */
export const MIN_RAILING_M = 0.3;

/**
 * The rooms whose open sides are railings. A balcony's walls stand whatever state the flat is
 * in — they are the building's — and where it is open the person draws a railing instead.
 */
export const RAILING_ROOM_TYPES: readonly RoomType[] = ['balcony'];

export function holdsRailings(room: Pick<PlanRoom, 'type'>): boolean {
  return RAILING_ROOM_TYPES.includes(room.type);
}

/** Railing heights the cards offer, metres. */
export const RAILING_HEIGHT_RANGE_M = { min: 0.8, max: 1.5 } as const;

export function edgeOf(room: PlanRoom, wallIndex: number): PlanEdge | null {
  return roomEdges(room.polygon).find((e) => e.index === wallIndex) ?? null;
}

/**
 * How thick the wall behind a room's edge is: one figure for the whole plan, or each edge's
 * own (the store passes `wallThicknessForEdge`). The other room's copy of a wall is looked for
 * within reach of that thickness (`neighbourTolerance`), and an outer wall onto a balcony is
 * often three times the plan's default: looked for at the default, the balcony was not found
 * behind it, so a window was cut in the room's half of the wall only, and the balcony's half —
 * built as half of a shared wall (`planEdgeWalls`) — stood solid in front of it.
 */
export type WallThickness = number | ((room: PlanRoom, edge: PlanEdge) => number);

function thicknessAt(thickness: WallThickness, room: PlanRoom, edge: PlanEdge): number {
  return typeof thickness === 'number' ? thickness : thickness(room, edge);
}

/** A spot on a wall: which room, which of its edges, and how far along it. */
export interface WallTarget {
  roomId: string;
  wallIndex: number;
  t: number;
}

export function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
}

/**
 * The wall nearest to `point` across every room, within `maxDistance` metres. A shared wall
 * exists twice (once per room); when both copies are equally close, `preferRoomId` wins, so
 * a door dragged along its own room's wall stays that room's door.
 */
export function nearestWall(rooms: PlanRoom[], point: Vec2, maxDistance: number, preferRoomId?: string | null): { room: PlanRoom; edge: PlanEdge; distance: number } | null {
  let best: { room: PlanRoom; edge: PlanEdge; distance: number } | null = null;
  for (const room of rooms) {
    // A room separator is no wall: nothing opens in it, it is open already.
    for (const edge of wallEdges(room)) {
      const distance = distanceToSegment(point, edge.a, edge.b);
      if (distance > maxDistance) continue;
      const closer = !best || distance < best.distance - 1e-6;
      const tie = !!best && Math.abs(distance - best.distance) <= 1e-6 && room.id === preferRoomId && best.room.id !== preferRoomId;
      if (closer || tie) best = { room, edge, distance };
    }
  }
  return best;
}

/** Where the opening's centre sits in the flat. */
export function openingWorldPoint(room: PlanRoom, opening: Opening): Vec2 | null {
  const edge = edgeOf(room, opening.wallIndex);
  return edge ? pointOnEdge(edge, opening.t) : null;
}

/** The `t` along `edge` nearest to `point`, kept far enough from both corners for `widthM` (and `cornerM` more). */
export function projectToEdge(edge: PlanEdge, point: Vec2, widthM: number, cornerM: number = CORNER_MARGIN_M): number {
  const raw = ((point.x - edge.a.x) * edge.dir.x + (point.z - edge.a.z) * edge.dir.z) / edge.length;
  const margin = (widthM / 2 + cornerM) / edge.length;
  if (margin >= 0.5) return 0.5;
  return Math.min(1 - margin, Math.max(margin, raw));
}

/**
 * Edge of `room` that is the other face of the wall `edge` is on (a shared wall), at `point`, if
 * any: side by side with it and within `tolerance` of the point, in any direction — a slanted
 * wall's too (`edgesParallel`; this went by the edges' axes once, and a diagonal wall's door got
 * its other half on whichever wall of the next room started at the same z).
 */
function twinEdge(room: PlanRoom, edge: PlanEdge, point: Vec2, tolerance: number): PlanEdge | null {
  for (const candidate of roomEdges(room.polygon)) {
    if (!edgesParallel(candidate, edge)) continue;
    // The point lies on `edge`; how far it stands off the candidate's line is the wall between.
    const across = Math.abs((point.x - candidate.a.x) * candidate.dir.z - (point.z - candidate.a.z) * candidate.dir.x);
    if (across > tolerance) continue;
    // And the point lies within the candidate's span.
    const along = alongEdge(candidate, point) / candidate.length;
    if (along >= -0.02 && along <= 1.02) return candidate;
  }
  return null;
}

export function twinOf(rooms: PlanRoom[], opening: Opening): { room: PlanRoom; opening: Opening } | null {
  if (!opening.connectsToRoomId) return null;
  const room = rooms.find((r) => r.id === opening.connectsToRoomId);
  if (!room) return null;
  const twinId = `${room.id}-${opening.roomId}-d`;
  const twin = room.openings.find((o) => o.id === twinId || (o.connectsToRoomId === opening.roomId && o.kind === opening.kind && Math.abs(o.widthM - opening.widthM) < 0.01));
  return twin ? { room, opening: twin } : null;
}

/** The flat's openings of one kind, an interior one's two halves once. */
function countOpenings(plan: FloorPlan, kind: OpeningKind): number {
  const seen = new Set<string>();
  let count = 0;
  for (const room of plan.rooms) {
    const ordinal = new Map<string, number>();
    for (const opening of room.openings) {
      if (opening.kind !== kind) continue;
      if (opening.connectsToRoomId) {
        const pairKey = [room.id, opening.connectsToRoomId].sort().join('|');
        const n = ordinal.get(pairKey) ?? 0;
        ordinal.set(pairKey, n + 1);
        if (seen.has(`${pairKey}|${n}`)) continue;
        seen.add(`${pairKey}|${n}`);
      }
      count += 1;
    }
  }
  return count;
}

/** The flat's doors, an interior door's two halves once: what the doors phase hangs. */
export function countDoors(plan: FloorPlan): number {
  return countOpenings(plan, 'door');
}

/** The flat's windows: what a window chosen for the whole flat is bought for. */
export function countWindows(plan: FloorPlan): number {
  return countOpenings(plan, 'window');
}

/**
 * The two halves of an interior door describe one leaf from two sides. Each room's edge runs
 * the other way along the shared wall, so the jamb that is "left" from one room is "right"
 * from the other, and a leaf that swings "in" to one room swings "out" of the other. These
 * give the twin's values for the primary's, so both halves agree on one leaf in the world.
 */
export function mirrorHinge(hinge: Opening['hinge']): NonNullable<Opening['hinge']> {
  return (hinge ?? 'left') === 'left' ? 'right' : 'left';
}

export function mirrorSwing(swing: Opening['swing']): NonNullable<Opening['swing']> {
  return (swing ?? 'in') === 'in' ? 'out' : 'in';
}

/** True when this half of a door does not draw the leaf: its twin, swinging into its own room, does. */
export function leafOnOtherSide(opening: Opening): boolean {
  return opening.kind === 'door' && !!opening.connectsToRoomId && (opening.swing ?? 'in') === 'out';
}

/**
 * The half of an opening between two rooms that stands for both — draws the model, writes the
 * size on the sheet: a door's the half its leaf swings into (`leafOnOtherSide`), anything else's
 * (an archway, a window onto a balcony) the room that sorts first. An opening in one room only is
 * its own.
 */
export function primaryHalf(opening: Opening): boolean {
  if (!opening.connectsToRoomId) return true;
  return opening.kind === 'door' ? !leafOnOtherSide(opening) : opening.roomId < opening.connectsToRoomId;
}

/**
 * Makes every twin agree with its primary on the leaf: plans from before the halves were
 * mirrored (and the parser's doors) had both halves hinged "left" — the opposite corners —
 * and both swinging "in", so the same door showed two leaves. The half met first in room
 * order is the primary; the twin takes the mirrored hinge and swing and the same material
 * and angle.
 */
export function alignTwins(rooms: PlanRoom[]): PlanRoom[] {
  const done = new Set<string>();
  let out = rooms;
  for (const room of rooms) {
    for (const opening of room.openings) {
      if (done.has(opening.id) || opening.kind === 'window' || opening.kind === 'railing' || !opening.connectsToRoomId) continue;
      const twin = twinOf(out, opening);
      if (!twin) continue;
      done.add(opening.id);
      done.add(twin.opening.id);
      const wanted: Partial<Opening> = {
        hinge: mirrorHinge(opening.hinge),
        swing: mirrorSwing(opening.swing),
        ...(opening.material ? { material: opening.material } : {}),
        ...(opening.openAngleDeg != null ? { openAngleDeg: opening.openAngleDeg } : {}),
        ...(opening.product ? { product: opening.product } : {}),
      };
      const same = Object.entries(wanted).every(([k, v]) => {
        const have = (twin.opening as unknown as Record<string, unknown>)[k];
        return k === 'product' ? (have as Opening['product'])?.productId === (v as Opening['product'])?.productId : have === v;
      });
      if (same) continue;
      out = replaceIn(out, twin.room.id, (r) => patchOpening(r, twin.opening.id, wanted));
    }
  }
  return out;
}

const replaceIn = (rooms: PlanRoom[], roomId: string, fn: (room: PlanRoom) => PlanRoom) => rooms.map((r) => (r.id === roomId ? fn(r) : r));
const patchOpening = (room: PlanRoom, id: string, patch: Partial<Opening>): PlanRoom => ({ ...room, openings: room.openings.map((o) => (o.id === id ? { ...o, ...patch } : o)) });

/**
 * The kinds a railing drawn over them takes the place of (`addOpening`): their wall is gone. A
 * door is somebody's way in and is never removed by one — a railing is not drawn over a door.
 */
export const RAILING_REPLACES: readonly OpeningKind[] = ['window', 'archway'];

/**
 * Whether an opening at `t` on its wall would share a stretch with a railing — nothing else
 * stands in a railing's stretch, and a railing stands in nobody's: a door, window or archway on
 * a railing, or a railing on one of them. `spare` are the kinds that do not count (a new railing
 * replaces `RAILING_REPLACES`); `opening.id` is left out, so an opening never clashes with itself.
 */
export function railingClash(room: Pick<PlanRoom, 'openings'>, opening: Pick<Opening, 'kind' | 'wallIndex' | 'widthM'> & { id?: string }, t: number, edgeLength: number, spare: readonly OpeningKind[] = []): boolean {
  const lo = t * edgeLength - opening.widthM / 2;
  const hi = t * edgeLength + opening.widthM / 2;
  return room.openings.some((o) => {
    if (o.id === opening.id || o.wallIndex !== opening.wallIndex || spare.includes(o.kind)) return false;
    if ((o.kind === 'railing') === (opening.kind === 'railing')) return false;
    const centre = o.t * edgeLength;
    return lo < centre + o.widthM / 2 - 1e-3 && centre - o.widthM / 2 < hi - 1e-3;
  });
}

/** Slides an opening along its wall; a paired interior door drags its twin with it. Onto a railing's stretch (or a railing onto a door's, a window's) it does not go: the rooms come back unchanged. */
export function moveOpening(rooms: PlanRoom[], roomId: string, openingId: string, t: number): PlanRoom[] {
  const room = rooms.find((r) => r.id === roomId);
  const opening = room?.openings.find((o) => o.id === openingId);
  if (!room || !opening) return rooms;
  const edge = edgeOf(room, opening.wallIndex);
  if (!edge) return rooms;
  const clamped = projectToEdge(edge, pointOnEdge(edge, t), opening.widthM, cornerMargin(opening.kind));
  if (railingClash(room, opening, clamped, edge.length)) return rooms;
  let next = replaceIn(rooms, roomId, (r) => patchOpening(r, openingId, { t: clamped }));

  const twin = twinOf(rooms, opening);
  if (twin) {
    const twinEdgeRef = edgeOf(twin.room, twin.opening.wallIndex);
    if (twinEdgeRef) {
      const point = pointOnEdge(edge, clamped);
      next = replaceIn(next, twin.room.id, (r) => patchOpening(r, twin.opening.id, { t: projectToEdge(twinEdgeRef, point, twin.opening.widthM) }));
    }
  }
  return next;
}

/**
 * Changes width, height, sill or kind; the twin follows for width and kind. A railing stays a
 * railing and nothing else becomes one: it belongs on a balcony's outer wall, where the railing
 * tool draws it.
 */
export function updateOpening(rooms: PlanRoom[], roomId: string, openingId: string, patch: Partial<Pick<Opening, 'widthM' | 'heightM' | 'sillM' | 'kind'>>): PlanRoom[] {
  const room = rooms.find((r) => r.id === roomId);
  const opening = room?.openings.find((o) => o.id === openingId);
  if (!room || !opening) return rooms;
  if (patch.kind && patch.kind !== opening.kind && (patch.kind === 'railing' || opening.kind === 'railing')) {
    const { kind: _refused, ...rest } = patch;
    patch = rest;
  }
  const edge = edgeOf(room, opening.wallIndex);
  const minWidth = opening.kind === 'railing' ? MIN_RAILING_M : 0.5;
  const widthM = patch.widthM != null ? Math.max(minWidth, Math.min(patch.widthM, (edge?.length ?? 10) - cornerMargin(opening.kind) * 2)) : opening.widthM;
  // Widened onto a railing's stretch (or a railing onto a door's, a window's): refused.
  if (edge && widthM > opening.widthM && railingClash(room, { ...opening, widthM }, projectToEdge(edge, pointOnEdge(edge, opening.t), widthM, cornerMargin(opening.kind)), edge.length)) return rooms;
  const clean: Partial<Opening> = { ...patch, widthM };
  const kindChanged = !!patch.kind && patch.kind !== opening.kind;
  if (patch.kind && kindChanged) {
    // A door becomes a window: it needs a sill and a window's height, and vice versa — and
    // its product, a door, is no window: the studio picks a new one of the new kind.
    const d = OPENING_DEFAULTS[patch.kind];
    clean.heightM = patch.heightM ?? d.heightM;
    clean.sillM = patch.sillM ?? d.sillM;
    if (patch.widthM == null) clean.widthM = Math.min(d.widthM, (edge?.length ?? 10) - CORNER_MARGIN_M * 2);
    clean.product = null;
  }
  let next = replaceIn(rooms, roomId, (r) => patchOpening(r, openingId, clean));
  // Re-clamp the position for the new width.
  if (edge) next = moveOpening(next, roomId, openingId, opening.t);
  const twin = twinOf(rooms, opening);
  if (twin) next = replaceIn(next, twin.room.id, (r) => patchOpening(r, twin.opening.id, { widthM: clean.widthM, heightM: clean.heightM ?? twin.opening.heightM, sillM: clean.sillM ?? twin.opening.sillM, kind: clean.kind ?? twin.opening.kind, ...(kindChanged ? { product: null } : {}) }));
  return next;
}

// ---------------------------------------------------------------------------
// Doors and windows as products
// ---------------------------------------------------------------------------

/**
 * Every door and window is bought as a product where the catalogue has one: the kind a
 * product carries (`products.model3dKind`) is `door` for an interior door, `entrance_door`
 * for one on an exterior wall, `window` for a window. An archway is a hole and buys nothing,
 * and neither does a railing — it comes with the balcony.
 * An opening whose kind has no product yet stays an estimate (`OPENING_ESTIMATE_GEL`) and is
 * drawn with the procedural frame and leaf.
 */
export const OPENING_PRODUCT_KINDS = ['door', 'entrance_door', 'window'] as const;
export type OpeningProductKind = (typeof OPENING_PRODUCT_KINDS)[number];

/** True for a product kind that is a door or a window, not furniture or a fitting. */
export function isOpeningProductKind(kind: string | null | undefined): kind is OpeningProductKind {
  return !!kind && (OPENING_PRODUCT_KINDS as readonly string[]).includes(kind);
}

/** The product kind an opening buys, or null for an archway or a railing. */
export function openingProductKind(opening: Pick<Opening, 'kind' | 'exterior'>): OpeningProductKind | null {
  if (opening.kind === 'window') return 'window';
  if (opening.kind === 'door') return opening.exterior ? 'entrance_door' : 'door';
  return null;
}

/**
 * The catalogue's products for an opening: its own kind first (an entrance door offered
 * for an interior one comes after the interior doors), the style's before the rest, the
 * cheapest first within that. Empty for an archway and a railing.
 */
export function openingCandidates(opening: Pick<Opening, 'kind' | 'exterior'>, catalog: CatalogProduct[], styleId: StyleId): CatalogProduct[] {
  const wanted = openingProductKind(opening);
  if (!wanted) return [];
  const family = wanted === 'window' ? ['window'] : ['door', 'entrance_door'];
  const rank = (p: CatalogProduct) => (p.model3dKind === wanted ? 0 : 1);
  const affinity = (p: CatalogProduct) => (Array.isArray(p.styleTags) && (p.styleTags as string[]).includes(styleId) ? 0 : 1);
  return catalog.filter((p) => !!p.model3dUrl && family.includes(p.model3dKind ?? '')).sort((a, b) => rank(a) - rank(b) || affinity(a) - affinity(b) || a.pricePerUnit - b.pricePerUnit);
}

/** The opening with `product` as what it is (or none). One of it: an interior door is one leaf however many halves it has. */
export function withOpeningProduct(opening: Opening, product: CatalogProduct | null): Opening {
  if (!product) {
    const { product: _dropped, ...rest } = opening;
    return rest;
  }
  return { ...opening, product: toSceneProduct(product, 1) };
}

/**
 * Gives every door and window without a product the best one the catalogue has, keeps a
 * chosen product that is still of the right family, and replaces one that is not (a door
 * that became a window). The two halves of an interior door end up with the same product.
 * Returns the same array when nothing changes.
 */
export function withOpeningProducts(rooms: PlanRoom[], catalog: CatalogProduct[], styleId: StyleId): PlanRoom[] {
  if (catalog.length === 0) return rooms;
  let out = rooms;
  const done = new Set<string>();
  for (const room of rooms) {
    for (const opening of room.openings) {
      if (done.has(opening.id) || !openingProductKind(opening)) continue;
      const candidates = openingCandidates(opening, catalog, styleId);
      const current = opening.product ? candidates.find((c) => c.id === opening.product?.productId) : undefined;
      const chosen = current ?? candidates[0] ?? null;
      const twin = opening.connectsToRoomId ? twinOf(out, opening) : null;
      done.add(opening.id);
      if (twin) done.add(twin.opening.id);
      // Nothing of this family in the catalogue: whatever is chosen stays as it is.
      if (!chosen) continue;
      if (current && (!twin || twin.opening.product?.productId === chosen.id)) continue;
      const product = toSceneProduct(chosen, 1);
      out = replaceIn(out, room.id, (r) => patchOpening(r, opening.id, { product }));
      if (twin) out = replaceIn(out, twin.room.id, (r) => patchOpening(r, twin.opening.id, { product }));
    }
  }
  return out;
}

/** Sets one opening's product (or none) on it and on its twin. */
export function setOpeningProduct(rooms: PlanRoom[], roomId: string, openingId: string, product: CatalogProduct | null): PlanRoom[] {
  const room = rooms.find((r) => r.id === roomId);
  const opening = room?.openings.find((o) => o.id === openingId);
  if (!room || !opening) return rooms;
  const value = product ? toSceneProduct(product, 1) : null;
  let next = replaceIn(rooms, roomId, (r) => patchOpening(r, openingId, { product: value }));
  const twin = twinOf(rooms, opening);
  if (twin) next = replaceIn(next, twin.room.id, (r) => patchOpening(r, twin.opening.id, { product: value }));
  return next;
}

/** Removes an opening and its twin. */
export function removeOpening(rooms: PlanRoom[], roomId: string, openingId: string): PlanRoom[] {
  const room = rooms.find((r) => r.id === roomId);
  const opening = room?.openings.find((o) => o.id === openingId);
  if (!room || !opening) return rooms;
  const twin = twinOf(rooms, opening);
  let next = replaceIn(rooms, roomId, (r) => ({ ...r, openings: r.openings.filter((o) => o.id !== openingId) }));
  if (twin) next = replaceIn(next, twin.room.id, (r) => ({ ...r, openings: r.openings.filter((o) => o.id !== twin.opening.id) }));
  return next;
}

export interface AddOpeningOptions {
  /** Where along the wall (0..1) to put it; otherwise a free spot is found. */
  t?: number;
  /** Size to keep — a moved opening brings its own; otherwise the kind's defaults. */
  widthM?: number;
  heightM?: number;
  sillM?: number;
  /** Doors: which jamb and which way, for the room it is added to; the twin gets the mirror. */
  hinge?: Opening['hinge'];
  swing?: Opening['swing'];
  material?: Opening['material'];
  openAngleDeg?: number;
  /** The product a moved opening brings along. */
  product?: Opening['product'];
}

/** How far past a wall a neighbour's copy of it is looked for. */
const neighbourTolerance = (wallThicknessM: number) => Math.max(wallThicknessM * 2.5, 0.25);

/** The room on the other side of `edge` of `roomId` at `point`, and its copy of the wall — none on an outer wall. */
function neighbourAt(rooms: PlanRoom[], roomId: string, edge: PlanEdge, point: Vec2, wallThicknessM: number): { room: PlanRoom; edge: PlanEdge } | null {
  const tolerance = neighbourTolerance(wallThicknessM);
  for (const r of rooms) {
    if (r.id === roomId) continue;
    const found = twinEdge(r, edge, point, tolerance);
    if (found) return { room: r, edge: found };
  }
  return null;
}

/**
 * Whether a railing may run from `fromM` to `toM` along a wall (metres from the edge's start):
 * the room is a balcony, the edge is a wall and not a room separator, and no room stands behind
 * any of that stretch — a railing is the balcony's open side, never a wall onto the flat.
 */
export function railingFits(rooms: PlanRoom[], roomId: string, wallIndex: number, fromM: number, toM: number, wallThickness: WallThickness, options: { /** false: a door in the way does not count (to tell the person why it was refused). */ doors?: boolean } = {}): boolean {
  const room = rooms.find((r) => r.id === roomId);
  if (!room || !holdsRailings(room)) return false;
  const edge = wallEdges(room).find((e) => e.index === wallIndex);
  if (!edge) return false;
  const wallThicknessM = thicknessAt(wallThickness, room, edge);
  const [lo, hi] = [Math.max(0, Math.min(fromM, toM)), Math.min(edge.length, Math.max(fromM, toM))];
  if (hi - lo < MIN_RAILING_M - 1e-6) return false;
  // Not over a door, nor over another railing: a window or a plain opening under it gives way.
  const spare = options.doors === false ? [...RAILING_REPLACES, 'door' as const] : RAILING_REPLACES;
  const railing = { kind: 'railing' as const, wallIndex, widthM: hi - lo };
  if (railingClash(room, railing, (lo + hi) / 2 / edge.length, edge.length, spare)) return false;
  if (room.openings.some((o) => o.kind === 'railing' && o.wallIndex === wallIndex && lo < o.t * edge.length + o.widthM / 2 - 1e-3 && o.t * edge.length - o.widthM / 2 < hi - 1e-3)) return false;
  // A few spots along it, a little in from its ends so a corner's neighbour does not count.
  const inset = Math.min(0.05, (hi - lo) / 4);
  const spots = [lo + inset, (lo + hi) / 2, hi - inset];
  return spots.every((s) => !neighbourAt(rooms, roomId, edge, pointOnEdge(edge, s / edge.length), wallThicknessM));
}

/**
 * Adds an opening to a wall — the given one, or the longest wall with nothing on it. A door
 * on a wall another room shares gets its twin cut in that room too, so it opens into a room
 * rather than into the back of a wall; a window on a shared wall is refused (returns the
 * rooms unchanged), because a window into the neighbour's bedroom is never what was meant —
 * unless one of the two rooms is a balcony: a window onto the balcony is, and it is cut in both
 * rooms like a door. A railing goes only on a balcony's outer wall (`railingFits`), the whole
 * wall unless a width is given, and takes the place of the windows and plain openings it
 * covers — the wall they were in is gone.
 */
export function addOpening(rooms: PlanRoom[], roomId: string, kind: OpeningKind, wallIndex: number | null, wallThickness: WallThickness, options: AddOpeningOptions = {}): { rooms: PlanRoom[]; openingId: string | null } {
  const room = rooms.find((r) => r.id === roomId);
  if (!room) return { rooms, openingId: null };
  if (kind === 'railing' && !holdsRailings(room)) return { rooms, openingId: null };
  // Never in a room separator: there is no wall to cut a door or a window into.
  const edges = wallEdges(room);
  const defaults = OPENING_DEFAULTS[kind];
  const margin = cornerMargin(kind);
  const minLength = kind === 'railing' ? MIN_RAILING_M : defaults.widthM + margin * 2;
  const chosen =
    (wallIndex != null ? edges.find((e) => e.index === wallIndex) : null) ??
    edges
      .filter((e) => e.length >= minLength)
      .sort((a, b) => {
        const usedA = room.openings.filter((o) => o.wallIndex === a.index).length;
        const usedB = room.openings.filter((o) => o.wallIndex === b.index).length;
        return usedA - usedB || b.length - a.length;
      })[0];
  if (!chosen || chosen.length < minLength) return { rooms, openingId: null };

  const width = Math.min(options.widthM ?? (kind === 'railing' ? chosen.length : defaults.widthM), chosen.length - margin * 2);
  let t = options.t ?? 0.5;
  if (options.t == null && kind !== 'railing') {
    // A free spot along the wall: the centre, or beside what is already there — never on a railing.
    const taken = room.openings.filter((o) => o.wallIndex === chosen.index && o.kind !== 'railing').map((o) => o.t);
    for (const candidate of [0.5, 0.25, 0.75, 0.15, 0.85]) {
      if (!taken.some((x) => Math.abs(x - candidate) * chosen.length < width + 0.2) && !railingClash(room, { kind, wallIndex: chosen.index, widthM: width }, candidate, chosen.length)) {
        t = candidate;
        break;
      }
    }
  }
  t = projectToEdge(chosen, pointOnEdge(chosen, t), width, margin);
  const point = pointOnEdge(chosen, t);
  const neighbour = neighbourAt(rooms, roomId, chosen, point, thicknessAt(wallThickness, room, chosen));

  if (kind === 'window' && neighbour && !holdsRailings(room) && !holdsRailings(neighbour.room)) return { rooms, openingId: null };
  if (kind === 'railing') {
    const centre = t * chosen.length;
    if (!railingFits(rooms, roomId, chosen.index, centre - width / 2, centre + width / 2, wallThickness)) return { rooms, openingId: null };
  } else if (railingClash(room, { kind, wallIndex: chosen.index, widthM: width }, t, chosen.length)) {
    // Nothing goes on a railing: there is no wall there to put it in.
    return { rooms, openingId: null };
  }

  const stamp = Date.now().toString(36);
  const id = `${roomId}-${kind}-${stamp}`;
  const opening: Opening = {
    id,
    kind,
    wallIndex: chosen.index,
    t,
    widthM: width,
    heightM: options.heightM ?? defaults.heightM,
    sillM: options.sillM ?? defaults.sillM,
    roomId,
    connectsToRoomId: neighbour ? neighbour.room.id : null,
    exterior: !neighbour,
    ...(kind === 'door' ? { hinge: options.hinge ?? 'left', swing: options.swing ?? 'in' } : {}),
    ...(options.material ? { material: options.material } : {}),
    ...(options.openAngleDeg != null ? { openAngleDeg: options.openAngleDeg } : {}),
    ...(options.product ? { product: options.product } : {}),
  };
  const centre = t * chosen.length;
  const covered = (o: Opening) => kind === 'railing' && o.wallIndex === chosen.index && (o.kind === 'window' || o.kind === 'archway') && Math.abs(o.t * chosen.length - centre) < (o.widthM + width) / 2 - 1e-6;
  let next = replaceIn(rooms, roomId, (r) => ({ ...r, openings: [...r.openings.filter((o) => !covered(o)), opening] }));
  if (neighbour && neighbour.edge) {
    const twin = twinIn(neighbour, opening, point, `${neighbour.room.id}-${roomId}-d-${stamp}`);
    next = replaceIn(next, neighbour.room.id, (r) => ({ ...r, openings: [...r.openings, twin] }));
  }
  return { rooms: next, openingId: id };
}

/** The twin is the same leaf seen from the other room: the other jamb, the other way. */
function twinIn(neighbour: { room: PlanRoom; edge: PlanEdge }, opening: Opening, point: Vec2, id: string): Opening {
  return {
    ...opening,
    id,
    wallIndex: neighbour.edge.index,
    t: projectToEdge(neighbour.edge, point, opening.widthM),
    roomId: neighbour.room.id,
    connectsToRoomId: opening.roomId,
    exterior: false,
    ...(opening.kind === 'door' ? { hinge: mirrorHinge(opening.hinge), swing: mirrorSwing(opening.swing) } : {}),
  };
}

/**
 * Puts each opening's two halves on the two faces of one wall (`onOneWall`), and cuts the
 * missing half of every door, window and archway that has a room behind its wall but no twin
 * there: the window onto a balcony through a thick outer wall that `addOpening` cut in
 * the room's half only, while the neighbour was still looked for at the plan's default thickness
 * (`WallThickness`), and a door through such a wall the same way — priced as an entrance door,
 * and a solid wall from the other room. A window between two rooms of the flat is left as it is
 * (`addOpening` refuses a new one; a person's window is not taken away). The twin's id is the
 * opening's own, prefixed, so every load agrees on it. Same array when nothing is missing.
 */
export function withOpeningTwins(rooms: PlanRoom[], wallThickness: WallThickness): PlanRoom[] {
  let next = rooms;
  for (const { id: roomId, openings } of rooms) {
    for (const { id } of openings) {
      // Read as it is now: an opening linked to its other half a moment ago is done.
      const room = next.find((r) => r.id === roomId)!;
      const opening = room.openings.find((o) => o.id === id)!;
      if (opening.kind === 'railing') continue;
      if (opening.connectsToRoomId) {
        next = onOneWall(next, room, opening, wallThickness);
        continue;
      }
      const edge = edgeOf(room, opening.wallIndex);
      if (!edge) continue;
      const point = pointOnEdge(edge, opening.t);
      const neighbour = neighbourAt(next, room.id, edge, point, thicknessAt(wallThickness, room, edge));
      if (!neighbour) continue;
      if (opening.kind === 'window' && !holdsRailings(room) && !holdsRailings(neighbour.room)) continue;
      const linked = { connectsToRoomId: neighbour.room.id, exterior: false };
      // The same opening cut from the other side too (a window put in again from the balcony,
      // to see it from there): the two become one opening's halves rather than two windows.
      const across = projectToEdge(neighbour.edge, point, opening.widthM) * neighbour.edge.length;
      const facing = neighbour.room.openings.find((o) => o.kind === opening.kind && o.wallIndex === neighbour.edge.index && Math.abs(o.t * neighbour.edge.length - across) < Math.max(o.widthM, opening.widthM) / 2);
      if (facing) {
        if (facing.connectsToRoomId) continue;
        next = replaceIn(next, room.id, (r) => patchOpening(r, opening.id, linked));
        next = replaceIn(next, neighbour.room.id, (r) => patchOpening(r, facing.id, { connectsToRoomId: room.id, exterior: false }));
        continue;
      }
      const twin = twinIn(neighbour, { ...opening, ...linked }, point, `${neighbour.room.id}-${room.id}-d-${opening.id}`);
      next = replaceIn(next, room.id, (r) => patchOpening(r, opening.id, linked));
      next = replaceIn(next, neighbour.room.id, (r) => ({ ...r, openings: [...r.openings, twin] }));
    }
  }
  return next;
}

/**
 * Puts the two halves of an opening back on the two faces of one wall. A pair made while the
 * other face of a slanted wall was found by its axis (`twinEdge`, `findSharedRun`) could have
 * one half on another wall of its room altogether — a toilet's half of the bedroom's door in its
 * outside wall, and the slanted wall between them solid behind the door. The half that is on
 * the wall the other room stands behind stays; the other is moved onto that wall's other face,
 * opposite it. Same rooms when they agree, or when neither is on such a wall.
 */
function onOneWall(rooms: PlanRoom[], room: PlanRoom, opening: Opening, wallThickness: WallThickness): PlanRoom[] {
  const twin = twinOf(rooms, opening);
  const edge = edgeOf(room, opening.wallIndex);
  const twinEdgeNow = twin ? edgeOf(twin.room, twin.opening.wallIndex) : null;
  if (!twin || !edge || !twinEdgeNow) return rooms;
  const point = pointOnEdge(edge, opening.t);
  const tolerance = neighbourTolerance(thicknessAt(wallThickness, room, edge));
  const across = Math.abs((point.x - twinEdgeNow.a.x) * twinEdgeNow.dir.z - (point.z - twinEdgeNow.a.z) * twinEdgeNow.dir.x);
  const along = alongEdge(twinEdgeNow, point) / twinEdgeNow.length;
  if (edgesParallel(edge, twinEdgeNow) && across <= tolerance && along >= -0.02 && along <= 1.02) return rooms;
  // This half's wall has the other room behind it: the twin goes onto that wall's other face.
  const right = twinEdge(twin.room, edge, point, tolerance);
  if (right) return replaceIn(rooms, twin.room.id, (r) => patchOpening(r, twin.opening.id, { wallIndex: right.index, t: projectToEdge(right, point, twin.opening.widthM) }));
  // Or the twin's has this room behind it: this half goes there.
  const twinPoint = pointOnEdge(twinEdgeNow, twin.opening.t);
  const back = twinEdge(room, twinEdgeNow, twinPoint, neighbourTolerance(thicknessAt(wallThickness, twin.room, twinEdgeNow)));
  if (back) return replaceIn(rooms, room.id, (r) => patchOpening(r, opening.id, { wallIndex: back.index, t: projectToEdge(back, twinPoint, opening.widthM) }));
  return rooms;
}

/**
 * Puts an opening down on any wall of any room, at `target.t`, keeping its size and kind.
 * Along its own wall (or the neighbour's copy of that shared wall) this is a plain slide;
 * anywhere else the opening — and its twin — is cut out and cut in again, so it gets a
 * new id, which is returned. A window dropped on a shared wall (but a balcony's) is refused:
 * `openingId` is null and the rooms come back unchanged.
 */
export function moveOpeningToWall(rooms: PlanRoom[], roomId: string, openingId: string, target: WallTarget, wallThickness: WallThickness): { rooms: PlanRoom[]; openingId: string | null } {
  const room = rooms.find((r) => r.id === roomId);
  const opening = room?.openings.find((o) => o.id === openingId);
  if (!room || !opening) return { rooms, openingId: null };
  if (target.roomId === roomId && target.wallIndex === opening.wallIndex) {
    return { rooms: moveOpening(rooms, roomId, openingId, target.t), openingId };
  }
  const twin = twinOf(rooms, opening);
  if (twin && target.roomId === twin.room.id && target.wallIndex === twin.opening.wallIndex) {
    return { rooms: moveOpening(rooms, twin.room.id, twin.opening.id, target.t), openingId };
  }
  const removed = removeOpening(rooms, roomId, openingId);
  const added = addOpening(removed, target.roomId, opening.kind, target.wallIndex, wallThickness, {
    t: target.t,
    widthM: opening.widthM,
    heightM: opening.heightM,
    sillM: opening.sillM,
    hinge: opening.hinge,
    swing: opening.swing,
    material: opening.material,
    openAngleDeg: opening.openAngleDeg,
    product: opening.product,
  });
  if (!added.openingId) return { rooms, openingId: null };
  return added;
}

/** Moves an opening to a different wall of the same room, centred on it. */
export function setOpeningWall(rooms: PlanRoom[], roomId: string, openingId: string, wallIndex: number, wallThickness: WallThickness): PlanRoom[] {
  const room = rooms.find((r) => r.id === roomId);
  const opening = room?.openings.find((o) => o.id === openingId);
  if (!room || !opening || opening.wallIndex === wallIndex) return rooms;
  const removed = removeOpening(rooms, roomId, openingId);
  const added = addOpening(removed, roomId, opening.kind, wallIndex, wallThickness);
  if (!added.openingId) return rooms;
  // Keep the size the user had set.
  return updateOpening(added.rooms, roomId, added.openingId, { widthM: opening.widthM, heightM: opening.heightM, sillM: opening.sillM });
}
