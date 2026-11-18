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
import { inDoorway, isPlacementValid, standsSolid } from '@/lib/design/manipulate';
import { floorTaken } from '@/lib/design/shower';
import { roomEdges, type PlanEdge } from '@/lib/design/planGeometry';
import type { DecorPiece, FloorPlan, PlacedItem, PlanRoom } from '@/lib/design/types';
import { ruleViolations } from '@/lib/design/ruleChecks';
import { JOINERY_SLIVER_M } from './joinery';
import { freeSpans } from './layout';
import { defaultDecorMaterial } from './materials';
import { decorMaterialFrom, wallBehind } from './resolve';

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
  const materials = { ...(gypsum ? { body: decorMaterialFrom(gypsum) } : {}), ...(tile ? { face: decorMaterialFrom(tile) } : {}) };
  for (const wc of items.filter((i) => i.slot === 'toilet')) {
    const room = rooms.find((r) => r.id === wc.roomId);
    // One box a WC: its own (`itemId`), or one from before boxes named their WC.
    if (!room || [...decor, ...out].some((d) => d.family === 'box' && d.anchor === 'wc' && (d.itemId ? d.itemId === wc.id : d.roomId === room.id))) continue;
    const box = wcBoxToBuild(wc, room, items, materials);
    if (box) out.push(box);
  }
  return out;
}

/** The id of the box built behind a WC. */
const wcBoxId = (room: PlanRoom, wc: PlacedItem) => `decor-${room.id}-wc-${wc.id}`;

/**
 * The box to build behind a WC that has none, by generation and by the studio's set-down and card
 * alike: `wcBoxFor`, but under a high window — the WC was laid out against the wall — only where
 * the WC stands clear once stood out in front of it (`wcStandsClear`: no door's way, no shower's
 * tray, no other piece); else the box between the wall's openings, where there is one. Null where
 * no box is built.
 */
export function wcBoxToBuild(wc: PlacedItem, room: PlanRoom, items: readonly PlacedItem[], materials: DecorPiece['materials'] = {}, id = wcBoxId(room, wc)): DecorPiece | null {
  const built = buildWcBox(wc, room, items, materials, id, false);
  if (!built || !built.underWindow || wcStandsClear(built.box, wc, room, items)) return built?.box ?? null;
  return buildWcBox(wc, room, items, materials, id, true)?.box ?? null;
}

/**
 * The stretch a WC's box takes on a wall, the WC's middle at `centre`, `half` its half width:
 * between all the wall's doors and windows (5 cm kept round each) where that holds the whole WC;
 * else, under a high window, between the others (`underWindow`: the WC stands at the window) —
 * never for a box to the ceiling (`full`); else what the openings leave. Null with no stretch there.
 */
export function wcBoxStretch(edge: PlanEdge, centre: number, half: number, room: PlanRoom, full = false, tolerance = 0): { stretch: [number, number]; underWindow: boolean } | null {
  const plain = boxStretch(edge, centre, room.openings, tolerance);
  const holds = (s: [number, number]) => s[0] <= centre - half + 1e-6 && s[1] >= centre + half - 1e-6;
  if (plain && holds(plain)) return { stretch: plain, underWindow: false };
  const under = full ? null : boxStretch(edge, centre, underHighWindows(room), tolerance);
  if (under && (!plain || under[1] - under[0] > plain[1] - plain[0] + 1e-6)) return { stretch: under, underWindow: true };
  return plain ? { stretch: plain, underWindow: false } : null;
}

/** The stretch of a wall between its `openings` (5 cm kept round each) a box centred at `centre` may take. */
function boxStretch(edge: PlanEdge, centre: number, openings: PlanRoom['openings'], tolerance = 0): [number, number] | null {
  return freeSpans(edge, openings, 0, edge.length, 0.05).find(([a, b]) => centre >= a - tolerance && centre <= b + tolerance) ?? null;
}

/** The room's openings but the windows whose sill is over a box's top (a toilet's high window): a box stands under one. */
function underHighWindows(room: PlanRoom): PlanRoom['openings'] {
  return room.openings.filter((o) => !(o.kind === 'window' && o.sillM >= WC_BOX_HALF_M));
}

