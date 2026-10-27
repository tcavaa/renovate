import { describe, expect, it } from 'vitest';
import { doorWidthFor, entranceSightBands, kitchenRunZones, minDoorWidthM, roomNiches } from '@/lib/design/rules';
import { layoutRoom, seatSlots } from '@/lib/design/autoLayout';
import { addOpening } from '@/lib/design/openings';
import { seededRng } from '@/lib/design/random';
import { radiatorKeepouts, ruleViolations } from '@/lib/design/ruleChecks';
import { refreshRoom } from '@/lib/design/planGeometry';
import { addWalls, rebuildRooms, wallsForRectangle } from '@/lib/design/walls';
import type { ElectricalPoint, FloorPlan, PlacedItem, PlanRoom, TechnicalPoint, Vec2, Wall } from '@/lib/design/types';

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

describe('the layout rules', () => {
  const poly = (id: string, type: PlanRoom['type'], points: Vec2[]): PlanRoom => refreshRoom({ id, type, name: id, polygon: points, heightM: 2.7, areaM2: 0, perimeterM: 0, openings: [] });
  const door = (roomId: string, wallIndex: number, t: number, widthM = 0.8, extra: Partial<import('@/lib/design/types').Opening> = {}) => ({ id: `${roomId}-d${wallIndex}-${t}`, kind: 'door' as const, wallIndex, t, widthM, heightM: 2.05, sillM: 0, roomId, exterior: false, ...extra });

  it('finds a niche — a recess with the room’s wall carrying on either side — and not a plain room’s end', () => {
    // A 4 × 3 bedroom whose top wall has a 1.8 m wide, 0.65 m deep recess at x 1–2.8.
    const recessed = poly('b', 'bedroom', [P(0, 0), P(1, 0), P(1, -0.65), P(2.8, -0.65), P(2.8, 0), P(4, 0), P(4, 3), P(0, 3)]);
    const niches = roomNiches(recessed);
    expect(niches).toHaveLength(1);
    expect(niches[0].widthM).toBeCloseTo(1.8, 2);
    expect(niches[0].depthM).toBeCloseTo(0.65, 2);
    expect(roomNiches(rect('r', 'bedroom', 0, 0, 4, 3))).toEqual([]);
  });

  it('builds the wardrobe into the niche', () => {
    const recessed = poly('b', 'bedroom', [P(0, 0), P(1, 0), P(1, -0.65), P(2.8, -0.65), P(2.8, 0), P(4, 0), P(4, 3.5), P(0, 3.5)]);
    const room = { ...recessed, openings: [door('b', 6, 0.8)] };
    const wardrobe = layoutRoom(room).find((i) => i.slot === 'wardrobe')!;
    expect(wardrobe).toBeDefined();
    expect(wardrobe.position.z).toBeLessThan(0);
    expect(wardrobe.size.width).toBeCloseTo(1.76, 2);
    expect(wardrobe.size.depth).toBe(0.6);
  });

  it('never stands the WC where the door opens onto it when another spot fits', () => {
    // A 2.2 × 2.4 bathroom, its door in the bottom wall (z = 2.4) at x 1.1 facing the top wall.
    const room = { ...rect('bath', 'bathroom', 0, 0, 2.2, 2.4), openings: [door('bath', 2, 0.5, 0.7)] };
    let placed = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const items = layoutRoom(room, { rng: seededRng(seed) });
      if (!items.some((i) => i.slot === 'toilet')) continue;
      placed += 1;
      expect(ruleViolations(planOf([room]), items).map((v) => v.code)).not.toContain('wc_faces_door');
    }
    expect(placed).toBeGreaterThan(0);
  });

  it('keeps the kitchen run out of the front door’s sight when another wall works', () => {
    // A 4 × 3.5 kitchen-living studio with the flat's front door in its bottom wall, facing the top wall.
    const kitchen = { ...rect('k', 'kitchen', 0, 0, 4, 3.5), openings: [door('k', 2, 0.5, 0.9, { exterior: true })] };
    const bands = entranceSightBands([kitchen]);
    expect(bands).toHaveLength(1);
    const run = layoutRoom(kitchen, { entranceSight: { k: bands.map((b) => b.quad) } }).find((i) => i.slot === 'kitchen_run')!;
    expect(run).toBeDefined();
    expect(ruleViolations(planOf([kitchen]), [run]).map((v) => v.code)).not.toContain('kitchen_faces_entrance');
    // Without the band, the same room may well put it there; the check says so.
    const facing: PlacedItem = { ...run, position: P(2, 0.31), rotation: 0, size: { ...run.size, width: 2.4 } };
    expect(ruleViolations(planOf([kitchen]), [facing]).map((v) => v.code)).toContain('kitchen_faces_entrance');
  });

  it('seats a person per 60 cm of table and gives a new door the width its rooms want', () => {
    expect(seatSlots({ position: P(0, 0), rotation: 0, size: { width: 1.8, depth: 0.9, height: 0.75 } })).toHaveLength(2 * 3 + 2);
    expect(seatSlots({ position: P(0, 0), rotation: 0, size: { width: 1.5, depth: 0.8, height: 0.75 } })).toHaveLength(2 * 2);
    expect(doorWidthFor('bedroom', 'hallway')).toBe(0.8);
    expect(doorWidthFor('hallway', 'toilet')).toBe(0.7);
    expect(doorWidthFor('hallway', null)).toBe(0.9);
    const rooms = addOpening([rect('h', 'hallway', 0, 0, 2, 3), rect('w', 'toilet', 2.12, 0, 1.2, 1.6)], 'h', 'door', 1, 0.12, { t: 0.25 }).rooms;
    expect(rooms[0].openings[0].widthM).toBe(0.7);
  });
});

