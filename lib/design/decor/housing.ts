/**
 * A piece of furniture and the joinery built round it are one thing to the person who owns them:
 * the washing machine and its column, the basin and its vanity, the WC and the box its cistern is
 * in, a built-in bath and its tiled enclosure. They are two records here — a `PlacedItem` with a
 * model and a `DecorPiece` built in code — so this module is what keeps them together (the owner's
 * notes of 13 Nov 2026):
 *
 * - **The link.** A cabinet's section names the piece standing in it (`CabinetSection.itemId`); a
 *   box names its WC or its bath (`DecorPiece.itemId`). Pieces from before the link take theirs by
 *   where they stand (`adoptHoused`).
 * - **The furniture moved** (`followHoused`): its housing goes to where it stands now — a box
 *   centred behind its WC, a column round its machine at the machine's new wall, a vanity under its
 *   basin. A section leaves a longer piece of joinery when its machine does. Where the new place
 *   has no wall or no room for it, the housing is given up; the piece's card builds it again.
 * - **The housing moved or resized** (`carryHoused`): what stands in it goes with it, the basin at
 *   the vanity's new height.
 * - **A piece set down from the catalogue** gets its housing as a generated one does (`houseItem`),
 *   and one whose housing was deleted gets it back from its card.
 * - **Joinery never runs into anything** (`freeExtent`): moved or resized, it stays inside the
 *   stretch of wall clear of the doors and windows, the furniture and the other joinery.
 *
 * Pure: no React, no three.js.
 */

import { roomEdges, type PlanEdge } from '@/lib/design/planGeometry';
import { WC_BOX_DEPTH_M, WC_BOX_HALF_M, WC_BOX_WIDTH_M } from '@/lib/design/rules';
import type { CabinetSection, DecorMaterial, DecorPiece, DecorSlot, PlacedItem, PlanRoom, SlotKind } from '@/lib/design/types';
import { CARCASS_M, JOINERY_SLIVER_M, VANITY_DEPTH_M, VANITY_MAX_M, VANITY_MIN_M, WASHER_COLUMN_DEPTH_M, freeStretch, sectionSpans, sectionsWidth } from './joinery';
import { decorDepth, freeSpans } from './layout';
import type { DecorExtent } from './resize';

/** What a slot is housed in. */
export type HousingKind = 'vanity' | 'column' | 'wc' | 'bath';
export const HOUSING_OF_SLOT: Partial<Record<SlotKind, HousingKind>> = { sink: 'vanity', washer: 'column', toilet: 'wc', bathtub: 'bath' };

/** The widest a vanity grows to on its own, and the room it keeps beside its basin (both sides together). */
const VANITY_GROW_M = 1.8;
const VANITY_ELBOW_M = 0.4;
/** The narrowest and lowest a section of joinery is made. */
const SECTION_MIN_WIDTH_M = 0.2;
const SECTION_MIN_HEIGHT_M = 0.3;
/** The pieces that go where their host goes: the basin's tap, the dryer on the machine, the bath's mixer. */
const COMPANIONS = ['tap', 'dryer', 'mixer'] as const;

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const mm = (m: number) => Math.round(m * 1000);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const alongOf = (edge: PlanEdge, p: { x: number; z: number }) => (p.x - edge.a.x) * edge.dir.x + (p.z - edge.a.z) * edge.dir.z;
const offOf = (edge: PlanEdge, p: { x: number; z: number }) => (p.x - edge.a.x) * edge.inward.x + (p.z - edge.a.z) * edge.inward.z;
const onEdge = (edge: PlanEdge, along: number, off: number) => ({ x: round3(edge.a.x + edge.dir.x * along + edge.inward.x * off), z: round3(edge.a.z + edge.dir.z * along + edge.inward.z * off) });

export interface Housing {
  piece: DecorPiece;
  /** The cabinet's section the piece stands in; null for a box. */
  section: number | null;
}

/** The joinery or the box built for a piece of furniture, by its link. */
export function housingOf(itemId: string, decor: readonly DecorPiece[]): Housing | null {
  for (const piece of decor) {
    if (piece.family === 'box' && piece.itemId === itemId) return { piece, section: null };
    if (piece.family !== 'cabinet') continue;
    const section = (piece.params.sections ?? []).findIndex((s) => s.itemId === itemId);
    if (section >= 0) return { piece, section };
  }
  return null;
}

/** The ids of every piece of furniture a decor piece houses. */
export function housedIds(piece: Pick<DecorPiece, 'family' | 'itemId' | 'params'>): string[] {
  if (piece.family === 'box') return piece.itemId ? [piece.itemId] : [];
  if (piece.family !== 'cabinet') return [];
  return (piece.params.sections ?? []).flatMap((s) => (s.itemId ? [s.itemId] : []));
}

/** A corner leg is its kitchen run's: it is not housing, and it stays at its corner (`lib/design/kitchenCorner`). */
export function isKitchenLeg(piece: Pick<DecorPiece, 'family' | 'params'>): boolean {
  return piece.family === 'cabinet' && !!piece.params.corner;
}

/** The pieces that travel with a host: its tap, its dryer, its mixer. */
export function companionsOf(itemId: string, items: readonly PlacedItem[]): PlacedItem[] {
  const ids = new Set(COMPANIONS.map((c) => `${itemId}-${c}`));
  return items.filter((i) => ids.has(i.id));
}

/**
 * The wall a piece stands with its back to — within `reach` of it, facing away from it — where
 * along it its middle is and how far off it its back stands.
 */
