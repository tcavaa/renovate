/**
 * Painting a room a piece at a time, the way a game's build mode does it: the floor one
 * square metre at a click, a wall one metre-wide strip (floor to ceiling) at a click.
 *
 * Both sit on top of the room's base finish, like a drawn zone or a single wall's finish
 * do. To keep a painted flat from turning into hundreds of finishes, what is painted is
 * folded as it goes: all the floor tiles of one product in one room are *one* finish with
 * a list of grid cells, and neighbouring strips of one product on one wall are *one*
 * finish with one span. Painting with no product is the eraser — the base shows again.
 *
 * The floor grid is the room's own: squares counted from the top-left corner of its
 * bounding box, each clipped to the room's outline, so a 3.32 m room ends in a 32 cm
 * column of part-tiles rather than in tiles that run under the wall. Strips are measured
 * along the wall from its first corner in the same way.
 *
 * Pure geometry over plain data; the store, the 2D board and the 3D view all call in here.
 */

import { pointInPolygon, polygonAreaM2, polygonBounds, roomEdges, type PlanEdge } from './planGeometry';
import { finishFromProduct } from './surfaces';
import { clipPolygon } from './zones';
import type { CatalogProduct } from './matcher';
import type { PlanRoom, SceneProduct, SurfaceFinish, Vec2 } from './types';

/** The side of a painted floor tile and the width of a painted wall strip, metres. */
export const PAINT_CELL_M = 1;
export const PAINT_STRIP_M = 1;
/** The side of a painted wall patch — a square metre of wall rather than a whole strip. */
export const PAINT_PATCH_M = 1;
/** A sliver narrower than this at the end of a wall joins the strip before it. */
const MIN_STRIP_M = 0.25;

export type Cell = [number, number];
export interface Span {
  from: number;
  to: number;
}

/**
 * What a click on a surface paints: one floor tile, one strip of one wall (floor to
 * ceiling), or — when `patch` is given — the one square metre of that wall the pointer is
 * on, `patch` being its [column along, row up] in the wall's own grid.
 */
export type PaintTarget = { roomId: string; surface: 'floor'; cell: Cell } | { roomId: string; surface: 'wall'; wallIndex: number; span: Span; patch?: Cell };

// ---------------------------------------------------------------------------
// Floor tiles
// ---------------------------------------------------------------------------

/** The tile of a room's grid under a point, or null when the point is not on its floor. */
export function cellAt(room: PlanRoom, point: Vec2): Cell | null {
  if (!pointInPolygon(point, room.polygon)) return null;
  const b = polygonBounds(room.polygon);
  return [Math.max(0, Math.floor((point.x - b.minX) / PAINT_CELL_M)), Math.max(0, Math.floor((point.z - b.minZ) / PAINT_CELL_M))];
}

/** A tile's outline, clipped to the room; empty when the tile misses the room altogether. */
export function cellPolygon(room: PlanRoom, cell: Cell): Vec2[] {
  const b = polygonBounds(room.polygon);
  const x = b.minX + cell[0] * PAINT_CELL_M;
  const z = b.minZ + cell[1] * PAINT_CELL_M;
  const clipped = clipPolygon(room.polygon, [
    { x, z },
    { x: x + PAINT_CELL_M, z },
    { x: x + PAINT_CELL_M, z: z + PAINT_CELL_M },
    { x, z: z + PAINT_CELL_M },
  ]);
  return clipped.length >= 3 && polygonAreaM2(clipped) > 1e-4 ? clipped : [];
}

export function cellsAreaM2(room: PlanRoom, cells: Cell[]): number {
  return round2(cells.reduce((sum, cell) => sum + polygonAreaM2(cellPolygon(room, cell)), 0));
}

const sameCell = (a: Cell, b: Cell) => a[0] === b[0] && a[1] === b[1];

/** The painted-tile finish a tile belongs to, if any. */
export function cellFinishAt(finishes: SurfaceFinish[], roomId: string, cell: Cell): SurfaceFinish | undefined {
  return finishes.find((f) => f.roomId === roomId && f.surface === 'floor' && !!f.cells?.some((c) => sameCell(c, cell)));
}

