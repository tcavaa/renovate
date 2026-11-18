/**
 * What the AI designer hands back (`/api/design/ai-generate`), and how it becomes a flat — pure,
 * shared by the server (which checks every id against the lists it offered) and the store (which
 * lays the flat out with it). See docs/design-studio/ai-layout-plan.md.
 *
 * The designer decides intent, the engine decides geometry: product picks per room and kind (the
 * matcher takes one where it fits the slot the engine laid, its own draw where it does not), a
 * floor and a wall finish per room, and decor intents that are measured against where the engine
 * actually put the bed, the sofa or the TV unit (`lib/design/decor/resolve`).
 */

import { applySwap, isKitchenFurniture, PAIRED_SLOTS, rehungClear, settledPosition, workingFloor, type CatalogProduct } from './matcher';
import { arrangedOff } from './arrangedOff';
import { getArchetype } from './catalog';
import { carryCompanions, carryRiders, companionsOf, hostOf, housedIds } from './decor/housing';
import { seatSlots } from './autoLayout';
import { decorDepth, fitLight, paramsOf } from './decor/layout';
import { blocksWindow, clampInsideRoom, fitSwapped, footprintInRoom, footprintOf, footprintsOverlap, inDoorway, isPlacementValid, pieceWall, type Footprint } from './manipulate';
import { roomEdges, type PlanEdge } from './planGeometry';
import type { AiReview } from './aiReview';
import { finishFromProduct, flatFinishRoom, mayLay, sharesFlatFinish, styleFinishProduct, surfaceOptions } from './surfaces';
import type { DecorFamily, DecorPiece, DecorSlot, ElectricalPoint, FloorPlan, PlacedItem, PlanRoom, SlotKind, StyleId, SurfaceFinish, Vec2 } from './types';
import type { RoomType } from '@/lib/calculator/types';
import { COVERS_WALL, overlaps, reanchorDecor, resolveDecor, resolveRoomDecor, type DecorIntent } from './decor/resolve';
import { underCeiling } from './rules';

export interface AiRoomProposal {
  roomId: string;
  /** One or two sentences on the room, in the person's language. */
  note: string | null;
  /** A product per kind of piece (archetype kind → product id), from the candidates offered for this room. */
  furniture: Array<{ kind: string; productId: number }>;
  /** The floor's and the walls' finish (product ids), from the candidates offered; null keeps the style's. */
  floor: number | null;
  wall: number | null;
  decor: DecorIntent[];
}

export interface AiProposal {
  /** The model that answered. */
  model: string;
  rooms: AiRoomProposal[];
}

/** The matcher's picks: `${kind}|${roomId}` → product id (the key the matcher draws per room by). */
export function proposalPicks(proposal: AiProposal | null | undefined): Record<string, number> {
  const picks: Record<string, number> = {};
  for (const room of proposal?.rooms ?? []) for (const pick of room.furniture) picks[`${pick.kind}|${room.roomId}`] = pick.productId;
  return picks;
}

/**
 * The finishes a surface of a room may wear in a designed flat: what the engine would lay there —
 * the finishes of the category of the style's own for the room (`styleFinishProduct`: tiles in a
 * wet room, a closed kitchen and on a balcony, the room's paint, the living room's laminate), only
 * what is made for a wet room in one (`mayLay`), as `generatedFinish` draws them. A room that shares
 * the flat's one floor and walls (`sharesFlatFinish`, given the flat's `rooms`) wears the lead
 * room's (`flatFinishRoom`) — laid through all of them (`withFlatFinish`) — so it is offered the
 * lead's. None where the catalogue has nothing the style would lay there.
 */
export function finishCandidates(catalog: CatalogProduct[], room: PlanRoom, surface: 'floor' | 'wall', styleId: StyleId, rooms: readonly PlanRoom[] = []): CatalogProduct[] {
  const from = (sharesFlatFinish(room) ? flatFinishRoom([...rooms]) : null) ?? room;
  const own = styleFinishProduct(catalog, from, surface, styleId);
  if (!own) return [];
  return surfaceOptions(catalog, surface, from, styleId).filter((p) => p.categorySlug === own.categorySlug && mayLay(p, from) && mayLay(p, room));
}

/**
 * The designer's floor or wall for a room as a finish laid by the style (`origin: 'style'`,
 * `laidFor`): a product the room may wear (`finishCandidates`, given the flat's `rooms`), or null to
 * keep what the engine drew.
 */
export function proposalFinish(room: PlanRoom, surface: 'floor' | 'wall', productId: number | null, styleId: StyleId, catalog: CatalogProduct[], rooms: readonly PlanRoom[] = []): SurfaceFinish | null {
  if (productId == null) return null;
  const product = finishCandidates(catalog, room, surface, styleId, rooms).find((p) => p.id === productId);
  if (!product) return null;
  return { ...finishFromProduct(room, surface, product, 'style'), laidFor: room.type };
}