export function backWall(item: Pick<PlacedItem, 'position' | 'rotation' | 'size'>, room: Pick<PlanRoom, 'polygon'>, reach = 0.3): { edge: PlanEdge; along: number; gap: number } | null {
  const f = { x: Math.sin(item.rotation), z: Math.cos(item.rotation) };
  const back = { x: item.position.x - f.x * (item.size.depth / 2), z: item.position.z - f.z * (item.size.depth / 2) };
  let best: { edge: PlanEdge; along: number; gap: number } | null = null;
  for (const edge of roomEdges(room.polygon)) {
    if (edge.inward.x * f.x + edge.inward.z * f.z < 0.9) continue;
    const along = alongOf(edge, item.position);
    if (along < -0.05 || along > edge.length + 0.05) continue;
    const gap = offOf(edge, back);
    if (gap < -0.1 || gap > reach) continue;
    if (!best || gap < best.gap) best = { edge, along, gap };
  }
  return best;
}

/**
 * A piece standing within reach of a wall with its back not to it, turned to stand with its back
 * on that wall — the nearest one. Null out in the room.
 */
function turnedToWall(item: PlacedItem, room: Pick<PlanRoom, 'polygon' | 'open'>): PlacedItem | null {
  const reach = Math.max(item.size.width, item.size.depth) / 2 + 0.45;
  let best: { edge: PlanEdge; along: number; off: number } | null = null;
  for (const edge of roomEdges(room.polygon)) {
    if (room.open?.includes(edge.index)) continue;
    const along = alongOf(edge, item.position);
    const off = offOf(edge, item.position);
    if (along < 0 || along > edge.length || off < 0 || off > reach) continue;
    if (!best || off < best.off) best = { edge, along, off };
  }
  if (!best) return null;
  const half = Math.min(item.size.width, best.edge.length) / 2;
  return { ...item, position: onEdge(best.edge, clamp(best.along, half, best.edge.length - half), item.size.depth / 2 + 0.02), rotation: best.edge.facing };
}

/**
 * Pieces from before the link take it by where they stand: a box behind a WC is that WC's, a
 * `washer` section with a machine in it that machine's, a `basin` section its basin's. The same
 * array when nothing was linked.
 */
export function adoptHoused(decor: DecorPiece[], items: readonly PlacedItem[], rooms: readonly PlanRoom[]): DecorPiece[] {
  const taken = new Set(decor.flatMap(housedIds));
  let changed = false;
  const standsIn = (slot: SlotKind, piece: DecorPiece, x0: number, x1: number, reach: number): PlacedItem | undefined => {
    const room = rooms.find((r) => r.id === piece.roomId);
    if (!room) return undefined;
    return items.find((i) => {
      if (i.roomId !== room.id || i.slot !== slot || taken.has(i.id)) return false;
      const wall = backWall(i, room, reach);
      return !!wall && wall.edge.index === piece.wallIndex && wall.along >= x0 - 0.02 && wall.along <= x1 + 0.02;
    });
  };
  const next = decor.map((piece) => {
    if (piece.wallIndex == null) return piece;
    const lo = Math.min(piece.span.from, piece.span.to);
    const hi = Math.max(piece.span.from, piece.span.to);
    if (piece.family === 'box' && !piece.itemId && (piece.anchor === 'wc' || piece.anchor === 'bath')) {
      const item = standsIn(piece.anchor === 'wc' ? 'toilet' : 'bathtub', piece, lo, hi, piece.anchor === 'wc' ? decorDepth(piece) + 0.3 : 0.3);
      if (!item) return piece;
      taken.add(item.id);
      changed = true;
      return { ...piece, itemId: item.id };
    }
    if (piece.family !== 'cabinet' || !piece.params.sections?.some((s) => !s.itemId && (s.kind === 'basin' || s.kind === 'washer'))) return piece;
    const spans = sectionSpans(piece);
    let linked = false;
    const sections = spans.map(({ section, x0, x1 }) => {
      if (section.itemId || (section.kind !== 'basin' && section.kind !== 'washer')) return section;
      const item = standsIn(section.kind === 'basin' ? 'sink' : 'washer', piece, x0, x1, section.kind === 'basin' ? section.depthMm / 1000 : 0.25);
      if (!item) return section;
      taken.add(item.id);
      linked = true;
      return { ...section, itemId: item.id };
    });
    if (!linked) return piece;
    changed = true;
    return { ...piece, params: { ...piece.params, sections } };
  });
  return changed ? next : decor;
}

/** A piece moved as its host moved: turned about the host's old place, carried to its new one, raised by as much. */
function moved(piece: PlacedItem, from: Pick<PlacedItem, 'position' | 'rotation' | 'elevationM'>, to: Pick<PlacedItem, 'position' | 'rotation' | 'elevationM' | 'roomId'>): PlacedItem {
  const turn = to.rotation - from.rotation;
  const dx = piece.position.x - from.position.x;
  const dz = piece.position.z - from.position.z;
  // three.js's yaw: x' = x·cos + z·sin, z' = −x·sin + z·cos.
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  return {
    ...piece,
    roomId: to.roomId,
    position: { x: round3(to.position.x + dx * cos + dz * sin), z: round3(to.position.z - dx * sin + dz * cos) },
    rotation: piece.rotation + turn,
    elevationM: round3(piece.elevationM + (to.elevationM - from.elevationM)),
  };
}

/** `items` with one piece put where `next` says, its companions carried with it. */
function withMoved(items: PlacedItem[], next: PlacedItem): PlacedItem[] {
  const before = items.find((i) => i.id === next.id);
  if (!before) return items;
  const same = before.position.x === next.position.x && before.position.z === next.position.z && before.rotation === next.rotation && before.elevationM === next.elevationM && before.roomId === next.roomId;
  if (same) return items;
  const companions = new Set(companionsOf(next.id, items).map((c) => c.id));
  return items.map((i) => (i.id === next.id ? next : companions.has(i.id) ? moved(i, before, next) : i));
}

