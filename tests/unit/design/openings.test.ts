import { describe, expect, it } from 'vitest';
import { addOpening, alignTwins, leafOnOtherSide, moveOpening, openingCandidates, openingWorldPoint, projectToEdge, removeOpening, setOpeningProduct, twinOf, updateOpening, withOpeningProducts } from '@/lib/design/openings';
import type { CatalogProduct } from '@/lib/design/matcher';
import { deriveOpenings, refreshRoom, roomEdges } from '@/lib/design/planGeometry';
import type { PlanRoom } from '@/lib/design/types';

const rect = (id: string, x: number, z: number, w: number, d: number, type: PlanRoom['type'] = 'bedroom'): PlanRoom =>
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

/** A hallway with a bedroom to its right, sharing the wall at x = 4. */
function flat(): PlanRoom[] {
  const rooms = [rect('hall', 0, 0, 4, 3, 'hallway'), rect('bed', 4, 0, 4, 3, 'bedroom')];
  deriveOpenings(rooms, 0.12);
  return rooms;
}

describe('openings', () => {
  it('derives a paired interior door that both rooms share', () => {
    const rooms = flat();
    const door = rooms[1].openings.find((o) => o.kind === 'door' && o.connectsToRoomId === 'hall')!;
    expect(door).toBeDefined();
    const twin = twinOf(rooms, door);
    expect(twin?.room.id).toBe('hall');
    const a = openingWorldPoint(rooms[1], door)!;
    const b = openingWorldPoint(twin!.room, twin!.opening)!;
    expect(a.x).toBeCloseTo(b.x, 5);
    expect(a.z).toBeCloseTo(b.z, 5);
  });

  it('hangs both halves of a door from the same jamb and draws one leaf', () => {
    const rooms = flat();
    const door = rooms[1].openings.find((o) => o.connectsToRoomId === 'hall')!;
    const twin = twinOf(rooms, door)!.opening;
    // Each half names the jamb from its own side of the wall; the same corner in the world.
    expect(door.hinge).not.toBe(twin.hinge);
    expect(door.swing).not.toBe(twin.swing);
    expect([door, twin].filter((o) => !leafOnOtherSide(o))).toHaveLength(1);
    // The private room's half is the one the leaf swings into.
    expect(door.swing).toBe('in');

    // A door added by hand on a shared wall gets the same treatment…
    const hallSide = rooms[0].openings.find((o) => o.connectsToRoomId === 'bed')!;
    const cleared = removeOpening(rooms, 'hall', hallSide.id);
    const added = addOpening(cleared, 'hall', 'door', hallSide.wallIndex, 0.12, { t: 0.7, hinge: 'right', swing: 'in' });
    const hallDoor = added.rooms[0].openings.find((o) => o.id === added.openingId)!;
    const bedTwin = twinOf(added.rooms, hallDoor)!.opening;
    expect(hallDoor.hinge).toBe('right');
    expect(bedTwin.hinge).toBe('left');
    expect(bedTwin.swing).toBe('out');

    // …and old plans whose halves were both "left" and both "in" are put right.
    const stale = rooms.map((r) => ({ ...r, openings: r.openings.map((o) => ({ ...o, hinge: 'left' as const, swing: 'in' as const })) }));
    const fixed = alignTwins(stale);
    const a = fixed.flatMap((r) => r.openings).find((o) => o.id === door.id)!;
    const b = twinOf(fixed, a)!.opening;
    expect(a.hinge).not.toBe(b.hinge);
    expect(a.swing).not.toBe(b.swing);
    expect(alignTwins(fixed)).toBe(fixed);
  });

  it('moves a door and its twin together, clamped away from the corners', () => {
    const rooms = flat();
    const door = rooms[1].openings.find((o) => o.connectsToRoomId === 'hall')!;
    const moved = moveOpening(rooms, 'bed', door.id, 0.99);
    const next = moved.find((r) => r.id === 'bed')!.openings.find((o) => o.id === door.id)!;
    expect(next.t).toBeLessThan(0.99);
    const twin = twinOf(moved, next)!;
    const a = openingWorldPoint(moved.find((r) => r.id === 'bed')!, next)!;
    const b = openingWorldPoint(twin.room, twin.opening)!;
    expect(a.z).toBeCloseTo(b.z, 5);
  });

  it('projects a point onto an edge with a margin for the opening width', () => {
    const edge = roomEdges(rect('r', 0, 0, 4, 3).polygon)[0];
    expect(projectToEdge(edge, { x: -3, z: 0 }, 0.9)).toBeCloseTo((0.45 + 0.15) / 4, 5);
    expect(projectToEdge(edge, { x: 2, z: 0 }, 0.9)).toBeCloseTo(0.5, 5);
  });

  it('adds a window on a free exterior wall and refuses one on a shared wall', () => {
    const rooms = flat();
    const bed = rooms[1];
    const sharedIndex = bed.openings.find((o) => o.connectsToRoomId === 'hall')!.wallIndex;
    const refused = addOpening(rooms, 'bed', 'window', sharedIndex, 0.12);
    expect(refused.openingId).toBeNull();
    const before = bed.openings.length;
    const added = addOpening(rooms, 'bed', 'window', null, 0.12);
    expect(added.openingId).not.toBeNull();
    expect(added.rooms.find((r) => r.id === 'bed')!.openings).toHaveLength(before + 1);
  });

  it('adds a door on a shared wall together with its twin', () => {
    const rooms = flat();
    const bed = rooms[1];
    const sharedIndex = bed.openings.find((o) => o.connectsToRoomId === 'hall')!.wallIndex;
    const cleared = removeOpening(rooms, 'bed', bed.openings.find((o) => o.connectsToRoomId === 'hall')!.id);
    expect(cleared.find((r) => r.id === 'hall')!.openings.some((o) => o.connectsToRoomId === 'bed')).toBe(false);
    const added = addOpening(cleared, 'bed', 'door', sharedIndex, 0.12);
    const door = added.rooms.find((r) => r.id === 'bed')!.openings.find((o) => o.id === added.openingId)!;
    expect(door.connectsToRoomId).toBe('hall');
    expect(added.rooms.find((r) => r.id === 'hall')!.openings.some((o) => o.connectsToRoomId === 'bed')).toBe(true);
  });

  it('turning a door into a window gives it a sill', () => {
    const rooms = flat();
    const bed = rooms[1];
    const win = bed.openings.find((o) => o.kind === 'window')!;
    const next = updateOpening(rooms, 'bed', win.id, { kind: 'door' });
    const door = next.find((r) => r.id === 'bed')!.openings.find((o) => o.id === win.id)!;
    expect(door.kind).toBe('door');
    expect(door.sillM).toBe(0);
  });
});