describe('the size checks', () => {
  const item = (id: string, slot: PlacedItem['slot'], roomId: string, x: number, z: number, w: number, d: number, extra: Partial<PlacedItem> = {}): PlacedItem => ({ id, slot, kind: slot, roomId, position: P(x, z), rotation: 0, elevationM: 0, size: { width: w, depth: d, height: 0.85 }, product: null, ...extra });
  const codes = (plan: FloorPlan, items: PlacedItem[], electrical: ElectricalPoint[] = []) => ruleViolations(plan, items, electrical).map((v) => v.code);

  it('wants 60 cm beside a double bed, 40 cm beside a WC’s centre, 120 cm between counters', () => {
    const bedroom = planOf([rect('b', 'bedroom', 0, 0, 3, 4)]);
    // A 1.6 m bed against the top wall, 0.3 m off the left wall.
    expect(codes(bedroom, [item('bed', 'bed', 'b', 1.1, 1.05, 1.6, 2.05)])).toContain('bed_side_tight');
    expect(codes(bedroom, [item('bed', 'bed', 'b', 1.5, 1.05, 1.6, 2.05)])).not.toContain('bed_side_tight');

    const wc = planOf([rect('w', 'toilet', 0, 0, 1.2, 1.6)]);
    expect(codes(wc, [item('t', 'toilet', 'w', 0.3, 0.34, 0.4, 0.68)])).toContain('wc_side_tight');
    expect(codes(wc, [item('t', 'toilet', 'w', 0.6, 0.34, 0.4, 0.68)])).not.toContain('wc_side_tight');

    const kitchen = planOf([rect('k', 'kitchen', 0, 0, 4, 4)]);
    const run = item('r', 'kitchen_run', 'k', 2, 0.31, 3, 0.62);
    expect(codes(kitchen, [run, item('i', 'kitchen_island', 'k', 2, 1.9, 1.8, 0.9)])).toContain('counters_too_close');
    expect(codes(kitchen, [run, item('i', 'kitchen_island', 'k', 2, 2.5, 1.8, 0.9)])).not.toContain('counters_too_close');
  });

  it('wants the TV 2.5–3.5 m from the sofa, a shower 80 cm, a basin 85 cm up, no socket by the shower', () => {
    const living = planOf([rect('l', 'living_room', 0, 0, 4, 6)]);
    const sofa = item('s', 'sofa', 'l', 2, 0.46, 2.2, 0.92);
    const tv = (z: number) => item('tv', 'tv_unit', 'l', 2, z, 1.8, 0.42, { rotation: Math.PI });
    expect(codes(living, [sofa, tv(3.4)])).not.toContain('sofa_tv_distance');
    expect(codes(living, [sofa, tv(5.79)])).toContain('sofa_tv_distance');
    expect(codes(living, [sofa, tv(2.0)])).toContain('sofa_tv_distance');

    const bath = planOf([rect('b', 'bathroom', 0, 0, 2.5, 2)]);
    expect(codes(bath, [item('sh', 'shower', 'b', 0.4, 0.4, 0.75, 0.75)])).toContain('shower_too_small');
    expect(codes(bath, [item('sh', 'shower', 'b', 0.46, 0.46, 0.9, 0.9)])).not.toContain('shower_too_small');
    expect(codes(bath, [item('k', 'sink', 'b', 1.5, 0.25, 0.6, 0.45, { size: { width: 0.6, depth: 0.45, height: 0.7 } })])).toContain('basin_height');
    expect(codes(bath, [item('k', 'sink', 'b', 1.5, 0.25, 0.6, 0.45)])).not.toContain('basin_height');
    const socket = (x: number): ElectricalPoint => ({ id: `s${x}`, roomId: 'b', kind: 'socket', position: P(x, 0.01), elevationM: 1.1, wallIndex: 0, t: x / 2.5, origin: 'generated' });
    const shower = item('sh', 'shower', 'b', 0.46, 0.46, 0.9, 0.9);
    expect(codes(bath, [shower], [socket(1.2)])).toContain('socket_in_splash');
    expect(codes(bath, [shower], [socket(2.2)])).not.toContain('socket_in_splash');
  });

  it('flags a WC the door opens onto, and two doors that hit each other', () => {
    const room = { ...rect('w', 'toilet', 0, 0, 1.2, 1.8), openings: [{ id: 'd', kind: 'door' as const, wallIndex: 2, t: 0.5, widthM: 0.7, heightM: 2.05, sillM: 0, roomId: 'w', exterior: false }] };
    expect(codes(planOf([room]), [item('t', 'toilet', 'w', 0.6, 0.34, 0.4, 0.68)])).toContain('wc_faces_door');

    // Two doors in the corner of a hall, one on each wall, each swinging in: their leaves meet.
    const hall = { ...rect('h', 'hallway', 0, 0, 3, 3), openings: [
      { id: 'a', kind: 'door' as const, wallIndex: 0, t: 0.2, widthM: 0.8, heightM: 2.05, sillM: 0, roomId: 'h', exterior: false },
      { id: 'b', kind: 'door' as const, wallIndex: 3, t: 0.8, widthM: 0.8, heightM: 2.05, sillM: 0, roomId: 'h', exterior: false },
    ] };
    expect(codes(planOf([hall]), [])).toContain('door_swing_clash');
    const apart = { ...hall, openings: [hall.openings[0], { ...hall.openings[1], t: 0.3 }] };
    expect(codes(planOf([apart]), [])).not.toContain('door_swing_clash');
  });
});