/**
 * The pieces that ride on one that was just moved by hand go with it: the dryer stacked on a
 * dragged washing machine, the tap of a dragged basin, a bath's mixer. `before` is the piece as it
 * stood. The same array when it has none or did not move.
 */
export function carryCompanions(items: PlacedItem[], before: PlacedItem): PlacedItem[] {
  const now = items.find((i) => i.id === before.id);
  const companions = now ? companionsOf(before.id, items) : [];
  if (!now || companions.length === 0) return items;
  if (now.position.x === before.position.x && now.position.z === before.position.z && now.rotation === before.rotation && now.elevationM === before.elevationM && now.roomId === before.roomId) return items;
  const ids = new Set(companions.map((c) => c.id));
  return items.map((i) => (ids.has(i.id) ? moved(i, before, now) : i));
}

/**
 * What stands on a piece that was just moved by hand goes with it (the owner's notes of 14 Nov
 * 2026: "a TV on its cabinet moves with the cabinet"): anything resting on its top — a TV on its
 * stand, a lamp on a bedside table — and a TV hung on the wall over its TV unit. `before` is the
 * piece as it stood. The same array when nothing stood on it or it did not move.
 */
export function carryRiders(items: PlacedItem[], before: PlacedItem): PlacedItem[] {
  const now = items.find((i) => i.id === before.id);
  if (!now || (now.position.x === before.position.x && now.position.z === before.position.z && now.rotation === before.rotation && now.roomId === before.roomId)) return items;
  const f = { x: Math.sin(before.rotation), z: Math.cos(before.rotation) };
  const top = before.elevationM + before.size.height;
  const companions = new Set(companionsOf(before.id, items).map((c) => c.id));
  const rides = (i: PlacedItem) => {
    if (i.id === before.id || i.roomId !== before.roomId || companions.has(i.id) || i.legOf) return false;
    const dx = i.position.x - before.position.x;
    const dz = i.position.z - before.position.z;
    const over = Math.abs(dx * f.z - dz * f.x) <= before.size.width / 2 + 0.01 && Math.abs(dx * f.x + dz * f.z) <= before.size.depth / 2 + 0.01;
    if (!over) return false;
    // On its top; or a TV on the wall over the unit it belongs to.
    return Math.abs(i.elevationM - top) <= 0.06 || (before.slot === 'tv_unit' && i.slot === 'tv' && i.elevationM >= top - 0.06);
  };
  const riders = new Set(items.filter(rides).map((i) => i.id));
  if (riders.size === 0) return items;
  return items.map((i) => (riders.has(i.id) ? moved(i, { ...before, elevationM: 0 }, { ...now, elevationM: now.elevationM - before.elevationM }) : i));
}

/** A cabinet without one of its sections, closed up along its wall; null when that was its only one. */
function withoutSection(piece: DecorPiece, index: number): DecorPiece | null {
  const spans = sectionSpans(piece);
  if (spans.length <= 1) return null;
  const from = Math.min(piece.span.from, piece.span.to);
  const gone = spans[index];
  // The middle of a run: plain doors in its place at the lower neighbour's height, so the run stays one piece.
  if (index > 0 && index < spans.length - 1) {
    const height = Math.min(spans[index - 1].section.heightMm, spans[index + 1].section.heightMm);
    const sections = spans.map((s, i) => (i === index ? { kind: 'doors' as const, widthMm: mm(s.x1 - s.x0), heightMm: height, depthMm: Math.min(spans[index - 1].section.depthMm, spans[index + 1].section.depthMm) } : { ...s.section, widthMm: mm(s.x1 - s.x0) }));
    return { ...piece, params: { ...piece.params, sections }, height: { from: 0, to: Math.max(...sections.map((s) => s.heightMm)) / 1000 } };
  }
  const kept = spans.filter((_, i) => i !== index);
  const sections = kept.map((s) => ({ ...s.section, widthMm: mm(s.x1 - s.x0) }));
  const start = index === 0 ? gone.x1 : from;
  return {
    ...piece,
    span: { from: round3(start), to: round3(start + sectionsWidth(sections)) },
    height: { from: 0, to: Math.max(...sections.map((s) => s.heightMm)) / 1000 },
    params: { ...piece.params, sections, depthMm: Math.max(...sections.map((s) => s.depthMm)) },
  };
}

/** A new piece's id: its furniture's, kept inside the save's 64 characters (the unique end of an id is its tail). */
function housingId(item: Pick<PlacedItem, 'id'>): string {
  return `dj-${item.id.slice(-60)}`;
}

/** The face a new piece of joinery is made in: the flat's own joinery's, so it stays one design; else what was given; else bare. */
function faceOf(decor: readonly DecorPiece[], face?: Partial<Record<DecorSlot, DecorMaterial>>): Partial<Record<DecorSlot, DecorMaterial>> {
  const model = decor.find((d) => d.family === 'cabinet' && d.materials.face?.product);
  return model ? { face: model.materials.face } : (face ?? {});
}

interface Built {
  piece: DecorPiece;
  item: PlacedItem;
}

/**
 * The washing machine's column where the machine stands: 65 cm deep, its sides close round it, at
 * the end of the wall when that is a sliver away — the machine centred in it, its back to the wall.
 * `like` keeps a column's own size (one that followed its machine). Null with no wall behind the
 * machine or no room for the column there.
 */
