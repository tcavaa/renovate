/**
 * The box a wall-hung WC's concealed cistern is built into (the design rules,
 * `lib/design/rules.ts`): plasterboard about 20 cm deep on the wall behind every WC, half height
 * with a shelf on top (or to the ceiling, the card's choice), tiled — the bathroom's walls are —
 * or painted in waterproof paint when the tiles are taken off it. A decor piece of the `box`
 * family, so it is drawn, measured and bought like the rest of the decor, and the WC stands in
 * front of it (`clearOfDecor`); it follows its WC (`reanchorDecor`, anchor `wc`). Pure.
 */

import type { CatalogProduct } from '@/lib/design/matcher';
import { footprintQuad, WC_BOX_DEPTH_M, WC_BOX_HALF_M, WC_BOX_WIDTH_M } from '@/lib/design/rules';
import { standsSolid } from '@/lib/design/manipulate';
import { floorTaken } from '@/lib/design/shower';
import type { PlanEdge } from '@/lib/design/planGeometry';
import type { DecorPiece, PlacedItem, PlanRoom } from '@/lib/design/types';
import { freeSpans } from './layout';
import { defaultDecorMaterial } from './materials';
import { decorMaterialFrom, wallBehind } from './resolve';

/** What is left of the wall beside the box below which the box takes the whole wall. */
const SLIVER_M = 0.3;

/**
 * The decor with a box behind every WC, a WC set down in the studio too (the rulebook, BA-4): the
 * studio has no catalogue to hand, so a new box takes its materials from one the flat already has
 * (else it is plain, painted plasterboard until the person picks a finish). The same array when
 * nothing was added.
 */
export function withWcBoxes(rooms: readonly PlanRoom[], items: PlacedItem[], decor: DecorPiece[]): DecorPiece[] {
  const added = wcBoxes(rooms, items, [], decor);
  if (added.length === 0) return decor;
  const model = decor.find((d) => d.family === 'box' && d.anchor === 'wc');
  return [...decor, ...added.map((d) => (model ? { ...d, materials: model.materials } : d))];
}

/** A box behind every WC that has none yet. */
export function wcBoxes(rooms: readonly PlanRoom[], items: PlacedItem[], catalog: CatalogProduct[], decor: DecorPiece[] = []): DecorPiece[] {
  const out: DecorPiece[] = [];
  const gypsum = defaultDecorMaterial(catalog, ['gypsum']);
  const tile = defaultDecorMaterial(catalog, ['tile', 'stone']);
  for (const wc of items.filter((i) => i.slot === 'toilet')) {
    const room = rooms.find((r) => r.id === wc.roomId);
    // One box a WC: its own (`itemId`), or one from before boxes named their WC.
    if (!room || [...decor, ...out].some((d) => d.family === 'box' && d.anchor === 'wc' && (d.itemId ? d.itemId === wc.id : d.roomId === room.id))) continue;
    const edge = wallBehind(wc, room);
    if (!edge) continue;
    const centre = (wc.position.x - edge.a.x) * edge.dir.x + (wc.position.z - edge.a.z) * edge.dir.z;
    const stretch = freeSpans(edge, room.openings, 0, edge.length, 0.05).find(([a, b]) => centre >= a && centre <= b);
    if (!stretch) continue;
    const [a, b] = stretch;
    let from = Math.max(a, centre - WC_BOX_WIDTH_M / 2);
    let to = Math.min(b, centre + WC_BOX_WIDTH_M / 2);
    if (from - a < SLIVER_M) from = a;
    if (b - to < SLIVER_M) to = b;
    // …and never into what stands beside the WC on that wall.
    const [lo, hi] = besideWc(stretch, edge, centre, wc, room, items);
    from = Math.max(from, lo);
    to = Math.min(to, hi);
    out.push({
      id: `decor-${room.id}-wc-${wc.id}`,
      roomId: room.id,
      family: 'box',
      wallIndex: edge.index,
      span: { from: Math.round(from * 1000) / 1000, to: Math.round(to * 1000) / 1000 },
      height: { from: 0, to: WC_BOX_HALF_M },
      params: { depthMm: Math.round(WC_BOX_DEPTH_M * 1000), full: false },
      materials: { ...(gypsum ? { body: decorMaterialFrom(gypsum) } : {}), ...(tile ? { face: decorMaterialFrom(tile) } : {}) },
      anchor: 'wc',
      itemId: wc.id,
    });
  }
  return out;
}

/**
 * The stretch a WC's box may take, stopped at what stands on its wall within the box's depth on
 * either side of the WC (a basin, a washer's column, a bath beside it), as it is stopped at a door
 * or a window: a box built after the basin stood ran into it. A piece standing across the WC's
 * middle (in its way, not beside it) does not cut it; nor is the box cut short of the WC's own
 * width — there the stretch as the openings leave it.
 */
function besideWc(stretch: [number, number], edge: PlanEdge, centre: number, wc: PlacedItem, room: PlanRoom, items: readonly PlacedItem[]): [number, number] {
  let [a, b] = stretch;
  for (const item of items) {
    if (item.roomId !== room.id || item.id === wc.id || !standsSolid(item)) continue;
    const corners = footprintQuad(floorTaken(item));
    const off = corners.map((p) => (p.x - edge.a.x) * edge.inward.x + (p.z - edge.a.z) * edge.inward.z);
    if (Math.min(...off) >= WC_BOX_DEPTH_M - 1e-6 || Math.max(...off) <= 0) continue;
    const along = corners.map((p) => (p.x - edge.a.x) * edge.dir.x + (p.z - edge.a.z) * edge.dir.z);
    const lo = Math.min(...along);
    const hi = Math.max(...along);
    if (hi <= a || lo >= b) continue;
    if (hi <= centre) a = Math.max(a, hi);
    else if (lo >= centre) b = Math.min(b, lo);
  }
  const half = wc.size.width / 2;
  return a <= centre - half + 1e-6 && b >= centre + half - 1e-6 ? [a, b] : stretch;
}