/**
 * Paints one floor tile: it leaves whatever painted finish held it and joins the product's
 * (made when the room has none yet); with no product it just leaves — the eraser. Finishes
 * left without tiles are dropped, and every one touched is priced again by its area.
 */
export function paintCell(finishes: SurfaceFinish[], room: PlanRoom, cell: Cell, product: CatalogProduct | null): SurfaceFinish[] {
  if (cellPolygon(room, cell).length === 0) return finishes;
  const isCells = (f: SurfaceFinish) => f.roomId === room.id && f.surface === 'floor' && !!f.cells;
  const already = product ? finishes.find((f) => isCells(f) && f.product?.productId === product.id && f.cells!.some((c) => sameCell(c, cell))) : undefined;
  if (already) return finishes;

  let joined = false;
  const next: SurfaceFinish[] = [];
  for (const finish of finishes) {
    if (!isCells(finish)) {
      next.push(finish);
      continue;
    }
    let cells = finish.cells!.filter((c) => !sameCell(c, cell));
    if (product && finish.product?.productId === product.id) {
      cells = [...cells, cell];
      joined = true;
    }
    if (cells.length > 0) next.push(pricedByArea({ ...finish, cells }, cellsAreaM2(room, cells)));
  }
  if (product && !joined) next.push(pricedByArea({ ...finishFromProduct(room, 'floor', product), cells: [cell] }, cellsAreaM2(room, [cell])));
  return next;
}

// ---------------------------------------------------------------------------
// Wall strips
// ---------------------------------------------------------------------------

/** How many whole steps a run of `lengthM` divides into; the last one takes the remainder. */
function stepCount(lengthM: number): number {
  return Math.max(1, Math.floor(lengthM / PAINT_STRIP_M) + (lengthM % PAINT_STRIP_M >= MIN_STRIP_M ? 1 : 0));
}

/** The step of the grid that holds `at` metres along a run of `lengthM`. */
function stepAt(lengthM: number, at: number): number {
  return Math.max(0, Math.min(stepCount(lengthM) - 1, Math.floor(at / PAINT_STRIP_M)));
}

/** The extent of one step, the last running on to the end. */
function stepSpan(lengthM: number, index: number): Span {
  const count = stepCount(lengthM);
  const i = Math.max(0, Math.min(count - 1, index));
  const from = i * PAINT_STRIP_M;
  return { from: round3(from), to: round3(i === count - 1 ? lengthM : from + PAINT_STRIP_M) };
}

/** The metre-wide strip of a wall that holds the spot `s` metres along it. */
export function stripAt(edge: Pick<PlanEdge, 'length'>, s: number): Span {
  return stepSpan(edge.length, stepAt(edge.length, s));
}

/**
 * The square-metre patch of a wall under a point: its column along the wall and its row up
 * it, counted from the wall's first corner and from the floor. The last column and the top
 * row run on to the corner and to the ceiling, so a 3.4 m wall is three columns, not three
 * and a sliver.
 */
export function patchAt(edge: Pick<PlanEdge, 'length'>, heightM: number, s: number, y: number): Cell {
  return [stepAt(edge.length, s), stepAt(heightM, y)];
}

/** The horizontal and vertical extent of one patch. */
export function patchSpans(edge: Pick<PlanEdge, 'length'>, heightM: number, patch: Cell): { along: Span; up: Span } {
  return { along: stepSpan(edge.length, patch[0]), up: stepSpan(heightM, patch[1]) };
}