function columnFor(washer: PlacedItem, room: PlanRoom, items: readonly PlacedItem[], decor: readonly DecorPiece[], face: Partial<Record<DecorSlot, DecorMaterial>>, like?: CabinetSection, id = housingId(washer)): Built | null {
  const wall = backWall(washer, room, 0.4);
  if (!wall) return null;
  const dryer = items.find((i) => i.id === `${washer.id}-dryer`);
  const least = { width: washer.size.width + 2 * CARCASS_M + 0.02, height: washer.size.height + 0.03 + (dryer ? dryer.size.height + 0.03 : 0) };
  const width = round3(Math.max(least.width, like ? like.widthMm / 1000 : 0));
  const height = round3(Math.min(room.heightM, Math.max(least.height, like ? like.heightMm / 1000 : 0)));
  const depth = like ? like.depthMm / 1000 : WASHER_COLUMN_DEPTH_M;
  const stretch = freeStretch(room, wall.edge, wall.along, items, [washer.id, ...companionsOf(washer.id, items).map((c) => c.id)], depth, decor, [id]);
  if (!stretch || stretch[1] - stretch[0] < width - 0.01) return null;
  let from = clamp(wall.along - width / 2, stretch[0], stretch[1] - width);
  if (from - stretch[0] < JOINERY_SLIVER_M) from = stretch[0];
  else if (stretch[1] - (from + width) < JOINERY_SLIVER_M) from = stretch[1] - width;
  const section: CabinetSection = { kind: 'washer', widthMm: mm(width), heightMm: mm(height), depthMm: mm(depth), ...(dryer ? { dryer: true } : {}), itemId: washer.id };
  return {
    piece: { id, roomId: room.id, family: 'cabinet', wallIndex: wall.edge.index, span: { from: round3(from), to: round3(from + width) }, height: { from: 0, to: height }, params: { sections: [section], depthMm: section.depthMm }, materials: face, anchor: 'joinery', origin: 'studio' },
    item: { ...washer, position: onEdge(wall.edge, from + width / 2, washer.size.depth / 2 + 0.02), rotation: wall.edge.facing },
  };
}

/**
 * A vanity under a basin: its top under 90 cm with the basin on it, from the basin's width and
 * 40 cm to 1.8 m, run on to a corner rather than leave a sliver. `like` keeps a vanity's own size.
 * Null with no wall behind the basin or no room.
 */
function vanityFor(sink: PlacedItem, room: PlanRoom, items: readonly PlacedItem[], decor: readonly DecorPiece[], face: Partial<Record<DecorSlot, DecorMaterial>>, like?: CabinetSection, id = housingId(sink)): Built | null {
  const wall = backWall(sink, room, 0.4);
  if (!wall) return null;
  const depth = like ? like.depthMm / 1000 : VANITY_DEPTH_M;
  const stretch = freeStretch(room, wall.edge, wall.along, items, [sink.id, ...companionsOf(sink.id, items).map((c) => c.id)], depth, decor, [id]);
  if (!stretch) return null;
  const want = like ? like.widthMm / 1000 : Math.min(VANITY_GROW_M, Math.max(sink.size.width + VANITY_ELBOW_M, 0.8));
  let from = Math.max(stretch[0], wall.along - want / 2);
  let to = Math.min(stretch[1], from + want);
  from = Math.max(stretch[0], to - want);
  if (!like) {
    if (from - stretch[0] < JOINERY_SLIVER_M) from = stretch[0];
    if (stretch[1] - to < JOINERY_SLIVER_M) to = stretch[1];
  }
  if (to - from < sink.size.width + 0.05) return null;
  const height = round3(like ? like.heightMm / 1000 : Math.min(VANITY_MAX_M - 0.05, Math.max(VANITY_MIN_M, VANITY_MAX_M - sink.size.height)));
  const section: CabinetSection = { kind: 'basin', widthMm: mm(to - from), heightMm: mm(height), depthMm: mm(depth), itemId: sink.id };
  const along = clamp(wall.along, from + sink.size.width / 2, to - sink.size.width / 2);
  return {
    piece: { id, roomId: room.id, family: 'cabinet', wallIndex: wall.edge.index, span: { from: round3(from), to: round3(to) }, height: { from: 0, to: height }, params: { sections: [section], depthMm: section.depthMm }, materials: face, anchor: 'joinery', origin: 'studio' },
    item: { ...sink, elevationM: height, position: onEdge(wall.edge, along, Math.max(sink.size.depth / 2 + 0.03, depth / 2)), rotation: wall.edge.facing },
  };
}

/** A box where its WC or its bath stands: centred behind it on its wall, its width kept, between the wall's doors and windows. Null with no wall behind the piece. */
function boxAt(piece: DecorPiece, item: PlacedItem, room: PlanRoom): DecorPiece | null {
  const wall = backWall(item, room, piece.anchor === 'bath' ? 0.4 : 1.2);
  if (!wall) return null;
  const width = Math.abs(piece.span.to - piece.span.from);
  const stretch = freeSpans(wall.edge, room.openings, 0, wall.edge.length, 0.05).find(([a, b]) => wall.along >= a - 1e-6 && wall.along <= b + 1e-6);
  if (!stretch) return null;
  const w = Math.min(width, stretch[1] - stretch[0]);
  const from = round3(clamp(wall.along - w / 2, stretch[0], stretch[1] - w));
  if (piece.roomId === room.id && piece.wallIndex === wall.edge.index && Math.abs(from - Math.min(piece.span.from, piece.span.to)) < 0.005 && Math.abs(w - width) < 0.005) return piece;
  return { ...piece, roomId: room.id, wallIndex: wall.edge.index, span: { from, to: round3(from + w) } };
}