describe('the warnings in words', () => {
  it('lists the flat’s warnings for the plan PDF, and the pieces’ for the AI’s check', async () => {
    const { ruleNotes } = await import('@/components/design/ruleText');
    const { ruleProblem } = await import('@/lib/design/ruleChecks');
    const { ka } = await import('@/lib/i18n/ka');
    const room = { ...rect('w', 'toilet', 0, 0, 1.2, 1.8), openings: [{ id: 'd', kind: 'door' as const, wallIndex: 2, t: 0.5, widthM: 0.7, heightM: 2.05, sillM: 0, roomId: 'w', exterior: false }] };
    const wc: PlacedItem = { id: 't', slot: 'toilet', kind: 'toilet', roomId: 'w', position: P(0.6, 0.34), rotation: 0, elevationM: 0, size: { width: 0.4, depth: 0.68, height: 0.82 }, product: null };
    const notes = ruleNotes(ka, 'ka', planOf([room]), [wc]);
    expect(notes.some((n) => n.includes('უნიტაზი'))).toBe(true);
    const [facing] = ruleViolations(planOf([room]), [wc]).filter((v) => v.code === 'wc_faces_door');
    expect(ruleProblem(facing)).toMatch(/door opens onto/);
    expect(ruleProblem({ code: 'door_too_narrow', roomId: 'w' })).toBeNull();
  });

  it('tells the AI’s check what the rules say about a piece', async () => {
    const { reviewFindings } = await import('@/lib/design/aiReview');
    const room = { ...rect('w', 'toilet', 0, 0, 1.2, 1.8), openings: [{ id: 'd', kind: 'door' as const, wallIndex: 2, t: 0.5, widthM: 0.7, heightM: 2.05, sillM: 0, roomId: 'w', exterior: false }] };
    const wc: PlacedItem = { id: 't', slot: 'toilet', kind: 'toilet', roomId: 'w', position: P(0.6, 0.34), rotation: 0, elevationM: 0, size: { width: 0.4, depth: 0.68, height: 0.82 }, product: { productId: 1, nameKa: 'wc', pricePerUnit: 1, unit: 'piece', qty: 1, totalPrice: 1 } as PlacedItem['product'] };
    expect(reviewFindings(planOf([room]), [wc]).get('t')?.join(' ')).toMatch(/door opens onto/);
  });
});
