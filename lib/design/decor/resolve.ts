/**
 * Decor intents → decor pieces. The designer (the AI, or anybody else) says *what* and *where in
 * words* — "an oak slat field behind the bed", "two arched niches on wall 2", "a cove round the
 * ceiling" — and this works out the metres: the wall the bed really stands against once the
 * engine has laid the room out, the stretch of it the piece covers (centred on what it is
 * anchored to, kept off doors and windows), its band of height, sane knobs, and real materials
 * from the catalogue for every slot. An intent that cannot be realised is dropped, never forced.
 */

import { WALL_UNIT_BOTTOM_M } from '@/lib/design/rules';
import { roomEdges, wallEdges, type PlanEdge } from '@/lib/design/planGeometry';
import type { CatalogProduct } from '@/lib/design/matcher';
import { toSceneProduct } from '@/lib/design/matcher';
import type { DecorFamily, DecorMaterial, DecorParams, DecorPiece, DecorSlot, Opening, PlacedItem, PlanRoom, SlotKind } from '@/lib/design/types';
import { DECOR_FAMILIES, DECOR_FAMILY_LIST, decorSlots, slotTakes } from './families';
import { freeSpans } from './layout';
import { decorMaterialKind, decorSpecs, defaultDecorMaterial, isDecorMaterial } from './materials';

export const DECOR_ANCHORS = ['bed', 'tv', 'sofa', 'desk', 'dining', 'kitchen', 'wall', 'room'] as const;
export type DecorAnchor = (typeof DECOR_ANCHORS)[number];

/** What a designer asks for, before it is measured. */
export interface DecorIntent {
  family: DecorFamily;
  /** The reference library entry and concept it realises. */
  referenceId?: string | null;
  concept?: string | null;
  /** What it is centred on: a piece of furniture, a wall by index, or the whole room (a cove). */
  anchor: DecorAnchor;
  wallIndex?: number | null;
  /** Its width; null for the family's own (the anchor's width and a margin, or the whole clear wall). */
  widthM?: number | null;
  heightFromM?: number | null;
  heightToM?: number | null;
  params?: DecorParams | null;
  materials?: Array<{ slot: DecorSlot; productId: number | null; colorHex?: string | null }> | null;
  note?: string | null;
}

/** A catalogue material as a slot wears it: the snapshot, the specs it draws with, and a colour where it takes one. */
export function decorMaterialFrom(product: CatalogProduct, colorHex: string | null = null): DecorMaterial {
  const specs = decorSpecs(product);
  const tint = colorHex && HEX.test(colorHex) && specs.tintable ? colorHex : null;
  const kept = {
    ...(specs.textureScaleM ? { textureScaleM: specs.textureScaleM } : {}),
    ...(specs.tintable ? { tintable: true } : {}),
    ...(specs.cct ? { cct: specs.cct } : {}),
    ...(specs.profileMm ? { profileMm: specs.profileMm } : {}),
    ...(specs.roughness ? { roughness: specs.roughness } : {}),
  };
  return { product: toSceneProduct(product, 1), ...(tint ? { colorHex: tint } : {}), ...(Object.keys(kept).length ? { specs: kept } : {}) };
}

export const ANCHOR_SLOT: Partial<Record<DecorAnchor, SlotKind>> = { bed: 'bed', tv: 'tv_unit', sofa: 'sofa', desk: 'desk', dining: 'dining_table', kitchen: 'kitchen_run' };

/** How far past the piece it is anchored to a field runs, each side, by default. */
const ANCHOR_MARGIN: Partial<Record<DecorAnchor, number>> = { bed: 0.75, tv: 0.6, sofa: 0.35, desk: 0.3, dining: 0.4, kitchen: 0 };

