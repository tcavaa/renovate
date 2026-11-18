/**
 * Made-to-measure joinery (the rulebook, 6 Nov 2026): a cabinet the joiner builds to the wall
 * rather than one a shop sells — the basin's vanity, the washing machine's column (a dryer on the
 * machine), the hall's wardrobe round the coats, the boiler and the shoes, a bedroom's wall of
 * wardrobe. One decor piece of the `cabinet` family, its sections left to right along its wall
 * (`CabinetSection`): each its own width, height and depth, so a vanity 80 cm high and a washer's
 * column 1.8 m high are one piece of furniture "with different openings".
 *
 * Its fronts are made in one of the kitchen maker's materials (`kitchen-custom`, priced by the m²
 * of façade — the same joiner, the same price list as a made-to-measure kitchen), the flat's
 * kitchen's own when it has one, so the joinery reads as one design. Bought by its façade: every
 * section's front and the two ends' sides (`decorUses`). Pure.
 */

import { isKitchenMaterial } from '@/lib/design/catalog';
import type { CatalogProduct } from '@/lib/design/matcher';
import { isPassage, ONTO_WINDOW_M, roomEdges, type PlanEdge } from '@/lib/design/planGeometry';
import { wallBehind } from '@/lib/design/pieceGeometry';
import type { CabinetSection, DecorMaterial, DecorPiece, Opening, PlacedItem, PlanRoom, StyleId } from '@/lib/design/types';
import { decorDepth, freeSpans } from './layout';
import { WC_BOX_DEPTH_M, WC_BOX_WIDTH_M, WC_SIDE_M } from '@/lib/design/rules';
import { floorTaken } from '@/lib/design/shower';
import type { RadiatorBody } from '@/lib/design/radiators';
import { alongWall, floorCorners } from '@/lib/design/wallClear';
import { COMPANION_SLOTS, NOT_IN_THE_WAY } from '@/lib/design/kinds';
import { decorMaterialFrom } from './resolve';

/** A column's side panels and the gap round a machine, metres. */
export const CARCASS_M = 0.018;
/** The washing machine's column: 65 cm deep (the rulebook, BA-12), the machine's width and its sides. */
export const WASHER_COLUMN_DEPTH_M = 0.65;
/** A vanity is never taller than 90 cm (BA-7). */
export const VANITY_MAX_M = 0.9;
export const VANITY_MIN_M = 0.7;
export const VANITY_DEPTH_M = 0.5;
/** A sliver of wall left beside joinery under this is joined to it — no 10–20 cm gaps. */
export const JOINERY_SLIVER_M = 0.3;

const mm = (m: number) => Math.round(m * 1000);

/** The joiner's material for the flat: the kitchen run's (the flat's joinery is one design), else the style's, else the cheapest. */
export function joineryMaterial(catalog: CatalogProduct[], styleId: StyleId, items: PlacedItem[] = []): CatalogProduct | null {
  const materials = catalog.filter((p) => isKitchenMaterial(p) && (!p.model3dKind || p.model3dKind === 'kitchen_run'));
  if (materials.length === 0) return null;
  const run = items.find((i) => i.slot === 'kitchen_run' && i.kitchenMaterial);
  const same = run ? materials.find((m) => m.id === run.kitchenMaterial!.productId) : undefined;
  if (same) return same;
  const affinity = (p: CatalogProduct) => (Array.isArray(p.styleTags) && (p.styleTags as string[]).includes(styleId) ? 1 : 0);
  return [...materials].sort((a, b) => affinity(b) - affinity(a) || a.pricePerUnit - b.pricePerUnit)[0];
}

export function joineryFace(material: CatalogProduct | null): Partial<Record<'face', DecorMaterial>> {
  return material ? { face: decorMaterialFrom(material) } : {};
}

/** The sections' total width, metres. */
export function sectionsWidth(sections: readonly CabinetSection[]): number {
  return sections.reduce((s, x) => s + x.widthMm, 0) / 1000;
}

