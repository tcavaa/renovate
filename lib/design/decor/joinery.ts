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
import { roomEdges, type PlanEdge } from '@/lib/design/planGeometry';
import type { CabinetSection, DecorMaterial, DecorPiece, PlacedItem, PlanRoom, StyleId } from '@/lib/design/types';
import { decorDepth, freeSpans } from './layout';
import { WC_BOX_WIDTH_M, WC_SIDE_M } from '@/lib/design/rules';
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

/** A cabinet piece on `edge` from `from` metres along it, its sections left to right. */
export function cabinetPiece(id: string, room: PlanRoom, edge: PlanEdge, from: number, sections: CabinetSection[], face: Partial<Record<'face', DecorMaterial>>): DecorPiece {
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
/** The way a door on the wall round the corner needs kept clear in front of it, and the little a window there does. */
const CORNER_DOOR_CLEAR_M = 0.9;
const CORNER_WINDOW_CLEAR_M = 0.4;
/** How much of such an opening joinery may stand in front of before it has to keep off the corner. */
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
 * How far joinery `depth` deep keeps off each end of a wall: a door on the wall round the corner
 * that it would stand in front of (by 25 cm or more of the opening) needs its way kept clear
 * (90 cm), and a window there is not built over (40 cm). `[from, to]` along the wall.
 */
export function cornerClearance(room: PlanRoom, edge: PlanEdge, depth: number): [number, number] {
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
    // How much of the opening the joinery would stand in front of: a hand's width of a door's
    // edge is lived with (a hall 1.8 m wide, its door in the middle of the end wall), more is not.
    if (Math.min(Math.max(...off), depth) - Math.max(Math.min(...off), 0) < CORNER_OVERLAP_M) continue;
    const along = ends.map((p) => (p.x - edge.a.x) * edge.dir.x + (p.z - edge.a.z) * edge.dir.z);
    const clear = opening.kind === 'door' ? CORNER_DOOR_CLEAR_M : CORNER_WINDOW_CLEAR_M;
    if (Math.max(...along) < 0.3) lo = Math.max(lo, clear);
    else if (Math.min(...along) > edge.length - 0.3) hi = Math.min(hi, edge.length - clear);
  }
  return [lo, hi];
}

/**
 * The stretch of a wall clear of its doors and windows, of every piece standing against it (but
 * those in `except`) and of the joinery and boxes already built (but those in `exceptDecor`) that
 * contains `at` metres along the wall — what joinery may fill there. It stops short of a corner
 * whose other wall has a door or a window within its depth (`cornerClearance`), unless `at` itself
 * is in that corner: what stands there was put there, and its cupboard goes round it.
 */
export function freeStretch(
  room: PlanRoom,
  edge: PlanEdge,
  at: number,
  items: readonly PlacedItem[],
  except: readonly string[] = [],
  depth = 0.65,
  decor: readonly DecorPiece[] = [],
  exceptDecor: readonly string[] = []
): [number, number] | null {
  const spans = freeSpans(edge, room.openings, 0, edge.length, 0.05);
  const stretch = spans.find(([a, b]) => at >= a - 1e-6 && at <= b + 1e-6);
  if (!stretch) return null;
  let [a, b] = stretch;
  const [cornerLo, cornerHi] = cornerClearance(room, edge, depth);
  if (at - cornerLo >= JOINERY_SLIVER_M) a = Math.max(a, cornerLo);
  if (cornerHi - at >= JOINERY_SLIVER_M) b = Math.min(b, cornerHi);
  // What is in the way, as its corners: a piece of furniture, or decor that takes floor.
  const blocks: Array<Array<{ x: number; z: number }>> = [];
  for (const item of items) {
    if (item.roomId !== room.id || except.includes(item.id) || item.elevationM > 1.2 || ['rug', 'curtain', 'pendant', 'artwork', 'mirror', 'blind', 'door_mat', 'tap', 'bath_mixer', 'dryer'].includes(item.slot)) continue;
    // A WC takes its box's 80 cm and its 40 cm either side of its middle, not its own 36 cm: a
    // washer's column 18 cm off a WC's middle left no room to sit and its box ran into the column.
    blocks.push(footprint(item.slot === 'toilet' ? { ...item, size: { ...item.size, width: Math.max(item.size.width, 2 * WC_SIDE_M + 0.02, WC_BOX_WIDTH_M) } } : item));
  }
  for (const piece of decor) {
    if (piece.roomId !== room.id || exceptDecor.includes(piece.id)) continue;
    const corners = decorFootprint(piece, room);
    if (corners) blocks.push(corners);
  }
  for (const corners of blocks) {
    // The footprint as seen along the wall, where it comes within the joinery's depth of it.
    const off = corners.map((p) => (p.x - edge.a.x) * edge.inward.x + (p.z - edge.a.z) * edge.inward.z);
    if (Math.min(...off) > depth + 0.05 || Math.max(...off) < -0.05) continue;
    const along = corners.map((p) => (p.x - edge.a.x) * edge.dir.x + (p.z - edge.a.z) * edge.dir.z);
    const lo = Math.min(...along);
    const hi = Math.max(...along);
    if (hi <= a || lo >= b) continue;
    if (hi <= at + 1e-6) a = Math.max(a, hi);
    else if (lo >= at - 1e-6) b = Math.min(b, lo);
    else return null;
  }
  return b - a > 0.05 ? [a, b] : null;
}

function footprint(item: Pick<PlacedItem, 'position' | 'rotation' | 'size'>): Array<{ x: number; z: number }> {
  const f = { x: Math.sin(item.rotation), z: Math.cos(item.rotation) };
  const r = { x: f.z, z: -f.x };
  const w = item.size.width / 2;
  const d = item.size.depth / 2;
  return [[-w, -d], [w, -d], [w, d], [-w, d]].map(([u, v]) => ({ x: item.position.x + r.x * u + f.x * v, z: item.position.z + r.z * u + f.z * v }));
}

/** The wall a piece stands with its back against (within 15 cm), and how far along it its middle is. */
export function wallOf(item: Pick<PlacedItem, 'position' | 'rotation' | 'size'>, room: PlanRoom): { edge: PlanEdge; along: number } | null {
  const f = { x: Math.sin(item.rotation), z: Math.cos(item.rotation) };
  const back = { x: item.position.x - f.x * (item.size.depth / 2), z: item.position.z - f.z * (item.size.depth / 2) };
  let best: { edge: PlanEdge; along: number; d: number } | null = null;
  for (const edge of roomEdges(room.polygon)) {
    if (edge.inward.x * f.x + edge.inward.z * f.z < 0.9) continue;
    const along = (back.x - edge.a.x) * edge.dir.x + (back.z - edge.a.z) * edge.dir.z;
    if (along < -0.05 || along > edge.length + 0.05) continue;
    const d = Math.abs((back.x - edge.a.x) * edge.inward.x + (back.z - edge.a.z) * edge.inward.z);
    if (d <= 0.15 && (!best || d < best.d)) best = { edge, along: (item.position.x - edge.a.x) * edge.dir.x + (item.position.z - edge.a.z) * edge.dir.z, d };
  }
  return best ? { edge: best.edge, along: best.along } : null;
}