const HEX = /^#[0-9a-f]{6}$/i;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Knobs kept inside the reference library's ranges (and what can be built); unknown ones dropped. */
export function sanitizeParams(family: DecorFamily, params: DecorParams | null | undefined): DecorParams {
  const p = params ?? {};
  const out: DecorParams = {};
  const set = <K extends keyof DecorParams>(key: K, value: DecorParams[K] | null | undefined) => {
    if (value != null) out[key] = value;
  };
  const range = (v: unknown, lo: number, hi: number) => {
    const n = num(v);
    return n == null ? null : clamp(n, lo, hi);
  };
  switch (family) {
    case 'slats':
      set('slatWidthMm', range(p.slatWidthMm, 20, 60));
      set('gapMm', range(p.gapMm, 8, 40));
      set('depthMm', range(p.depthMm, 10, 40));
      if (typeof p.backing === 'boolean') set('backing', p.backing);
      break;
    case 'moulding':
      set('dadoMm', range(p.dadoMm, 800, 1200));
      set('bayWidthMm', range(p.bayWidthMm, 450, 1400));
      for (const k of ['upper', 'lower', 'rail'] as const) if (typeof p[k] === 'boolean') set(k, p[k]);
      break;
    case 'niche':
      if (p.shape === 'arch' || p.shape === 'rect') set('shape', p.shape);
      set('count', range(p.count, 1, 4));
      set('nicheWidthMm', range(p.nicheWidthMm, 400, 1200));
      set('nicheHeightMm', range(p.nicheHeightMm, 600, 2400));
      set('depthMm', range(p.depthMm, 120, 450));
      set('shelves', range(p.shelves, 0, 5));
      if (typeof p.mantel === 'boolean') set('mantel', p.mantel);
      break;
    case 'light':
      if (p.path === 'cove' || p.path === 'line') set('path', p.path);
      break;
    case 'panel':
      if (p.style === 'upholstered' || p.style === 'fluted' || p.style === 'flat') set('style', p.style);
      set('moduleWidthMm', range(p.moduleWidthMm, 30, 1200));
      break;
    case 'slab':
      set('standoffMm', range(p.standoffMm, 0, 80));
      set('moduleWidthMm', range(p.moduleWidthMm, 600, 3200));
      set('moduleHeightMm', range(p.moduleHeightMm, 600, 3200));
      break;
    case 'cladding':
      set('moduleWidthMm', range(p.moduleWidthMm, 200, 1200));
      set('moduleHeightMm', range(p.moduleHeightMm, 50, 2800));
      break;
    case 'tile':
      if (typeof p.border === 'boolean') set('border', p.border);
      break;
    case 'mural':
      break;
  }
  if (DECOR_FAMILIES[family].slots.led && (p.led === 'none' || p.led === 'bottom' || p.led === 'top' || p.led === 'halo' || p.led === 'inside')) set('led', p.led);
  return out;
}

/** The wall a piece of furniture stands with its back to: the wall edge nearest its back. */
export function wallBehind(item: Pick<PlacedItem, 'position' | 'rotation' | 'size'>, room: PlanRoom): PlanEdge | null {
  const facing = { x: Math.sin(item.rotation), z: Math.cos(item.rotation) };
  const back = { x: item.position.x - facing.x * (item.size.depth / 2), z: item.position.z - facing.z * (item.size.depth / 2) };
  let best: { edge: PlanEdge; d: number } | null = null;
  for (const edge of wallEdges(room)) {
    const t = clamp(((back.x - edge.a.x) * edge.dir.x + (back.z - edge.a.z) * edge.dir.z) / edge.length, 0, 1);
    const px = edge.a.x + edge.dir.x * edge.length * t;
    const pz = edge.a.z + edge.dir.z * edge.length * t;
    // Only a wall the piece faces away from: its inward normal points the way the piece looks.
    const aligned = edge.inward.x * facing.x + edge.inward.z * facing.z;
    const d = Math.hypot(back.x - px, back.z - pz) + (aligned > 0.7 ? 0 : 10);
    if (!best || d < best.d) best = { edge, d };
  }
  return best && best.d < 1.2 ? best.edge : null;
}

/** Where along an edge a point falls, metres from its first corner. */
function along(edge: PlanEdge, point: { x: number; z: number }): number {
  return (point.x - edge.a.x) * edge.dir.x + (point.z - edge.a.z) * edge.dir.z;
}

