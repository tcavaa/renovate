import { describe, expect, it } from 'vitest';
import { MIN_RAILING_M, addOpening, countDoors, countWindows, openingCandidates, openingProductKind, primaryHalf, railingFits, twinOf, updateOpening, withOpeningProducts } from '@/lib/design/openings';
import { deriveOpenings, edgeWallAreaM2, openingSpanUp, openingWallArea, refreshRoom, roomEdges, type PlanEdge } from '@/lib/design/planGeometry';
import { partitionArea, partitionWall, standingWallIds, wallsToBuild } from '@/lib/design/partitions';
import { priceOpenings } from '@/lib/design/pricing';
import { trimLengthM } from '@/lib/design/trims';
import { standardElectrical } from '@/lib/design/electrical';
import { rebuildRooms, reprojectOpenings } from '@/lib/design/walls';
import { buildWallGeometry, WALL_SLOT_CAP } from '@/lib/design3d/wallGeometry';
import type { CatalogProduct } from '@/lib/design/matcher';
import type { FloorPlan, PlanRoom, Vec2, Wall } from '@/lib/design/types';

const rect = (id: string, x: number, z: number, w: number, d: number, type: PlanRoom['type']): PlanRoom =>
  refreshRoom({
    id,
    type,
    name: id,
    polygon: [
      { x, z },
      { x: x + w, z },
      { x: x + w, z: z + d },
      { x, z: z + d },
    ],
    heightM: 2.8,
    areaM2: 0,
    perimeterM: 0,
    openings: [],
  });

/** A living room 4 × 3 m with a balcony 4 × 1.2 m along its bottom wall (z = 3). */
function flat(): PlanRoom[] {
  return [rect('living', 0, 0, 4, 3, 'living_room'), rect('balcony', 0, 3.12, 4, 1.2, 'balcony')];
}

/** The edge of a room whose middle lies on the line z (or x) = value. */
function edgeAt(room: PlanRoom, axis: 'x' | 'z', value: number): PlanEdge {
  return roomEdges(room.polygon).find((e) => Math.abs((axis === 'z' ? (e.a.z + e.b.z) / 2 : (e.a.x + e.b.x) / 2) - value) < 1e-6)!;
}