/** Square metres of one wall patch — the part of it a door or window takes is not painted. */
export function patchAreaM2(room: PlanRoom, wallIndex: number, patch: Cell): number {
  const edge = roomEdges(room.polygon).find((e) => e.index === wallIndex);
  if (!edge) return 0;
  const { along, up } = patchSpans(edge, room.heightM, patch);
  let area = (along.to - along.from) * (up.to - up.from);
  for (const opening of room.openings) {
    if (opening.wallIndex !== wallIndex) continue;
    const centre = opening.t * edge.length;
    const across = Math.min(along.to, centre + opening.widthM / 2) - Math.max(along.from, centre - opening.widthM / 2);
    const tall = Math.min(up.to, opening.sillM + opening.heightM) - Math.max(up.from, opening.sillM);
    if (across > 0 && tall > 0) area -= across * tall;
  }
  return Math.max(0.05, round2(area));
}

/** True while a patch is still on the wall — it got shorter, or the ceiling came down. */
export function patchInRange(room: PlanRoom, wallIndex: number, patch: Cell): boolean {
  const edge = roomEdges(room.polygon).find((e) => e.index === wallIndex);
  if (!edge) return false;
  return patch[0] >= 0 && patch[0] < stepCount(edge.length) && patch[1] >= 0 && patch[1] < stepCount(room.heightM);
}

export function patchesAreaM2(room: PlanRoom, wallIndex: number, patches: Cell[]): number {
  return round2(patches.reduce((sum, patch) => sum + patchAreaM2(room, wallIndex, patch), 0));
}

/** The patches painted on one wall, whichever product they wear. */
export function wallPatches(finishes: SurfaceFinish[], roomId: string, wallIndex: number): SurfaceFinish[] {
  return finishes.filter((f) => f.roomId === roomId && f.surface === 'wall' && f.wallIndex === wallIndex && !!f.cells);
}

/**
 * Paints one square metre of one wall. Like a floor tile: the patch leaves whatever painted
 * finish held it and joins the product's, and with no product it just leaves — the eraser.
 * All the patches of one product on one wall are one finish, priced by their real area.
 */
export function paintPatch(finishes: SurfaceFinish[], room: PlanRoom, wallIndex: number, patch: Cell, product: CatalogProduct | null): SurfaceFinish[] {
  const edge = roomEdges(room.polygon).find((e) => e.index === wallIndex);
  if (!edge) return finishes;
  const isPatches = (f: SurfaceFinish) => f.roomId === room.id && f.surface === 'wall' && f.wallIndex === wallIndex && !!f.cells;
  const already = product ? finishes.find((f) => isPatches(f) && f.product?.productId === product.id && f.cells!.some((c) => sameCell(c, patch))) : undefined;
  if (already) return finishes;

  let joined = false;
  const next: SurfaceFinish[] = [];
  for (const finish of finishes) {
    if (!isPatches(finish)) {
      next.push(finish);
      continue;
    }
    let cells = finish.cells!.filter((c) => !sameCell(c, patch));
    if (product && finish.product?.productId === product.id) {
      cells = [...cells, patch];
      joined = true;
    }
    if (cells.length > 0) next.push(pricedByArea({ ...finish, cells }, patchesAreaM2(room, wallIndex, cells)));
  }
  if (product && !joined) next.push(pricedByArea({ ...finishFromProduct(room, 'wall', product), wallIndex, cells: [patch] }, patchesAreaM2(room, wallIndex, [patch])));
  return next;
}

/** A room's wall and the spot along it nearest to a point, within `reachM` of the wall's face. */
export function wallSpotAt(room: PlanRoom, point: Vec2, reachM: number): { edge: PlanEdge; s: number; distance: number } | null {
  let best: { edge: PlanEdge; s: number; distance: number } | null = null;
  for (const edge of roomEdges(room.polygon)) {
    const s = Math.max(0, Math.min(edge.length, (point.x - edge.a.x) * edge.dir.x + (point.z - edge.a.z) * edge.dir.z));
    const distance = Math.hypot(point.x - (edge.a.x + edge.dir.x * s), point.z - (edge.a.z + edge.dir.z * s));
    if (distance <= reachM && (!best || distance < best.distance)) best = { edge, s, distance };
  }
  return best;
}