/** Decor that covers its stretch of wall: nothing hangs over it, and it keeps off what must hang there. */
export const COVERS_WALL = new Set<string>(['slats', 'slab', 'panel', 'cladding', 'mural', 'tile', 'niche']);

/**
 * What hangs on this wall for use and must stay — a mirror over a basin in a bathroom or toilet,
 * kitchen wall cabinets — as openings for `freeSpans` (its stretch along the wall, 10 cm aside).
 */
function fixturesOnWall(edge: PlanEdge, room: PlanRoom, items: PlacedItem[], band?: { from: number; to: number }): Opening[] {
  const wet = room.type === 'bathroom' || room.type === 'toilet';
  return items
    .filter((i) => i.roomId === room.id && i.elevationM >= 0.05 && (i.slot === 'kitchen_wall' || (wet && i.slot === 'mirror')))
    // Only what hangs at the decor's height: a backsplash runs under the wall cabinets.
    .filter((i) => !band || (i.elevationM < band.to - 0.02 && i.elevationM + i.size.height > band.from + 0.02))
    .filter((i) => wallBehind(i, room)?.index === edge.index)
    .map((i) => ({ id: `fixture-${i.id}`, kind: 'window' as const, wallIndex: edge.index, t: along(edge, i.position) / edge.length, widthM: i.size.width + 0.2, heightM: i.size.height, sillM: i.elevationM, roomId: room.id, exterior: false }));
}

/** Decor built out from the wall (a niche wall): it cannot stand behind anything. */
const BUILT_OUT = new Set<string>(['niche']);

/** What stands against this wall on the floor (the bath, the washing machine, a cabinet), as openings for `freeSpans`. */
function floorPiecesOnWall(edge: PlanEdge, room: PlanRoom, items: PlacedItem[]): Opening[] {
  return items
    .filter((i) => i.roomId === room.id && i.elevationM < 0.05 && i.slot !== 'rug' && i.slot !== 'curtain')
    .filter((i) => wallBehind(i, room)?.index === edge.index)
    .map((i) => ({ id: `piece-${i.id}`, kind: 'window' as const, wallIndex: edge.index, t: along(edge, i.position) / edge.length, widthM: i.size.width + 0.1, heightM: i.size.height, sillM: 0, roomId: room.id, exterior: false }));
}

/**
 * Decor that follows the piece it was anchored to — tiles behind the kitchen run, slats behind
 * the bed — moved to that piece's wall and centred on it again when the piece has moved (a run
 * swapped for a shop's unit on another wall); its width and height kept, clamped to the wall's
 * clear stretch — the nearest one when the piece stands at a door or a window, and the decor goes
 * when that wall has none 30 cm wide. A piece whose anchor is gone stays where it is. Pure.
 */
export function reanchorDecor(decor: DecorPiece[], items: PlacedItem[], rooms: readonly PlanRoom[]): DecorPiece[] {
  return decor.flatMap((piece) => {
    // A WC's box follows its WC.
    const slot = piece.anchor === 'wc' ? 'toilet' : piece.anchor ? ANCHOR_SLOT[piece.anchor as DecorAnchor] : undefined;
    const room = rooms.find((r) => r.id === piece.roomId);
    if (!slot || !room || piece.wallIndex == null) return [piece];
    const anchorPiece = items.find((i) => i.roomId === room.id && i.slot === slot && !!i.product);
    const edge = anchorPiece ? wallBehind(anchorPiece, room) : null;
    if (!anchorPiece || !edge) return [piece];
    const width = piece.span.to - piece.span.from;
    const spans = freeSpans(edge, room.openings, 0, edge.length, 0.1);
    const centre = along(edge, anchorPiece.position);
    // Where the piece stands at an opening (a desk under a window), the nearest clear stretch beside
    // it — the slats followed the desk onto the window — or, with none wide enough, the decor goes.
    const gapTo = ([lo, hi]: [number, number]) => Math.max(lo - centre, 0, centre - hi);
    const stretch = spans.find(([lo, hi]) => centre >= lo && centre <= hi) ?? spans.filter(([lo, hi]) => hi - lo >= 0.3).sort((p, q) => gapTo(p) - gapTo(q))[0];
    if (!stretch) return [];
    const [a, b] = stretch;
    const w = Math.min(width, b - a);
    const from = clamp(centre - w / 2, a, b - w);
    if (edge.index === piece.wallIndex && Math.abs(from - piece.span.from) < 0.01 && Math.abs(w - width) < 0.01) return [piece];
    return [{ ...piece, wallIndex: edge.index, span: { from: round3(from), to: round3(from + w) } }];
  });
}