/** The engine's base finishes with the designer's floors and walls laid over them. */
export function withProposalFinishes(finishes: SurfaceFinish[], plan: FloorPlan, proposal: AiProposal | null | undefined, styleId: StyleId, catalog: CatalogProduct[]): SurfaceFinish[] {
  if (!proposal) return finishes;
  let next = finishes;
  for (const room of plan.rooms) {
    const asked = proposal.rooms.find((r) => r.roomId === room.id);
    if (!asked) continue;
    for (const surface of ['floor', 'wall'] as const) {
      const finish = proposalFinish(room, surface, asked[surface], styleId, catalog, plan.rooms);
      if (!finish) continue;
      const index = next.findIndex((f) => f.roomId === room.id && f.surface === surface && f.wallIndex == null && !f.zone && !f.span && !f.cells);
      // A finish somebody chose stays theirs.
      if (index >= 0 && next[index].origin && next[index].origin !== 'style') continue;
      next = index >= 0 ? next.map((f, i) => (i === index ? finish : f)) : [...next, finish];
    }
  }
  return next;
}

/** At most this many decor pieces in a room the designer decorates (what the prompt says; `validateProposal`, `proposalDecor`). */
export const MAX_DECOR_PER_ROOM = 3;
/** The rooms that take one decor piece at most: a hallway, a kitchen, a bathroom. */
export const ONE_DECOR_ROOMS: readonly RoomType[] = ['hallway', 'kitchen', 'bathroom'];

/** How many of the designer's decor pieces a room keeps at most — what the prompt tells it, held by `proposalDecor` on what is built. */
export function maxDecor(type: RoomType): number {
  return ONE_DECOR_ROOMS.includes(type) ? 1 : MAX_DECOR_PER_ROOM;
}

/**
 * Every room's decor intents measured against the flat as the engine laid it out — its furniture
 * and, `built`, the joinery and boxes it made (the hall's wardrobe, a wall of wardrobe, a vanity, a
 * column, a bath's box): decor that covers its wall keeps off those as it keeps off what hangs there
 * for use (`clearOfBuilt`). A room keeps as many as it takes (`maxDecor`), the first asked of those
 * that can be built: one the flat cannot take does not stand in for one it can.
 */
export function proposalDecor(plan: FloorPlan, proposal: AiProposal | null | undefined, items: PlacedItem[], catalog: CatalogProduct[], built: readonly DecorPiece[] = []): DecorPiece[] {
  if (!proposal) return [];
  return plan.rooms.flatMap((room) => {
    const asked = proposal.rooms.find((r) => r.roomId === room.id);
    if (!asked) return [];
    // A bed with a tall headboard of its own takes no panel or slats behind it (the rulebook, B-6).
    const bed = items.find((i) => i.roomId === room.id && i.slot === 'bed');
    const ownHeadboard = !!bed && bed.size.height >= TALL_HEADBOARD_M;
    const wanted = ownHeadboard ? asked.decor.filter((d) => d.anchor !== 'bed') : asked.decor;
    return clearOfBuilt((r) => resolveRoomDecor(wanted, r, items, catalog), underCeiling(room, plan), built).slice(0, maxDecor(room.type));
  });
}

/**
 * Where a decor piece of `family` asked for on wall `wallIndex` would be fitted in the flat as laid
 * out — its furniture `items` and the joinery and boxes `built` — fitted as `proposalDecor` fits the
 * designer's (`resolveDecor`, kept off the joinery by `clearOfBuilt`), at the family's own height:
 * the piece, or null where it would be left out (no stretch clear of the openings, of what hangs
 * there for use and of the joinery — and for a niche, built out, of all that stands against the
 * wall; a niche or a panel needs 1.2 m). What the designer is told each wall takes. Pure.
 */
export function decorFit(family: DecorFamily, wallIndex: number, room: PlanRoom, items: PlacedItem[], built: readonly DecorPiece[]): DecorPiece | null {
  const intent: DecorIntent = { family, anchor: 'wall', wallIndex, widthM: null, heightFromM: null, heightToM: null, params: {}, materials: [], referenceId: null, concept: null, note: null };
  // No catalogue: the materials do not move the piece.
  const fitted = clearOfBuilt((r) => [resolveDecor(intent, r, items, [], `fit-${room.id}-${wallIndex}`)].filter((d): d is DecorPiece => !!d), room, built)[0];
  return fitted && fitted.wallIndex === wallIndex ? fitted : null;
}

/** Joinery and boxes the engine built on a wall: what decor covering the wall cannot stand behind. */
function isBuilt(piece: DecorPiece): boolean {
  return (piece.family === 'cabinet' || piece.family === 'box') && piece.wallIndex != null;
}

/**
 * Decor `resolve`d in a room, kept off the engine's joinery and boxes there: decor that covers its
 * wall (`COVERS_WALL`: slats, a slab, panels, cladding, a mural, tiles, a niche) and would stand
 * behind one at its height is fitted again with that joinery's stretch as an opening, beside it —
 * and left out where it still would. Decor that does not cover its wall (mouldings, a light line)
 * and decor clear of the joinery are fitted as they were. Pure.
 */
function clearOfBuilt(resolve: (room: PlanRoom) => DecorPiece[], room: PlanRoom, built: readonly DecorPiece[]): DecorPiece[] {
  const joinery = built.filter((d) => d.roomId === room.id && isBuilt(d));
  const behind = (piece: DecorPiece, of: readonly DecorPiece[]) => COVERS_WALL.has(piece.family) && of.some((d) => overlaps(piece, d));
  const first = resolve(room);
  const clash = joinery.filter((d) => first.some((piece) => behind(piece, [d])));
  if (clash.length === 0) return first;
  const edges = roomEdges(room.polygon);
  const openings = clash.flatMap((d) => {
    const edge = edges.find((e) => e.index === d.wallIndex);
    if (!edge) return [];
    const from = Math.min(d.span.from, d.span.to);
    const to = Math.max(d.span.from, d.span.to);
    return [{ id: `built-${d.id}`, roomId: room.id, kind: 'window' as const, wallIndex: edge.index, t: (from + to) / 2 / edge.length, widthM: to - from, heightM: d.height.to, sillM: 0, exterior: false }];
  });
  return resolve({ ...room, openings: [...room.openings, ...openings] }).filter((piece) => !behind(piece, joinery));
}