/** A WC out in front of its box: its back on the box's face when it stands in it. */
function inFrontOf(box: DecorPiece, wc: PlacedItem, room: PlanRoom): PlacedItem {
  const edge = roomEdges(room.polygon).find((e) => e.index === box.wallIndex);
  if (!edge) return wc;
  const depth = decorDepth(box);
  const off = offOf(edge, wc.position);
  const back = off - wc.size.depth / 2;
  if (back >= depth - 0.01 || back < -0.1) return wc;
  return { ...wc, position: onEdge(edge, alongOf(edge, wc.position), depth + wc.size.depth / 2) };
}

/** Whether a piece still stands in its section of a cabinet: against the cabinet's wall, between the section's ends. */
function standsIn(item: PlacedItem, piece: DecorPiece, x0: number, x1: number, room: PlanRoom): boolean {
  if (item.roomId !== piece.roomId) return false;
  const wall = backWall(item, room, 0.4);
  return !!wall && wall.edge.index === piece.wallIndex && wall.along - item.size.width / 2 >= x0 - 0.02 && wall.along + item.size.width / 2 <= x1 + 0.02;
}

/**
 * The furniture is where it is; the housing goes to it. A housing whose piece is gone goes too (a
 * section of a longer run closes up), a box sits centred behind its WC or its bath on whatever wall
 * that now is, and a machine or a basin that left its section takes the section with it as a piece
 * of its own — given up where its new place has no wall or no room. The same arrays when nothing moved.
 */
export function followHoused(decorIn: DecorPiece[], itemsIn: PlacedItem[], rooms: readonly PlanRoom[]): { decor: DecorPiece[]; items: PlacedItem[] } {
  let decor = adoptHoused(decorIn, itemsIn, rooms);
  let items = itemsIn;
  const has = (id: string) => items.some((i) => i.id === id);

  // What was built for a piece that is gone goes with it.
  if (decor.some((d) => !isKitchenLeg(d) && housedIds(d).some((id) => !has(id)))) {
    decor = decor.flatMap((piece) => {
      if (isKitchenLeg(piece)) return [piece];
      if (piece.family === 'box') return piece.itemId && !has(piece.itemId) ? [] : [piece];
      let next: DecorPiece | null = piece;
      for (;;) {
        const index: number = next ? (next.params.sections ?? []).findIndex((s) => s.itemId && !has(s.itemId)) : -1;
        if (!next || index < 0) break;
        next = withoutSection(next, index);
      }
      return next ? [next] : [];
    });
  }

  for (const id of items.map((i) => i.id)) {
    const found = items.find((i) => i.id === id);
    const kind = found ? HOUSING_OF_SLOT[found.slot] : undefined;
    const housing = found && kind ? housingOf(found.id, decor) : null;
    const room = found ? rooms.find((r) => r.id === found.roomId) : undefined;
    if (!found || !housing || !room) continue;
    let item: PlacedItem = found;
    const { piece } = housing;
    // Set down by another wall with its back not to it: it turns its back to that wall, as a
    // machine, a basin or a WC stands — so what is built for it can go there with it.
    if (!backWall(item, room, kind === 'wc' ? 0.5 : 0.4)) {
      const turned = turnedToWall(item, room);
      if (turned) {
        items = withMoved(items, turned);
        item = turned;
      }
    }

    if (housing.section == null) {
      const next = boxAt(piece, item, room);
      if (!next) continue; // out in the room: its box waits on its wall
      if (next !== piece) decor = decor.map((d) => (d.id === piece.id ? next : d));
      if (kind === 'wc') items = withMoved(items, inFrontOf(next, item, room));
      continue;
    }

    const spans = sectionSpans(piece);
    const span = spans[housing.section];
    const pieceRoom = rooms.find((r) => r.id === piece.roomId);
    // A basin stands on its vanity's whole top: its own section and the plain doors beside it at
    // its height. Moved about on it, nothing is rebuilt (the vanity used to shrink to the basin).
    let lo = span?.x0 ?? 0;
    let hi = span?.x1 ?? 0;
    if (span?.section.kind === 'basin') {
      const level = (i: number) => spans[i]?.section.kind === 'doors' && Math.abs(spans[i].section.heightMm - span.section.heightMm) < 11;
      for (let i = housing.section - 1; level(i); i--) lo = spans[i].x0;
      for (let i = housing.section + 1; level(i); i++) hi = spans[i].x1;
    }
    if (span && pieceRoom && standsIn(item, piece, lo, hi, pieceRoom)) continue;
    // The only thing the piece was built for: the whole piece goes with it, every section, to the
    // wall it stands at now.
    const wall = backWall(item, room, 0.4);
    if (span && wall && spans.length > 1 && housedIds(piece).length === 1) {
      const start = Math.min(piece.span.from, piece.span.to);
      const width = Math.abs(piece.span.to - piece.span.from);
      const stretch = freeStretch(room, wall.edge, wall.along, items, [item.id, ...companionsOf(item.id, items).map((c) => c.id)], decorDepth(piece), decor, [piece.id]);
      if (stretch && stretch[1] - stretch[0] >= width - 0.005) {
        const from = round3(clamp(wall.along - ((span.x0 + span.x1) / 2 - start), stretch[0], stretch[1] - width));
        const moved: DecorPiece = { ...piece, roomId: room.id, wallIndex: wall.edge.index, span: { from, to: round3(from + width) } };
        decor = decor.map((d) => (d.id === piece.id ? moved : d));
        const half = Math.min(item.size.width, span.x1 - span.x0) / 2;
        const along = clamp(wall.along, from + (span.x0 - start) + half, from + (span.x1 - start) - half);
        const off = kind === 'column' ? item.size.depth / 2 + 0.02 : Math.max(item.size.depth / 2 + 0.03, span.section.depthMm / 2000);
        items = withMoved(items, { ...item, position: onEdge(wall.edge, along, off), rotation: wall.edge.facing, ...(kind === 'vanity' ? { elevationM: span.section.heightMm / 1000 } : {}) });
        continue;
      }
    }
    // It left its section: the section goes with it, as a piece of its own.
    const rest = withoutSection(piece, housing.section);
    const others = decor.flatMap((d) => (d.id === piece.id ? (rest ? [rest] : []) : [d]));
    const like = span ? { ...span.section, widthMm: mm(span.x1 - span.x0) } : undefined;
    // The old piece keeps its id when it has sections left; alone, the new one takes it over.
    const newId = rest ? housingId(item) : piece.id;
    const built = kind === 'column' ? columnFor(item, room, items, others, piece.materials, like, newId) : vanityFor(item, room, items, others, piece.materials, like, newId);
    if (!built) {
      decor = others;
      continue;
    }
    decor = [...others, { ...built.piece, materials: piece.materials, origin: piece.origin }];
    items = withMoved(items, built.item);
  }
  return { decor, items };
}