/** The longest clear wall of a room (fewest openings), for an intent whose wall cannot be used. */
function longestClearWall(room: PlanRoom): PlanEdge | null {
  const scored = wallEdges(room).map((edge) => {
    const spans = freeSpans(edge, room.openings, 0, edge.length, 0.1);
    const longest = spans.reduce((m, [a, b]) => Math.max(m, b - a), 0);
    return { edge, longest };
  });
  scored.sort((a, b) => b.longest - a.longest);
  return scored[0]?.longest > 1 ? scored[0].edge : null;
}

/** The family's band of height by default, for what it is anchored to. */
function defaultHeight(family: DecorFamily, anchor: DecorAnchor, roomHeight: number): { from: number; to: number } {
  if (family === 'slab' && anchor === 'tv') return { from: 0.65, to: Math.min(2.45, roomHeight - 0.3) };
  if (family === 'panel' && anchor === 'bed') return { from: 0.35, to: 1.6 };
  if (family === 'slats' && anchor === 'bed') return { from: 1.0, to: roomHeight - 0.25 };
  if (family === 'tile') return { from: 0, to: Math.min(1.2, roomHeight) };
  if (family === 'light') return { from: roomHeight - 0.05, to: roomHeight };
  return { from: 0, to: roomHeight };
}

/** Families that take a whole wall: they are built along it, around its doors and windows. */
const WHOLE_WALL: DecorFamily[] = ['moulding', 'niche'];

/**
 * The materials of a piece: the designer's where they are real decor materials of a kind the
 * slot takes, otherwise the catalogue's first of the slot's kinds (a required slot) or nothing
 * (an optional one); a colour only on a material that takes one.
 */
export function resolveMaterials(
  family: DecorFamily,
  wanted: DecorIntent['materials'],
  catalog: CatalogProduct[],
  params: DecorParams
): Partial<Record<DecorSlot, DecorMaterial>> {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const out: Partial<Record<DecorSlot, DecorMaterial>> = {};
  // What the piece draws with its knobs as they stand (its family's defaults under its own).
  const p = { ...DECOR_FAMILIES[family].params, ...params };
  const ledOn = family === 'light' || (!!p.led && p.led !== 'none');
  for (const slot of decorSlots(family)) {
    const spec = DECOR_FAMILIES[family].slots[slot]!;
    const drawn =
      slot === 'led' ? ledOn : slot === 'backing' ? p.backing !== false : slot === 'surround' ? !!p.mantel : slot === 'shelf' ? (p.shelves ?? 0) > 0 : slot === 'border' ? !!p.border : true;
    if (!drawn) continue;
    const ask = wanted?.find((m) => m.slot === slot);
    const asked = ask?.productId != null ? byId.get(ask.productId) : undefined;
    let product = asked && isDecorMaterial(asked) && slotTakes(family, slot, decorMaterialKind(asked)) ? asked : undefined;
    // A part that is drawn gets a material; an optional extra (a trim) only when it was asked for.
    const needed = !spec.optional || slot === 'led' || slot === 'backing' || slot === 'surround' || slot === 'shelf' || slot === 'border' || !!ask;
    if (!product && needed) product = defaultDecorMaterial(catalog, spec.kinds);
    if (!product) continue;
    out[slot] = decorMaterialFrom(product, ask?.colorHex ?? null);
  }
  return out;
}