/** A bed this tall has a headboard that is its own wall panel (B-6). */
export const TALL_HEADBOARD_M = 1.2;

/** The designer's notes per room id, for the generation record. */
export function proposalNotes(proposal: AiProposal | null | undefined): Record<string, string> {
  const notes: Record<string, string> = {};
  for (const room of proposal?.rooms ?? []) if (room.note) notes[room.roomId] = room.note.slice(0, 1200);
  return notes;
}

/** How many AI generations a design may have before it is laid out by the engine alone. */
export const MAX_AI_GENERATIONS = 5;

/** Pieces placed off another (nightstands off the bed, the coffee table off the sofa, the desk chair off the desk). */
const PLACED_OFF: Record<string, string> = { nightstand: 'bed', coffee_table: 'sofa', office_chair: 'desk' };

/** Families of decor furniture in front of has to stand clear of (`clearOfDecor`). */
const STANDS_OUT = new Set(['slats', 'slab', 'panel', 'cladding', 'mural', 'tile', 'niche', 'moulding', 'box']);

/** A floor piece that stands against a wall in the engine's layout (not a rug, curtains or a free-standing table). */
function wallPiece(item: PlacedItem): boolean {
  if (item.elevationM >= 0.05 || item.slot === 'rug' || item.slot === 'curtain') return false;
  const rule = getArchetype(item.kind)?.placement;
  return rule?.type === 'wall' || rule?.type === 'wall-run' || rule?.type === 'corner' || (rule?.type === 'relative' && (rule.beside != null || !!rule.toWall));
}

/**
 * Whether a piece may stand where it is now, among `others`: inside the floor, clear of them, of
 * the windows (if tall) and of the doorways — and, given the floor the layout kept clear (`keepClear`:
 * the strip before a radiator, a column, a partition's floor), of that and of a kitchen run's
 * working floor, as the matcher keeps a product (`MatchOptions.keepClear`).
 */
function standsWell(room: PlanRoom, item: PlacedItem, others: PlacedItem[], rooms: readonly PlanRoom[], keepClear: readonly Footprint[] | null = null): boolean {
  if (!isPlacementValid(room, item, others, rooms) || blocksWindow(item, room) || inDoorway(item, room)) return false;
  if (!keepClear) return true;
  const clear = [...keepClear, ...(isKitchenFurniture(item) ? [] : others.filter((o) => o.roomId === room.id && o.slot === 'kitchen_run').map(workingFloor))];
  const footprint = footprintOf(item.position, item.size, item.rotation);
  return !clear.some((box) => footprintsOverlap(footprint, box));
}

/**
 * The slots a kind is laid out off by its placement rule — every one the rule names: the TV unit
 * off the sofa, the rug under the coffee table (or the sofa), the wall cabinets over the run, the
 * fridge at its end, a print over the bed — not only those it cannot stand without (`arrangedOff`).
 */
function laidOffSlots(kind: string, roomType?: RoomType): SlotKind[] {
  const rule = getArchetype(kind)?.placement;
  const slots = new Set<SlotKind>(arrangedOff(kind, roomType)?.slots ?? []);
  if (rule?.type === 'relative' || rule?.type === 'under') slots.add(rule.to);
  if (rule?.type === 'wall-mounted' && rule.above) for (const slot of [rule.above].flat()) slots.add(slot);
  if (rule?.type === 'wall' && rule.beside) slots.add(rule.beside);
  return [...slots];
}

/** The nearest piece of a slot in `item`'s room, other than itself. */
function nearestOf(item: PlacedItem, slot: SlotKind, items: readonly PlacedItem[]): PlacedItem | undefined {
  const distance = (p: PlacedItem) => Math.hypot(p.position.x - item.position.x, p.position.z - item.position.z);
  return items.filter((p) => p.roomId === item.roomId && p.id !== item.id && p.slot === slot).sort((a, b) => distance(a) - distance(b))[0];
}

/**
 * What a move of `item` takes along (the studio's own movers): what rides on it — its tap, its
 * dryer, its mixer (`carryCompanions`), what stands on its top or hangs over it as a TV over its
 * unit (`carryRiders`) — and the pieces placed off it that the check stands by it again after the
 * fixes (`PLACED_OFF`: the nightstands, the coffee table, the desk chair).
 */
function takenAlong(item: PlacedItem, items: readonly PlacedItem[]): Set<string> {
  const probe = items.map((i) => (i.id === item.id ? { ...i, position: { x: i.position.x + 1, z: i.position.z } } : i));
  const riders = carryRiders(probe, item).filter((i, k) => i !== probe[k] && i.id !== item.id);
  return new Set([...companionsOf(item.id, items), ...riders, ...items.filter((i) => i.roomId === item.roomId && PLACED_OFF[i.kind] === item.slot)].map((i) => i.id));
}

