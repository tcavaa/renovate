/**
 * Decor and the joinery under it (Nini's decision 8, 24 Nov 2026): wall decor is a finish of the
 * wall, not an object that keeps off every piece of furniture. Over a **low** built-in piece — a WC's
 * installation box, a vanity, a washing machine's column, a bath's enclosure: joinery whose top is
 * no higher than `LOW_BUILT_MAX_M` — a slatted field, a slab, a panel, cladding or a mural is placed
 * in one of four ways (`DecorPlacement`):
 *
 * - `full` — floor to ceiling, continuing behind the box or the vanity: one feature wall;
 * - `above` — from the top of the joinery to where it was asked to stop (the ceiling by default);
 * - `partial` — at the height and width the designer asked, behind the joinery where it reaches it;
 * - `beside` — kept off the joinery's stretch, as it always was.
 *
 * Tall joinery (a wardrobe, the hall's cupboards) and what hangs over joinery (a corner leg's wall
 * cabinets) are never stood behind: decor goes beside them whatever was asked. Nor is decor stood
 * behind joinery that what it houses stands in front of the wall in — an open section (the
 * washing machine's column) or a bath's enclosure: the machine and the bath would be pushed off
 * their housing by the decor's depth — so over those, `full` and `partial` go `above` instead.
 * Whatever the placement, decor keeps clear of the fixtures on its wall (the mirror, the basin and
 * its tap, a wall mixer — `resolve.ts`), of a radiator and of the openings.
 *
 * Pure: no React, no three.js.
 */

import type { DecorFamily, DecorPiece, DecorPlacement } from '@/lib/design/types';
import { sectionSpans } from './joinery';

/** The four placements over low joinery, in the order the brief and the card give them. */
export const DECOR_PLACEMENTS = ['full', 'above', 'partial', 'beside'] as const satisfies readonly DecorPlacement[];

/** Joinery whose top is no higher than this is low: decor may go behind or above it (a WC's box 1 m, a vanity 70–90 cm, a machine's column 90 cm, a bath's box). */
export const LOW_BUILT_MAX_M = 1.3;

/** The least height decor placed above joinery is built with; with less, it goes beside it. */
export const MIN_ABOVE_M = 0.4;

/**
 * The placement the engine takes when the designer leaves it open: **above**. Nini's own example
 * (a slab or a fluted panel from the top of a 1.2 m concealed-cistern box to the ceiling); the box's
 * top is a line the decor carries along the whole wall; it buys no material hidden behind the box,
 * and nothing on the box's face (the flush plate) or on a vanity's top stands in it.
 */
export const DEFAULT_PLACEMENT: DecorPlacement = 'above';

/** The families placed over low joinery: those that cover their stretch of wall and lie flat on it (a niche wall is built out and keeps off everything standing there). */
export const OVER_BUILT_FAMILIES: ReadonlySet<DecorFamily> = new Set<DecorFamily>(['slats', 'slab', 'panel', 'cladding', 'mural', 'tile']);

/** One block of built joinery on a wall, in the wall's frame: along it (metres from its first corner) and off the floor. */
export interface BuiltRect {
  from: number;
  to: number;
  bottom: number;
  top: number;
  /** Low joinery standing on the floor: decor may go above it, and behind it when `behind`. */
  low: boolean;
  /** Decor may stand behind it: a closed box or carcass with nothing standing in front of the wall inside it. */
  behind: boolean;
}

/** Whether a decor piece is built joinery: a cabinet or a box on a wall. */
export function isBuiltPiece(piece: Pick<DecorPiece, 'family' | 'wallIndex'>): boolean {
  return (piece.family === 'cabinet' || piece.family === 'box') && piece.wallIndex != null;
}

/** Sections open in front, the machine standing against the wall inside them. */
const OPEN_SECTIONS = new Set(['washer', 'open']);

/**
 * The blocks a piece of joinery takes on its wall: each cabinet section at its own height (a vanity
 * beside a washer's column is two), a corner leg's wall cabinets hung over it, a box whole. Empty for
 * anything else.
 */
export function builtRects(piece: DecorPiece): BuiltRect[] {
  if (!isBuiltPiece(piece)) return [];
  const rect = (from: number, to: number, bottom: number, top: number, behind: boolean): BuiltRect => ({ from, to, bottom, top, low: bottom < 0.05 && top <= LOW_BUILT_MAX_M + 1e-6, behind });
  if (piece.family === 'box') {
    const from = Math.min(piece.span.from, piece.span.to);
    const to = Math.max(piece.span.from, piece.span.to);
    // A bath's enclosure is hollow, the bath against the wall inside it.
    return [rect(from, to, Math.min(piece.height.from, piece.height.to), Math.max(piece.height.from, piece.height.to), piece.anchor !== 'bath')];
  }
  const out = sectionSpans(piece).map(({ section, x0, x1 }) => rect(x0, x1, 0, section.heightMm / 1000, !OPEN_SECTIONS.has(section.kind)));
  const hung = piece.params.wallUnits;
  if (hung && hung.to - hung.from > 0.05) out.push({ from: hung.from, to: hung.to, bottom: hung.bottomMm / 1000, top: (hung.bottomMm + hung.heightMm) / 1000, low: false, behind: false });
  return out;
}

/** Every block of joinery built on one wall of a room. */
export function builtRectsOnWall(built: readonly DecorPiece[], roomId: string, wallIndex: number): BuiltRect[] {
  return built.filter((d) => d.roomId === roomId && d.wallIndex === wallIndex).flatMap(builtRects);
}

/** Whether a stretch of wall `[from, to]` and a block overlap along it (by more than 2 cm). */
export function alongOverlaps(from: number, to: number, rect: Pick<BuiltRect, 'from' | 'to'>): boolean {
  return Math.min(to, rect.to) - Math.max(from, rect.from) > 0.02;
}

/** Whether a band of height and a block overlap up the wall (by more than 2 cm). */
export function bandOverlaps(band: { from: number; to: number }, rect: Pick<BuiltRect, 'bottom' | 'top'>): boolean {
  return Math.min(band.to, rect.top) - Math.max(band.from, rect.bottom) > 0.02;
}

/**
 * Where a piece stands against the low joinery on its wall, read from where it is: behind it, above
 * it, or beside it — null where its wall has no low joinery. What the card shows and the audit counts.
 */
export function placementOver(piece: Pick<DecorPiece, 'roomId' | 'wallIndex' | 'span' | 'height' | 'family'>, built: readonly DecorPiece[]): 'behind' | 'above' | 'beside' | null {
  if (piece.wallIndex == null || !OVER_BUILT_FAMILIES.has(piece.family)) return null;
  const low = builtRectsOnWall(built, piece.roomId, piece.wallIndex).filter((r) => r.low);
  if (low.length === 0) return null;
  const from = Math.min(piece.span.from, piece.span.to);
  const to = Math.max(piece.span.from, piece.span.to);
  const under = low.filter((r) => alongOverlaps(from, to, r));
  if (under.length === 0) return 'beside';
  return under.some((r) => bandOverlaps(piece.height, r)) ? 'behind' : 'above';
}