/**
 * Whether a WC stands clear where it will stand in front of its box (`clearOfDecor` stands it the
 * box's depth and a centimetre off the wall): in its room, out of every other piece (a shower as its
 * tray), out of a door's way, and breaking none of the app's rule checks it kept against the wall
 * (`ruleViolations`: its 40 cm either side, a door's swing).
 */
export function wcStandsClear(box: DecorPiece, wc: PlacedItem, room: PlanRoom, items: readonly PlacedItem[]): boolean {
  const edge = roomEdges(room.polygon).find((e) => e.index === box.wallIndex);
  if (!edge) return false;
  const f = { x: Math.sin(wc.rotation), z: Math.cos(wc.rotation) };
  const back = (wc.position.x - f.x * (wc.size.depth / 2) - edge.a.x) * edge.inward.x + (wc.position.z - f.z * (wc.size.depth / 2) - edge.a.z) * edge.inward.z;
  const step = Math.max(0, WC_BOX_DEPTH_M + 0.01 - back);
  const moved: PlacedItem = { ...wc, position: { x: wc.position.x + f.x * step, z: wc.position.z + f.z * step } };
  const here = items.filter((i) => i.roomId === room.id && i.id !== wc.id);
  const others = here.map((i) => ({ ...i, ...floorTaken(i) }));
  if (!isPlacementValid(room, moved, others, undefined, true) || inDoorway(moved, room)) return false;
  const plan: FloorPlan = { rooms: [room], metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', wallThicknessM: 0 };
  const broken = (at: PlacedItem) => new Set(ruleViolations(plan, [...here, at]).filter((v) => v.itemId === wc.id).map((v) => v.code));
  const kept = broken(wc);
  return [...broken(moved)].every((code) => kept.has(code));
}

/**
 * The box built behind one WC, by generation and by the studio alike (a WC set down from the
 * catalogue, a box asked for on its card, and the test of whether a box still stands where it is
 * built — `lib/design/decor/housing`): on the wall behind the WC, 80 cm centred on it, the whole
 * stretch between the wall's doors and windows when a sliver would be left beside it (under a
 * high window where the WC stands at it: `wcBoxStretch`; `plain`, between them all), and never
 * into what stands beside the WC on that wall (`besideWc`). Null with no wall behind the WC or no
 * stretch of it there.
 */
export function wcBoxFor(wc: PlacedItem, room: PlanRoom, items: readonly PlacedItem[], materials: DecorPiece['materials'] = {}, id = wcBoxId(room, wc), plain = false): DecorPiece | null {
  return buildWcBox(wc, room, items, materials, id, plain)?.box ?? null;
}

/** `wcBoxFor`, and whether the box went under a high window. */
function buildWcBox(wc: PlacedItem, room: PlanRoom, items: readonly PlacedItem[], materials: DecorPiece['materials'], id: string, plain: boolean): { box: DecorPiece; underWindow: boolean } | null {
  const edge = wallBehind(wc, room);
  if (!edge) return null;
  const centre = (wc.position.x - edge.a.x) * edge.dir.x + (wc.position.z - edge.a.z) * edge.dir.z;
  const between = plain ? boxStretch(edge, centre, room.openings) : null;
  const chosen = plain ? (between ? { stretch: between, underWindow: false } : null) : wcBoxStretch(edge, centre, wc.size.width / 2, room);
  if (!chosen) return null;
  const { stretch } = chosen;
  const [a, b] = stretch;
  let from = Math.max(a, centre - WC_BOX_WIDTH_M / 2);
  let to = Math.min(b, centre + WC_BOX_WIDTH_M / 2);
  if (from - a < JOINERY_SLIVER_M) from = a;
  if (b - to < JOINERY_SLIVER_M) to = b;
  // …and never into what stands beside the WC on that wall.
  const [lo, hi] = besideWc(stretch, edge, centre, wc, room, items);
  from = Math.max(from, lo);
  to = Math.min(to, hi);
  const box: DecorPiece = {
    id,
    roomId: room.id,
    family: 'box',
    wallIndex: edge.index,
    span: { from: Math.round(from * 1000) / 1000, to: Math.round(to * 1000) / 1000 },
    height: { from: 0, to: WC_BOX_HALF_M },
    params: { depthMm: Math.round(WC_BOX_DEPTH_M * 1000), full: false },
    materials,
    anchor: 'wc',
    itemId: wc.id,
  };
  return { box, underWindow: chosen.underWindow };
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
