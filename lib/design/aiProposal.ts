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

import { applySwap, settledElevation, settledPosition, type CatalogProduct } from './matcher';
import { fitSwapped, isPlacementValid } from './manipulate';
import { roomEdges } from './planGeometry';
import type { AiReview } from './aiReview';
import { finishFromProduct, isWetRoom, surfaceOptions, surfaceSpecs } from './surfaces';
import type { DecorPiece, FloorPlan, PlacedItem, PlanRoom, StyleId, SurfaceFinish } from './types';
import { COVERS_WALL, resolveRoomDecor, type DecorIntent } from './decor/resolve';

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

/** The finishes a surface of a room may wear: the right surface, as wet or dry as the room. */
export function finishCandidates(catalog: CatalogProduct[], room: PlanRoom, surface: 'floor' | 'wall', styleId: StyleId): CatalogProduct[] {
  const wet = isWetRoom(room.type);
  return surfaceOptions(catalog, surface, room, styleId).filter((p) => !!surfaceSpecs(p).wet === wet);
}

/**
 * The designer's floor or wall for a room as a finish laid by the style (`origin: 'style'`,
 * `laidFor`): a product the room may wear, or null to keep what the engine drew.
 */
export function proposalFinish(room: PlanRoom, surface: 'floor' | 'wall', productId: number | null, styleId: StyleId, catalog: CatalogProduct[]): SurfaceFinish | null {
  if (productId == null) return null;
  const product = finishCandidates(catalog, room, surface, styleId).find((p) => p.id === productId);
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
      const finish = proposalFinish(room, surface, asked[surface], styleId, catalog);
      if (!finish) continue;
      const index = next.findIndex((f) => f.roomId === room.id && f.surface === surface && f.wallIndex == null && !f.zone && !f.span && !f.cells);
      // A finish somebody chose stays theirs.
      if (index >= 0 && next[index].origin && next[index].origin !== 'style') continue;
      next = index >= 0 ? next.map((f, i) => (i === index ? finish : f)) : [...next, finish];
    }
  }
  return next;
}

/** Every room's decor intents measured against the flat as the engine laid it out. */
export function proposalDecor(plan: FloorPlan, proposal: AiProposal | null | undefined, items: PlacedItem[], catalog: CatalogProduct[]): DecorPiece[] {
  if (!proposal) return [];
  return plan.rooms.flatMap((room) => {
    const asked = proposal.rooms.find((r) => r.roomId === room.id);
    return asked ? resolveRoomDecor(asked.decor, room, items, catalog) : [];
  });
}

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

/**
 * The designer's check applied (`lib/design/aiReview`): a piece it took out goes; a replacement
 * goes in where the old piece stood — its back on the same wall, at the height a hung one should
 * hang (`settledElevation`) — only if it fits there; then the pieces placed off a replaced bed,
 * sofa or desk move to stand by the new one, where they fit. A locked piece is left. Pure.
 */
export function applyReviewFixes(items: PlacedItem[], review: AiReview, plan: FloorPlan, catalog: CatalogProduct[]): PlacedItem[] {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const rooms = new Map(plan.rooms.map((r) => [r.id, r]));
  let out = [...items];
  const changed = new Set<string>();
  for (const fix of review.fixes) {
    const index = out.findIndex((i) => i.id === fix.itemId);
    if (index < 0 || out[index].locked) continue;
    const item = out[index];
    if (fix.action === 'remove') {
      out = out.filter((i) => i.id !== item.id);
      continue;
    }
    const product = fix.productId != null ? byId.get(fix.productId) : undefined;
    const room = rooms.get(item.roomId);
    if (!product || !room) continue;
    // The pieces placed off it (the nightstands off a bed) follow it below: they are not in its way.
    const others = out.filter((i) => i.id !== item.id && !(i.roomId === item.roomId && PLACED_OFF[i.kind] === item.slot));
    const swapped = { ...applySwap([item], item.id, product)[0], pinned: false, origin: 'style' as const };
    const hung = { ...swapped, elevationM: settledElevation(item, swapped.size, product, others) };
    const placed = hung.elevationM >= 0.05 ? hung : fitSwapped(room, hung, others, plan.rooms);
    if (!placed) continue;
    out[index] = placed;
    changed.add(`${item.roomId}|${item.slot}`);
  }
  // A nightstand stands by the bed the room has now, not where the old bed's side was; one with no
  // room beside the new bed goes rather than stand in it.
  return out.flatMap((item) => {
    const anchorSlot = PLACED_OFF[item.kind];
    if (!anchorSlot || item.locked || !changed.has(`${item.roomId}|${anchorSlot}`)) return [item];
    const room = rooms.get(item.roomId);
    if (!room) return [item];
    const rest = out.filter((i) => i.id !== item.id);
    const moved = { ...item, position: settledPosition(item, item.size, room, rest) };
    if (isPlacementValid(room, moved, rest, plan.rooms)) return [moved];
    return isPlacementValid(room, item, rest, plan.rooms) ? [item] : [];
  });
}


/**
 * Without the prints and mirrors that would hang over built decor on the same wall — the designer's
 * slats behind the bed are the picture there. Pure.
 */
export function withoutArtOverDecor(items: PlacedItem[], decor: DecorPiece[], plan: FloorPlan): PlacedItem[] {
  if (decor.length === 0) return items;
  const rooms = new Map(plan.rooms.map((r) => [r.id, r]));
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