describe('balcony railings', () => {
  it('goes on a balcony’s outer wall only — not on a shared wall, not in another room', () => {
    const rooms = flat();
    const balcony = rooms[1];
    const outer = edgeAt(balcony, 'z', 4.32);
    const shared = edgeAt(balcony, 'z', 3.12);
    expect(addOpening(rooms, 'balcony', 'railing', outer.index, 0.12).openingId).not.toBeNull();
    expect(addOpening(rooms, 'balcony', 'railing', shared.index, 0.12).openingId).toBeNull();
    const livingOuter = edgeAt(rooms[0], 'z', 0);
    expect(addOpening(rooms, 'living', 'railing', livingOuter.index, 0.12).openingId).toBeNull();
    expect(railingFits(rooms, 'balcony', outer.index, 0, outer.length, 0.12)).toBe(true);
    expect(railingFits(rooms, 'balcony', shared.index, 0, shared.length, 0.12)).toBe(false);
    // Shorter than a railing worth drawing.
    expect(railingFits(rooms, 'balcony', outer.index, 1, 1 + MIN_RAILING_M / 2, 0.12)).toBe(false);
  });

  it('runs the whole wall unless told otherwise, and into a corner when drawn there', () => {
    const rooms = flat();
    const outer = edgeAt(rooms[1], 'z', 4.32);
    const whole = addOpening(rooms, 'balcony', 'railing', outer.index, 0.12);
    const railing = whole.rooms[1].openings.find((o) => o.id === whole.openingId)!;
    expect(railing).toMatchObject({ kind: 'railing', exterior: true, connectsToRoomId: null, t: 0.5, sillM: 0, heightM: 1 });
    expect(railing.widthM).toBeCloseTo(outer.length, 6);

    // Drawn from the corner 1.5 m along: no hand's breadth kept from the corner, as a door keeps.
    const drawn = addOpening(rooms, 'balcony', 'railing', outer.index, 0.12, { t: 0.75 / outer.length, widthM: 1.5 });
    const partial = drawn.rooms[1].openings.find((o) => o.id === drawn.openingId)!;
    expect(partial.widthM).toBeCloseTo(1.5, 6);
    expect(partial.t * outer.length - partial.widthM / 2).toBeCloseTo(0, 6);
  });

  it('takes the place of the windows it covers, and leaves the rest of the wall’s alone', () => {
    const rooms = flat();
    const outer = edgeAt(rooms[1], 'z', 4.32);
    const windowed = addOpening(rooms, 'balcony', 'window', outer.index, 0.12, { t: 0.25, widthM: 1 });
    const other = addOpening(windowed.rooms, 'balcony', 'window', outer.index, 0.12, { t: 0.8, widthM: 0.6 });
    // A railing over the first window only: from the corner to 2 m along.
    const railed = addOpening(other.rooms, 'balcony', 'railing', outer.index, 0.12, { t: 1 / outer.length, widthM: 2 });
    // (Ids are stamped by the millisecond, so the two windows are told apart by where they are.)
    const windows = railed.rooms[1].openings.filter((o) => o.kind === 'window');
    expect(windows.map((o) => o.t)).toEqual([0.8]);
    expect(railed.rooms[1].openings.filter((o) => o.kind === 'railing')).toHaveLength(1);
  });

  it('lets a window onto the balcony go in the wall it shares with the flat, cut in both rooms', () => {
    const rooms = flat();
    const shared = edgeAt(rooms[1], 'z', 3.12);
    const added = addOpening(rooms, 'balcony', 'window', shared.index, 0.12);
    expect(added.openingId).not.toBeNull();
    const window = added.rooms[1].openings.find((o) => o.id === added.openingId)!;
    const twin = twinOf(added.rooms, window)!;
    expect(twin.room.id).toBe('living');
    expect(twin.opening).toMatchObject({ kind: 'window', sillM: window.sillM, widthM: window.widthM });
    // One of the two halves stands for both; the flat has one window.
    expect([window, twin.opening].filter(primaryHalf)).toHaveLength(1);
    const plan: FloorPlan = { rooms: added.rooms, metresPerPixel: null, bounds: { width: 4, depth: 4.32 }, source: 'manual', wallThicknessM: 0.12 };
    expect(countWindows(plan)).toBe(1);

    // Between two rooms of the flat a window is still refused.
    const pair = [rect('living', 0, 0, 4, 3, 'living_room'), rect('bed', 0, 3.12, 4, 3, 'bedroom')];
    expect(addOpening(pair, 'bed', 'window', edgeAt(pair[1], 'z', 3.12).index, 0.12).openingId).toBeNull();
  });

  it('stays a railing, and is resized between the shortest railing and the whole wall', () => {
    const rooms = flat();
    const outer = edgeAt(rooms[1], 'z', 4.32);
    const added = addOpening(rooms, 'balcony', 'railing', outer.index, 0.12, { widthM: 2 });
    const id = added.openingId!;
    const find = (rs: PlanRoom[]) => rs[1].openings.find((o) => o.id === id)!;
    expect(find(updateOpening(added.rooms, 'balcony', id, { kind: 'door' })).kind).toBe('railing');
    expect(find(updateOpening(added.rooms, 'balcony', id, { widthM: 9 })).widthM).toBeCloseTo(outer.length, 6);
    expect(find(updateOpening(added.rooms, 'balcony', id, { widthM: 0.1 })).widthM).toBeCloseTo(MIN_RAILING_M, 6);

    // And nothing else becomes one.
    const door = addOpening(rooms, 'living', 'door', edgeAt(rooms[0], 'z', 0).index, 0.12);
    expect(updateOpening(door.rooms, 'living', door.openingId!, { kind: 'railing' })[0].openings[0].kind).toBe('door');
  });

  it('is never a product, a door or a window, and is priced nowhere', () => {
    const rooms = flat();
    const outer = edgeAt(rooms[1], 'z', 4.32);
    const added = addOpening(rooms, 'balcony', 'railing', outer.index, 0.12);
    const railing = { ...added.rooms[1].openings[0], origin: 'user' as const };
    const product = { id: 1, model3dKind: 'door', model3dUrl: '/d.glb', pricePerUnit: 100, styleTags: [] } as unknown as CatalogProduct;
    expect(openingProductKind(railing)).toBeNull();
    expect(openingCandidates(railing, [product], 'modern')).toEqual([]);
    expect(withOpeningProducts(added.rooms, [product], 'modern')[1].openings[0].product).toBeUndefined();
    const plan: FloorPlan = { rooms: [added.rooms[0], { ...added.rooms[1], openings: [railing] }], metresPerPixel: null, bounds: { width: 4, depth: 4.32 }, source: 'manual', wallThicknessM: 0.12 };
    expect(countDoors(plan)).toBe(0);
    expect(countWindows(plan)).toBe(0);
    // Even with the doors-and-windows phase ticked, when every opening is new.
    expect(priceOpenings(plan, true, [13], new Map())).toEqual([]);
  });

  it('takes the wall off floor to ceiling, whatever its own height', () => {
    const railing = { kind: 'railing' as const, widthM: 2, heightM: 1, sillM: 0 };
    expect(openingSpanUp(railing, 2.8)).toEqual({ bottom: 0, top: 2.8 });
    expect(openingWallArea(railing, 2.8)).toBeCloseTo(5.6, 6);
    // A window is its own height above its sill.
    expect(openingWallArea({ kind: 'window', widthM: 1.4, heightM: 1.4, sillM: 0.9 }, 2.8)).toBeCloseTo(1.96, 6);

    const rooms = flat();
    const outer = edgeAt(rooms[1], 'z', 4.32);
    const added = addOpening(rooms, 'balcony', 'railing', outer.index, 0.12, { widthM: 3 });
    const balcony = added.rooms[1];
    expect(edgeWallAreaM2(balcony, outer.index)).toBeCloseTo((4 - 3) * 2.8, 2);
    // No skirting at its foot and no cornice under the ceiling there.
    const perimeter = roomEdges(balcony.polygon).reduce((s, e) => s + e.length, 0);
    expect(trimLengthM(balcony, 'skirting')).toBeCloseTo(perimeter - 3, 1);
    expect(trimLengthM(balcony, 'cornice')).toBeCloseTo(perimeter - 3, 1);
  });

  it('keeps a railing drawn the whole length of its wall through an edit', () => {
    const rooms = flat();
    const outer = edgeAt(rooms[1], 'z', 4.32);
    const added = addOpening(rooms, 'balcony', 'railing', outer.index, 0.12);
    const balcony = added.rooms[1];
    const [carried] = reprojectOpenings(balcony, { ...balcony, openings: [] });
    expect(carried.widthM).toBeCloseTo(outer.length, 6);
    expect(carried.t).toBeCloseTo(0.5, 6);
  });

  it('survives the openings being worked out again, and no window goes on its wall', () => {
    const rooms = flat();
    const outer = edgeAt(rooms[1], 'z', 4.32);
    const added = addOpening(rooms, 'balcony', 'railing', outer.index, 0.12).rooms;
    deriveOpenings(added, 0.12);
    const balcony = added[1];
    expect(balcony.openings.filter((o) => o.kind === 'railing')).toHaveLength(1);
    expect(balcony.openings.some((o) => o.kind === 'window' && o.wallIndex === outer.index)).toBe(false);
  });

  it('gets no light switch beside it, and no socket over it', () => {
    const rooms = flat();
    const outer = edgeAt(rooms[1], 'z', 4.32);
    const withDoor = addOpening(rooms, 'balcony', 'door', edgeAt(rooms[1], 'z', 3.12).index, 0.12, { t: 0.3 }).rooms;
    const withRailing = addOpening(withDoor, 'balcony', 'railing', outer.index, 0.12).rooms;
    const plan: FloorPlan = { rooms: withRailing, metresPerPixel: null, bounds: { width: 4, depth: 4.32 }, source: 'manual', wallThicknessM: 0.12 };
    const points = standardElectrical(plan).filter((p) => p.roomId === 'balcony');
    // The door's switch, and none for the railing.
    expect(points.filter((p) => p.kind === 'switch')).toHaveLength(1);
    expect(points.some((p) => p.wallIndex === outer.index)).toBe(false);
  });
});