/**
 * Why a piece may not be moved to another wall by the check: the pieces it would leave standing
 * where it was — those laid out off it that a move does not take along (the sofa's TV unit and rug,
 * the run's wall cabinets and fridge, the bed's print) — or, for a piece laid out off another that
 * stands in the room (a TV unit off the sofa, a nightstand off the bed), that piece, which it would
 * leave. Empty for a piece the check may move. Pure.
 */
export function heldByMove(item: PlacedItem, items: readonly PlacedItem[], rooms: ReadonlyArray<Pick<PlanRoom, 'id' | 'type'>>): PlacedItem[] {
  const type = rooms.find((r) => r.id === item.roomId)?.type;
  const along = takenAlong(item, items);
  const left = items.filter((other) => {
    if (other.roomId !== item.roomId || other.id === item.id || along.has(other.id)) return false;
    return laidOffSlots(other.kind, type).some((slot) => slot === item.slot && nearestOf(other, slot, items)?.id === item.id);
  });
  const off = arrangedOff(item.kind, type);
  const anchor = off ? off.slots.map((slot) => nearestOf(item, slot, items)).find((p) => !!p) : undefined;
  return anchor ? [anchor, ...left] : left;
}

/**
 * The piece against `edge`, its middle near `along` metres from the wall's first corner, turned to
 * face the room — the first spot nearest `along` (in 10 cm steps either way) where it stands well,
 * or null.
 */
function againstWall(item: PlacedItem, room: PlanRoom, edge: PlanEdge, along: number, others: PlacedItem[], rooms: readonly PlanRoom[], keepClear: readonly Footprint[] | null = null): PlacedItem | null {
  const half = item.size.width / 2;
  const steps = [0];
  for (let d = 0.1; d <= edge.length; d += 0.1) steps.push(d, -d);
  for (const step of steps) {
    const t = along + step;
    if (t - half < 0.02 || t + half > edge.length - 0.02) continue;
    const foot = { x: edge.a.x + edge.dir.x * t, z: edge.a.z + edge.dir.z * t };
    const moved = { ...item, rotation: edge.facing, position: { x: foot.x + edge.inward.x * (item.size.depth / 2 + 0.02), z: foot.z + edge.inward.z * (item.size.depth / 2 + 0.02) } };
    if (standsWell(room, moved, others, rooms, keepClear)) return moved;
  }
  return null;
}

/** Back against the wall behind it (or the nearest wall, turned to face the room), as near where it stood as it stands well. */
function backToWall(item: PlacedItem, room: PlanRoom, others: PlacedItem[], rooms: readonly PlanRoom[], keepClear: readonly Footprint[] | null = null): PlacedItem | null {
  const behind = pieceWall(item, room, 1.5);
  const centre = item.position;
  const edges = behind
    ? [behind.edge]
    : [...roomEdges(room.polygon)].sort((a, b) => distanceToEdge(centre, a) - distanceToEdge(centre, b)).slice(0, 2);
  for (const edge of edges) {
    const along = (centre.x - edge.a.x) * edge.dir.x + (centre.z - edge.a.z) * edge.dir.z;
    const moved = againstWall(item, room, edge, along, others, rooms, keepClear);
    if (moved) return moved;
  }
  return null;
}

function distanceToEdge(p: Vec2, edge: PlanEdge): number {
  const t = Math.max(0, Math.min(edge.length, (p.x - edge.a.x) * edge.dir.x + (p.z - edge.a.z) * edge.dir.z));
  return Math.hypot(edge.a.x + edge.dir.x * t - p.x, edge.a.z + edge.dir.z * t - p.z);
}

/**
 * The dining chairs of these rooms seated round their table as it stands now (`seatSlots`): the
 * n-th chair at the n-th seat, a chair the table has no seat for — or no floor for — taken out.
 * After a table is replaced, the old ring stood round nothing (a chair 1.3 m from a bistro table).
 */
export function reseatChairs(items: PlacedItem[], roomIds: Iterable<string>, rooms: readonly PlanRoom[]): PlacedItem[] {
  let out = [...items];
  for (const roomId of roomIds) {
    const room = rooms.find((r) => r.id === roomId);
    const table = out.find((i) => i.roomId === roomId && i.slot === 'dining_table' && i.product);
    const chairs = out.filter((i) => i.roomId === roomId && i.slot === 'dining_chair');
    if (!room || !table || chairs.length === 0) continue;
    const seats = seatSlots(table, chairs[0].size.depth);
    const seated = new Map<string, PlacedItem | null>();
    chairs.forEach((chair, n) => {
      const seat = seats[n];
      if (chair.locked) return seated.set(chair.id, chair);
      if (!seat) return seated.set(chair.id, null);
      const moved = { ...chair, position: seat.position, rotation: seat.rotation };
      seated.set(chair.id, footprintInRoom(footprintOf(moved.position, moved.size, moved.rotation), room.polygon) ? moved : null);
    });
    out = out.flatMap((i) => (seated.has(i.id) ? (seated.get(i.id) ? [seated.get(i.id)!] : []) : [i]));
  }
  return out;
}

/** Pieces standing in front of another, arranged off it: they move with it (the desk chair, the coffee table). */
const IN_FRONT: Record<string, string> = { office_chair: 'desk', coffee_table: 'sofa' };

