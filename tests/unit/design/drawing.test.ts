import { describe, expect, it } from 'vitest';
import { beamAt, columnAt, nodeAt, pointElementAt, polygonsOverlap, snapPoint, snapRectangle, snapRoomMove, snapWallOffset, wallAt } from '@/lib/design/drawing';
import { addWalls, roomsFromWalls, wallsClash, wallsForRectangle } from '@/lib/design/walls';
import type { Beam, Column, TechnicalPoint, Vec2, Wall } from '@/lib/design/types';

const wall = (id: string, a: Vec2, b: Vec2, thicknessM = 0.12): Wall => ({ id, a, b, thicknessM, origin: 'user' });
const P = (x: number, z: number): Vec2 => ({ x, z });
const square = [wall('t', P(0, 0), P(4, 0)), wall('r', P(4, 0), P(4, 3)), wall('b', P(4, 3), P(0, 3)), wall('l', P(0, 3), P(0, 0))];

describe('snapPoint', () => {
  it('snaps onto a junction within reach before anything else', () => {
    const result = snapPoint(P(3.92, 0.06), { walls: square, tolM: 0.15, anchor: P(1, 1) });
    expect(result.point).toEqual(P(4, 0));
    expect(result.snappedTo).toBe('node');
  });

  it('locks a nearly horizontal wall to the axis and lands on the grid', () => {
    const result = snapPoint(P(2.53, 1.04), { walls: [], tolM: 0.15, anchor: P(0, 1), gridM: 0.05 });
    expect(result.point).toEqual(P(2.55, 1));
    expect(result.snappedTo).toBe('axis');
    expect(result.guides.some((g) => g.kind === 'axis')).toBe(true);
  });

  it('leaves an angled wall alone when free drawing is asked for', () => {
    const result = snapPoint(P(2.5, 1.04), { walls: [], tolM: 0.15, anchor: P(0, 1), gridM: 0.05, free: true });
    expect(result.point).toEqual(P(2.5, 1.05));
  });

  it('lands on an existing wall for a T-junction, keeping the axis lock', () => {
    const result = snapPoint(P(2, 2.94), { walls: square, tolM: 0.15, anchor: P(2, 1) });
    expect(result.snappedTo).toBe('wall');
    expect(result.point.z).toBeCloseTo(3, 6);
    expect(result.point.x).toBeCloseTo(2, 6);
  });

  it('aligns with a junction on the free axis and says which', () => {
    const result = snapPoint(P(4.04, 6), { walls: square, tolM: 0.15 });
    expect(result.point.x).toBe(4);
    expect(result.snappedTo).toBe('align');
    expect(result.guides[0].kind).toBe('align');
  });

  it('falls back to the grid', () => {
    const result = snapPoint(P(7.33, 7.71), { walls: square, tolM: 0.15, gridM: 0.05 });
    expect(result.point).toEqual(P(7.35, 7.7));
    expect(result.snappedTo).toBe('grid');
  });
});

