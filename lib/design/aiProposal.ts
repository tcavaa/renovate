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

import type { CatalogProduct } from './matcher';
import { finishFromProduct, isWetRoom, surfaceOptions, surfaceSpecs } from './surfaces';
import type { DecorPiece, FloorPlan, PlacedItem, PlanRoom, StyleId, SurfaceFinish } from './types';
import { resolveRoomDecor, type DecorIntent } from './decor/resolve';

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
