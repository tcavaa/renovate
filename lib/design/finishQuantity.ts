/**
 * How much of its product a finish needs — the one rule the studio's store and the save
 * route share, so what the server stores is what the person saw.
 *
 * A finish covers whatever it says it covers: the whole room, one wall, a painted strip of
 * one, a drawn zone, the floor tiles painted one at a time — in square metres — or, for a
 * skirting board or a cornice, the running metres round the room. (The save route used to
 * price every finish by its room's whole floor or wall area, so an accent wall was stored
 * at the price of papering the room.)
 */

import { cellsAreaM2, spanAreaM2 } from './paint';
import { wallAreaM2 } from './surfaces';
import { isTrimSurface, trimLengthM } from './trims';
import { wallEdgeAreaM2, zoneAreaM2 } from './zones';
import type { PlanRoom, SurfaceFinish } from './types';

export function finishQuantity(room: PlanRoom, finish: Pick<SurfaceFinish, 'surface' | 'wallIndex' | 'span' | 'zone' | 'cells'>): number {
  if (isTrimSurface(finish.surface)) return trimLengthM(room, finish.surface);
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