describe('snapRectangle', () => {
  it('pulls a rectangle so its wall lands on the neighbour’s wall', () => {
    // The square's right wall is the centreline at x = 4; a rectangle whose left face is at
    // 4.1 puts its own centreline at 4.04, within reach.
    const { rect, guides } = snapRectangle({ x: 4.1, z: 0.2, width: 3, depth: 2.5 }, square, 0.12, 0.2);
    expect(rect.x).toBeCloseTo(4.06, 6);
    expect(rect.z).toBeCloseTo(0.06, 6); // the top face snapped to the top wall too
    // Each snapped side: the wall it landed on, and the line the two share across the sheet.
    expect(guides).toHaveLength(4);
  });

  it('snaps onto the wall that runs alongside, not the one that only meets the corner', () => {
    // Two rooms stacked on the left: the upper one 12 cm wider, so the partition above ends
    // 12 cm to the right of the lower room's wall. A rectangle drawn beside the lower room
    // with its edge under the upper partition (x = 4.12) must share the lower room's wall
    // (x = 4), not continue the partition into a doubled wall a hand's width away.
    const stacked = [
      ...square,
      wall('u-t', P(0, -3), P(4.12, -3)),
      wall('u-r', P(4.12, -3), P(4.12, 0)),
      wall('u-l', P(0, -3), P(0, 0)),
    ];
    const { rect, guides } = snapRectangle({ x: 4.12, z: 0.06, width: 3, depth: 2.5 }, stacked, 0.12, 0.2);
    expect(rect.x).toBeCloseTo(4.06, 6);
    expect(guides[0].a).toEqual(P(4, 0));
  });

  it('meets the neighbour on both sides when a room is drawn between two others', () => {
    // Rooms 1 and 3 stand either side of a gap under room 2; the pointer snapped both corners
    // of room 4 onto their walls' centrelines (x = 5.2 and x = 7.86), so the drawn face is
    // half a wall too wide on each side. Sliding it onto one neighbour left the other wall
    // doubled, a thickness apart; both sides have to land.
    const flat = addWalls(
      [],
      [
        ...wallsForRectangle({ x: 0.06, z: 1.95, width: 5.08, depth: 4 }, 0.12, 'user', 'r1'),
        ...wallsForRectangle({ x: 0.06, z: 0.06, width: 10.01, depth: 1.77 }, 0.12, 'user', 'r2'),
        ...wallsForRectangle({ x: 7.92, z: 1.95, width: 2.15, depth: 4.12 }, 0.12, 'user', 'r3'),
      ]
    );
    const { rect, guides } = snapRectangle({ x: 5.2, z: 1.89, width: 2.66, depth: 5.75 }, flat, 0.12, 0.2);
    expect(rect.x).toBeCloseTo(5.26, 6);
    expect(rect.width).toBeCloseTo(2.54, 6);
    expect(rect.z).toBeCloseTo(1.95, 6);
    expect(rect.depth).toBeCloseTo(5.75, 6);
    expect(guides.filter((g) => g.kind === 'wall')).toHaveLength(3);

    // One wall between rooms 1 and 4, one between 4 and 3: four plain rooms, no jogs.
    const walls = addWalls(flat, wallsForRectangle(rect, 0.12, 'user', 'r4'));
    const rooms = roomsFromWalls(walls);
    expect(rooms).toHaveLength(4);
    const fourth = rooms.find((r) => Math.abs(r.areaM2 - 2.54 * 5.75) < 0.05);
    expect(fourth?.polygon).toHaveLength(4);
    for (const p of walls) {
      for (const q of walls) {
        if (p === q || Math.abs(p.a.x - p.b.x) > 1e-6 || Math.abs(q.a.x - q.b.x) > 1e-6) continue;
        const apart = Math.abs(p.a.x - q.a.x);
        const overlap = Math.min(Math.max(p.a.z, p.b.z), Math.max(q.a.z, q.b.z)) - Math.max(Math.min(p.a.z, p.b.z), Math.min(q.a.z, q.b.z));
        if (overlap > 0.3) expect(apart === 0 || apart > 0.5).toBe(true);
      }
    }
  });

  it('reaches a wall its own wall would overlap, however small the pointer’s reach', () => {
    // Zoomed far in the pointer's reach is a couple of centimetres; a rectangle whose wall
    // would stand half inside the neighbour's is still the neighbour's wall.
    const { rect } = snapRectangle({ x: 4.15, z: 0.06, width: 3, depth: 2.5 }, square, 0.12, 0.02);
    expect(rect.x).toBeCloseTo(4.06, 6);
  });

  it('leaves a rectangle far from everything where it is', () => {
    const { rect, guides } = snapRectangle({ x: 9, z: 9, width: 3, depth: 2 }, square, 0.12, 0.2);
    expect(rect).toEqual({ x: 9, z: 9, width: 3, depth: 2 });
    expect(guides).toHaveLength(0);
  });
});