/**
 * `item` moved by `step` along its facing, with the pieces arranged in front of it moved the same,
 * when all of them stand well there (judged without one another); null when they do not. A piece
 * that stood inside its own room stays inside it: a step square to a wall drawn a hair off square
 * drifts along the next wall by as much, and is taken back into the room's bounds
 * (`clampInsideRoom`) — the tidy-up is no reason to cross a room separator's line or a wall.
 */
function shiftWithFront(item: PlacedItem, step: number, out: PlacedItem[], room: PlanRoom, rooms: readonly PlanRoom[]): PlacedItem[] | null {
  const forward = { x: Math.sin(item.rotation), z: Math.cos(item.rotation) };
  const inRoom = (p: PlacedItem) => footprintInRoom(footprintOf(p.position, p.size, p.rotation), room.polygon);
  const move = (p: PlacedItem) => {
    const moved = { ...p, position: { x: p.position.x + forward.x * step, z: p.position.z + forward.z * step } };
    if (!inRoom(p) || inRoom(moved)) return moved;
    const kept = { ...moved, position: clampInsideRoom(room, moved.position, moved.size, moved.rotation) };
    return inRoom(kept) ? kept : moved;
  };
  // …and a TV standing on a TV unit, with it.
  const front = out.filter((p) => p.roomId === item.roomId && !p.locked && (IN_FRONT[p.kind] === item.slot || (item.slot === 'tv_unit' && p.slot === 'tv' && Math.abs(p.elevationM - item.size.height) < 0.02)));
  const group = [item, ...front];
  const moved = group.map(move);
  const ids = new Set(group.map((p) => p.id));
  // What travels with a piece moved (a bath's floor mixer, `hostOf`) is not in its way.
  const rest = out.filter((p) => !ids.has(p.id) && !ids.has(hostOf(p, out)?.id ?? ''));
  // Tested as what each is on the floor (`solid`): a ghost's archetype is a rendering hint, not floor
  // nobody needs — a floor mixer neither stands in a piece nor has a piece pushed into it.
  return moved.every((p, k) => isPlacementValid(room, p, rest, rooms, true) && (!inRoom(group[k]) || inRoom(p))) ? moved : null;
}

/**
 * Every piece the engine stands against a wall back against it where it has come to stand off it —
 * a swap, a fit or a check nudged it (a chest of drawers 48 cm off its wall) — if it stands well
 * there; given `only`, only the pieces it picks (and what stands in front of them). A locked piece
 * is left, and so is a piece that travels with its host (`hostOf`: a bath's floor mixer stands a
 * hand's width off its bath where the bathroom pass put it, not against the wall behind it). Pure.
 */
export function settleToWalls(items: PlacedItem[], plan: FloorPlan, only?: (item: PlacedItem) => boolean): PlacedItem[] {
  const out = [...items];
  out.forEach((item) => {
    if (item.locked || !wallPiece(item) || (only && !only(item)) || hostOf(item, out)) return;
    const room = plan.rooms.find((r) => r.id === item.roomId);
    const wall = room && pieceWall(item, room, 0.7);
    if (!room || !wall || wall.gap <= 0.03) return;
    const group = shiftWithFront(item, -(wall.gap - 0.02), out, room, plan.rooms);
    if (!group || blocksWindow(group[0], room)) return;
    for (const p of group) out[out.findIndex((q) => q.id === p.id)] = p;
  });
  return out;
}

/**
 * What stands in front of decor on its wall moved off it by the decor's depth (`decorDepth`) — a
 * bed in front of a headboard panel, a sideboard in front of slats — where it still stands well;
 * otherwise left, for the check to see; given `only`, only the pieces it picks. A niche wall is
 * kept off furniture when it is fitted (`resolveDecor`). Pure.
 */
export function clearOfDecor(items: PlacedItem[], decor: DecorPiece[], plan: FloorPlan, only?: (item: PlacedItem) => boolean): PlacedItem[] {
  if (decor.length === 0) return items;
  const out = [...items];
  out.forEach((item, index) => {
    // A TV on the wall is hung on the slab behind it, not inside it; other hung pieces keep off decor when it is fitted.
    const hung = item.elevationM >= 0.05;
    if (item.locked || (hung && item.slot !== 'tv') || item.slot === 'rug' || item.slot === 'curtain' || (only && !only(item))) return;
    const room = plan.rooms.find((r) => r.id === item.roomId);
    const wall = room && pieceWall(out[index], room, 0.3);
    if (!room || !wall) return;
    const bottom = hung ? item.elevationM : 0;
    const top = bottom + item.size.height;
    const need = Math.max(0, ...decor
      .filter((d) => d.roomId === room.id && d.wallIndex === wall.edge.index && STANDS_OUT.has(d.family) && !(d.anchor === 'bath' && item.slot === 'bathtub'))
      .filter((d) => wall.along + item.size.width / 2 > d.span.from + 0.02 && wall.along - item.size.width / 2 < d.span.to - 0.02 && d.height.from < top - 0.02 && d.height.to > bottom + 0.02)
      .map((d) => decorDepth(d) + 0.01));
    if (need <= wall.gap) return;
    if (hung) {
      const current = out[index];
      const forward = { x: Math.sin(current.rotation), z: Math.cos(current.rotation) };
      const step = need - wall.gap;
      out[index] = { ...current, position: { x: current.position.x + forward.x * step, z: current.position.z + forward.z * step } };
      return;
    }
    const group = shiftWithFront(item, need - wall.gap, out, room, plan.rooms);
    if (group) for (const p of group) out[out.findIndex((q) => q.id === p.id)] = p;
  });
  return out;
}