/** Square metres of a stretch of wall, less the parts of doors and windows that fall in it. */
export function spanAreaM2(room: PlanRoom, wallIndex: number, span: Span): number {
  const edge = roomEdges(room.polygon).find((e) => e.index === wallIndex);
  if (!edge) return 0;
  const from = Math.max(0, span.from);
  const to = Math.min(edge.length, span.to);
  if (to <= from) return 0;
  let area = (to - from) * room.heightM;
  for (const opening of room.openings) {
    if (opening.wallIndex !== wallIndex) continue;
    const centre = opening.t * edge.length;
    const overlap = Math.min(to, centre + opening.widthM / 2) - Math.max(from, centre - opening.widthM / 2);
    if (overlap > 0) area -= overlap * Math.min(opening.heightM, room.heightM - opening.sillM);
  }
  return Math.max(0.05, round2(area));
}

/** The painted stretches of one wall, in order along it. */
export function wallSpans(finishes: SurfaceFinish[], roomId: string, wallIndex: number): SurfaceFinish[] {
  return finishes.filter((f) => f.roomId === roomId && f.surface === 'wall' && f.wallIndex === wallIndex && !!f.span).sort((a, b) => a.span!.from - b.span!.from);
}

/**
 * Paints a stretch of one wall: the stretch is cut out of every painted span it crosses,
 * then laid as the product's own span — run together with a span of the same product it
 * touches. With no product the cut is all there is: the eraser.
 */
export function paintSpan(finishes: SurfaceFinish[], room: PlanRoom, wallIndex: number, span: Span, product: CatalogProduct | null): SurfaceFinish[] {
  const edge = roomEdges(room.polygon).find((e) => e.index === wallIndex);
  if (!edge) return finishes;
  let from = Math.max(0, span.from);
  let to = Math.min(edge.length, span.to);
  if (to - from < 0.01) return finishes;
  const onWall = (f: SurfaceFinish) => f.roomId === room.id && f.surface === 'wall' && f.wallIndex === wallIndex && !!f.span;

  const next: SurfaceFinish[] = [];
  for (const finish of finishes) {
    if (!onWall(finish)) {
      next.push(finish);
      continue;
    }
    const s = finish.span!;
    const same = !!product && finish.product?.productId === product.id;
    if (same && s.to >= from - 1e-6 && s.from <= to + 1e-6) {
      // Touching or overlapping, and the same product: one span.
      from = Math.min(from, s.from);
      to = Math.max(to, s.to);
      continue;
    }
    // What is left of it on either side of the new stretch.
    for (const rest of [{ from: s.from, to: Math.min(s.to, from) }, { from: Math.max(s.from, to), to: s.to }]) {
      if (rest.to - rest.from < 0.01) continue;
      next.push(pricedByArea({ ...finish, span: { from: round3(rest.from), to: round3(rest.to) } }, spanAreaM2(room, wallIndex, rest)));
    }
  }
  if (product) {
    const laid = { from: round3(from), to: round3(to) };
    next.push(pricedByArea({ ...finishFromProduct(room, 'wall', product), wallIndex, span: laid }, spanAreaM2(room, wallIndex, laid)));
  }
  return next;
}

/** What a paint target wears now: the product on that tile or strip, or null for the base finish. */
export function paintedProductAt(finishes: SurfaceFinish[], target: PaintTarget): SceneProduct | null {
  if (target.surface === 'floor') return cellFinishAt(finishes, target.roomId, target.cell)?.product ?? null;
  if (target.patch) {
    const patch = target.patch;
    return wallPatches(finishes, target.roomId, target.wallIndex).find((f) => f.cells!.some((c) => sameCell(c, patch)))?.product ?? null;
  }
  const middle = (target.span.from + target.span.to) / 2;
  return wallSpans(finishes, target.roomId, target.wallIndex).find((f) => middle >= f.span!.from && middle <= f.span!.to)?.product ?? null;
}

function pricedByArea(finish: SurfaceFinish, areaM2: number): SurfaceFinish {
  if (!finish.product) return finish;
  return { ...finish, product: { ...finish.product, qty: areaM2, totalPrice: round2(finish.product.pricePerUnit * areaM2) } };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
