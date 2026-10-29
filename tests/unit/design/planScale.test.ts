import { describe, expect, it } from 'vitest';
import { defaultScaleEdge, scaleEdgeLength, scalePlan, scalePlanToEdge } from '@/lib/design/planScale';
import { addWalls, rebuildRooms, wallsForRectangle } from '@/lib/design/walls';
import { roomEdges } from '@/lib/design/planGeometry';
import type { FloorPlan, Wall } from '@/lib/design/types';

const blankPlan = (): FloorPlan => ({ rooms: [], metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'parsed', imageUrl: null, wallThicknessM: 0.12, wallHeightM: 2.8, walls: [] });

/** A plan at the wrong scale: two rooms of 2 × 1.5 m and 1 × 1.5 m (inside), 30 cm walls outside and a 12 cm partition. */
function smallPlan(): FloorPlan {
  const walls: Wall[] = [
    { id: 'top', a: { x: 0, z: 0 }, b: { x: 3.27, z: 0 }, thicknessM: 0.3, origin: 'existing' },
    { id: 'bottom', a: { x: 0, z: 1.8 }, b: { x: 3.27, z: 1.8 }, thicknessM: 0.3, origin: 'existing' },
    { id: 'left', a: { x: 0, z: 0 }, b: { x: 0, z: 1.8 }, thicknessM: 0.3, origin: 'existing' },
    { id: 'right', a: { x: 3.27, z: 0 }, b: { x: 3.27, z: 1.8 }, thicknessM: 0.3, origin: 'existing' },
    { id: 'mid', a: { x: 2.21, z: 0 }, b: { x: 2.21, z: 1.8 }, thicknessM: 0.12, origin: 'existing' },
  ];
  const plan = rebuildRooms(blankPlan(), walls);
  plan.rooms.forEach((r, i) => {
    r.type = i === 0 ? 'living_room' : 'bedroom';
    r.name = r.type;
  });
  return plan;
}

describe('defaultScaleEdge', () => {
  it('offers the longest inside edge on an outside wall', () => {
    const plan = smallPlan();
    const edge = defaultScaleEdge(plan)!;
    expect(edge).not.toBeNull();
    expect(scaleEdgeLength(plan, edge)).toBeCloseTo(2, 2);
  });

  it('offers nothing for a plan with no rooms', () => {
    expect(defaultScaleEdge(blankPlan())).toBeNull();
  });
});

describe('scalePlanToEdge', () => {
  it('scales the plan so the chosen wall measures what was typed, inside the room, the walls as thick as before', () => {
    const plan = smallPlan();
    const edge = defaultScaleEdge(plan)!;
    const scaled = scalePlanToEdge(plan, edge, 5);
    expect(scaleEdgeLength(scaled, edge)).toBeCloseTo(5, 3);
    expect(scaled.walls!.find((w) => w.id === 'top')!.thicknessM).toBe(0.3);
    expect(scaled.walls!.find((w) => w.id === 'mid')!.thicknessM).toBe(0.12);
    expect(scaled.rooms).toHaveLength(2);
    expect(scaled.bounds.width).toBeGreaterThan(plan.bounds.width * 2);
  });

  it('carries doors and windows along, their widths scaled with the plan', () => {
    const plan = smallPlan();
    const living = plan.rooms[0];
    const top = roomEdges(living.polygon).find((e) => living.wallIds?.[e.index] === 'top')!;
    living.openings = [{ id: 'win', kind: 'window', wallIndex: top.index, t: 0.5, widthM: 0.6, heightM: 1.4, sillM: 0.9, roomId: living.id, exterior: true }];
    const scaled = scalePlan(plan, 2);
    const win = scaled.rooms.find((r) => r.id === living.id)!.openings.find((o) => o.id === 'win')!;
    expect(win.widthM).toBeCloseTo(1.2, 3);
    expect(win.t).toBeCloseTo(0.5, 1);
  });

  it('leaves a plan alone for a length that makes no sense or a wall that is not there', () => {
    const plan = smallPlan();
    expect(scalePlanToEdge(plan, { roomId: 'nope', edgeIndex: 0 }, 5)).toBe(plan);
    expect(scalePlanToEdge(plan, defaultScaleEdge(plan)!, 0)).toBe(plan);
  });
});

describe('scalePlan', () => {
  it('scales the rooms built from rectangles too', () => {
    const walls = addWalls([], wallsForRectangle({ x: 0.06, z: 0.06, width: 1, depth: 1 }, 0.12, 'user', 'a'));
    const plan = rebuildRooms(blankPlan(), walls);
    const scaled = scalePlan(plan, 3);
    expect(scaled.rooms[0].areaM2).toBeGreaterThan(plan.rooms[0].areaM2 * 8);
  });
});