/**
 * The narrowest section a cabinet is made of: a filler of a few centimetres is no cupboard — and
 * the save route refuses one (`decorPieceSchema`'s sections, `widthMm`), so a flat holding it could
 * not be saved at all.
 */
export const MIN_SECTION_MM = 100;

/** Sections as wide as what stands in them, whatever is left over: a machine's column. */
const MACHINE_SECTIONS: ReadonlySet<CabinetSection['kind']> = new Set(['washer', 'boiler', 'kitchen']);

/**
 * The sections with each one narrower than `MIN_SECTION_MM` folded into the section beside it —
 * the one before it, or after, that is not a machine's column, else the one before — so the
 * cabinet keeps its width and every section is one a joiner can make. A section something stands
 * in (`itemId`) is never folded away.
 */
export function withoutSlivers(sections: readonly CabinetSection[]): CabinetSection[] {
  const out = sections.map((s) => ({ ...s }));
  const sliver = (s: CabinetSection) => s.widthMm < MIN_SECTION_MM && !s.itemId;
  for (let i = 0; i < out.length && out.length > 1; ) {
    if (!sliver(out[i])) {
      i++;
      continue;
    }
    const takes = (j: number) => j >= 0 && j < out.length && !MACHINE_SECTIONS.has(out[j].kind);
    const into = takes(i - 1) ? i - 1 : takes(i + 1) ? i + 1 : i > 0 ? i - 1 : i + 1;
    out[into] = { ...out[into], widthMm: out[into].widthMm + out[i].widthMm };
    out.splice(i, 1);
    i = Math.max(0, Math.min(i, into));
  }
  return out;
}