/**
 * Under a lowered ceiling (a cove's floating panel, `fitLight`): the hanging lamps under the panel
 * hang from it, not through it, and the ceiling points under it are fitted to its underside. Pure.
 */
export function underCeilingDecor(items: PlacedItem[], electrical: ElectricalPoint[], decor: DecorPiece[], plan: FloorPlan): { items: PlacedItem[]; electrical: ElectricalPoint[] } {
  const panels = new Map<string, { minX: number; maxX: number; minZ: number; maxZ: number; underside: number }>();
  for (const piece of decor) {
    if (piece.family !== 'light' || piece.wallIndex != null) continue;
    const room = plan.rooms.find((r) => r.id === piece.roomId);
    const panel = room ? fitLight(piece, underCeiling(room, plan), paramsOf(piece)).panel : null;
    if (panel) panels.set(piece.roomId, { ...panel, underside: panel.y - 0.07 });
  }
  if (panels.size === 0) return { items, electrical };
  const under = (roomId: string, p: Vec2) => {
    const panel = panels.get(roomId);
    return panel && p.x >= panel.minX && p.x <= panel.maxX && p.z >= panel.minZ && p.z <= panel.maxZ ? panel : null;
  };
  return {
    items: items.map((item) => {
      const panel = getArchetype(item.kind)?.placement.type === 'ceiling' ? under(item.roomId, item.position) : null;
      if (!panel || item.elevationM + item.size.height <= panel.underside) return item;
      return { ...item, elevationM: Math.round(Math.max(0.5, panel.underside - item.size.height) * 100) / 100 };
    }),
    electrical: electrical.map((point) => {
      if (point.kind !== 'light_ceiling' && point.kind !== 'light_spot') return point;
      const panel = under(point.roomId, point.position);
      return panel ? { ...point, elevationM: Math.round((panel.underside - 0.005) * 1000) / 1000 } : point;
    }),
  };
}

/**
 * The designer's check applied (`lib/design/aiReview`), and the room tidied after it:
 * - `remove`: the piece goes; `replace`: the new product goes where the old piece stood — its back
 *   on the same wall, a hung one at the height it should hang (`settledElevation`) — if it fits;
 *   both of a pair (`PAIRED_SLOTS`: the nightstands) are replaced, each beside the bed, or neither;
 * - `to_wall`: back against the wall behind it, or the nearest; `move_to_wall`: against wall N,
 *   as near its middle as it stands well (clear of windows if tall, of doorways and — given
 *   `keepClear`, per room — of the floor the layout kept clear and a kitchen run's working floor),
 *   what rides on it and what stands on it carried along (`carryCompanions`, `carryRiders`);
 * - `remove_decor`: the decor piece goes; `decor_to_wall`: fitted again on wall N.
 * Then the pieces placed off a replaced or moved bed, sofa or desk stand by it again, the chairs
 * round a replaced table are seated round it, every wall piece is back on its wall, and nothing
 * stands in the decor. A locked piece is left. Pure.
 */
