import { describe, expect, it } from 'vitest';
import { kitchenRunZones, minDoorWidthM } from '@/lib/design/rules';
import { radiatorKeepouts, ruleViolations } from '@/lib/design/ruleChecks';
import { refreshRoom } from '@/lib/design/planGeometry';
import { addWalls, rebuildRooms, wallsForRectangle } from '@/lib/design/walls';
import type { FloorPlan, PlacedItem, PlanRoom, TechnicalPoint, Vec2, Wall } from '@/lib/design/types';

const P = (x: number, z: number): Vec2 => ({ x, z });
const rect = (id: string, type: PlanRoom['type'], x: number, z: number, w: number, d: number): PlanRoom =>
  refreshRoom({ id, type, name: id, polygon: [P(x, z), P(x + w, z), P(x + w, z + d), P(x, z + d)], heightM: 2.7, areaM2: 0, perimeterM: 0, openings: [] });
const planOf = (rooms: PlanRoom[], points: TechnicalPoint[] = []): FloorPlan => ({ rooms, metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', wallThicknessM: 0.12, walls: [], technical: { points } });

/** A 2.4 m run along the top wall (z = 0) of a 4 × 3 kitchen, x 0.8–3.2, facing into the room. */
const run: PlacedItem = { id: 'run', roomId: 'k', slot: 'kitchen_run', kind: 'kitchen_run', position: P(2, 0.3), elevationM: 0, rotation: 0, size: { width: 2.4, depth: 0.6, height: 0.9 }, product: null };

describe('the kitchen run’s zones', () => {
  const kitchen = rect('k', 'kitchen', 0, 0, 4, 3);

  it('puts the sink at the end nearer the water, the dishwasher beside it and the hob towards the middle', () => {
    const water: TechnicalPoint = { id: 'w', kind: 'water_supply', roomId: 'k', position: P(3.1, 0.08), elevationM: 0.5, origin: 'user' };
    const zones = kitchenRunZones(kitchen, run, [water])!;
    expect(zones.edge.index).toBe(0);
    expect(zones.sinkS).toBeCloseTo(2.9, 2);
    expect(zones.dishwasherS).toBeCloseTo(2.3, 2);
    expect(zones.hobS).toBeCloseTo(1.4, 2);
    // Prep between the dishwasher's unit and the hob, the rest past the hob.
    expect(zones.worktop.map(([a, b]) => [Math.round(a * 100) / 100, Math.round(b * 100) / 100])).toEqual([
      [1.7, 2.0],
      [0.8, 1.1],
    ]);
  });

  it('with no water marked, takes the end nearer the fridge; with nothing, the wall’s first end', () => {
    const fridge: PlacedItem = { id: 'f', roomId: 'k', slot: 'fridge', kind: 'fridge', position: P(3.6, 0.35), elevationM: 0, rotation: 0, size: { width: 0.6, depth: 0.65, height: 1.9 }, product: null };
    expect(kitchenRunZones(kitchen, run, [], [fridge])!.sinkS).toBeCloseTo(2.9, 2);
    expect(kitchenRunZones(kitchen, run)!.sinkS).toBeCloseTo(1.1, 2);
  });

  it('has no dishwasher in a short run', () => {
    const short = { ...run, size: { ...run.size, width: 1.8 } };
    expect(kitchenRunZones(kitchen, short)!.dishwasherS).toBeNull();
  });
});

describe('the rule checks', () => {
  const T = 0.12;
  const blank: FloorPlan = { rooms: [], metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', wallThicknessM: T, walls: [] };
  const fromRects = (...rects: Array<{ x: number; z: number; width: number; depth: number }>): FloorPlan =>
    rebuildRooms(blank, rects.reduce((all, r, i) => addWalls(all, wallsForRectangle(r, T, 'user', `r${i}`)), [] as Wall[]));

  /** A living room with a window in its top wall (z = 0), x 1.3–2.7, and a radiator under it. */
  const withRadiator = (heightM: number, sillM = 0.9) => {
    const plan = fromRects({ x: 0, z: 0, width: 4, depth: 3 });
    const room = { ...plan.rooms[0], type: 'living_room' as const, openings: [{ id: 'w', kind: 'window' as const, wallIndex: 0, t: 0.5, widthM: 1.4, heightM: 1.4, sillM, roomId: plan.rooms[0].id, exterior: true }] };
    const radiator: TechnicalPoint = { id: 'rad', kind: 'radiator', roomId: room.id, position: P(2, 0.08), elevationM: 0.12, sections: 8, radiator: { wattsPerSection: 170, sectionWidthM: 0.08, heightM, depthM: 0.1 }, origin: 'user' };
    return { ...plan, rooms: [room], technical: { points: [radiator] } } as FloorPlan;
  };

  it('keeps the floor in front of a radiator clear', () => {
    const plan = withRadiator(0.6);
    const [box] = radiatorKeepouts(plan)[plan.rooms[0].id];
    expect(box.minZ).toBeCloseTo(0, 1);
    expect(box.maxZ).toBeCloseTo(0.4, 1);
    expect(box.maxX - box.minX).toBeCloseTo(8 * 0.08 + 0.1, 2);

    const sofa: PlacedItem = { id: 's', roomId: plan.rooms[0].id, slot: 'sofa', kind: 'sofa_3', position: P(2, 0.5), elevationM: 0, rotation: 0, size: { width: 2, depth: 0.9, height: 0.85 }, product: null };
    expect(ruleViolations(plan, [sofa]).map((v) => v.code)).toContain('radiator_blocked');
    const away = { ...sofa, position: P(2, 2.4), rotation: Math.PI };
    expect(ruleViolations(plan, [away]).map((v) => v.code)).not.toContain('radiator_blocked');
  });

  it('flags a radiator that reaches within 10 cm of its sill', () => {
    expect(ruleViolations(withRadiator(0.6), []).map((v) => v.code)).not.toContain('radiator_under_sill');
    const tall = ruleViolations(withRadiator(0.76), []).find((v) => v.code === 'radiator_under_sill')!;
    expect(tall.valueM).toBeCloseTo(0.02, 2);
  });

  it('flags a boiler on an inside wall', () => {
    const plan = fromRects({ x: 0, z: 0, width: 3, depth: 3 }, { x: 3 + T, z: 0, width: 3, depth: 3 });
    const kitchen = plan.rooms.find((r) => r.polygon.every((p) => p.x < 3.05))!;
    const inside: TechnicalPoint = { id: 'b', kind: 'boiler', roomId: kitchen.id, position: P(2.9, 1.5), elevationM: 1.6, origin: 'user' };
    const outside: TechnicalPoint = { ...inside, position: P(0.08, 1.5) };
    expect(ruleViolations({ ...plan, technical: { points: [inside] } }, []).map((v) => v.code)).toEqual(['boiler_not_exterior']);
    expect(ruleViolations({ ...plan, technical: { points: [outside] } }, [])).toEqual([]);
  });

  it('wants doors of 80 cm, 70 cm into a bathroom, measuring an interior door once', () => {
    expect(minDoorWidthM('bedroom')).toBe(0.8);
    expect(minDoorWidthM('toilet')).toBe(0.7);
    const door = (id: string, roomId: string, other: string, widthM: number, wallIndex = 1) => ({ id, kind: 'door' as const, wallIndex, t: 0.5, widthM, heightM: 2.1, sillM: 0, roomId, connectsToRoomId: other, exterior: false });
    const hall = { ...rect('h', 'hallway', 0, 0, 2, 3), openings: [door('d1', 'h', 'b', 0.7)] };
    const bath = { ...rect('b', 'bathroom', 2.12, 0, 2, 3), openings: [door('d2', 'b', 'h', 0.7, 3)] };
    expect(ruleViolations(planOf([hall, bath]), [])).toEqual([]);
    const bed = { ...rect('b', 'bedroom', 2.12, 0, 3, 3), openings: [door('d2', 'b', 'h', 0.7, 3)] };
    const narrow = ruleViolations(planOf([hall, bed]), []).filter((v) => v.code === 'door_too_narrow');
    expect(narrow).toHaveLength(1);
    expect(narrow[0].limitM).toBe(0.8);
  });
});
