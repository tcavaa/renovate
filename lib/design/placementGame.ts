/**
 * "Where does it go?" — the game played while the plan is being read.
 *
 * Reading an uploaded plan takes from twenty seconds to two minutes. Instead of a spinner, the
 * upload card shows real catalogue products one at a time, each turning on a 3D turntable, and
 * the person puts each into the room of a little flat it belongs in. It is the studio in
 * miniature: real, purchasable pieces, placed room by room.
 *
 * Which room a piece belongs in is not written down here. It comes from the room programs the
 * layout engine furnishes rooms with (`kindsForRoom`): a kind is playable when exactly one of
 * the game's rooms has it — a bed is a bedroom's, a toilet a bathroom's, while an armchair
 * (living room, office, balcony) or a dining table (kitchen or living room) has no single
 * right answer and is left out (`roomForKind`).
 *
 * Pure: the round is a value, an answer returns the next one.
 */

import type { RoomType } from '@/lib/calculator/types';
import { kindsForRoom } from './catalog';
import type { CatalogProduct } from './matcher';

/** The little flat's rooms, in the order the board lays them out. */
export const GAME_ROOMS: readonly RoomType[] = ['living_room', 'kitchen', 'bedroom', 'bathroom', 'hallway'];

/** How many pieces a round has. */
export const ROUND_SIZE = 8;

/** Points for a piece put right first time, and for the second try; nothing after that. */
const FIRST_TRY = 100;
const SECOND_TRY = 50;
/** Each piece right first time in a row adds this much more, up to `STREAK_CAP` steps. */
const STREAK_BONUS = 25;
const STREAK_CAP = 4;

/**
 * Rooms the little flat does not have whose pieces would make a right answer arguable — an
 * armchair is as much the balcony's or the office's as the living room's. (A toilet room, a
 * closet and a studio are parts of the game's bathroom, bedroom and living room, so their
 * pieces stay in.)
 */
const ARGUABLE_ROOMS: readonly RoomType[] = ['office', 'balcony', 'storage'];

/** The one game room a kind belongs in, or null when none, several, or an arguable room has it. */
export function roomForKind(kind: string): RoomType | null {
  if (ARGUABLE_ROOMS.some((room) => kindsForRoom(room).includes(kind))) return null;
  const rooms = GAME_ROOMS.filter((room) => kindsForRoom(room).includes(kind));
  return rooms.length === 1 ? rooms[0] : null;
}

export interface GamePiece {
  product: CatalogProduct;
  /** The room it belongs in. */
  room: RoomType;
}

/**
 * Kinds that are not a piece to pick up: a kitchen run is sold as its material (a veneer, a
 * lacquer) and measured to the wall, so its name and photo are a swatch, not furniture.
 */
const NOT_PIECES: readonly string[] = ['kitchen_run', 'kitchen_wall'];

/** The products the game can use: a ready 3D model of a kind with one right room. */
export function playablePieces(products: CatalogProduct[]): GamePiece[] {
  const out: GamePiece[] = [];
  for (const product of products) {
    if (!product.model3dUrl || !product.model3dKind || product.own || NOT_PIECES.includes(product.model3dKind)) continue;
    const room = roomForKind(product.model3dKind);
    if (room) out.push({ product, room });
  }
  return out;
}

/**
 * A round's pieces: each a different kind, no room given more than two, as many rooms as there
 * are pieces for, in a shuffled order. Products in `avoid` (the last round's) are used only when
 * there is nothing else. `random` is injectable so a round can be tested.
 */
export function pickRound(pieces: GamePiece[], avoid: ReadonlySet<number> = new Set(), size = ROUND_SIZE, random: () => number = Math.random): GamePiece[] {
  const shuffled = shuffle(pieces, random).sort((a, b) => Number(avoid.has(a.product.id)) - Number(avoid.has(b.product.id)));
  const kinds = new Set<string>();
  const perRoom = new Map<RoomType, number>();
  const chosen: GamePiece[] = [];
  // First one piece for every room, then a second, so a small catalogue still covers the flat.
  for (const limit of [1, 2]) {
    for (const piece of shuffled) {
      if (chosen.length >= size) break;
      const kind = piece.product.model3dKind!;
      if (kinds.has(kind) || (perRoom.get(piece.room) ?? 0) >= limit) continue;
      kinds.add(kind);
      perRoom.set(piece.room, (perRoom.get(piece.room) ?? 0) + 1);
      chosen.push(piece);
    }
  }
  return shuffle(chosen, random);
}

export interface GameState {
  pieces: GamePiece[];
  /** The piece being placed; `pieces.length` once the round is over. */
  index: number;
  /** Wrong rooms tried for the current piece. */
  tries: number;
  score: number;
  streak: number;
  bestStreak: number;
  /** Pieces put right first time. */
  perfect: number;
  /** Product ids placed in each room so far. */
  placed: Partial<Record<RoomType, number[]>>;
  /** What the last answer was, for the feedback. */
  last: { room: RoomType; right: boolean; points: number } | null;
}

export function startRound(pieces: GamePiece[]): GameState {
  return { pieces, index: 0, tries: 0, score: 0, streak: 0, bestStreak: 0, perfect: 0, placed: {}, last: null };
}

export function currentPiece(state: GameState): GamePiece | null {
  return state.pieces[state.index] ?? null;
}

export function roundOver(state: GameState): boolean {
  return state.index >= state.pieces.length;
}

/** After two wrong rooms the right one is shown, so nobody is stuck on a piece. */
export function hintRoom(state: GameState): RoomType | null {
  const piece = currentPiece(state);
  return piece && state.tries >= 2 ? piece.room : null;
}

/**
 * The current piece put in `room`. Right: it is placed, scored and the next piece comes up.
 * Wrong: it stays, the streak is broken, and the try counts.
 */
export function answer(state: GameState, room: RoomType): GameState {
  const piece = currentPiece(state);
  if (!piece) return state;
  if (room !== piece.room) {
    return { ...state, tries: state.tries + 1, streak: 0, last: { room, right: false, points: 0 } };
  }
  const firstTry = state.tries === 0;
  const streak = firstTry ? state.streak + 1 : 0;
  const points = firstTry ? FIRST_TRY + STREAK_BONUS * Math.min(STREAK_CAP, streak - 1) : state.tries === 1 ? SECOND_TRY : 0;
  return {
    ...state,
    index: state.index + 1,
    tries: 0,
    score: state.score + points,
    streak,
    bestStreak: Math.max(state.bestStreak, streak),
    perfect: state.perfect + (firstTry ? 1 : 0),
    placed: { ...state.placed, [room]: [...(state.placed[room] ?? []), piece.product.id] },
    last: { room, right: true, points },
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