export function applyReviewFixes(items: PlacedItem[], decor: DecorPiece[], review: AiReview, plan: FloorPlan, catalog: CatalogProduct[], keepClear: Record<string, Footprint[]> = {}): { items: PlacedItem[]; decor: DecorPiece[] } {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const rooms = new Map(plan.rooms.map((r) => [r.id, underCeiling(r, plan)]));
  let out = [...items];
  let pieces = [...decor];
  const changed = new Set<string>();
  // The rooms whose decor the check moved or took out: what stands there is cleared of it again.
  const decorRooms = new Set<string>();
  for (const fix of review.fixes) {
    if (fix.action === 'remove_decor') {
      const gone = pieces.find((d) => d.id === fix.target);
      if (gone) decorRooms.add(gone.roomId);
      pieces = pieces.filter((d) => d.id !== fix.target);
      continue;
    }
    if (fix.action === 'decor_to_wall') {
      const piece = pieces.find((d) => d.id === fix.target);
      const room = piece && rooms.get(piece.roomId);
      if (!piece || !room || fix.wallIndex == null) continue;
      const intent: DecorIntent = {
        family: piece.family,
        anchor: 'wall',
        wallIndex: fix.wallIndex,
        widthM: piece.span.to - piece.span.from > 0 ? piece.span.to - piece.span.from : null,
        heightFromM: piece.height.from,
        heightToM: piece.height.to,
        params: piece.params,
        materials: Object.entries(piece.materials).map(([slot, m]) => ({ slot: slot as DecorSlot, productId: m?.product?.productId ?? null, colorHex: m?.colorHex ?? null })),
        referenceId: piece.reference?.entryId ?? null,
        concept: piece.reference?.concept ?? null,
        note: piece.note ?? null,
      };
      // Kept off the engine's joinery on that wall, as the designer's decor is when it is first fitted.
      const moved = clearOfBuilt((r) => [resolveDecor(intent, r, out, catalog, piece.id)].filter((d): d is DecorPiece => !!d), room, pieces)[0];
      if (moved && !pieces.some((d) => d.id !== piece.id && overlaps(d, moved))) {
        pieces = pieces.map((d) => (d.id === piece.id ? moved : d));
        decorRooms.add(piece.roomId);
      }
      continue;
    }
    const index = out.findIndex((i) => i.id === fix.target);
    if (index < 0 || out[index].locked) continue;
    const item = out[index];
    const room = rooms.get(item.roomId);
    if (!room) continue;
    if (fix.action === 'remove') {
      out = out.filter((i) => i.id !== item.id);
      changed.add(`${item.roomId}|${item.slot}`);
      continue;
    }
    // The pieces placed off it (the nightstands off a bed, the chairs round a table) follow it below: they are not in its way.
    const others = out.filter((i) => i.id !== item.id && !(i.roomId === item.roomId && (PLACED_OFF[i.kind] === item.slot || (item.slot === 'dining_table' && i.slot === 'dining_chair'))));
    let placed: PlacedItem | null = null;
    if (fix.action === 'replace') {
      const product = fix.productId != null ? byId.get(fix.productId) : undefined;
      if (!product) continue;
      // A pair (two nightstands) is replaced together or not at all — each beside the bed at the new
      // size: replacing one left a bed between two different nightstands.
      if (PAIRED_SLOTS.has(item.slot)) {
        const group = out.filter((i) => i.roomId === item.roomId && i.slot === item.slot);
        // The check names every piece of the set; the first replaced them all.
        if (group.some((i) => i.locked) || group.every((i) => i.product?.productId === product.id)) continue;
        const rest = others.filter((i) => !group.includes(i));
        const done: PlacedItem[] = [];
        for (const piece of group) {
          const swapped = { ...applySwap([piece], piece.id, product)[0], pinned: false, origin: 'style' as const };
          const beside = { ...swapped, position: settledPosition(piece, swapped.size, room, rest) };
          const fitted = fitSwapped(room, beside, [...rest, ...done], plan.rooms);
          if (!fitted) break;
          done.push(fitted);
        }
        if (done.length !== group.length) continue;
        out = out.map((i) => done.find((d) => d.id === i.id) ?? i);
        changed.add(`${item.roomId}|${item.slot}`);
        continue;
      }
      const swapped = { ...applySwap([item], item.id, product)[0], pinned: false, origin: 'style' as const };
      // A hung piece at the height and place the new product hangs or stands at (a TV on its stand
      // onto the unit); a standing one re-measured as the matcher would — a wider fridge against the
      // end of the run, not 2 cm under its wall cabinets.
      // A basin on its vanity stays on the vanity's top, where it stands (the rulebook's bathroom pass).
      const onVanity = item.slot === 'sink' && item.elevationM > 0.3;
      const hung = onVanity ? { ...swapped, elevationM: item.elevationM, position: item.position } : rehungClear(item, swapped, product, others, room);
      placed = hung.elevationM >= 0.05 ? hung : fitSwapped(room, { ...hung, position: settledPosition(item, hung.size, room, others) }, others, plan.rooms);
    } else if (fix.action === 'to_wall' || fix.action === 'move_to_wall') {
      // What it takes along is in nothing's way of it; the rest of the room is, and so is the floor kept clear.
      const along = takenAlong(item, out);
      const rest = others.filter((i) => !along.has(i.id));
      const clear = keepClear[item.roomId] ?? [];
      const edge = fix.action === 'move_to_wall' ? roomEdges(room.polygon).find((e) => e.index === fix.wallIndex) : undefined;
      placed = fix.action === 'to_wall' ? backToWall(item, room, rest, plan.rooms, clear) : edge ? againstWall(item, room, edge, edge.length / 2, rest, plan.rooms, clear) : null;
    }
    if (!placed) continue;
    // Nothing the check moves or swaps in lands in the engine's joinery or a box (a WC moved
    // against the washer's column): such a fix is dropped.
    if (placed.elevationM < 0.05 && inEngineDecor(placed, pieces, room)) continue;
    out[index] = placed;
    if (fix.action === 'to_wall' || fix.action === 'move_to_wall') out = carryRiders(carryCompanions(out, item), item);
    changed.add(`${item.roomId}|${item.slot}`);
  }
  // A nightstand stands by the bed the room has now, not where the old bed's side was; one with no
  // room beside the new bed goes rather than stand in it.
  out = out.flatMap((item) => {
    const anchorSlot = PLACED_OFF[item.kind];
    if (!anchorSlot || item.locked || !changed.has(`${item.roomId}|${anchorSlot}`)) return [item];
    const room = rooms.get(item.roomId);
    if (!room) return [item];
    const rest = out.filter((i) => i.id !== item.id);
    const moved = { ...item, position: settledPosition(item, item.size, room, rest) };
    if (isPlacementValid(room, moved, rest, plan.rooms)) return [moved];
    return isPlacementValid(room, item, rest, plan.rooms) ? [item] : [];
  });
  const reseat = [...changed].filter((k) => k.endsWith('|dining_table') || k.endsWith('|dining_chair')).map((k) => k.split('|')[0]);
  out = reseatChairs(out, new Set(reseat), plan.rooms);
  // Decor centred on a piece the check moved goes with it first; then nothing stands in it.
  // Only what the check changed is tidied: decor whose piece it moved or swapped follows it (a piece
  // that would follow the furniture as it stood stays as it was), the pieces it moved, swapped or
  // seated again go back on their walls, and nothing stands in decor it moved. The rest of the flat
  // stays as generation left it.
  const asLaid = new Map(reanchorDecor(pieces, items, plan.rooms).map((d) => [d.id, JSON.stringify(d)]));
  const followed = new Map(reanchorDecor(pieces, out, plan.rooms).map((d) => [d.id, d]));
  pieces = pieces.flatMap((d) => {
    const now = followed.get(d.id);
    if ((now ? JSON.stringify(now) : undefined) === asLaid.get(d.id)) return [d];
    return now ? [now] : [];
  });
  const touched = (i: PlacedItem) => changed.has(`${i.roomId}|${i.slot}`) || changed.has(`${i.roomId}|${PLACED_OFF[i.kind]}`) || (i.slot === 'dining_chair' && changed.has(`${i.roomId}|dining_table`));
  out = clearOfDecor(settleToWalls(out, plan, touched), pieces, plan, (i) => touched(i) || decorRooms.has(i.roomId));
  return { items: out, decor: pieces };
}

