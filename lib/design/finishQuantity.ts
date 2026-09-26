/**
 * How much of its product a finish needs — the one rule the studio's store and the save
 * route share, so what the server stores is what the person saw.
 *
 * A finish covers whatever it says it covers: the whole room, one wall, a painted strip of
 * one, the square metres painted on one, a drawn zone, the floor tiles painted one at a
 * time — in square metres — or, for a skirting board or a cornice, the running metres round
 * the room. (The save route used to price every finish by its room's whole floor or wall
 * area, so an accent wall was stored at the price of papering the room.)
 *
 * What a finish *covers* is not what is bought of it, though: finishes lie on one another
 * like coats of paint, and only the top coat shows (`visibleFinishes`).
 */

import { cellSquare, cellsAreaM2, patchAreaM2, patchesAreaM2, patchSpans, spanAreaM2 } from './paint';
import { polygonAreaM2, roomEdges } from './planGeometry';
import { wallAreaM2 } from './surfaces';
import { isTrimSurface, trimLengthM } from './trims';
import { clipPolygon, isBaseFinish, wallEdgeAreaM2, zoneAreaM2 } from './zones';
import type { PlanRoom, SurfaceFinish, Vec2 } from './types';

export function finishQuantity(room: PlanRoom, finish: Pick<SurfaceFinish, 'surface' | 'wallIndex' | 'span' | 'zone' | 'cells'>): number {
  if (isTrimSurface(finish.surface)) return trimLengthM(room, finish.surface);
  // `cells` on a wall are square metres of that wall — [column along it, row up it] — not
  // tiles of the floor: read as floor tiles they were priced by whatever floor happened to
  // lie under those grid squares, which for a row near the ceiling is usually none.
  if (finish.cells && finish.surface === 'wall' && finish.wallIndex != null) return patchesAreaM2(room, finish.wallIndex, finish.cells);
  if (finish.cells) return cellsAreaM2(room, finish.cells);
  if (finish.zone) return zoneAreaM2(finish.zone);
  if (finish.surface === 'wall' && finish.wallIndex != null) {
    return finish.span ? spanAreaM2(room, finish.wallIndex, finish.span) : wallEdgeAreaM2(room, finish.wallIndex);
  }
  if (finish.surface === 'wall') return wallAreaM2(room);
  return Math.round(room.areaM2 * 10) / 10;
}

/** The unit a finish is bought in: mouldings by the running metre, everything else by the square metre. */
export function finishUnit(finish: Pick<SurfaceFinish, 'surface'>): 'm2' | 'linear_m' {
  return isTrimSurface(finish.surface) ? 'linear_m' : 'm2';
}

/**
 * Less of a finish than this showing is none of it showing: what the rounding of the areas
 * it is worked out from leaves behind when something covers it edge to edge.
 */
const HIDDEN_M2 = 0.1;

/**
 * The finishes as they show, each with its product counted over the part of it that nothing
 * lies on top of — what the budget buys.
 *
 * The layers are the studio's own, as the 3D view and the board draw them. On the floor: the
 * room's floor, the zones drawn on it, and the square metres painted over either. On the
 * walls: the room's walls, one wall given a finish of its own over them, the metre-wide
 * strips painted on a wall over that, and the square metres painted over those. Tile the
 * lower metre of a painted wall and the paint under the tiles is not bought as well; paint a
 * strip, then paint it again in another colour, and only the colour on top is. A finish
 * wholly covered is not bought at all, and leaves the list.
 *
 * Each finish keeps its own quantity as what it covers (`finishQuantity`); the geometry only
 * says what lies on what. A layer with no product — an old zone still waiting for its tile —
 * hides nothing: the floor under it is still the floor that gets laid. Of two finishes that
 * both claim a whole surface only the first is drawn (`wallFinishFor`), and only it is bought.
 * A finish of a room the plan no longer has is left as it is.
 */
