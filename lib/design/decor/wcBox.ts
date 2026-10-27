/**
 * The box a wall-hung WC's concealed cistern is built into (the design rules,
 * `lib/design/rules.ts`): plasterboard about 20 cm deep on the wall behind every WC, half height
 * with a shelf on top (or to the ceiling, the card's choice), tiled — the bathroom's walls are —
 * or painted in waterproof paint when the tiles are taken off it. A decor piece of the `box`
 * family, so it is drawn, measured and bought like the rest of the decor, and the WC stands in
 * front of it (`clearOfDecor`); it follows its WC (`reanchorDecor`, anchor `wc`). Pure.
 */

import type { CatalogProduct } from '@/lib/design/matcher';
import { WC_BOX_DEPTH_M, WC_BOX_HALF_M, WC_BOX_WIDTH_M } from '@/lib/design/rules';
import type { DecorPiece, PlacedItem, PlanRoom } from '@/lib/design/types';
import { freeSpans } from './layout';
import { defaultDecorMaterial } from './materials';
import { decorMaterialFrom, wallBehind } from './resolve';

/** What is left of the wall beside the box below which the box takes the whole wall. */
const SLIVER_M = 0.3;

/** A box behind every WC that has none yet. */
export function wcBoxes(rooms: readonly PlanRoom[], items: PlacedItem[], catalog: CatalogProduct[], decor: DecorPiece[] = []): DecorPiece[] {
  const out: DecorPiece[] = [];
  const gypsum = defaultDecorMaterial(catalog, ['gypsum']);
  const tile = defaultDecorMaterial(catalog, ['tile', 'stone']);
  for (const wc of items.filter((i) => i.slot === 'toilet')) {
    const room = rooms.find((r) => r.id === wc.roomId);
    if (!room || [...decor, ...out].some((d) => d.family === 'box' && d.roomId === room.id && d.anchor === 'wc')) continue;
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
    });
  }
  return out;
}
