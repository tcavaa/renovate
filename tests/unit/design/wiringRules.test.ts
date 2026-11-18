import { describe, expect, it } from 'vitest';
import { suggestTechnical } from '@/lib/design/autoTechnical';
import { dressBoard } from '@/lib/design/boardPicks';
import { isLampOutlet, roomMiddle, standardElectrical, suggestElectrical, withFixtureProduct, withFixtureProducts } from '@/lib/design/electrical';
import { lightingPlan } from '@/lib/design/lightingPlan';
import type { CatalogProduct } from '@/lib/design/matcher';
import { pointInPolygon, polygonCentroid, refreshRoom, roomEdges } from '@/lib/design/planGeometry';
import { priceScene } from '@/lib/design/pricing';
import { radiatorBody } from '@/lib/design/radiators';
import { radiatorKeepouts, ruleViolations } from '@/lib/design/ruleChecks';
import { APPLIANCE_SOCKET_M, HOOD_SOCKET_M, KITCHEN_SOCKET_M, TOWEL_RAIL_DEPTH_M, TOWEL_RAIL_HEIGHT_M, TOWEL_RAIL_WIDTH_M } from '@/lib/design/rules';
import { studioParts } from '@/lib/design/studio';
import { technicalSuggestions } from '@/lib/design/technical';
import type { ElectricalPoint, FloorPlan, Opening, PlacedItem, PlanRoom, TechnicalPoint, Vec2 } from '@/lib/design/types';

/**
 * The wiring reads what is already on a wall (docs/design-studio/generation-audit.md, section G): a
 * socket is never put in a radiator, behind a kitchen run or in a doorway — it slides along its wall
 * to the nearest clear spot.
 */

