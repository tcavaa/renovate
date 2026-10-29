import { describe, expect, it } from 'vitest';
import { refreshRoom } from '@/lib/design/planGeometry';
import { DECOR_MIN_HEIGHT_M, DECOR_MIN_WIDTH_M, decorExtent, dragDecorHandle, isResizable, resizeDecor } from '@/lib/design/decor/resize';
import type { DecorPiece, PlanRoom } from '@/lib/design/types';

/** Wall decor resized by hand: its arrows in 3D and its card's sizes (lib/design/decor/resize.ts). */

const room: PlanRoom = refreshRoom({ id: 'r', type: 'bedroom', name: 'r', polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }], heightM: 2.7, areaM2: 0, perimeterM: 0, openings: [] });
const piece = (extra: Partial<DecorPiece> = {}): DecorPiece => ({ id: 'd', roomId: 'r', family: 'slats', wallIndex: 0, span: { from: 1, to: 3 }, height: { from: 0.9, to: 2.4 }, params: {}, materials: {}, anchor: 'wall', ...extra });

describe('dragging a decor piece\'s arrows', () => {
  it('moves the side that was dragged, and keeps the other', () => {
    expect(dragDecorHandle(piece(), room, 'left', 0.5, 1.5)).toEqual({ span: { from: 0.5, to: 3 }, height: { from: 0.9, to: 2.4 } });
    expect(dragDecorHandle(piece(), room, 'right', 3.6, 1.5)?.span).toEqual({ from: 1, to: 3.6 });
    expect(dragDecorHandle(piece(), room, 'top', 2, 2.6)?.height).toEqual({ from: 0.9, to: 2.6 });
    expect(dragDecorHandle(piece(), room, 'bottom', 2, 0.3)?.height).toEqual({ from: 0.3, to: 2.4 });
  });

  it('grows a piece centred on furniture from its middle, so it stays centred', () => {
    expect(dragDecorHandle(piece({ anchor: 'bed' }), room, 'right', 3.4, 1.5)?.span).toEqual({ from: 0.6, to: 3.4 });
    // As far as the wall lets it either side of its middle.
    expect(dragDecorHandle(piece({ anchor: 'bed' }), room, 'left', -2, 1.5)?.span).toEqual({ from: 0, to: 4 });
  });

  it('keeps it on its wall, under the ceiling, and never smaller than a piece can be', () => {
    expect(dragDecorHandle(piece(), room, 'left', -1, 1)?.span.from).toBe(0);
    expect(dragDecorHandle(piece(), room, 'right', 9, 1)?.span.to).toBe(4);
    expect(dragDecorHandle(piece(), room, 'top', 2, 5)?.height.to).toBe(2.7);
    expect(dragDecorHandle(piece(), room, 'bottom', 2, -1)?.height.from).toBe(0);
    const narrow = dragDecorHandle(piece(), room, 'left', 3.5, 1)!;
    expect(narrow.span.to - narrow.span.from).toBeCloseTo(DECOR_MIN_WIDTH_M, 5);
    const low = dragDecorHandle(piece(), room, 'top', 2, 0)!;
    expect(low.height.to - low.height.from).toBeCloseTo(DECOR_MIN_HEIGHT_M, 5);
  });
});

describe('typing a decor piece\'s size', () => {
  it('sets the width about its middle, the height from its bottom, and how high its bottom is', () => {
    expect(resizeDecor(piece(), room, { widthM: 1 })?.span).toEqual({ from: 1.5, to: 2.5 });
    expect(resizeDecor(piece(), room, { heightM: 1 })?.height).toEqual({ from: 0.9, to: 1.9 });
    expect(resizeDecor(piece(), room, { bottomM: 1.1 })?.height).toEqual({ from: 1.1, to: 2.6 });
  });

  it('keeps a wide piece on its wall and a tall one under the ceiling', () => {
    expect(resizeDecor(piece({ span: { from: 3, to: 3.8 } }), room, { widthM: 2 })?.span).toEqual({ from: 2, to: 4 });
    expect(resizeDecor(piece(), room, { heightM: 3 })?.height).toEqual({ from: 0, to: 2.7 });
    expect(resizeDecor(piece(), room, { bottomM: 2 })?.height).toEqual({ from: 1.2, to: 2.7 });
  });

  it('reads a box to the ceiling as the ceiling, and leaves a cove round the room alone', () => {
    expect(decorExtent(piece({ family: 'box', height: { from: 0, to: 20 } }), room)?.height).toEqual({ from: 0, to: 2.7 });
    expect(isResizable(piece({ family: 'light', wallIndex: null }))).toBe(false);
    expect(resizeDecor(piece({ wallIndex: null }), room, { widthM: 1 })).toBeNull();
  });
});