/**
 * The housing a piece of furniture is given — set down from the catalogue, or asked for on its
 * card: a box behind a WC (`family: 'box'`), a column round a washing machine, a vanity under a
 * basin; a bath is boxed by the bathroom pass, which has the tiles (`boxFor`). `face` is the
 * joiner's material when the caller has the catalogue. Null for a piece that takes none, has one,
 * or has no wall or room for it.
 */
export function houseItem(item: PlacedItem, rooms: readonly PlanRoom[], items: PlacedItem[], decor: DecorPiece[], face?: Partial<Record<DecorSlot, DecorMaterial>>): { decor: DecorPiece[]; items: PlacedItem[] } | null {
  const kind = HOUSING_OF_SLOT[item.slot];
  const room = rooms.find((r) => r.id === item.roomId);
  if (!kind || !room || housingOf(item.id, decor)) return null;
  if (kind === 'column' || kind === 'vanity') {
    const built = kind === 'column' ? columnFor(item, room, items, decor, faceOf(decor, face)) : vanityFor(item, room, items, decor, faceOf(decor, face));
    return built ? { decor: [...decor, built.piece], items: withMoved(items, built.item) } : null;
  }
  const box = boxFor(item, room, items, decor);
  if (!box) return null;
  return { decor: [...decor, box], items: kind === 'wc' ? withMoved(items, inFrontOf(box, item, room)) : items };
}

/**
 * A WC's installation box (80 cm, 20 cm deep, half height, the whole stretch when a sliver would be
 * left) or a bath's enclosure (as long as the bath, to just under its rim), in the materials of a
 * box the flat already has — the studio has no catalogue, so a first one is plain plasterboard
 * until a finish is picked on its card.
 */
export function boxFor(item: PlacedItem, room: PlanRoom, items: readonly PlacedItem[], decor: readonly DecorPiece[]): DecorPiece | null {
  const bath = item.slot === 'bathtub';
  const wall = backWall(item, room, bath ? 0.4 : 1.2);
  if (!wall) return null;
  const model = decor.find((d) => d.family === 'box' && d.materials.body) ?? decor.find((d) => d.family === 'box');
  const half = bath ? item.size.width / 2 + 0.02 : WC_BOX_WIDTH_M / 2;
  const stretch = bath
    ? freeStretch(room, wall.edge, wall.along, items, [item.id, ...companionsOf(item.id, items).map((c) => c.id)], item.size.depth + 0.1, decor)
    : (freeSpans(wall.edge, room.openings, 0, wall.edge.length, 0.05).find(([a, b]) => wall.along >= a && wall.along <= b) ?? null);
  if (!stretch) return null;
  let from = Math.max(stretch[0], wall.along - half);
  let to = Math.min(stretch[1], wall.along + half);
  if (from - stretch[0] < JOINERY_SLIVER_M) from = stretch[0];
  if (stretch[1] - to < JOINERY_SLIVER_M) to = stretch[1];
  if (to - from < 0.2) return null;
  return {
    id: housingId(item),
    roomId: room.id,
    family: 'box',
    wallIndex: wall.edge.index,
    span: { from: round3(from), to: round3(to) },
    height: { from: 0, to: bath ? round3(item.size.height - 0.01) : WC_BOX_HALF_M },
    params: { depthMm: mm(bath ? item.size.depth + 0.03 : WC_BOX_DEPTH_M), full: false },
    materials: model ? model.materials : {},
    anchor: bath ? 'bath' : 'wc',
    itemId: item.id,
    origin: 'studio',
  };
}

/**
 * A cabinet at another size (its arrows, its card): the width shared out over its sections — a
 * washing machine's column keeps its own while another section can take the change — and its top:
 * the sections that reached the old top go to the new one, the lower ones stay as they are (a
 * vanity beside a column). No section is made narrower or lower than what stands in it. A corner
 * leg's worktop stays at the kitchen's height.
 */
