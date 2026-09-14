import { describe, expect, it } from 'vitest';
import { beamAt, columnAt, nodeAt, pointElementAt, snapPoint, snapRectangle, wallAt } from '@/lib/design/drawing';
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
    expect(guides).toHaveLength(2);
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

  it('leaves a rectangle far from everything where it is', () => {
    const { rect, guides } = snapRectangle({ x: 9, z: 9, width: 3, depth: 2 }, square, 0.12, 0.2);
    expect(rect).toEqual({ x: 9, z: 9, width: 3, depth: 2 });
    expect(guides).toHaveLength(0);
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