/** A cabinet piece on `edge` from `from` metres along it, its sections left to right (none narrower than a cupboard: `withoutSlivers`). */
export function cabinetPiece(id: string, room: PlanRoom, edge: PlanEdge, from: number, made: CabinetSection[], face: Partial<Record<'face', DecorMaterial>>): DecorPiece {
  const sections = withoutSlivers(made);
  const width = sectionsWidth(sections);
  const top = Math.max(...sections.map((s) => s.heightMm)) / 1000;
  return {
    id,
    roomId: room.id,
    family: 'cabinet',
    wallIndex: edge.index,
    span: { from: round3(from), to: round3(from + width) },
    height: { from: 0, to: round3(top) },
    params: { sections, depthMm: Math.max(...sections.map((s) => s.depthMm)) },
    materials: face,
    anchor: 'joinery',
  };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** The sections of a piece, or one plain section filling it when it has none (a piece drawn by hand). */
export function cabinetSections(piece: Pick<DecorPiece, 'params' | 'span' | 'height'>): CabinetSection[] {
  const sections = piece.params.sections;
  if (sections && sections.length > 0) return sections;
  return [{ kind: 'doors', widthMm: mm(Math.abs(piece.span.to - piece.span.from)), heightMm: mm(Math.abs(piece.height.to - piece.height.from)), depthMm: piece.params.depthMm ?? 600 }];
}

/**
 * Where each section stands along the wall, metres from the wall's first corner — sections are
 * stretched or squeezed in proportion when the piece was resized to another width.
 */
export function sectionSpans(piece: Pick<DecorPiece, 'params' | 'span' | 'height'>): Array<{ section: CabinetSection; x0: number; x1: number }> {
  const sections = cabinetSections(piece);
  const from = Math.min(piece.span.from, piece.span.to);
  const width = Math.abs(piece.span.to - piece.span.from);
  const total = sectionsWidth(sections) || width;
  const scale = width / total;
  let x = from;
  return sections.map((section) => {
    const w = (section.widthMm / 1000) * scale;
    const out = { section, x0: x, x1: x + w };
    x += w;
    return out;
  });
}

/** Square metres of façade the joiner prices: every section's front, the two ends' sides, and the top of a section lower than its neighbour's. */
export function cabinetFacadeM2(piece: Pick<DecorPiece, 'params' | 'span' | 'height'>): number {
  const spans = sectionSpans(piece);
  if (spans.length === 0) return 0;
  let m2 = 0;
  spans.forEach(({ section, x0, x1 }, i) => {
    const h = section.heightMm / 1000;
    const d = section.depthMm / 1000;
    m2 += (x1 - x0) * h;
    const left = spans[i - 1]?.section;
    const right = spans[i + 1]?.section;
    // A kitchen's corner leg: its front and its one free end — the other is against the run.
    if (section.kind === 'kitchen') {
      m2 += d * h;
      return;
    }
    // An end's side shows whole; a side against a lower or shallower neighbour shows above or in front of it.
    m2 += d * (h - Math.min(h, left ? left.heightMm / 1000 : 0));
    m2 += d * (h - Math.min(h, right ? right.heightMm / 1000 : 0));
  });
  // A corner leg's wall cabinets: their front.
  const hung = piece.params.wallUnits;
  if (hung) m2 += Math.abs(hung.to - hung.from) * (hung.heightMm / 1000);
  return Math.round(m2 * 100) / 100;
}

/** How deep a cabinet stands off its wall: its deepest section. */
export function cabinetDepth(piece: Pick<DecorPiece, 'params'>): number {
  const sections = piece.params.sections ?? [];
  const deepest = sections.length > 0 ? Math.max(...sections.map((s) => s.depthMm)) : piece.params.depthMm ?? 600;
  return Math.min(0.9, Math.max(0.1, deepest / 1000));
}

/** Decor that takes floor — a cabinet, a box, a niche wall: what joinery may not be built into. */
const SOLID_DECOR = new Set<string>(['cabinet', 'box', 'niche']);
/** The way kept clear in front of a door, as deep as `inDoorway`'s (90 cm); and the little a window round the corner keeps. */
const DOOR_WAY_M = 0.9;
const CORNER_WINDOW_CLEAR_M = 0.4;
/** How much of an opening round the corner the studio's own builder lets joinery stand in front of. */
const CORNER_OVERLAP_M = 0.25;

/** The floor a piece of decor stands on, as its four corners — null for one that is flat on its wall. */
export function decorFootprint(piece: Pick<DecorPiece, 'family' | 'params' | 'wallIndex' | 'span' | 'anchor'>, room: Pick<PlanRoom, 'polygon'>): Array<{ x: number; z: number }> | null {
  if (piece.wallIndex == null || !SOLID_DECOR.has(piece.family)) return null;
  const edge = roomEdges(room.polygon).find((e) => e.index === piece.wallIndex);
  if (!edge) return null;
  const lo = Math.min(piece.span.from, piece.span.to);
  const hi = Math.max(piece.span.from, piece.span.to);
  const depth = decorDepth(piece);
  const at = (s: number, off: number) => ({ x: edge.a.x + edge.dir.x * s + edge.inward.x * off, z: edge.a.z + edge.dir.z * s + edge.inward.z * off });
  return [at(lo, 0), at(hi, 0), at(hi, depth), at(lo, depth)];
}

/**
 * How far joinery `depth` deep keeps off each end of a wall, for an opening on the wall round the
 * corner it would stand in front of. `strict` (generation): a door or an archway it would stand in
 * front of by any of its width needs its way kept clear (90 cm), and a window it would stand in
 * front of by more than a piece may reach onto one (`ONTO_WINDOW_M`) is not built over (40 cm).
 * Otherwise (the studio's own builder, as a person drags and resizes joinery): only an opening it
 * would stand in front of by 25 cm or more — a door's 90 cm, any other's 40 cm. `[from, to]` along
 * the wall.
 */
export function cornerClearance(room: PlanRoom, edge: PlanEdge, depth: number, strict = false): [number, number] {
  const edges = roomEdges(room.polygon);
  let lo = 0;
  let hi = edge.length;
  for (const opening of room.openings) {
    if (opening.wallIndex === edge.index || opening.kind === 'railing') continue;
    const other = edges.find((e) => e.index === opening.wallIndex);
    // Only a wall that meets this one at a corner: one across the room is no concern of the joinery's.
    if (!other || Math.abs(other.dir.x * edge.dir.x + other.dir.z * edge.dir.z) > 0.3) continue;
    const centre = opening.t * other.length;
    const ends = [centre - opening.widthM / 2, centre + opening.widthM / 2].map((s) => ({ x: other.a.x + other.dir.x * s, z: other.a.z + other.dir.z * s }));
    const off = ends.map((p) => (p.x - edge.a.x) * edge.inward.x + (p.z - edge.a.z) * edge.inward.z);
    // How much of the opening the joinery would stand in front of. Generation: none of a door's
    // way; of a window, no more than a piece may stand onto one. The studio lives with less than
    // 25 cm of either (a hall 1.8 m wide, its door in the middle of the end wall).
    const passage = strict ? isPassage(opening) : opening.kind === 'door';
    const overlap = Math.min(Math.max(...off), depth) - Math.max(Math.min(...off), 0);
    if (strict ? overlap <= (passage ? 1e-6 : ONTO_WINDOW_M) : overlap < CORNER_OVERLAP_M) continue;
    const along = ends.map((p) => (p.x - edge.a.x) * edge.dir.x + (p.z - edge.a.z) * edge.dir.z);
    const clear = passage ? DOOR_WAY_M : CORNER_WINDOW_CLEAR_M;
    if (Math.max(...along) < 0.3) lo = Math.max(lo, clear);
    else if (Math.min(...along) > edge.length - 0.3) hi = Math.min(hi, edge.length - clear);
  }
  // To the millimetre the joinery is measured in, on the clear side: a span rounded to it
  // (`cabinetPiece`) does not then reach a fraction of a millimetre into the door's way.
  return [Math.max(0, Math.ceil(lo * 1000 - 1e-6) / 1000), Math.floor(hi * 1000 + 1e-6) / 1000];
}

/** What else `freeStretch` reads. */
export interface StretchOptions {
  /**
   * How tall the joinery is: a window whose sill is at or over its top is not built over and does
   * not stop it (a vanity under a window). Unknown: every window stops it.
   */
  top?: number;
  /**
   * The flat's radiators and towel rails (`radiatorBodies`): joinery is not built over one, nor
   * against one round the corner — but under one whose bottom is at or over its `top`. Not given:
   * none is read.
   */
  radiators?: readonly RadiatorBody[];
  /**
   * Generation's joinery (the bathroom, hall and bedroom passes): a door's way and a window round
   * the corner are kept clear as `cornerClearance(…, true)` keeps them, whatever stands in that
   * corner, and so is every door's way across the room. Not set (the studio's own builder, as a
   * person drags, resizes or fits joinery): the corner as `cornerClearance` keeps it, waived for a
   * piece that stands in that corner, and no door across the room is read.
   */
  strict?: boolean;
}

/** What stands within this of joinery's face, not only what it would stand in, stops it. */
const FACE_GAP_M = 0.05;
/**
 * What joinery does not stop at besides what stands before no wall (`NOT_IN_THE_WAY`): what hangs
 * on the wall over it (a picture, a mirror — anything hung higher than `HUNG_OVER_JOINERY_M`) and
 * what rides on a piece (a basin's tap, a bath's mixer, the dryer on the machine). `wallBlocks`
 * reads these as blocks of their own height instead: a socket or a radiator is in their way.
 */
const OVER_JOINERY: ReadonlySet<string> = new Set(['artwork', 'mirror', ...COMPANION_SLOTS]);
const HUNG_OVER_JOINERY_M = 1.2;

/**
 * The stretch of a wall clear of its doors and windows, of every piece standing against it (but
 * those in `except`) and of the joinery and boxes already built (but those in `exceptDecor`) that
 * contains `at` metres along the wall — what joinery may fill there. It stops short of a corner
 * whose other wall has a door or a window within its depth (`cornerClearance`) — in the studio
 * unless `at` itself is in that corner (what stands there was put there, and its cupboard goes round
 * it), for generation whatever stands there (`StretchOptions.strict`). Null where `at` has no such
 * stretch.
 */
export function freeStretch(
  room: PlanRoom,
  edge: PlanEdge,
  at: number,
  items: readonly PlacedItem[],
  except: readonly string[] = [],
  depth = 0.65,
  decor: readonly DecorPiece[] = [],
  exceptDecor: readonly string[] = [],
  options: StretchOptions = {}
): [number, number] | null {
  const openings = room.openings.filter((o) => !underSill(o, options.top));
  const spans = freeSpans(edge, openings, 0, edge.length, 0.05);
  const stretch = spans.find(([a, b]) => at >= a - 1e-6 && at <= b + 1e-6);
  if (!stretch) return null;
  const strict = options.strict === true;
  const [cornerLo, cornerHi] = cornerClearance({ ...room, openings }, edge, depth, strict);
  let [a, b] = stretch;
  if (strict) {
    // A door's way and a window round the corner are kept clear whatever stands by them: a piece
    // standing in that corner gets no joinery round it there.
    a = Math.max(a, cornerLo);
    b = Math.min(b, cornerHi);
    if (at < a - 1e-6 || at > b + 1e-6) return null;
  } else {
    if (at - cornerLo >= JOINERY_SLIVER_M) a = Math.max(a, cornerLo);
    if (cornerHi - at >= JOINERY_SLIVER_M) b = Math.min(b, cornerHi);
  }
  // What is in the way, as its corners: a piece of furniture, or decor that takes floor — and how
  // far in front of the joinery's face it still counts.
  const blocks: Array<{ corners: Array<{ x: number; z: number }>; gap: number }> = [];
  for (const item of items) {
    if (item.roomId !== room.id || except.includes(item.id) || item.elevationM > HUNG_OVER_JOINERY_M || NOT_IN_THE_WAY.has(item.slot) || OVER_JOINERY.has(item.slot)) continue;
    if (item.slot !== 'toilet') {
      // A shower takes its tray, not the column at its back (`floorTaken`).
      blocks.push({ corners: footprint(floorTaken(item)), gap: FACE_GAP_M });
      continue;
    }
    const wc = withItsBox(item, room);
    blocks.push({ corners: footprint(wc), gap: FACE_GAP_M });
    // A WC also keeps its box's 80 cm and its 40 cm either side of its middle, not its own 36 cm: a
    // washer's column 18 cm off a WC's middle left no room to sit and its box ran into the column.
    // That room is itself the WC's clearance: joinery may come up to it, not a gap short of it.
    blocks.push({ corners: footprint({ ...wc, size: { ...wc.size, width: Math.max(wc.size.width, 2 * WC_SIDE_M + 0.02, WC_BOX_WIDTH_M) } }), gap: 0 });
  }
  for (const piece of decor) {
    if (piece.roomId !== room.id || exceptDecor.includes(piece.id)) continue;
    const corners = decorFootprint(piece, room);
    if (corners) blocks.push({ corners, gap: FACE_GAP_M });
  }
  // A door's way, wherever the door is — across the room too, or round a corner of an L: as deep
  // into the room as `inDoorway` keeps it, the door's width wide.
  for (const opening of strict ? room.openings : []) {
    if (opening.wallIndex === edge.index || !isPassage(opening)) continue;
    const other = roomEdges(room.polygon).find((e) => e.index === opening.wallIndex);
    if (!other) continue;
    const at = (s: number, off: number) => ({ x: other.a.x + other.dir.x * s + other.inward.x * off, z: other.a.z + other.dir.z * s + other.inward.z * off });
    const lo = opening.t * other.length - opening.widthM / 2;
    const hi = opening.t * other.length + opening.widthM / 2;
    blocks.push({ corners: [at(lo, 0), at(hi, 0), at(hi, DOOR_WAY_M), at(lo, DOOR_WAY_M)], gap: 0 });
  }
  for (const body of options.radiators ?? []) {
    if (body.room.id !== room.id || (options.top != null && body.bottom >= options.top)) continue;
    const e = body.edge;
    const at = (s: number, off: number) => ({ x: e.a.x + e.dir.x * s + e.inward.x * off, z: e.a.z + e.dir.z * s + e.inward.z * off });
    blocks.push({ corners: [at(body.from, 0), at(body.to, 0), at(body.to, body.depthM), at(body.from, body.depthM)], gap: FACE_GAP_M });
  }
  for (const { corners, gap } of blocks) {
    // The footprint as seen along the wall, where it comes within the joinery's depth of it.
    const seen = alongWall(edge, corners, depth + gap - 1e-6);
    if (!seen) continue;
    const [lo, hi] = seen;
    if (hi <= a || lo >= b) continue;
    if (hi <= at + 1e-6) a = Math.max(a, hi);
    else if (lo >= at - 1e-6) b = Math.min(b, lo);
    else return null;
  }
  return b - a > 0.05 ? [a, b] : null;
}

/**
 * The floor a WC takes with its box: a WC with its back on its wall gets a box behind it for its
 * cistern (`wcBoxes`) and stands in front of the box (`clearOfDecor`), `WC_BOX_DEPTH_M` off the
 * wall — so from its wall to its front as it will stand. One already off its wall by that much
 * (in front of its box) is where it is.
 */
function withItsBox(item: PlacedItem, room: PlanRoom): Pick<PlacedItem, 'position' | 'rotation' | 'size'> {
  const wall = wallOf(item, room);
  if (!wall) return item;
  const f = { x: Math.sin(item.rotation), z: Math.cos(item.rotation) };
  const back = { x: item.position.x - f.x * (item.size.depth / 2), z: item.position.z - f.z * (item.size.depth / 2) };
  const gap = Math.max(0, (back.x - wall.edge.a.x) * wall.edge.inward.x + (back.z - wall.edge.a.z) * wall.edge.inward.z);
  if (gap >= WC_BOX_DEPTH_M) return item;
  // From the wall to its front once it stands in front of its box.
  const depth = WC_BOX_DEPTH_M + item.size.depth;
  const shift = depth / 2 - item.size.depth / 2 - gap;
  return { position: { x: item.position.x + f.x * shift, z: item.position.z + f.z * shift }, rotation: item.rotation, size: { ...item.size, depth } };
}

/** A window joinery `top` high stands under: its sill at or over the joinery's top. */
function underSill(opening: Opening, top: number | undefined): boolean {
  return top != null && opening.kind === 'window' && opening.sillM >= top;
}

function footprint(item: Pick<PlacedItem, 'position' | 'rotation' | 'size'>): Array<{ x: number; z: number }> {
  return floorCorners(item.position, item.rotation, item.size.width, item.size.depth);
}

/**
 * The wall a piece stands with its back against (`wallBehind`: square to it within about 25°, its
 * back's middle within 15 cm either side of the wall's line and no more than 5 cm past an end, the
 * nearest either side), and how far along it its middle is.
 */
export function wallOf(item: Pick<PlacedItem, 'position' | 'rotation' | 'size'>, room: PlanRoom): { edge: PlanEdge; along: number } | null {
  const wall = wallBehind(item, roomEdges(room.polygon), { facing: 0.9, by: 'gap', min: -0.15, max: 0.15, past: 0.05, rank: 'abs' });
  if (!wall) return null;
  const { edge } = wall;
  return { edge, along: (item.position.x - edge.a.x) * edge.dir.x + (item.position.z - edge.a.z) * edge.dir.z };
}