export function cabinetAtExtent(piece: DecorPiece, extent: DecorExtent, items: readonly PlacedItem[] = []): DecorPiece {
  if (piece.family !== 'cabinet') return { ...piece, span: { ...extent.span }, height: { ...extent.height } };
  const spans = sectionSpans(piece);
  const before = spans.map((s) => s.x1 - s.x0);
  const byId = new Map(items.map((i) => [i.id, i]));
  const least = spans.map(({ section }) => {
    const housed = section.itemId ? byId.get(section.itemId) : undefined;
    const dryer = housed ? byId.get(`${housed.id}-dryer`) : undefined;
    if (!housed) return { width: SECTION_MIN_WIDTH_M, height: SECTION_MIN_HEIGHT_M };
    if (section.kind === 'washer') return { width: housed.size.width + 2 * CARCASS_M + 0.02, height: housed.size.height + 0.03 + (dryer ? dryer.size.height + 0.03 : 0) };
    return { width: housed.size.width + 0.05, height: SECTION_MIN_HEIGHT_M };
  });
  // The width: over the sections that stretch, each in proportion; what they cannot give, the rest take.
  const want = Math.abs(extent.span.to - extent.span.from);
  const widths = [...before];
  const stretchy = spans.map(({ section }) => section.kind !== 'washer');
  for (const pool of [stretchy, stretchy.map(() => true)]) {
    for (let pass = 0; pass < 4; pass++) {
      const delta = want - widths.reduce((s, w) => s + w, 0);
      if (Math.abs(delta) < 1e-6) break;
      const open = widths.map((w, i) => pool[i] && (delta > 0 || w > least[i].width + 1e-6));
      const total = widths.reduce((s, w, i) => s + (open[i] ? w : 0), 0);
      if (total <= 0) break;
      widths.forEach((w, i) => {
        if (open[i]) widths[i] = Math.max(least[i].width, w + (delta * w) / total);
      });
    }
  }
  // The top: the sections at the old top follow it.
  const oldTop = Math.max(...spans.map((s) => s.section.heightMm)) / 1000;
  const top = Math.max(extent.height.to, extent.height.from + SECTION_MIN_HEIGHT_M);
  const sections = spans.map(({ section }, i) => {
    const h = section.heightMm / 1000;
    const height = section.kind === 'kitchen' ? h : Math.max(least[i].height, Math.abs(h - oldTop) < 0.011 ? top : Math.min(h, top));
    return { ...section, widthMm: mm(widths[i]), heightMm: mm(height) };
  });
  const width = sectionsWidth(sections);
  // Where a section would not give, the side that was not dragged stays where it is.
  const leftDragged = Math.abs(extent.span.to - Math.max(piece.span.from, piece.span.to)) < 0.002 && Math.abs(extent.span.from - Math.min(piece.span.from, piece.span.to)) > 0.002;
  const from = leftDragged ? extent.span.to - width : extent.span.from;
  return {
    ...piece,
    span: { from: round3(from), to: round3(from + width) },
    height: { from: 0, to: Math.max(...sections.map((s) => s.heightMm)) / 1000 },
    params: { ...piece.params, sections, depthMm: Math.max(...sections.map((s) => s.depthMm)) },
  };
}

/**
 * What stands in a piece of joinery or in front of a box goes with it when it is moved or resized
 * by hand: carried with its section when that moved, left where it stood (inside it) when that was
 * made wider or narrower, as far off the wall, turned to the new wall — a basin at its vanity's
 * new height.
 */
export function carryHoused(before: DecorPiece, after: DecorPiece, items: PlacedItem[], rooms: readonly PlanRoom[]): PlacedItem[] {
  const ids = housedIds(before);
  if (ids.length === 0 || isKitchenLeg(before)) return items;
  const roomB = rooms.find((r) => r.id === before.roomId);
  const roomA = rooms.find((r) => r.id === after.roomId);
  const edgeB = roomB && roomEdges(roomB.polygon).find((e) => e.index === before.wallIndex);
  const edgeA = roomA && roomEdges(roomA.polygon).find((e) => e.index === after.wallIndex);
  if (!roomA || !edgeB || !edgeA) return items;
  const part = (piece: DecorPiece, id: string): { x0: number; x1: number; section: CabinetSection | null } | null => {
    if (piece.family === 'box') return { x0: Math.min(piece.span.from, piece.span.to), x1: Math.max(piece.span.from, piece.span.to), section: null };
    const span = sectionSpans(piece).find((s) => s.section.itemId === id);
    return span ? { x0: span.x0, x1: span.x1, section: span.section } : null;
  };
  let next = items;
  for (const id of ids) {
    const item = next.find((i) => i.id === id);
    const was = part(before, id);
    const now = part(after, id);
    if (!item || !was || !now) continue;
    // Moved (its width kept, or onto another wall), the piece goes with its section; resized, it
    // stays where it stood — its pipes are there — as long as it is still inside.
    const rigid = edgeA !== edgeB || Math.abs(now.x1 - now.x0 - (was.x1 - was.x0)) < 0.002;
    const wanted = rigid ? now.x0 + (alongOf(edgeB, item.position) - was.x0) : alongOf(edgeB, item.position);
    const half = Math.min(item.size.width, now.x1 - now.x0) / 2;
    const along = clamp(wanted, now.x0 + half, now.x1 - half);
    const placed: PlacedItem = {
      ...item,
      roomId: roomA.id,
      position: onEdge(edgeA, along, offOf(edgeB, item.position)),
      rotation: item.rotation + (edgeA.facing - edgeB.facing),
      elevationM: now.section?.kind === 'basin' ? now.section.heightMm / 1000 : item.elevationM,
    };
    next = withMoved(next, placed);
  }
  return next;
}

/**
 * Where joinery or a box may stand (`moving`: slid along a wall, or onto another) or how far it may
 * grow: inside the stretch of its wall clear of the doors and windows, the furniture (but what it
 * houses) and the other joinery. Null when it does not fit there; anything flat on its wall — slats,
 * a panel, mouldings — goes where it is put, furniture stands in front of it.
 */