describe('a balcony’s walls', () => {
  const P = (x: number, z: number): Vec2 => ({ x, z });
  const wall = (id: string, a: Vec2, b: Vec2): Wall => ({ id, a, b, thicknessM: 0.12, origin: 'existing' });
  const base: FloorPlan = { rooms: [], metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', wallThicknessM: 0.12, wallHeightM: 2.8, walls: [] };

  /** A room over a balcony, sharing the wall at z = 3, and a room beside the room at x = 4. */
  function plan(): FloorPlan {
    const built = rebuildRooms(base, [
      wall('top', P(0, 0), P(8, 0)),
      wall('right', P(8, 0), P(8, 3)),
      wall('bottom-right', P(8, 3), P(4, 3)),
      wall('mid', P(4, 0), P(4, 3)),
      wall('shared', P(4, 3), P(0, 3)),
      wall('left', P(0, 3), P(0, 0)),
      wall('b-left', P(0, 3), P(0, 4.2)),
      wall('b-bottom', P(0, 4.2), P(4, 4.2)),
      wall('b-right', P(4, 4.2), P(4, 3)),
    ]);
    return { ...built, rooms: built.rooms.map((r) => (r.polygon.every((p) => p.z > 2.9) ? { ...r, type: 'balcony' as const } : r)) };
  }

  it('stand already: the wall onto the balcony is never a partition to build, the one between the rooms is', () => {
    const p = plan();
    expect(p.rooms.filter((r) => r.type === 'balcony')).toHaveLength(1);
    expect(partitionWall(p, 'shared')).toMatchObject({ interior: true, balcony: true });
    expect(partitionWall(p, 'mid')).toMatchObject({ interior: true, balcony: false });
    expect(partitionArea(p).partitionM2).toBeCloseTo(3 * 2.8, 2);
    const standing = standingWallIds(p);
    expect([...standing].sort()).toEqual(['b-bottom', 'b-left', 'b-right', 'shared']);
    // The board of a black frame draws only what is still to build grey: here the one partition.
    expect([...wallsToBuild(p)]).toEqual(['mid']);
    const built = { ...p, walls: (p.walls ?? []).map((w) => (w.id === 'mid' ? { ...w, built: true } : w)) };
    expect(wallsToBuild(built).size).toBe(0);
  });
});

describe('a railing’s gap in 3D', () => {
  it('takes the top of the wall away over it, and closes its floor', () => {
    const edge = { index: 0, a: { x: 0, z: 0 }, b: { x: 4, z: 0 }, dir: { x: 1, z: 0 }, inward: { x: 0, z: 1 }, length: 4, axis: 'x', facing: 0 } as unknown as PlanEdge;
    const geometry = buildWallGeometry({ edge, height: 2.8, pieces: [{ from: 0, to: 4, farFrom: -0.12, farTo: 4.12, depth: 0.12, neighbour: null }], holes: [{ left: 1, right: 3, bottom: 0, top: 2.8, floor: true }] });
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const caps: Array<{ x: number; y: number }> = [];
    for (const group of geometry.groups) {
      if (group.materialIndex !== WALL_SLOT_CAP) continue;
      for (let i = group.start; i < group.start + group.count; i += 3) {
        if (normal.getY(i) < 0.9) continue;
        const xs = [0, 1, 2].map((k) => position.getX(i + k));
        caps.push({ x: (xs[0] + xs[1] + xs[2]) / 3, y: position.getY(i) });
      }
    }
    // The top is there either side of the gap and nowhere over it; the gap's floor is there.
    expect(caps.some((c) => c.y > 2.7 && c.x < 1)).toBe(true);
    expect(caps.some((c) => c.y > 2.7 && c.x > 3)).toBe(true);
    expect(caps.some((c) => c.y > 2.7 && c.x > 1.05 && c.x < 2.95)).toBe(false);
    expect(caps.some((c) => c.y < 0.01 && c.x > 1 && c.x < 3)).toBe(true);
  });

  it('leaves no post of wall where two railings meet, and one where only one runs in', () => {
    const edge = { index: 0, a: { x: 0, z: 0 }, b: { x: 4, z: 0 }, dir: { x: 1, z: 0 }, inward: { x: 0, z: 1 }, length: 4, axis: 'x', facing: 0 } as unknown as PlanEdge;
    const piece = { from: 0, to: 4, farFrom: -0.12, farTo: 4.12, depth: 0.12, neighbour: null };
    /** Anything of the wall standing over the corner's triangle, past the edge's start. */
    const inCorner = (left: number) => {
      const geometry = buildWallGeometry({ edge, height: 2.8, pieces: [piece], holes: [{ left, right: 2, bottom: 0, top: 2.8, floor: true }] });
      const position = geometry.getAttribute('position');
      let found = false;
      for (let i = 0; i < position.count; i += 3) {
        const xs = [0, 1, 2].map((k) => position.getX(i + k));
        const ys = [0, 1, 2].map((k) => position.getY(i + k));
        if ((xs[0] + xs[1] + xs[2]) / 3 < -0.01 && Math.max(...ys) > 0.01) found = true;
      }
      return found;
    };
    expect(inCorner(0)).toBe(true);
    expect(inCorner(-Infinity)).toBe(false);
  });
});