describe('dragging openings between walls', () => {
  const exteriorWalls = (room: PlanRoom, sharedX: number) =>
    roomEdges(room.polygon).filter((e) => !(Math.abs(e.a.x - sharedX) < 1e-6 && Math.abs(e.b.x - sharedX) < 1e-6));

  it('finds the nearest wall within reach, preferring the dragged opening’s own room on a shared wall', async () => {
    const { nearestWall } = await import('@/lib/design/openings');
    const rooms = flat();
    // Just outside the bedroom's top wall (z = 0), well within reach.
    const top = nearestWall(rooms, { x: 6, z: -0.1 }, 0.3);
    expect(top?.room.id).toBe('bed');
    expect(top?.edge.a.z === 0 && top?.edge.b.z === 0).toBe(true);
    // The middle of the room is a metre and a half from every wall: nothing in reach.
    expect(nearestWall(rooms, { x: 6, z: 1.5 }, 0.3)).toBeNull();
    // On the shared wall both rooms' copies are equally close; the preferred room wins.
    expect(nearestWall(rooms, { x: 4, z: 1.5 }, 0.3, 'hall')?.room.id).toBe('hall');
    expect(nearestWall(rooms, { x: 4, z: 1.5 }, 0.3, 'bed')?.room.id).toBe('bed');
  });

  it('moves a window to another wall of its room, keeping its width', async () => {
    const { moveOpeningToWall } = await import('@/lib/design/openings');
    const rooms = flat();
    const bed = rooms.find((r) => r.id === 'bed')!;
    const window = bed.openings.find((o) => o.kind === 'window')!;
    const target = exteriorWalls(bed, 4).find((e) => e.index !== window.wallIndex)!;
    const result = moveOpeningToWall(rooms, 'bed', window.id, { roomId: 'bed', wallIndex: target.index, t: 0.5 }, 0.12);
    expect(result.openingId).not.toBeNull();
    const moved = result.rooms.find((r) => r.id === 'bed')!.openings.find((o) => o.id === result.openingId)!;
    expect(moved.wallIndex).toBe(target.index);
    expect(moved.widthM).toBeCloseTo(window.widthM, 5);
    expect(moved.t).toBeCloseTo(0.5, 5);
    expect(result.rooms.find((r) => r.id === 'bed')!.openings.some((o) => o.id === window.id)).toBe(false);
  });

  it('slides along its own wall without changing id, and refuses a window on a shared wall', async () => {
    const { moveOpeningToWall } = await import('@/lib/design/openings');
    const rooms = flat();
    const bed = rooms.find((r) => r.id === 'bed')!;
    const window = bed.openings.find((o) => o.kind === 'window')!;
    const slid = moveOpeningToWall(rooms, 'bed', window.id, { roomId: 'bed', wallIndex: window.wallIndex, t: 0.3 }, 0.12);
    expect(slid.openingId).toBe(window.id);
    const shared = roomEdges(bed.polygon).find((e) => Math.abs(e.a.x - 4) < 1e-6 && Math.abs(e.b.x - 4) < 1e-6)!;
    const refused = moveOpeningToWall(rooms, 'bed', window.id, { roomId: 'bed', wallIndex: shared.index, t: 0.5 }, 0.12);
    expect(refused.openingId).toBeNull();
    expect(refused.rooms).toBe(rooms);
  });

  it('carries a door into the neighbouring room', async () => {
    const { moveOpeningToWall } = await import('@/lib/design/openings');
    const rooms = flat();
    const hall = rooms.find((r) => r.id === 'hall')!;
    const wall = exteriorWalls(hall, 4)[0];
    const added = addOpening(rooms, 'hall', 'door', wall.index, 0.12);
    const bed = added.rooms.find((r) => r.id === 'bed')!;
    const bedWall = exteriorWalls(bed, 4)[0];
    const moved = moveOpeningToWall(added.rooms, 'hall', added.openingId!, { roomId: 'bed', wallIndex: bedWall.index, t: 0.4 }, 0.12);
    expect(moved.openingId).not.toBeNull();
    expect(moved.rooms.find((r) => r.id === 'hall')!.openings.some((o) => o.id === added.openingId)).toBe(false);
    const door = moved.rooms.find((r) => r.id === 'bed')!.openings.find((o) => o.id === moved.openingId)!;
    expect(door.kind).toBe('door');
    expect(door.exterior).toBe(true);
    expect(door.wallIndex).toBe(bedWall.index);
  });

  it('adds at a requested position when one is given', () => {
    const rooms = flat();
    const bed = rooms.find((r) => r.id === 'bed')!;
    const wall = exteriorWalls(bed, 4).find((e) => e.length >= 4)!;
    // 0.3 keeps the 1.4 m window's edge clear of the corner; 0.2 would be clamped to the margin.
    const added = addOpening(rooms, 'bed', 'window', wall.index, 0.12, { t: 0.3 });
    const window = added.rooms.find((r) => r.id === 'bed')!.openings.find((o) => o.id === added.openingId)!;
    expect(window.t).toBeCloseTo(0.3, 5);
  });

  describe('as products', () => {
    const product = (id: number, kind: string, price: number, styleTags: string[] = []): CatalogProduct => ({ id, nameKa: `p${id}`, slug: `p${id}`, brand: null, categorySlug: kind === 'window' ? 'windows' : 'doors', pricePerUnit: price, unit: 'piece', imageUrl: null, colorHex: null, textureUrl: null, model3dKind: kind, model3dUrl: `/models/fixtures/${kind}-${id}.glb`, widthCm: 90, depthCm: 20, heightCm: 210, styleTags, tags: [], isFeatured: false, specs: null, coveragePerUnit: null, store: null });
    const catalog = [product(1, 'door', 500, ['modern']), product(2, 'door', 400, ['vintage']), product(3, 'entrance_door', 1200), product(4, 'window', 450, ['modern'])];

    it('offers doors of the opening\'s own kind first, the style\'s first, then the cheapest', () => {
      const ids = openingCandidates({ kind: 'door', exterior: false }, catalog, 'modern').map((p) => p.id);
      expect(ids).toEqual([1, 2, 3]);
      expect(openingCandidates({ kind: 'door', exterior: true }, catalog, 'modern').map((p) => p.id)).toEqual([3, 1, 2]);
      expect(openingCandidates({ kind: 'window', exterior: true }, catalog, 'vintage').map((p) => p.id)).toEqual([4]);
      expect(openingCandidates({ kind: 'archway', exterior: false }, catalog, 'modern')).toEqual([]);
    });

    it('gives both halves of an interior door the same product, and keeps a chosen one', () => {
      const rooms = withOpeningProducts(flat(), catalog, 'vintage');
      const door = rooms[1].openings.find((o) => o.connectsToRoomId === 'hall')!;
      const twin = twinOf(rooms, door)!.opening;
      expect(door.product?.productId).toBe(2);
      expect(twin.product?.productId).toBe(2);
      expect(door.product?.qty).toBe(1);
      // A window on the bedroom's outside wall is a window product.
      const window = rooms.flatMap((r) => r.openings).find((o) => o.kind === 'window');
      expect(window?.product?.productId).toBe(4);
      // Nothing to do the second time round.
      expect(withOpeningProducts(rooms, catalog, 'vintage')).toBe(rooms);
      // A choice sticks on both halves, and a re-run leaves it alone.
      const chosen = setOpeningProduct(rooms, 'bed', door.id, catalog[0]);
      const again = withOpeningProducts(chosen, catalog, 'vintage');
      expect(again.find((r) => r.id === 'bed')!.openings.find((o) => o.id === door.id)!.product?.productId).toBe(1);
      expect(twinOf(again, door)!.opening.product?.productId).toBe(1);
    });

    it('drops the product when the kind changes, so a door\'s product never sits in a window', () => {
      const rooms = withOpeningProducts(flat(), catalog, 'modern');
      const window = rooms.flatMap((r) => r.openings).find((o) => o.kind === 'window')!;
      const changed = updateOpening(rooms, window.roomId, window.id, { kind: 'door' });
      expect(changed.find((r) => r.id === window.roomId)!.openings.find((o) => o.id === window.id)!.product).toBeNull();
      const refilled = withOpeningProducts(changed, catalog, 'modern');
      expect(refilled.find((r) => r.id === window.roomId)!.openings.find((o) => o.id === window.id)!.product?.productId).toBe(3);
    });

    it('aligns the twin\'s product with the primary\'s', () => {
      const rooms = withOpeningProducts(flat(), catalog, 'modern');
      const door = rooms[0].openings.find((o) => o.connectsToRoomId === 'bed')!;
      const stale = rooms.map((r) => (r.id === 'bed' ? { ...r, openings: r.openings.map((o) => ({ ...o, product: null })) } : r));
      const aligned = alignTwins(stale);
      expect(twinOf(aligned, door)!.opening.product?.productId).toBe(door.product?.productId);
    });
  });
});