describe('snapRoomMove', () => {
  /** A box of walls with its centrelines on the given rectangle. */
  const box = (id: string, x0: number, z0: number, x1: number, z1: number, t = 0.12): Wall[] => [
    wall(`${id}-t`, P(x0, z0), P(x1, z0), t),
    wall(`${id}-r`, P(x1, z0), P(x1, z1), t),
    wall(`${id}-b`, P(x1, z1), P(x0, z1), t),
    wall(`${id}-l`, P(x0, z1), P(x0, z0), t),
  ];
  const shifted = (walls: Wall[], d: Vec2): Wall[] => walls.map((w) => ({ ...w, a: P(w.a.x + d.x, w.a.z + d.z), b: P(w.b.x + d.x, w.b.z + d.z) }));
  const upper = box('a', 0, 0, 5.15, 4);
  const lower = box('b', 1.2, 6, 5.2, 10);
  const options = { tolM: 0.3, gridM: 0.05 };

  it('lands a room pushed up under another exactly on its wall — the six centimetres never happen', () => {
    // The hand stops with the two walls 6 cm apart, which is how the board used to leave them.
    const { delta, guides } = snapRoomMove(lower, upper, P(0.41, -1.94), options);
    expect(delta.z).toBe(-2);
    expect(wallsClash(shifted(lower, delta), upper)).toBe(false);
    // It says which wall it took, and draws the line the two now share.
    expect(guides.some((g) => g.kind === 'wall' && g.a.z === 4 && g.b?.z === 4)).toBe(true);
    expect(guides.some((g) => g.kind === 'align')).toBe(true);
  });

  it('squares the side walls up with the neighbour’s when they come close', () => {
    // Sliding left along the upper room: its left wall comes within reach of the other's.
    const { delta } = snapRoomMove(lower, upper, P(-1.13, -2.02), options);
    expect(delta).toEqual(P(-1.2, -2));
  });

  it('prefers the wall it is being pushed against to a line it merely passes', () => {
    // 20 cm short of the upper room's wall, and 4 cm off lining up with a wall far away.
    const far = [wall('far', P(20, 8.24), P(24, 8.24))];
    const { delta } = snapRoomMove(lower, [...upper, ...far], P(0.4, -1.8), options);
    expect(delta.z).toBe(-2);
  });

  it('lines up with a room across the sheet when nothing is nearer', () => {
    const across = box('c', 12, 6.07, 16, 9);
    const { delta, guides } = snapRoomMove(lower, across, P(0, 0.02), options);
    expect(delta.z).toBeCloseTo(0.07, 6);
    expect(guides.filter((g) => g.kind === 'wall')).toHaveLength(0);
  });

  it('reaches a wall its own would overlap however small the pointer’s reach', () => {
    const { delta } = snapRoomMove(lower, upper, P(0.4, -1.9), { tolM: 0.02, gridM: 0.01 });
    expect(delta.z).toBe(-2);
  });

  it('falls to the grid when no wall is near', () => {
    expect(snapRoomMove(lower, upper, P(7.03, 3.98), options).delta).toEqual(P(7.05, 4));
  });
});

describe('hit tests', () => {
  it('finds walls, junctions, columns, beams and points under the pointer', () => {
    expect(wallAt(square, P(2, 0.05), 0.05)?.wall.id).toBe('t');
    expect(wallAt(square, P(2, 1), 0.05)).toBeNull();
    expect(nodeAt(square, P(3.95, 0.03), 0.1)).toEqual(P(4, 0));
    const column: Column = { id: 'c', position: P(1, 1), widthM: 0.3, depthM: 0.3, origin: 'existing' };
    expect(columnAt([column], P(1.1, 1.1), 0.05)?.id).toBe('c');
    expect(columnAt([column], P(1.5, 1), 0.05)).toBeNull();
    const beam: Beam = { id: 'b', a: P(0, 1.5), b: P(4, 1.5), widthM: 0.2, depthM: 0.3, elevationM: 2.4, origin: 'existing' };
    expect(beamAt([beam], P(2, 1.58), 0.02)?.id).toBe('b');
    const point: TechnicalPoint = { id: 'p', kind: 'sewer', roomId: null, position: P(3, 2), origin: 'existing' };
    expect(pointElementAt([point], P(3.1, 2.1), 0.2)?.id).toBe('p');
    expect(pointElementAt([point], P(3.5, 2.5), 0.2)).toBeNull();
  });
});