/**
 * Whether a piece the check moved stands well where it has come to stand once what was built for it
 * is settled again (`settleFitted`: a WC pushed off its new wall by the box built behind it), by the
 * test its move was given (`standsWell` among the room's other pieces, clear of the floor kept clear),
 * out of the engine's joinery and boxes — and with what was built for it out of every other piece.
 * Pure.
 */
export function standsAfterMove(item: PlacedItem, items: readonly PlacedItem[], decor: readonly DecorPiece[], plan: FloorPlan, keepClear: readonly Footprint[] = []): boolean {
  const planRoom = plan.rooms.find((r) => r.id === item.roomId);
  if (!planRoom) return false;
  const room = underCeiling(planRoom, plan);
  const along = takenAlong(item, items);
  const others = items.filter((i) => i.id !== item.id && !along.has(i.id));
  if (!standsWell(room, item, others, plan.rooms, keepClear)) return false;
  const pieces = [...decor];
  if (item.elevationM < 0.05 && inEngineDecor(item, pieces, room)) return false;
  const own = pieces.filter((d) => housedIds(d).includes(item.id));
  return !others.some((o) => o.roomId === item.roomId && o.elevationM < 0.05 && inEngineDecor(o, own, room));
}

/** Whether a floor piece's footprint runs into a made-to-measure cabinet or a box on one of its room's walls. */
function inEngineDecor(item: PlacedItem, decor: DecorPiece[], room: PlanRoom): boolean {
  const footprint = footprintOf(item.position, item.size, item.rotation);
  return decor.some((piece) => {
    if (piece.roomId !== item.roomId || piece.wallIndex == null || (piece.family !== 'cabinet' && piece.family !== 'box')) return false;
    const edge = roomEdges(room.polygon).find((e) => e.index === piece.wallIndex);
    if (!edge) return false;
    // The piece's own WC or bath stands in its box by design.
    if ((piece.anchor === 'wc' && item.slot === 'toilet') || (piece.anchor === 'bath' && item.slot === 'bathtub')) return false;
    const depth = decorDepth(piece);
    const at = (s: number, d: number) => ({ x: edge.a.x + edge.dir.x * s + edge.inward.x * d, z: edge.a.z + edge.dir.z * s + edge.inward.z * d });
    const lo = Math.min(piece.span.from, piece.span.to) + 0.02;
    const hi = Math.max(piece.span.from, piece.span.to) - 0.02;
    const corners = [at(lo, 0), at(hi, 0), at(hi, depth), at(lo, depth)];
    const box = { minX: Math.min(...corners.map((c) => c.x)), maxX: Math.max(...corners.map((c) => c.x)), minZ: Math.min(...corners.map((c) => c.z)), maxZ: Math.max(...corners.map((c) => c.z)) };
    return footprintsOverlap(footprint, box);
  });
}

/**
 * Without the prints and mirrors that would hang over built decor on the same wall — the designer's
 * slats behind the bed are the picture there. Pure.
 */
export function withoutArtOverDecor(items: PlacedItem[], decor: DecorPiece[], plan: FloorPlan): PlacedItem[] {
  if (decor.length === 0) return items;
  const rooms = new Map(plan.rooms.map((r) => [r.id, underCeiling(r, plan)]));
  return items.filter((item) => {
    if ((item.slot !== 'artwork' && item.slot !== 'mirror') || item.elevationM < 0.05) return true;
    const room = rooms.get(item.roomId);
    if (!room) return true;
    const forward = { x: Math.sin(item.rotation), z: Math.cos(item.rotation) };
    const back = { x: item.position.x - forward.x * (item.size.depth / 2), z: item.position.z - forward.z * (item.size.depth / 2) };
    return !decor.some((piece) => {
      if (piece.roomId !== item.roomId || piece.wallIndex == null || !COVERS_WALL.has(piece.family)) return false;
      const edge = roomEdges(room.polygon).find((e) => e.index === piece.wallIndex);
      if (!edge) return false;
      const gap = (back.x - edge.a.x) * edge.inward.x + (back.z - edge.a.z) * edge.inward.z;
      if (Math.abs(gap) > 0.3) return false;
      const along = (back.x - edge.a.x) * edge.dir.x + (back.z - edge.a.z) * edge.dir.z;
      const from = along - item.size.width / 2;
      const to = along + item.size.width / 2;
      const high = item.elevationM + item.size.height;
      return from < piece.span.to - 0.05 && to > piece.span.from + 0.05 && item.elevationM < piece.height.to && high > piece.height.from;
    });
  });
}
