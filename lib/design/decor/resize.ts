/**
 * A wall decor piece made bigger or smaller by hand (the owner's notes of 29 Oct 2026: arrows on
 * its sides, top and bottom to resize it, and its width and height typed on its card). Its span
 * along the wall and its height stay on the wall and under the ceiling, and never smaller than a
 * piece can be built at. A piece centred on a piece of furniture (the slats behind the bed) grows
 * both ways from its middle, so it stays centred when the furniture moves (`reanchorDecor`); any
 * other moves the side that was dragged.
 *
 * Pure: no React, no three.js.
 */

import { roomEdges } from '../planGeometry';
import type { DecorPiece, PlanRoom } from '../types';
import { decorWall } from './layout';

/** The smallest a piece is resized to: narrower or lower than this it is not decor any more. */
export const DECOR_MIN_WIDTH_M = 0.2;
export const DECOR_MIN_HEIGHT_M = 0.1;

/** The arrow being dragged: a side, the top or the bottom. */
export type DecorHandle = 'left' | 'right' | 'top' | 'bottom';

export type DecorExtent = Pick<DecorPiece, 'span' | 'height'>;

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Whether a piece's sides move together: one centred on a piece of furniture grows from its middle. */
export function resizesFromMiddle(piece: Pick<DecorPiece, 'anchor'>): boolean {
  return !!piece.anchor && piece.anchor !== 'wall' && piece.anchor !== 'room';
}

/** Whether a piece can be resized by hand: one on a wall (not a cove round the ceiling). */
export function isResizable(piece: Pick<DecorPiece, 'wallIndex' | 'family'>): boolean {
  return piece.wallIndex != null && piece.family !== 'light';
}

/** The piece's extent as it stands — on its wall, under the ceiling — or null when it is not on a wall. */
export function decorExtent(piece: DecorPiece, room: Pick<PlanRoom, 'polygon' | 'heightM'>): DecorExtent | null {
  const wall = decorWall(piece, room);
  return wall ? { span: { from: wall.x0, to: wall.x1 }, height: { from: wall.y0, to: wall.y1 } } : null;
}

/** An extent kept on its wall (`length` long) and under the ceiling, at least the smallest size. */
function settle(extent: DecorExtent, length: number, ceiling: number): DecorExtent {
  const width = clamp(extent.span.to - extent.span.from, Math.min(DECOR_MIN_WIDTH_M, length), length);
  const from = clamp(extent.span.from, 0, length - width);
  const height = clamp(extent.height.to - extent.height.from, Math.min(DECOR_MIN_HEIGHT_M, ceiling), ceiling);
  const bottom = clamp(extent.height.from, 0, ceiling - height);
  return { span: { from: round3(from), to: round3(from + width) }, height: { from: round3(bottom), to: round3(bottom + height) } };
}

/**
 * The piece dragged by one of its arrows to a point on its wall: `along` metres from the wall's
 * start, `up` metres from the floor. Null when the piece is not on a wall of this room.
 */
export function dragDecorHandle(piece: DecorPiece, room: Pick<PlanRoom, 'polygon' | 'heightM'>, handle: DecorHandle, along: number, up: number): DecorExtent | null {
  const now = decorExtent(piece, room);
  const edge = now && roomEdges(room.polygon).find((e) => e.index === piece.wallIndex);
  if (!now || !edge) return null;
  const { span, height } = now;
  const middle = (span.from + span.to) / 2;
  const ceiling = room.heightM;
  if (handle === 'top' || handle === 'bottom') {
    // The other edge stays; the dragged one stops short of it by the smallest height.
    const next = handle === 'top' ? { from: height.from, to: clamp(up, height.from + DECOR_MIN_HEIGHT_M, ceiling) } : { from: clamp(up, 0, height.to - DECOR_MIN_HEIGHT_M), to: height.to };
    return settle({ span, height: next }, edge.length, ceiling);
  }
  if (resizesFromMiddle(piece)) {
    // Both sides move: the half-width is how far the pointer is from the middle, as far as the wall lets it.
    const half = clamp(Math.abs(along - middle), DECOR_MIN_WIDTH_M / 2, Math.min(middle, edge.length - middle));
    return settle({ span: { from: middle - half, to: middle + half }, height }, edge.length, ceiling);
  }
  const next = handle === 'left' ? { from: clamp(along, 0, span.to - DECOR_MIN_WIDTH_M), to: span.to } : { from: span.from, to: clamp(along, span.from + DECOR_MIN_WIDTH_M, edge.length) };
  return settle({ span: next, height }, edge.length, ceiling);
}

/**
 * The piece at a size typed on its card: a width (about its middle, kept on the wall), a height
 * (from its bottom up) or how high its bottom is off the floor (its height kept). Null when the
 * piece is not on a wall of this room.
 */
export function resizeDecor(piece: DecorPiece, room: Pick<PlanRoom, 'polygon' | 'heightM'>, size: { widthM?: number; heightM?: number; bottomM?: number }): DecorExtent | null {
  const now = decorExtent(piece, room);
  const edge = now && roomEdges(room.polygon).find((e) => e.index === piece.wallIndex);
  if (!now || !edge) return null;
  let { span, height } = now;
  if (size.widthM != null) {
    const width = clamp(size.widthM, DECOR_MIN_WIDTH_M, edge.length);
    const middle = clamp((span.from + span.to) / 2, width / 2, edge.length - width / 2);
    span = { from: middle - width / 2, to: middle + width / 2 };
  }
  if (size.bottomM != null) {
    const tall = height.to - height.from;
    height = { from: size.bottomM, to: size.bottomM + tall };
  }
  if (size.heightM != null) height = { from: height.from, to: height.from + clamp(size.heightM, DECOR_MIN_HEIGHT_M, room.heightM) };
  // A height that would run through the ceiling comes down from it rather than past it.
  if (height.to > room.heightM) height = { from: Math.max(0, height.from - (height.to - room.heightM)), to: room.heightM };
  return settle({ span, height }, edge.length, room.heightM);
}