/**
 * Whether a tile or slab asked for in a kitchen is its backsplash — worktop to wall cabinets,
 * the length of the run (the `kitchen` anchor): tiles always, whichever wall was named; a slab
 * asked for behind the run, on the run's wall, or as a band no higher than 1.8 m. A slab
 * floor to ceiling on another wall stays the feature wall it was asked to be.
 */
function isBacksplash(intent: DecorIntent, runWall: PlanEdge | null): boolean {
  if (intent.family === 'tile') return true;
  if (intent.family !== 'slab') return false;
  if (intent.anchor === 'kitchen') return true;
  if (runWall && intent.anchor === 'wall' && intent.wallIndex === runWall.index) return true;
  const top = num(intent.heightToM);
  return top != null && top <= 1.8;
}

/**
 * One intent made a piece in a room laid out with `items`, or null when it cannot be: an unknown
 * family, an anchor the room does not have, no wall clear enough.
 */
export function resolveDecor(intent: DecorIntent, room: PlanRoom, items: PlacedItem[], catalog: CatalogProduct[], id: string): DecorPiece | null {
  if (!DECOR_FAMILY_LIST.includes(intent.family)) return null;
  const family = intent.family;
  const params = sanitizeParams(family, intent.params);
  const H = room.heightM;
  const run = items.find((i) => i.roomId === room.id && i.slot === 'kitchen_run' && !!i.product);
  const anchor: DecorAnchor = run && room.type === 'kitchen' && isBacksplash(intent, wallBehind(run, room)) ? 'kitchen' : intent.anchor;
  const base = {
    id,
    roomId: room.id,
    family,
    params,
    anchor,
    reference: intent.referenceId ? { entryId: intent.referenceId, concept: intent.concept ?? '' } : null,
    note: intent.note ?? null,
    origin: 'ai' as const,
  };

  // A cove runs round the room's ceiling; it needs no wall.
  if (family === 'light' && (params.path ?? 'cove') === 'cove') {
    if (room.polygon.length !== 4) return null;
    return { ...base, wallIndex: null, span: { from: 0, to: 0 }, height: { from: H - 0.2, to: H }, materials: resolveMaterials(family, intent.materials, catalog, params) };
  }

  // The wall, and the point on it the piece centres on.
  let edge: PlanEdge | null = null;
  let centre: number | null = null;
  let anchorWidth = 0;
  const slot = ANCHOR_SLOT[anchor];
  if (slot) {
    const piece = items.find((i) => i.roomId === room.id && i.slot === slot && !!i.product);
    if (!piece) return null;
    edge = wallBehind(piece, room);
    if (!edge) return null;
    centre = along(edge, piece.position);
    anchorWidth = piece.size.width;
  } else if (anchor === 'wall' && intent.wallIndex != null) {
    edge = wallEdges(room).find((e) => e.index === intent.wallIndex) ?? null;
  }
  edge ??= longestClearWall(room);
  if (!edge) return null;

  // Its band of height. A backsplash runs from the worktop to the wall cabinets over it (or where they would hang, `WALL_UNIT_BOTTOM_M`).
  const cabinets = anchor === 'kitchen' ? items.find((i) => i.roomId === room.id && i.slot === 'kitchen_wall' && wallBehind(i, room)?.index === edge!.index) : undefined;
  const fallback = anchor === 'kitchen' && run
    ? { from: run.size.height <= 1.1 ? run.size.height : 0.9, to: cabinets ? cabinets.elevationM : WALL_UNIT_BOTTOM_M }
    : defaultHeight(family, anchor, H);
  const hFrom = num(intent.heightFromM);
  const hTo = num(intent.heightToM);
  let height = { from: clamp(hFrom ?? fallback.from, 0, H - 0.1), to: clamp(hTo ?? fallback.to, 0.1, H) };
  if (height.to - height.from < 0.15) height = fallback;
  if (family === 'light') height = { from: clamp(hFrom ?? H - 0.1, 0.2, H - 0.02), to: clamp((hFrom ?? H - 0.1) + 0.05, 0.25, H) };

  // The stretch: the whole wall for mouldings, the longest clear stretch for niches (a build-out
  // over a door is no niche), else centred on its anchor and kept to the clear stretch it is in.
  let from: number;
  let to: number;
  if (family === 'moulding') {
    from = 0;
    to = edge.length;
  } else {
    // Clear of the openings and, for decor that covers its stretch, of what hangs there for use —
    // the mirror over a basin, the wall cabinets: the niche goes beside the mirror, not over it. A
    // build-out (a niche wall) also keeps off what stands against the wall: it would stand in the
    // bath. Thinner decor stays, and what stands in front of it is moved off it (`clearOfDecor`).
    const blocked = [...(COVERS_WALL.has(family) ? fixturesOnWall(edge, room, items, height) : []), ...(BUILT_OUT.has(family) ? floorPiecesOnWall(edge, room, items) : [])];
    const spans = freeSpans(edge, [...room.openings, ...blocked], 0, edge.length, 0.1);
    if (spans.length === 0) return null;
    const containing = centre != null ? spans.find(([a, b]) => centre! >= a && centre! <= b) : undefined;
    const [a, b] = containing ?? spans.reduce((best, s) => (s[1] - s[0] > best[1] - best[0] ? s : best));
    const clear = b - a;
    // A backsplash is as long as the run, whatever width was asked: a 1.2 m strip of marble
    // behind a 2.5 m worktop looked unfinished.
    const widthAsked = anchor === 'kitchen' ? null : num(intent.widthM);
    const auto = WHOLE_WALL.includes(family) || centre == null ? clear : anchorWidth + 2 * (ANCHOR_MARGIN[anchor] ?? 0.4);
    const width = clamp(widthAsked ?? auto, 0.3, clear);
    const c = centre ?? (a + b) / 2;
    from = clamp(c - width / 2, a, b - width);
    to = from + width;
    if (WHOLE_WALL.includes(family) && clear < 1.2) return null;
  }


  return {
    ...base,
    wallIndex: edge.index,
    span: { from: round3(from), to: round3(to) },
    height: { from: round3(height.from), to: round3(height.to) },
    materials: resolveMaterials(family, intent.materials, catalog, params),
  };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Whether two pieces would stand on the same stretch of the same wall at the same height. */
export function overlaps(a: DecorPiece, b: DecorPiece): boolean {
  if (a.roomId !== b.roomId || a.wallIndex == null || a.wallIndex !== b.wallIndex) return false;
  const x = Math.min(a.span.to, b.span.to) - Math.max(a.span.from, b.span.from);
  const y = Math.min(a.height.to, b.height.to) - Math.max(a.height.from, b.height.from);
  return x > 0.1 && y > 0.1;
}

/**
 * A room's intents made pieces: at most four, none on top of another (the first asked wins),
 * one cove. Ids are the room's and a count.
 */
export function resolveRoomDecor(intents: DecorIntent[], room: PlanRoom, items: PlacedItem[], catalog: CatalogProduct[]): DecorPiece[] {
  const pieces: DecorPiece[] = [];
  for (const intent of intents) {
    if (pieces.length >= 4) break;
    const piece = resolveDecor(intent, room, items, catalog, `decor-${room.id}-${pieces.length + 1}`);
    if (!piece) continue;
    if (piece.wallIndex == null && pieces.some((p) => p.wallIndex == null)) continue;
    if (pieces.some((p) => overlaps(p, piece))) continue;
    pieces.push(piece);
  }
  return pieces;
}

/** A piece's wall edge — for the builders and the panel. */
export function pieceEdge(piece: Pick<DecorPiece, 'wallIndex'>, room: Pick<PlanRoom, 'polygon'>): PlanEdge | null {
  return piece.wallIndex == null ? null : roomEdges(room.polygon).find((e) => e.index === piece.wallIndex) ?? null;
}
