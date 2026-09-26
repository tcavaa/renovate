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

/** A tile's whole square on the room's grid, before the room's outline cuts it. */
export function cellSquare(room: PlanRoom, cell: Cell): Vec2[] {
  const b = polygonBounds(room.polygon);
  const x = b.minX + cell[0] * PAINT_CELL_M;
  const z = b.minZ + cell[1] * PAINT_CELL_M;
  return [
    { x, z },
    { x: x + PAINT_CELL_M, z },
    { x: x + PAINT_CELL_M, z: z + PAINT_CELL_M },
    { x, z: z + PAINT_CELL_M },
  ];
}

/** A tile's outline, clipped to the room; empty when the tile misses the room altogether. */
export function cellPolygon(room: PlanRoom, cell: Cell): Vec2[] {
  const clipped = clipPolygon(room.polygon, cellSquare(room, cell));
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

/**
 * The extent of a patch as it is drawn on a wall that stands `wallTopM` high. The grid is the
 * room's — its rows are counted against the ceiling — but a wall can be given a height of its
 * own in the inspector, and then "the top row runs on to the ceiling" means to the top of
 * *that wall*: higher than the room, or cut off short by a wall that stops below it. Null
 * when the whole row lies above the wall.
 */
export function patchSpansOnWall(edge: Pick<PlanEdge, 'length'>, roomHeightM: number, wallTopM: number, patch: Cell): { along: Span; up: Span } | null {
  const { along, up } = patchSpans(edge, roomHeightM, patch);
  const topRow = patch[1] >= stepCount(roomHeightM) - 1;
  const to = topRow ? wallTopM : Math.min(up.to, wallTopM);
  return to - up.from > 1e-3 ? { along, up: { from: up.from, to: round3(to) } } : null;
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
  // The eraser on a square no patch holds: what shows there is the strip underneath, so that
  // is what gives the square up (`erasePatchFromStrip`).
  if (!product && !finishes.some((f) => isPatches(f) && f.cells!.some((c) => sameCell(c, patch)))) return erasePatchFromStrip(finishes, room, edge, wallIndex, patch);

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
 *
 * A strip is floor to ceiling, so it also takes the place of every square metre painted in
 * the stretch: those lie *on top* of strips (`buildWallGeometry`), and one left under a new
 * strip would go on showing through it — the strip would seem not to apply. The other way
 * round needs nothing: a square painted over a strip simply lies on it.
 */
export function paintSpan(finishes: SurfaceFinish[], room: PlanRoom, wallIndex: number, span: Span, product: CatalogProduct | null): SurfaceFinish[] {
  const edge = roomEdges(room.polygon).find((e) => e.index === wallIndex);
  if (!edge) return finishes;
  const painted = { from: Math.max(0, span.from), to: Math.min(edge.length, span.to) };
  if (painted.to - painted.from < 0.01) return finishes;
  const cut = cutOutOfSpans(finishes, room, wallIndex, painted, product?.id ?? null);
  const next = clearPatchesIn(cut.finishes, room, edge, wallIndex, painted);
  if (product) {
    const laid = { from: round3(cut.from), to: round3(cut.to) };
    next.push(pricedByArea({ ...finishFromProduct(room, 'wall', product), wallIndex, span: laid }, spanAreaM2(room, wallIndex, laid)));
  }
  return next;
}

/**
 * Every painted span of the wall with `range` taken out of it. A span of `joinProductId`
 * that touches the range is swallowed whole instead, and the range comes back grown to hold
 * it — the caller lays one span over the lot.
 */
function cutOutOfSpans(finishes: SurfaceFinish[], room: PlanRoom, wallIndex: number, range: Span, joinProductId: number | null): { finishes: SurfaceFinish[]; from: number; to: number } {
  let { from, to } = range;
  const onWall = (f: SurfaceFinish) => f.roomId === room.id && f.surface === 'wall' && f.wallIndex === wallIndex && !!f.span;
  // Touching or overlapping, and the same product: one span. Until nothing more joins — a
  // span two along only touches once the one between them has been taken in.
  for (let grew = joinProductId != null; grew; ) {
    grew = false;
    for (const finish of finishes) {
      const s = finish.span;
      if (!s || !onWall(finish) || finish.product?.productId !== joinProductId) continue;
      if (s.to < from - 1e-6 || s.from > to + 1e-6 || (s.from >= from - 1e-6 && s.to <= to + 1e-6)) continue;
      from = Math.min(from, s.from);
      to = Math.max(to, s.to);
      grew = true;
    }
  }
  const next: SurfaceFinish[] = [];
  for (const finish of finishes) {
    if (!onWall(finish)) {
      next.push(finish);
      continue;
    }
    const s = finish.span!;
    if (joinProductId != null && finish.product?.productId === joinProductId && s.to >= from - 1e-6 && s.from <= to + 1e-6) continue;
    // What is left of it on either side of the new stretch.
    for (const rest of [{ from: s.from, to: Math.min(s.to, from) }, { from: Math.max(s.from, to), to: s.to }]) {
      if (rest.to - rest.from < 0.01) continue;
      next.push(pricedByArea({ ...finish, span: { from: round3(rest.from), to: round3(rest.to) } }, spanAreaM2(room, wallIndex, rest)));
    }
  }
  return { finishes: next, from, to };
}

/** The painted square metres of the wall whose column falls in `range`, taken off it. */
function clearPatchesIn(finishes: SurfaceFinish[], room: PlanRoom, edge: PlanEdge, wallIndex: number, range: Span): SurfaceFinish[] {
  const next: SurfaceFinish[] = [];
  for (const finish of finishes) {
    if (!(finish.roomId === room.id && finish.surface === 'wall' && finish.wallIndex === wallIndex && finish.cells)) {
      next.push(finish);
      continue;
    }
    const cells = finish.cells.filter((cell) => {
      const { along } = patchSpans(edge, room.heightM, cell);
      const middle = (along.from + along.to) / 2;
      return middle < range.from || middle > range.to;
    });
    if (cells.length === finish.cells.length) next.push(finish);
    else if (cells.length > 0) next.push(pricedByArea({ ...finish, cells }, patchesAreaM2(room, wallIndex, cells)));
  }
  return next;
}

/**
 * The 1 m² eraser on a strip. A strip cannot have a hole in it — it is a stretch of wall,
 * floor to ceiling — so the column the square stands in leaves the strip, and the rest of
 * that column goes on wearing the strip's product as square metres of it. What is on the
 * wall afterwards is exactly what was there less the one square, and priced as such.
 */
function erasePatchFromStrip(finishes: SurfaceFinish[], room: PlanRoom, edge: PlanEdge, wallIndex: number, patch: Cell): SurfaceFinish[] {
  const { along } = patchSpans(edge, room.heightM, patch);
  const middle = (along.from + along.to) / 2;
  const strip = wallSpans(finishes, room.id, wallIndex).find((f) => middle > f.span!.from && middle < f.span!.to);
  if (!strip?.product) return finishes;

  const onThisWall = (f: SurfaceFinish) => f.roomId === room.id && f.surface === 'wall' && f.wallIndex === wallIndex && !!f.cells;
  // Squares other products already hold in the column lie on top of the strip and stay.
  const held = finishes.filter(onThisWall).flatMap((f) => f.cells!);
  const rest: Cell[] = [];
  for (let row = 0; row < stepCount(room.heightM); row++) {
    const cell: Cell = [patch[0], row];
    if (row !== patch[1] && !held.some((c) => sameCell(c, cell))) rest.push(cell);
  }

  const next = cutOutOfSpans(finishes, room, wallIndex, along, null).finishes;
  if (rest.length === 0) return next;
  const own = next.findIndex((f) => onThisWall(f) && f.product?.productId === strip.product!.productId);
  if (own >= 0) {
    const cells = [...next[own].cells!, ...rest];
    next[own] = pricedByArea({ ...next[own], cells }, patchesAreaM2(room, wallIndex, cells));
  } else {
    const { span: _span, ...asPatches } = strip;
    next.push(pricedByArea({ ...asPatches, cells: rest }, patchesAreaM2(room, wallIndex, rest)));
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
