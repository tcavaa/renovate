import { describe, expect, it } from 'vitest';
import type { CatalogProduct } from '@/lib/design/matcher';
import { GAME_ROOMS, answer, currentPiece, hintRoom, pickRound, playablePieces, roomForKind, roundOver, startRound } from '@/lib/design/placementGame';

let nextId = 1;
const product = (kind: string | null, model = true): CatalogProduct =>
  ({ id: nextId++, nameKa: kind ?? 'x', slug: `p${nextId}`, model3dKind: kind, model3dUrl: model ? `/models/${kind}.glb` : null, pricePerUnit: 100, imageUrl: null }) as CatalogProduct;

/** A seeded random, so rounds are the same every run. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

describe('roomForKind', () => {
  it('answers from the room programs, one room per kind', () => {
    expect(roomForKind('bed_double')).toBe('bedroom');
    expect(roomForKind('toilet')).toBe('bathroom');
    expect(roomForKind('fridge')).toBe('kitchen');
    expect(roomForKind('sofa_3seat')).toBe('living_room');
    expect(roomForKind('shoe_cabinet')).toBe('hallway');
  });

  it('leaves out what has no single right room', () => {
    expect(roomForKind('dining_table')).toBeNull(); // kitchen or living room
    expect(roomForKind('armchair')).toBeNull(); // living room, office, balcony
    expect(roomForKind('pendant')).toBeNull(); // everywhere
    expect(roomForKind('socket')).toBeNull(); // nowhere
  });
});

describe('a round', () => {
  const catalogue = [
    ...['bed_double', 'wardrobe', 'nightstand', 'toilet', 'bathtub', 'fridge', 'kitchen_island', 'sofa_3seat', 'tv_unit', 'shoe_cabinet', 'console_table'].map((k) => product(k)),
    product('dining_table'),
    product('kitchen_run'),
    product('toilet', false),
    product(null),
  ];
  const pieces = playablePieces(catalogue);

  it('plays only pieces with a model and one right room', () => {
    expect(pieces).toHaveLength(11);
    expect(pieces.every((p) => p.product.model3dUrl && GAME_ROOMS.includes(p.room))).toBe(true);
  });

  it('covers every room before giving one a second piece, with no kind twice', () => {
    const round = pickRound(pieces, new Set(), 8, seeded(7));
    expect(round).toHaveLength(8);
    expect(new Set(round.map((p) => p.room)).size).toBe(GAME_ROOMS.length);
    expect(new Set(round.map((p) => p.product.model3dKind)).size).toBe(8);
    const perRoom = GAME_ROOMS.map((room) => round.filter((p) => p.room === room).length);
    expect(Math.max(...perRoom)).toBeLessThanOrEqual(2);
  });

  it("puts the last round's pieces last", () => {
    const first = pickRound(pieces, new Set(), 5, seeded(3));
    const second = pickRound(pieces, new Set(first.map((p) => p.product.id)), 5, seeded(4));
    expect(second.filter((p) => first.some((f) => f.product.id === p.product.id))).toHaveLength(0);
  });

  it('scores first tries with a growing run, a second try with less, and moves on only when right', () => {
    const round = pickRound(pieces, new Set(), 3, seeded(11));
    let state = startRound(round);

    state = answer(state, currentPiece(state)!.room);
    expect(state.score).toBe(100);
    state = answer(state, currentPiece(state)!.room);
    expect(state.score).toBe(225); // 100 + a run of two
    expect(state.streak).toBe(2);

    const piece = currentPiece(state)!;
    const wrong = GAME_ROOMS.find((r) => r !== piece.room)!;
    state = answer(state, wrong);
    expect(currentPiece(state)).toBe(piece);
    expect(state.streak).toBe(0);
    expect(hintRoom(state)).toBeNull();
    state = answer(state, wrong);
    expect(hintRoom(state)).toBe(piece.room);
    state = answer(state, piece.room);
    expect(state.score).toBe(225); // third try: placed, no points
    expect(roundOver(state)).toBe(true);
    expect(state.perfect).toBe(2);
    expect(state.bestStreak).toBe(2);
    expect(state.placed[piece.room]).toContain(piece.product.id);
  });
});