const P = (x: number, z: number): Vec2 => ({ x, z });
function room(id: string, type: PlanRoom['type'], w: number, d: number, openings: Array<Omit<Opening, 'roomId' | 'id'>> = []): PlanRoom {
  return refreshRoom({ id, type, name: id, polygon: [P(0, 0), P(w, 0), P(w, d), P(0, d)], heightM: 2.7, areaM2: 0, perimeterM: 0, openings: openings.map((o, i) => ({ ...o, id: `${id}-o${i}`, roomId: id })) });
}
const plan = (rooms: PlanRoom[], points: TechnicalPoint[] = []): FloorPlan => ({ rooms, metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', wallThicknessM: 0.12, technical: { points } });
const door = (wallIndex: number, t: number): Omit<Opening, 'roomId' | 'id'> => ({ kind: 'door', wallIndex, t, widthM: 0.8, heightM: 2.05, sillM: 0, exterior: false });
const window = (wallIndex: number, t: number, widthM = 1.4): Omit<Opening, 'roomId' | 'id'> => ({ kind: 'window', wallIndex, t, widthM, heightM: 1.4, sillM: 0.9, exterior: true });
/** Whether a fitting is in an opening of its wall, or within 8 cm of it, at its own height. */
function inOpening(r: PlanRoom, p: ElectricalPoint): boolean {
  return r.openings.some((o) => o.wallIndex === p.wallIndex && p.elevationM > o.sillM - 0.05 && p.elevationM < o.sillM + o.heightM + 0.05 && Math.abs(at(r, p) - o.t * roomEdges(r.polygon)[o.wallIndex].length) < o.widthM / 2 + 0.08 - 1e-6);
}
const item = (roomId: string, slot: PlacedItem['slot'], x: number, z: number, size: PlacedItem['size'], rotation = 0, elevationM = 0): PlacedItem => ({ id: `${roomId}-${slot}`, roomId, slot, kind: slot, position: P(x, z), rotation, elevationM, size, product: null });
/** A ten-section radiator (80 cm) on a wall of `r`, its middle at `position`. */
const radiator = (id: string, roomId: string, position: Vec2): TechnicalPoint => ({ id, kind: 'radiator', roomId, position, elevationM: 0.12, sections: 10, radiator: { wattsPerSection: 170, sectionWidthM: 0.08, heightM: 0.6, depthM: 0.1 }, origin: 'user' });
/** Metres along its wall of a wall-mounted point. */
const at = (r: PlanRoom, p: ElectricalPoint) => p.t! * roomEdges(r.polygon)[p.wallIndex!].length;

/** Whether a fitting is in a radiator's body: on its wall, within its length and its height. */
function inRadiator(flat: FloorPlan, r: PlanRoom, p: ElectricalPoint): boolean {
  return (flat.technical?.points ?? []).some((point) => {
    const body = radiatorBody(flat, point);
    if (!body || body.room.id !== p.roomId || body.edge.index !== p.wallIndex) return false;
    return at(r, p) > body.from - 0.04 && at(r, p) < body.to + 0.04 && p.elevationM > body.bottom - 0.04 && p.elevationM < body.top + 0.04;
  });
}

describe('sockets and radiators', () => {
  const bedroom = room('r', 'bedroom', 4, 3, [door(2, 0.5)]);

  it('measures a radiator on its wall: its length by its sections, from its bottom to its top', () => {
    const flat = plan([bedroom], [radiator('rad', 'r', P(2, 0.08))]);
    const body = radiatorBody(flat, flat.technical!.points[0])!;
    expect(body.edge.index).toBe(0);
    expect([body.from, body.to]).toEqual([1.6, 2.4]);
    expect([body.bottom, body.top]).toEqual([0.12, 0.72]);
  });

  it('slides the general socket off the radiator hanging where it would go', () => {
    const bare = standardElectrical(plan([bedroom]));
    const socket = bare.find((p) => p.kind === 'socket')!;
    expect([socket.wallIndex, at(bedroom, socket)]).toEqual([0, 2]);

    const flat = plan([bedroom], [radiator('rad', 'r', P(2, 0.08))]);
    const wired = standardElectrical(flat);
    const moved = wired.find((p) => p.kind === 'socket')!;
    expect(inRadiator(flat, bedroom, moved)).toBe(false);
    // On the same wall, beside the radiator — not across the room.
    expect(moved.wallIndex).toBe(0);
    expect(Math.abs(at(bedroom, moved) - 2)).toBeLessThan(0.7);
    // The same fittings either way.
    expect(wired.map((p) => p.kind).sort()).toEqual(bare.map((p) => p.kind).sort());
  });

  it('slides a bedside socket off a radiator and keeps both of the bed’s', () => {
    const bed = item('r', 'bed', 2, 1.05, { width: 1.6, depth: 2.05, height: 1 });
    const bare = suggestElectrical(plan([bedroom]), [bed]).filter((p) => p.kind === 'socket_double');
    expect(bare.map((p) => at(bedroom, p)).sort()).toEqual([0.95, 3.05]);
    // A radiator on the bed's wall, over the left bedside socket's spot.
    const flat = plan([bedroom], [radiator('rad', 'r', P(0.8, 0.08))]);
    const sockets = suggestElectrical(flat, [bed]).filter((p) => p.kind === 'socket_double');
    expect(sockets).toHaveLength(2);
    expect(sockets.some((p) => inRadiator(flat, bedroom, p))).toBe(false);
    expect(suggestElectrical(flat, [bed]).filter((p) => p.kind.startsWith('socket') && inRadiator(flat, bedroom, p))).toEqual([]);
  });

  it('puts no general socket behind a kitchen run, however low its units', () => {
    const kitchen = room('k', 'kitchen', 3.6, 3, [door(2, 0.2)]);
    // Base units 90 cm high along the whole of the longest free wall.
    const run = item('k', 'kitchen_run', 1.8, 0.3, { width: 3.4, depth: 0.6, height: 0.9 });
    const general = suggestElectrical(plan([kitchen]), [run]).filter((p) => p.kind === 'socket' && p.elevationM === 0.45);
    expect(general).toHaveLength(1);
    const behind = general[0].wallIndex === 0 && at(kitchen, general[0]) > 0.1 && at(kitchen, general[0]) < 3.5;
    expect(behind).toBe(false);
  });
});

describe('a heated towel rail', () => {
  const bath = room('b', 'bathroom', 2.4, 3.2, [door(2, 0.5)]);
  /** Over the WC on the top wall (z = 0), its bottom 1.1 m up — where `suggestRadiators` hangs it. */
  const rail: TechnicalPoint = { id: 'rail', kind: 'radiator', towelRail: true, roomId: 'b', position: P(1.2, 0.06), elevationM: 1.1, radiator: { wattsPerSection: 450, sectionWidthM: TOWEL_RAIL_WIDTH_M, heightM: TOWEL_RAIL_HEIGHT_M, depthM: TOWEL_RAIL_DEPTH_M }, origin: 'user' };
  const wc = item('b', 'toilet', 1.2, 0.3, { width: 0.36, depth: 0.54, height: 0.78 });
  const flat = plan([bath], [rail]);

  it('hung over a WC takes no floor, and the WC under it does not block it', () => {
    expect(radiatorKeepouts(flat)).toEqual({});
    expect(ruleViolations(flat, [wc]).map((v) => v.code)).not.toContain('radiator_blocked');
    // A radiator in the same room still keeps its strip.
    const both = plan([bath], [rail, radiator('rad', 'b', P(0.08, 1.6))]);
    expect(radiatorKeepouts(both).b).toHaveLength(1);
  });

  it('hung at its usual 60 cm is not blocked by what stands under it, and its floor is still kept for the layout', () => {
    const low = plan([bath], [{ ...rail, elevationM: 0.6 }]);
    const stool = item('b', 'stool', 1.2, 0.25, { width: 0.37, depth: 0.37, height: 0.58 });
    expect(ruleViolations(low, [stool]).map((v) => v.code)).not.toContain('radiator_blocked');
    // The layout cannot tell a stool from a vanity: it keeps the strip, as it did.
    const [box] = radiatorKeepouts(low).b;
    expect(box.maxX - box.minX).toBeCloseTo(TOWEL_RAIL_WIDTH_M + 0.1, 3);
    expect(box.maxZ).toBeCloseTo(TOWEL_RAIL_DEPTH_M + 0.3, 3);
  });

  it('is in the way of what stands up into it', () => {
    const column = item('b', 'washer', 1.2, 0.3, { width: 0.6, depth: 0.6, height: 1.9 });
    expect(ruleViolations(flat, [column]).filter((v) => v.code === 'radiator_blocked').map((v) => v.itemId)).toEqual(['b-washer']);
    // …but not of what stands in front of it, clear of the rail itself.
    const ahead = item('b', 'washer', 1.2, 0.5, { width: 0.6, depth: 0.6, height: 1.9 });
    expect(ruleViolations(flat, [ahead]).map((v) => v.code)).not.toContain('radiator_blocked');
  });

  it('need not hang on an outside wall', () => {
    expect(technicalSuggestions(flat, [wc]).map((s) => s.code)).not.toContain('radiator_not_exterior');
    const inside = plan([room('r', 'bedroom', 4, 3, [door(2, 0.5)])], [radiator('rad', 'r', P(2, 0.08))]);
    expect(technicalSuggestions(inside, []).map((s) => s.code)).toContain('radiator_not_exterior');
  });
});

describe('a fitting that falls on a door or a window', () => {
  /** A 3.2 m run along the top wall (z = 0) of a 4 × 3 kitchen, x 0.4–3.6. */
  const run = item('k', 'kitchen_run', 2, 0.3, { width: 3.2, depth: 0.6, height: 0.9 });
  const count = (points: ElectricalPoint[], kind: ElectricalPoint['kind'], elevationM: number) => points.filter((p) => p.kind === kind && p.elevationM === elevationM).length;

  it('slides beside the window over a kitchen run: the hood’s socket and every worktop socket stay', () => {
    const plain = room('k', 'kitchen', 4, 3, [door(2, 0.2)]);
    const bare = suggestElectrical(plan([plain]), [run]);
    expect([count(bare, 'socket_kitchen', KITCHEN_SOCKET_M), count(bare, 'socket_high', HOOD_SOCKET_M)]).toEqual([3, 1]);
    // A window over the middle of the run, x 1.3–2.7: over the hob and a stretch of worktop.
    const windowed = room('k', 'kitchen', 4, 3, [door(2, 0.2), window(0, 0.5)]);
    const wired = suggestElectrical(plan([windowed]), [run]);
    expect([count(wired, 'socket_kitchen', KITCHEN_SOCKET_M), count(wired, 'socket_high', HOOD_SOCKET_M)]).toEqual([3, 1]);
    // Nothing fixed to the wall is in the window (the strip under the wall cabinets is in the cabinets).
    const onWall = wired.filter((p) => p.wallIndex === 0 && p.kind !== 'light_furniture');
    expect(onWall.filter((p) => inOpening(windowed, p))).toEqual([]);
    expect(wired.filter((p) => p.kind === 'light_furniture')).toHaveLength(1);
    // Each beside the window, on the run's wall — and no two plates in each other.
    const worktop = wired.filter((p) => p.kind === 'socket_kitchen').map((p) => at(windowed, p)).sort((a, b) => a - b);
    for (let i = 1; i < worktop.length; i++) expect(worktop[i] - worktop[i - 1]).toBeGreaterThan(0.16);
    for (const s of worktop) expect(s > 0.4 && s < 3.6).toBe(true);
  });

  it('slides beside a floor-length window in the middle of a bare room’s wall', () => {
    // A living room: a general socket on each of its two long walls, one of which is glass to the floor in its middle.
    const living = room('l', 'living_room', 5, 3.4, [door(1, 0.5), { kind: 'window', wallIndex: 0, t: 0.5, widthM: 1.2, heightM: 2.2, sillM: 0, exterior: true }]);
    const sockets = standardElectrical(plan([living])).filter((p) => p.kind === 'socket');
    expect(sockets.map((p) => p.wallIndex).sort()).toEqual([0, 2]);
    expect(sockets.filter((p) => inOpening(living, p))).toEqual([]);
  });

  it('gives a run of exactly 3 m the three worktop sockets a run of 3.01 m gets', () => {
    const kitchen = room('k', 'kitchen', 4, 3, [door(2, 0.2)]);
    const sockets = (width: number) => count(suggestElectrical(plan([kitchen]), [{ ...run, size: { ...run.size, width } }]), 'socket_kitchen', KITCHEN_SOCKET_M);
    expect([sockets(3.01), sockets(3), sockets(2.99)]).toEqual([3, 3, 2]);
  });
});

describe('the switch by a door', () => {
  const switchOf = (r: PlanRoom, items: PlacedItem[] = []) => suggestElectrical(plan([r]), items).find((p) => p.kind === 'switch' || p.kind === 'switch_two_way')!;

  it('is on the handle side, 20 cm from the opening', () => {
    const r = room('r', 'bedroom', 4, 3, [door(2, 0.5)]);
    expect(at(r, switchOf(r))).toBeCloseTo(2 + 0.4 + 0.2, 3);
  });

  it('goes to the door’s other side when a window takes the handle side', () => {
    // A balcony door with its window right beside it, on the handle side: x 2.45–3.85 of the wall.
    const r = room('r', 'bedroom', 4, 3, [door(2, 0.5), { ...window(2, 0.8875 - 0.1), widthM: 1.4 }]);
    const sw = switchOf(r);
    expect(inOpening(r, sw)).toBe(false);
    expect(at(r, sw)).toBeCloseTo(2 - 0.4 - 0.2, 3);
  });

  it('is never squeezed into the corner: the other side when the wall ends by the door', () => {
    // The door 12 cm from the wall's far end: its handle side has no wall for a plate.
    const r = room('r', 'bedroom', 4, 3, [door(2, (4 - 0.12 - 0.4) / 4)]);
    const sw = switchOf(r);
    expect(at(r, sw)).toBeCloseTo(4 - 0.12 - 0.8 - 0.2, 3);
    // A door with a short wall either side: the plate keeps clear of the corner all the same.
    const tight = room('t', 'toilet', 1.15, 1.5, [{ ...door(2, 0.5), widthM: 0.7 }]);
    const s = at(tight, switchOf(tight));
    expect(Math.min(s, 1.15 - s)).toBeGreaterThanOrEqual(0.05 - 1e-6);
    expect(inOpening(tight, switchOf(tight))).toBe(false);
  });

  it('stays on the handle side when its spot there is free, though the plate slides a hair off what stands beside it', () => {
    const r = room('r', 'bedroom', 4, 3, [door(2, 0.5)]);
    // Shelving against the door's wall from 2.687 m along it: 8.7 cm from the middle of the switch's
    // spot (2.6 m), so the plate and its gap reach it by 3 mm. The door's other side is bare.
    const shelving = (from: number) => item('r', 'bookshelf', 4 - (from + 0.4), 2.85, { width: 0.8, depth: 0.3, height: 1.8 }, Math.PI);
    const sw = switchOf(r, [shelving(2.687)]);
    expect(at(r, sw)).toBeGreaterThan(2.5);
    expect(at(r, sw)).toBeCloseTo(2.6, 1);
    expect(at(r, sw)).toBeLessThanOrEqual(2.687 - 0.04);
    // Shelving standing on the spot itself: the other side of the door.
    expect(at(r, switchOf(r, [shelving(2.5)]))).toBeCloseTo(2 - 0.4 - 0.2, 3);
  });
});

describe('a room entered through a separator', () => {
  // A kitchen 3 × 3 m whose right side (x = 3, edge 1) is a room separator onto the living room: no door.
  const kitchen: PlanRoom = { ...room('k', 'kitchen', 3, 3), open: [1] };

  it('has its light switched at the separator, 20 cm from it, as at a doorway', () => {
    for (const wired of [standardElectrical(plan([kitchen])), suggestElectrical(plan([kitchen]), [])]) {
      expect(wired.some((p) => p.kind === 'light_ceiling')).toBe(true);
      const switches = wired.filter((p) => p.kind === 'switch');
      expect(switches).toHaveLength(1);
      // On the top wall (edge 0), 20 cm before the separator's end at x = 3.
      expect(switches[0].wallIndex).toBe(0);
      expect(at(kitchen, switches[0])).toBeCloseTo(3 - 0.2, 3);
    }
  });

  it('takes the separator’s other end when a window takes the first', () => {
    const windowed: PlanRoom = { ...room('k', 'kitchen', 3, 3, [window(0, 2.3 / 3, 1.2)]), open: [1] };
    const sw = standardElectrical(plan([windowed])).find((p) => p.kind === 'switch')!;
    expect(sw.wallIndex).toBe(2);
    expect(at(windowed, sw)).toBeCloseTo(0.2, 3);
  });

  it('gets no second switch where a door already switches it', () => {
    const withDoor: PlanRoom = { ...room('k', 'kitchen', 3, 3, [door(3, 0.5)]), open: [1] };
    expect(standardElectrical(plan([withDoor])).filter((p) => p.kind === 'switch')).toHaveLength(1);
  });
});

describe('a second piece of a kind', () => {
  it('gives a second sofa, desk and basin the sockets the first has', () => {
    const living = room('l', 'living_room', 6, 4, [door(2, 0.5)]);
    // A sofa against the top wall and another against the left one; a desk on the right wall and another on the bottom.
    const sofas = [{ ...item('l', 'sofa', 2, 0.45, { width: 2, depth: 0.9, height: 0.8 }), id: 's1' }, { ...item('l', 'sofa', 0.45, 2.2, { width: 2, depth: 0.9, height: 0.8 }, Math.PI / 2), id: 's2' }];
    const desks = [{ ...item('l', 'desk', 5.65, 2, { width: 1.2, depth: 0.7, height: 0.75 }, -Math.PI / 2), id: 'd1' }, { ...item('l', 'desk', 4.5, 3.65, { width: 1.2, depth: 0.7, height: 0.75 }, Math.PI), id: 'd2' }];
    const wired = suggestElectrical(plan([living]), [...sofas, ...desks]);
    const near = (piece: PlacedItem, kind: ElectricalPoint['kind']) => wired.some((p) => p.kind === kind && Math.hypot(p.position.x - piece.position.x, p.position.z - piece.position.z) < piece.size.width / 2 + 0.5);
    for (const sofa of sofas) expect(near(sofa, 'socket_double')).toBe(true);
    for (const desk of desks) expect(near(desk, 'internet')).toBe(true);

    const bath = room('b', 'bathroom', 3, 2, [door(2, 0.5)]);
    const basins = [{ ...item('b', 'sink', 0.6, 0.25, { width: 0.6, depth: 0.5, height: 0.85 }), id: 'b1' }, { ...item('b', 'sink', 2.4, 0.25, { width: 0.6, depth: 0.5, height: 0.85 }), id: 'b2' }];
    const bathWired = suggestElectrical(plan([bath]), basins);
    for (const basin of basins) expect(bathWired.some((p) => p.kind === 'socket' && p.wallIndex === 0 && Math.abs(at(bath, p) - basin.position.x) < 0.6)).toBe(true);
  });
});

describe('the basin’s socket and the splash zone', () => {
  const bath = room('b', 'bathroom', 3, 2, [door(2, 0.15)]);
  /** A basin on the top wall (z = 0), x 1.2–1.8. */
  const basin = item('b', 'sink', 1.5, 0.25, { width: 0.6, depth: 0.5, height: 0.85 });
  /** A shower in the corner, its column on the top wall: `areaM` is its tray. */
  const shower = (x: number): PlacedItem => ({ ...item('b', 'shower', x, 0.25, { width: 0.36, depth: 0.5, height: 1.8 }), areaM: { width: 0.9, depth: 0.9 } });
  const socketOf = (items: PlacedItem[]) => suggestElectrical(plan([bath]), items).find((p) => p.kind === 'socket')!;

  it('is beside the basin, 20 cm past its edge, when nothing wet is near', () => {
    const socket = socketOf([basin]);
    expect(Math.abs(at(bath, socket) - 1.5)).toBeCloseTo(0.5, 3);
  });

  it('measures the zone from the shower’s tray, not from the column standing in it', () => {
    // The tray is x 2.05–2.95: a socket at x 1.6 is 45 cm from it and 67 cm from the column.
    const socket: ElectricalPoint = { id: 's', roomId: 'b', kind: 'socket', position: P(1.6, 0.01), elevationM: 1.1, wallIndex: 0, t: 1.6 / 3, origin: 'generated' };
    expect(ruleViolations(plan([bath]), [shower(2.5)], [socket]).map((v) => v.code)).toContain('socket_in_splash');
    expect(ruleViolations(plan([bath]), [shower(2.5)], [{ ...socket, position: P(1.4, 0.01) }]).map((v) => v.code)).not.toContain('socket_in_splash');
  });

  it('goes to the basin’s other side when a shower is within 60 cm of its usual one', () => {
    for (const x of [0.5, 2.5]) {
      const items = [basin, shower(x)];
      const wired = suggestElectrical(plan([bath]), items);
      expect(ruleViolations(plan([bath]), items, wired).map((v) => v.code)).not.toContain('socket_in_splash');
      // Still the basin's socket: on its wall, beside it.
      const socket = wired.find((p) => p.kind === 'socket')!;
      expect(socket.wallIndex).toBe(0);
      expect(Math.abs(at(bath, socket) - 1.5)).toBeLessThan(0.75);
    }
  });
});

describe('a washing machine', () => {
  /** Against the top wall (z = 0) of a 2.4 × 3 hall, x 0.3–0.9. */
  const hall = room('h', 'hallway', 2.4, 3, [door(2, 0.7)]);
  const washer = item('h', 'washer', 0.6, 0.3, { width: 0.6, depth: 0.6, height: 0.85 });

  it('has a socket behind it, in whatever room it stands', () => {
    const before = suggestElectrical(plan([hall]), []).filter((p) => p.kind.startsWith('socket'));
    const sockets = suggestElectrical(plan([hall]), [washer]).filter((p) => p.kind.startsWith('socket') && p.elevationM === APPLIANCE_SOCKET_M);
    expect(before.filter((p) => p.elevationM === APPLIANCE_SOCKET_M)).toEqual([]);
    expect(sockets).toHaveLength(1);
    expect([sockets[0].wallIndex, sockets[0].count]).toEqual([0, 1]);
    expect(at(hall, sockets[0])).toBeCloseTo(0.6, 2);
    // With a dryer on it: two machines, two outlets.
    const dryer = item('h', 'dryer', 0.6, 0.3, { width: 0.6, depth: 0.6, height: 0.85 }, 0, 0.85);
    expect(suggestElectrical(plan([hall]), [washer, dryer]).filter((p) => p.elevationM === APPLIANCE_SOCKET_M).map((p) => p.count)).toEqual([2]);
  });

  it('keeps its socket out of a shower’s splash zone, and has none where the wall has no such spot', () => {
    const bath = room('b', 'bathroom', 3, 2, [door(2, 0.15)]);
    const machine = item('b', 'washer', 1.5, 0.3, { width: 0.6, depth: 0.6, height: 0.85 });
    const shower: PlacedItem = { ...item('b', 'shower', 2.5, 0.25, { width: 0.36, depth: 0.5, height: 1.8 }), areaM: { width: 0.9, depth: 0.9 } };
    const wired = suggestElectrical(plan([bath]), [machine, shower]);
    expect(wired.filter((p) => p.elevationM === APPLIANCE_SOCKET_M)).toHaveLength(1);
    expect(ruleViolations(plan([bath]), [machine, shower], wired).map((v) => v.code)).not.toContain('socket_in_splash');
    // A wall wet from end to end: no socket rather than one in the zone.
    const small = room('s', 'bathroom', 1.6, 1.6, [door(2, 0.2)]);
    const items = [item('s', 'washer', 0.35, 0.3, { width: 0.6, depth: 0.6, height: 0.85 }), { ...item('s', 'shower', 1.15, 0.25, { width: 0.36, depth: 0.5, height: 1.8 }), areaM: { width: 0.9, depth: 0.9 } } as PlacedItem];
    expect(suggestElectrical(plan([small]), items).filter((p) => p.elevationM === APPLIANCE_SOCKET_M)).toEqual([]);
  });

  it('in a hall gets a drain as well as cold water', () => {
    let n = 0;
    const { points } = suggestTechnical(plan([hall]), [washer], () => `t${n++}`);
    // Its tap above it (the boiler in the hall has pipes of its own, lower).
    expect(points.filter((p) => p.kind === 'water_supply' && p.elevationM === 0.9)).toHaveLength(1);
    const drain = points.filter((p) => p.kind === 'sewer');
    expect(drain).toHaveLength(1);
    expect(Math.hypot(drain[0].position.x - 0.6, drain[0].position.z - 0.3)).toBeLessThan(0.35);
    // A hall with no machine has no drain.
    expect(suggestTechnical(plan([hall]), [], () => `u${n++}`).points.filter((p) => p.kind === 'sewer')).toEqual([]);
  });
});

describe('a corner kitchen’s leg', () => {
  const kitchen = room('k', 'kitchen', 4, 3.6, [door(2, 0.1)]);
  /** The run along the top wall (z = 0), x 1.6–4 — and its leg round the corner, down the right wall, longer than the run. */
  const run = item('k', 'kitchen_run', 2.8, 0.3, { width: 2.4, depth: 0.6, height: 0.9 });
  const leg: PlacedItem = { ...item('k', 'kitchen_run', 3.7, 2.1, { width: 3, depth: 0.6, height: 0.9 }, -Math.PI / 2), id: 'k-leg', legOf: run.id };
  const ids = () => {
    let n = 0;
    return () => `t${n++}`;
  };
  const kinds = (points: TechnicalPoint[]) => points.map((p) => p.kind).sort();

  it('is part of its run: it gets no water, drain, gas or hood of its own', () => {
    const alone = suggestTechnical(plan([kitchen]), [run], ids()).points;
    const cornered = suggestTechnical(plan([kitchen]), [run, leg], ids()).points;
    expect(kinds(cornered)).toEqual(kinds(alone));
    // Each at the same spot as with no leg: on the run, which has the sink and the hob.
    for (const point of cornered) {
      const twin = alone.find((p) => p.kind === point.kind && Math.hypot(p.position.x - point.position.x, p.position.z - point.position.z) < 0.01);
      expect(twin, point.kind).toBeDefined();
    }
  });

  it('is not what the kitchen’s sockets and spots are placed by, whichever of the two comes first', () => {
    const wired = (items: PlacedItem[]) => suggestElectrical(plan([kitchen]), items).map((p) => `${p.kind}@${p.wallIndex ?? 'c'}:${p.position.x.toFixed(2)},${p.position.z.toFixed(2)}`).sort();
    expect(wired([leg, run])).toEqual(wired([run, leg]));
    const worktop = suggestElectrical(plan([kitchen]), [leg, run]).filter((p) => p.kind === 'socket_kitchen');
    expect(worktop.length).toBeGreaterThan(0);
    expect(worktop.every((p) => p.wallIndex === 0)).toBe(true);
  });

  it('is not told it stands far from the shaft or the water', () => {
    const sewer: TechnicalPoint = { id: 's', kind: 'sewer', roomId: 'k', position: P(1.9, 0.08), elevationM: 0, origin: 'user' };
    const water: TechnicalPoint = { id: 'w', kind: 'water_supply', roomId: 'k', position: P(1.9, 0.08), elevationM: 0.5, origin: 'user' };
    const hints = technicalSuggestions(plan([kitchen], [sewer, water]), [run, leg]);
    expect(hints.filter((h) => h.itemId === leg.id)).toEqual([]);
  });
});

describe('the middle of a room', () => {
  const L = (id: string, type: PlanRoom['type'], points: Array<[number, number]>): PlanRoom => refreshRoom({ id, type, name: id, polygon: points.map(([x, z]) => P(x, z)), heightM: 2.7, areaM2: 0, perimeterM: 0, openings: [] });

  it('is its area’s centre, where the hanging lamp goes — not the mean of its corners', () => {
    // An L: a 5 × 3 room with a 2 × 1.5 corner cut out of it.
    const living = L('l', 'living_room', [[0, 0], [5, 0], [5, 1.5], [3, 1.5], [3, 3], [0, 3]]);
    const light = standardElectrical(plan([living])).find((p) => p.kind === 'light_ceiling')!;
    const centre = polygonCentroid(living.polygon);
    expect(light.position.x).toBeCloseTo(centre.x, 6);
    expect(light.position.z).toBeCloseTo(centre.z, 6);
    // The corners' mean is somewhere else.
    expect(Math.hypot(centre.x - 16 / 6, centre.z - 9 / 6)).toBeGreaterThan(0.25);
  });

  it('is inside the room, where the area’s centre of a thin L is not', () => {
    const thin = L('t', 'living_room', [[0, 0], [6, 0], [6, 1.2], [1.2, 1.2], [1.2, 5], [0, 5]]);
    expect(pointInPolygon(polygonCentroid(thin.polygon), thin.polygon)).toBe(false);
    expect(pointInPolygon(roomMiddle(thin), thin.polygon)).toBe(true);
    const light = standardElectrical(plan([thin])).find((p) => p.kind === 'light_ceiling')!;
    expect(pointInPolygon(light.position, thin.polygon)).toBe(true);
  });
});

describe('one main light', () => {
  const bedroom = room('r', 'bedroom', 4, 3, [door(2, 0.5)]);
  /** The furniture's hanging lamp, in the middle of the room where the wiring's ceiling light goes. */
  const pendant = item('r', 'pendant', 2, 1.5, { width: 0.4, depth: 0.4, height: 0.5 }, 0, 2.2);
  const lamp = (id: number, kind: string): CatalogProduct =>
    ({ id, nameKa: `l${id}`, slug: `l${id}`, brand: null, categorySlug: 'lighting', pricePerUnit: 100 + id, unit: 'piece', imageUrl: null, colorHex: null, textureUrl: null, model3dKind: kind, model3dUrl: `/models/fixtures/l${id}.glb`, widthCm: 30, depthCm: 30, heightCm: 10, styleTags: [], tags: [], isFeatured: false, specs: null, coveragePerUnit: null, store: null }) as unknown as CatalogProduct;
  const catalog = [lamp(1, 'light_ceiling'), lamp(2, 'socket'), lamp(3, 'switch')];

  it('makes the ceiling point under a hanging lamp that lamp’s outlet: where the lamp hangs, and no second lamp', () => {
    const wired = withFixtureProducts(suggestElectrical(plan([bedroom]), [pendant]), catalog, 'modern', [bedroom], [pendant]);
    const ceiling = wired.filter((p) => p.kind === 'light_ceiling');
    expect(ceiling).toHaveLength(1);
    expect(ceiling[0].position).toEqual(pendant.position);
    expect(ceiling[0].lampOutlet).toBe(true);
    expect(ceiling[0].product ?? null).toBeNull();
    expect(isLampOutlet(ceiling[0], [pendant])).toBe(true);
    // Every other fitting is bought as before.
    expect(wired.filter((p) => p.kind === 'socket').every((p) => p.product?.productId === 2)).toBe(true);
    // With no hanging lamp the room's ceiling light is a lamp of its own.
    const alone = withFixtureProducts(suggestElectrical(plan([bedroom]), []), catalog, 'modern', [bedroom], []).filter((p) => p.kind === 'light_ceiling');
    expect(alone.map((p) => [p.lampOutlet ?? null, p.product?.productId])).toEqual([[null, 1]]);
  });

  it('leaves a room its own ceiling light when the hanging lamp is over the table, somewhere else', () => {
    const table = item('r', 'dining_table', 0.9, 0.8, { width: 1.2, depth: 0.8, height: 0.75 });
    const overTable = { ...pendant, position: P(0.9, 0.8) };
    const ceiling = withFixtureProducts(suggestElectrical(plan([bedroom]), [table, overTable]), catalog, 'modern', [bedroom], [table, overTable]).filter((p) => p.kind === 'light_ceiling');
    expect(ceiling.map((p) => [p.lampOutlet ?? null, p.product?.productId])).toEqual([[null, 1]]);
  });

  it('is an outlet while a hanging lamp hangs at it — whichever lamp, by where it hangs, not by its name', () => {
    const [outlet] = suggestElectrical(plan([bedroom]), [pendant]).filter((p) => p.kind === 'light_ceiling');
    expect(isLampOutlet(outlet, [])).toBe(false);
    expect(isLampOutlet(outlet, [{ ...pendant, position: P(0.5, 0.5) }])).toBe(false);
    expect(isLampOutlet(outlet, [{ ...pendant, roomId: 'other' }])).toBe(false);
    // Generating again numbers the lamps anew: the lamp hanging there is this point's all the same.
    const again = { ...pendant, id: 'r-pendant-7', position: P(2.2, 1.4) };
    expect(isLampOutlet(outlet, [again])).toBe(true);
    expect(withFixtureProducts([outlet], catalog, 'modern', [bedroom], [again])[0]).toBe(outlet);
    expect(lightingPlan(plan([bedroom]), [again], [outlet])[0].rows.filter((r) => r.purpose === 'primary').map((r) => r.fixture)).toEqual(['pendant']);
    // A bare ceiling point under a lamp was never made its outlet: it is a light of its own.
    const { lampOutlet: _outlet, ...bare } = outlet;
    expect(isLampOutlet(bare, [pendant])).toBe(false);
  });

  it('is a ceiling light again once its lamp is taken away or moved off: it is given a lamp like any other', () => {
    const [outlet] = suggestElectrical(plan([bedroom]), [pendant]).filter((p) => p.kind === 'light_ceiling');
    for (const items of [[], [{ ...pendant, position: P(0.5, 0.5) }]]) {
      const [light] = withFixtureProducts([outlet], catalog, 'modern', [bedroom], items);
      expect([light.lampOutlet ?? null, light.product?.productId]).toEqual([null, 1]);
      expect(lightingPlan(plan([bedroom]), items, [light])[0].rows.filter((r) => r.purpose === 'primary').map((r) => r.fixture)).toContain('light_ceiling');
    }
  });

  it('takes the lamp a person picks for it — then it is a light of its own — and is a fitting of its own as another kind', () => {
    const [outlet] = suggestElectrical(plan([bedroom]), [pendant]).filter((p) => p.kind === 'light_ceiling');
    const picked = withFixtureProduct(outlet, catalog[0]);
    expect([picked.lampOutlet ?? null, picked.product?.productId]).toEqual([null, 1]);
    expect(isLampOutlet(picked, [pendant])).toBe(false);
    // "No product" leaves it the lamp's outlet.
    expect(isLampOutlet(withFixtureProduct(outlet, null), [pendant])).toBe(true);
    // Turned into another kind of fitting it is that fitting, bought like any other.
    const spot = withFixtureProduct({ ...outlet, kind: 'light_spot' }, lamp(4, 'light_spot'));
    expect([spot.lampOutlet ?? null, spot.product?.productId]).toEqual([null, 4]);
    expect(withFixtureProduct({ ...outlet, kind: 'light_spot' }, null).lampOutlet ?? null).toBeNull();
  });

  it('is not given the ceiling light chosen for the whole flat, nor counted among the ones it was put on', () => {
    const other = room('o', 'bedroom', 4, 3, [door(2, 0.5)]);
    const flat = plan([bedroom, other]);
    const wired = suggestElectrical(flat, [pendant]);
    const dressed = dressBoard(flat, wired, [{ key: 'light', product: catalog[0] }]);
    expect(dressed.placed).toEqual({ light: 1 });
    expect(dressed.electrical.filter((p) => p.kind === 'light_ceiling').map((p) => [p.roomId, p.product?.productId ?? null])).toEqual([['r', null], ['o', 1]]);
  });

  it('is listed and bought once: the lighting plan has the hanging lamp, the budget no ceiling lamp for its outlet', () => {
    const flat = plan([bedroom]);
    const wired = suggestElectrical(flat, [pendant]);
    const rows = lightingPlan(flat, [pendant], wired)[0].rows;
    expect(rows.filter((r) => r.purpose === 'primary').map((r) => r.fixture)).toEqual(['pendant']);
    const scene = (electrical: ElectricalPoint[]) => ({ styleId: 'modern' as const, mode: 'full' as const, budgetGel: null, items: [pendant], finishes: [], electrical });
    const keys = (electrical: ElectricalPoint[]) => priceScene(flat, scene(electrical), { homeState: 'white_frame' }).lines.map((l) => l.key);
    expect(keys(wired)).not.toContain('electrical_light_ceiling');
    // The same room wired with no lamp hanging in it buys its ceiling light.
    expect(keys(suggestElectrical(flat, []))).toContain('electrical_light_ceiling');
    // The electrician wires the outlet all the same: as many points either way.
    const points = (electrical: ElectricalPoint[]) => priceScene(flat, scene(electrical), { homeState: 'white_frame' }).lines.filter((l) => l.key === 'electric_point').reduce((sum, l) => sum + l.qty, 0);
    expect(points(wired)).toBe(points(suggestElectrical(flat, [])));
  });
});

describe('the kitchen’s row of spots', () => {
  const primary = (points: ElectricalPoint[]) => points.filter((p) => p.kind === 'light_spot' && p.category === 'primary');

  it('in a studio is over the kitchen half’s floor, in front of the run — not in the middle of the whole studio', () => {
    // An 8 × 4 studio: the kitchen its left 3.2 m, the run on the left wall facing into it.
    const studio: PlanRoom = { ...room('s', 'studio', 8, 4, [door(2, 0.1)]), split: { axis: 'x', t: 0.4, parts: ['kitchen', 'living_room'] } };
    const kitchenHalf = studioParts(studio)!.find((part) => part.type === 'kitchen')!;
    const run = item('s', 'kitchen_run', 0.31, 2, { width: 3, depth: 0.6, height: 0.9 }, Math.PI / 2);
    const wired = suggestElectrical(plan([studio]), [run]);
    const spots = primary(wired);
    expect(spots.length).toBeGreaterThanOrEqual(3);
    for (const spot of spots) expect(pointInPolygon(spot.position, kitchenHalf.polygon)).toBe(true);
    // Through the middle of the kitchen half, as a kitchen's row runs through the middle of the kitchen.
    for (const spot of spots) expect(spot.position.x).toBeCloseTo(1.6, 2);
    // The studio keeps its ceiling light for the living half.
    expect(wired.filter((p) => p.kind === 'light_ceiling')).toHaveLength(1);
  });

  it('in an L-shaped kitchen is inside the room along its whole length', () => {
    const polygon = [P(0, 0), P(4, 0), P(4, 1.5), P(2, 1.5), P(2, 4), P(0, 4)];
    const kitchen = refreshRoom({ id: 'k', type: 'kitchen', name: 'k', polygon, heightM: 2.7, areaM2: 0, perimeterM: 0, openings: [] });
    // Along the top wall, across both the deep part (x < 2) and the shallow one.
    const run = item('k', 'kitchen_run', 2, 0.3, { width: 3.6, depth: 0.6, height: 0.9 });
    const spots = primary(suggestElectrical(plan([kitchen]), [run]));
    expect(spots).toHaveLength(4);
    for (const spot of spots) expect(pointInPolygon(spot.position, polygon)).toBe(true);
    // Through the middle of the floor in front of the run where that floor is shallowest.
    for (const spot of spots) expect(spot.position.z).toBeCloseTo(0.75, 2);
  });
});
