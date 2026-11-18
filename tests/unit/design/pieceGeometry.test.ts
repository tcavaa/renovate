import { describe, expect, it } from 'vitest';
import { backMiddle, distanceToSegment, round2, wallBehind } from '@/lib/design/pieceGeometry';
import { roomEdges } from '@/lib/design/planGeometry';
import type { PlacedItem, Vec2 } from '@/lib/design/types';

/**
 * The geometry of a piece in its room, written once (generation-audit D1, D2, D8, X5): each caller
 * passes its own tolerances, the measure is the same.
 */

const P = (x: number, z: number): Vec2 => ({ x, z });
// A room 4 × 3 m: wall 0 along z = 0 facing +z, wall 1 along x = 4 facing −x.
const edges = roomEdges([P(0, 0), P(4, 0), P(4, 3), P(0, 3)]);
const piece = (x: number, z: number, rotation: number, width = 1, depth = 0.5): Pick<PlacedItem, 'position' | 'rotation' | 'size'> => ({ position: { x, z }, rotation, size: { width, depth, height: 1 } });

describe('the wall behind a piece', () => {
  it('by its gap: square to the wall it backs onto, within the caller\'s slack', () => {
    const chest = piece(2, 0.3, 0); // its back 5 cm off wall 0
    const wall = wallBehind(chest, edges, { facing: Math.cos(0.05), by: 'gap', min: -0.05, max: 0.06, past: 0.05 });
    expect(wall?.edge.index).toBe(0);
    expect(wall?.gap).toBeCloseTo(0.05);
    expect(wall?.along).toBeCloseTo(2);
    expect(wallBehind(chest, edges, { facing: Math.cos(0.05), by: 'gap', min: -0.05, max: 0.04 })).toBeNull();
    // Turned a quarter away from it, it backs onto no wall it faces as.
    expect(wallBehind(piece(2, 0.3, Math.PI / 2), edges, { facing: Math.cos(0.05), by: 'gap', min: -0.05, max: 0.06 })).toBeNull();
  });

  it('by its distance: the nearest wall to its back\'s middle, whichever way it faces when the caller says so', () => {
    const turned = piece(3.5, 1.5, Math.PI / 2); // its back's middle at x 3.25, 75 cm from wall 1
    expect(wallBehind(turned, edges, { facing: null, by: 'distance', max: 0.45 })).toBeNull();
    expect(wallBehind(turned, edges, { facing: null, by: 'distance', max: 0.8 })?.edge.index).toBe(1);
  });

  it('past the end of a wall: by metres, or a share of its length', () => {
    const off = piece(4.1, 0.25, 0); // its back's middle 10 cm past wall 0's end
    expect(wallBehind(off, edges, { facing: 1 - 1e-9, by: 'gap', min: -0.05, max: 0.05, past: 0.05 })).toBeNull();
    expect(wallBehind(off, edges, { facing: 1 - 1e-9, by: 'gap', min: -0.05, max: 0.05, past: { share: 0.03 } })?.edge.index).toBe(0);
  });
});

describe('the small measures', () => {
  it('the back\'s middle, a point\'s distance to a segment, the centimetre', () => {
    expect(backMiddle(piece(2, 1, 0))).toEqual({ x: 2, z: 0.75 });
    expect(distanceToSegment(P(1, 1), P(0, 0), P(2, 0))).toBeCloseTo(1);
    expect(distanceToSegment(P(3, 0), P(0, 0), P(2, 0))).toBeCloseTo(1);
    expect(round2(1.005)).toBe(1);
    expect(round2(1.236)).toBe(1.24);
  });
});