describe('rooms may not sit on top of each other', () => {
  const box = (x: number, z: number, w: number, d: number): Vec2[] => [
    { x, z },
    { x: x + w, z },
    { x: x + w, z: z + d },
    { x, z: z + d },
  ];
  // An L, to make the point that a room is not always convex.
  const ell: Vec2[] = [
    { x: 0, z: 0 },
    { x: 6, z: 0 },
    { x: 6, z: 3 },
    { x: 3, z: 3 },
    { x: 3, z: 6 },
    { x: 0, z: 6 },
  ];

  it('two rooms sharing a wall do not overlap; one pushed into the other does', () => {
    expect(polygonsOverlap(box(0, 0, 4, 3), box(4.12, 0, 3, 3))).toBe(false);
    // Edges exactly on top of each other — the usual result of snapping — still do not.
    expect(polygonsOverlap(box(0, 0, 4, 3), box(4, 0, 3, 3))).toBe(false);
    expect(polygonsOverlap(box(0, 0, 4, 3), box(3, 0, 3, 3))).toBe(true);
  });

  it('sees a room dropped into the notch of an L-shaped one', () => {
    // The notch is free floor of the *other* room, not of the L.
    expect(polygonsOverlap(ell, box(3.2, 3.2, 2, 2))).toBe(false);
    // Over the L's own arm, it is an overlap.
    expect(polygonsOverlap(ell, box(1, 1, 2, 2))).toBe(true);
    // Wholly inside, with no edge crossing at all.
    expect(polygonsOverlap(box(0, 0, 8, 8), box(2, 2, 2, 2))).toBe(true);
  });
});

describe('lining up with a room elsewhere on the sheet', () => {
  it('pulls a rectangle side onto the line of a wall it is in line with, and draws that line', () => {
    // A room drawn well below the square, a hand off its right wall's line: the side lands on
    // x = 4 exactly, and the guide is the full-sheet line the two walls now share.
    const { rect, guides } = snapRectangle({ x: 0.5, z: 6, width: 3.45, depth: 2 }, square, 0.12, 0.2);
    expect(rect.x + rect.width + 0.06).toBeCloseTo(4, 6);
    const line = guides.find((g) => g.kind === 'align');
    expect(line?.a.x).toBeCloseTo(4, 6);
    // Nothing runs alongside down there, so the wall itself is not a guide — only the line.
    expect(guides.some((g) => g.kind === 'wall' && g.a.x === 4)).toBe(false);
  });

  it('gives two rooms the same width when both sides line up', () => {
    const { rect } = snapRectangle({ x: 0.1, z: 6, width: 3.75, depth: 2 }, square, 0.12, 0.2);
    expect(rect.x - 0.06).toBeCloseTo(0, 6);
    expect(rect.x + rect.width + 0.06).toBeCloseTo(4, 6);
  });
});

describe('snapWallOffset', () => {
  // A second room below the square, its right wall a hand short of the square's.
  const lower = [wall('l-t', P(0, 4), P(3.85, 4)), wall('l-r', P(3.85, 4), P(3.85, 7)), wall('l-b', P(3.85, 7), P(0, 7)), wall('l-l', P(0, 7), P(0, 4))];
  const all = [...square, ...lower];

  it('pulls a wall dragged sideways onto the line of a wall in line with it', () => {
    const dragged = lower[1];
    // The right wall's normal points into the room (−x): a negative travel moves it right.
    const { distance, guides } = snapWallOffset(dragged, all, -0.1, 0.2);
    expect(3.85 - distance).toBeCloseTo(4, 6);
    expect(guides.find((g) => g.kind === 'align')?.a.x).toBeCloseTo(4, 6);
  });

  it('leaves a wall alone that runs alongside, and one out of reach', () => {
    // The square's bottom wall and the lower room's top wall run alongside on the same line:
    // dragging the top wall up towards it must not land on it.
    expect(snapWallOffset(lower[0], all, 0.05, 0.2).distance).toBe(0.05);
    expect(snapWallOffset(lower[1], all, -0.5, 0.2).distance).toBe(-0.5);
  });
});