export function freeExtent(piece: DecorPiece, extent: DecorExtent, wallIndex: number, room: PlanRoom, items: readonly PlacedItem[], decor: readonly DecorPiece[], moving: boolean): DecorExtent | null {
  if (piece.family !== 'cabinet' && piece.family !== 'box') return extent;
  const edge = roomEdges(room.polygon).find((e) => e.index === wallIndex);
  if (!edge) return null;
  const housed = housedIds(piece);
  const except = [...housed, ...housed.flatMap((id) => companionsOf(id, items).map((c) => c.id))];
  const width = Math.abs(extent.span.to - extent.span.from);
  const now = (Math.min(piece.span.from, piece.span.to) + Math.max(piece.span.from, piece.span.to)) / 2;
  const at = moving || wallIndex !== piece.wallIndex ? (extent.span.from + extent.span.to) / 2 : clamp(now, extent.span.from, extent.span.to);
  // A WC's box is built on the wall whatever stands before it; joinery stops at furniture.
  const stretch = piece.family === 'box' && piece.anchor !== 'bath'
    ? (freeSpans(edge, room.openings, 0, edge.length, 0.05).find(([a, b]) => at >= a - 1e-6 && at <= b + 1e-6) ?? null)
    : freeStretch(room, edge, at, items, except, decorDepth(piece), decor, [piece.id]);
  if (!stretch && moving) return null;
  if (moving && stretch) {
    if (stretch[1] - stretch[0] < width - 0.005) return null;
    const from = round3(clamp(extent.span.from, stretch[0], stretch[1] - width));
    return { span: { from, to: round3(from + width) }, height: extent.height };
  }
  // Resized where nothing is clear round its middle (it stands in something already): its height only.
  if (!stretch) return Math.abs(extent.span.from - Math.min(piece.span.from, piece.span.to)) < 0.002 && Math.abs(extent.span.to - Math.max(piece.span.from, piece.span.to)) < 0.002 ? extent : null;
  // Only a side that was dragged is held back: one left where it is stays there, whatever it stands
  // against (a flat laid out before joinery kept clear of a WC's box is not shifted by a new height).
  const lo = Math.min(piece.span.from, piece.span.to);
  const hi = Math.max(piece.span.from, piece.span.to);
  const same = wallIndex === piece.wallIndex;
  const from = same && Math.abs(extent.span.from - lo) < 0.002 ? lo : Math.max(stretch[0], extent.span.from);
  const to = same && Math.abs(extent.span.to - hi) < 0.002 ? hi : Math.min(stretch[1], extent.span.to);
  return to - from >= SECTION_MIN_WIDTH_M ? { span: { from: round3(from), to: round3(to) }, height: extent.height } : null;
}

/** Joinery or a box as something a dragged piece may not stand in, and the pieces it is built for (they may). */
export interface JoineryObstacle {
  item: PlacedItem;
  houses: string[];
}

/**
 * The flat's joinery and boxes as the floor they take, a block a section (each its own height and
 * depth), for the furniture's own rules of what is in the way (`lib/design/manipulate`): a sofa is
 * not dropped into a wardrobe, a chair not into a kitchen's corner leg. What a piece is built for
 * stands in it — the machine in its column, the bath in its surround.
 */
export function joineryObstacles(decor: readonly DecorPiece[], rooms: readonly PlanRoom[]): JoineryObstacle[] {
  const out: JoineryObstacle[] = [];
  for (const piece of decor) {
    if ((piece.family !== 'cabinet' && piece.family !== 'box') || piece.wallIndex == null) continue;
    const room = rooms.find((r) => r.id === piece.roomId);
    const edge = room && roomEdges(room.polygon).find((e) => e.index === piece.wallIndex);
    if (!room || !edge) continue;
    // A corner leg meets its own run.
    const houses = isKitchenLeg(piece) && piece.itemId ? [piece.itemId] : housedIds(piece);
    const parts = piece.family === 'cabinet' ? sectionSpans(piece).map(({ section, x0, x1 }) => ({ x0, x1, depth: section.depthMm / 1000, height: section.heightMm / 1000 })) : [{ x0: Math.min(piece.span.from, piece.span.to), x1: Math.max(piece.span.from, piece.span.to), depth: decorDepth(piece), height: Math.min(room.heightM, Math.abs(piece.height.to - piece.height.from)) }];
    parts.forEach((part, i) => {
      if (part.x1 - part.x0 < 0.05) return;
      out.push({
        houses,
        item: { id: `joinery:${piece.id}:${i}`, roomId: room.id, slot: 'wardrobe', kind: 'wardrobe', position: onEdge(edge, (part.x0 + part.x1) / 2, part.depth / 2), rotation: edge.facing, elevationM: 0, size: { width: part.x1 - part.x0, depth: part.depth, height: part.height }, product: null, locked: true },
      });
    });
  }
  return out;
}

/** The furniture and, with it, the joinery a piece being moved has to keep out of — all but what is built for it (or for the piece it rides on). */
export function withJoinery(items: PlacedItem[], obstacles: readonly JoineryObstacle[], movingId: string): PlacedItem[] {
  if (obstacles.length === 0) return items;
  const host = COMPANIONS.reduce((id, c) => (id.endsWith(`-${c}`) ? id.slice(0, -c.length - 1) : id), movingId);
  return [...items, ...obstacles.filter((o) => !o.houses.includes(movingId) && !o.houses.includes(host)).map((o) => o.item)];
}