export function visibleFinishes(finishes: SurfaceFinish[], rooms: PlanRoom[]): SurfaceFinish[] {
  const hidden = hiddenAreas(finishes, rooms);
  if (hidden.size === 0) return finishes;
  const shown: SurfaceFinish[] = [];
  for (const finish of finishes) {
    const under = hidden.get(finish);
    if (under == null || !finish.product) {
      shown.push(finish);
      continue;
    }
    const qty = round2(Math.max(0, finish.product.qty - under));
    if (qty < HIDDEN_M2) continue;
    shown.push({ ...finish, product: { ...finish.product, qty, totalPrice: round2(finish.product.pricePerUnit * qty) } });
  }
  return shown;
}

/** Square metres of each finish that another finish lies on top of. */
function hiddenAreas(finishes: SurfaceFinish[], rooms: PlanRoom[]): Map<SurfaceFinish, number> {
  const hidden = new Map<SurfaceFinish, number>();
  const hide = (finish: SurfaceFinish | undefined, areaM2: number) => {
    if (!finish?.product || areaM2 <= 0) return;
    hidden.set(finish, (hidden.get(finish) ?? 0) + areaM2);
  };
  /** Everything but the first of several finishes that claim the same thing is out of sight. */
  const firstOf = (claimants: SurfaceFinish[]) => {
    for (const extra of claimants.slice(1)) hide(extra, extra.product?.qty ?? 0);
    return claimants[0] as SurfaceFinish | undefined;
  };

  for (const room of rooms) {
    const own = finishes.filter((f) => f.roomId === room.id);
    if (own.length === 0) continue;

    // --- the floor: the room's, the zones on it, the tiles painted over both ---
    const floor = firstOf(own.filter((f) => f.surface === 'floor' && isBaseFinish(f)));
    const zones = own.filter((f) => f.surface === 'floor' && f.zone && !f.cells && f.product);
    const tiles = own.filter((f) => f.surface === 'floor' && f.cells && f.product);
    const squares = tiles.flatMap((f) => f.cells!.map((cell) => cellSquare(room, cell)));
    let zonesShown = 0;
    for (const zone of zones) {
      // A square is convex, so it can cut any zone down to the part of the zone under it.
      const underTiles = squares.reduce((sum, square) => sum + areaOf(clipPolygon(zone.zone!.polygon, square)), 0);
      hide(zone, underTiles);
      zonesShown += Math.max(0, zone.product!.qty - underTiles);
    }
    hide(floor, zonesShown + tiles.reduce((sum, f) => sum + f.product!.qty, 0));

    // --- the walls: the room's, a wall's own, the strips on it, the square metres on top ---
    const walls = firstOf(own.filter((f) => f.surface === 'wall' && isBaseFinish(f)));
    const edges = roomEdges(room.polygon);
    let bareWalls = 0;
    for (const edge of edges) {
      const onWall = own.filter((f) => f.surface === 'wall' && f.wallIndex === edge.index);
      const whole = firstOf(onWall.filter((f) => !f.span && !f.cells));
      const strips = onWall.filter((f) => f.span && f.product);
      // Whatever lies straight on the wall's own finish (or on the room's, where it has none):
      // the strips, and the square metres that are not on a strip.
      let onWallFinish = strips.reduce((sum, f) => sum + f.product!.qty, 0);
      for (const patches of onWall.filter((f) => f.cells && f.product)) {
        for (const cell of patches.cells!) {
          const area = patchAreaM2(room, edge.index, cell);
          const { along } = patchSpans(edge, room.heightM, cell);
          const middle = (along.from + along.to) / 2;
          const strip = strips.find((f) => middle >= f.span!.from && middle <= f.span!.to);
          if (strip) hide(strip, area);
          else onWallFinish += area;
        }
      }
      if (whole?.product) {
        hide(whole, onWallFinish);
        hide(walls, whole.product.qty);
      } else {
        hide(walls, onWallFinish);
        bareWalls += 1;
      }
    }
    // Every wall papered on its own: none of the room's own shows, whatever the sum of the
    // walls' rounded areas says.
    if (edges.length > 0 && bareWalls === 0) hide(walls, walls?.product?.qty ?? 0);
  }
  return hidden;
}

function areaOf(polygon: Vec2[]): number {
  return polygon.length >= 3 ? polygonAreaM2(polygon) : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
