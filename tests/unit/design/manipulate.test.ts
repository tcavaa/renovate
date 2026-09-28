import { describe, expect, it } from 'vitest';
import { fitSwapped, hangOnWall, isPlacementValid, isWallHung, itemFootprints, rotateItem, snapPlacement } from '@/lib/design/manipulate';
import { withPartialWallSeparators, withSplitRoomTypes } from '@/lib/design/separators';
import { rebuildRooms } from '@/lib/design/walls';
import { clearFootprintMasks, maskFromGrid, registerFootprintMask } from '@/lib/design/footprintMasks';
import { floorWalls, openFloor, pointInPolygon, refreshRoom, roomEdges } from '@/lib/design/planGeometry';
import type { FloorPlan, PlacedItem, PlanRoom, Vec2, Wall } from '@/lib/design/types';

const room: PlanRoom = refreshRoom({
  id: 'r1',
  type: 'living_room',
  name: 'living',
  polygon: [
    { x: 0, z: 0 },
    { x: 4, z: 0 },
    { x: 4, z: 3 },
    { x: 0, z: 3 },
  ],
  heightM: 2.8,
  areaM2: 0,
  perimeterM: 0,
  openings: [],
});

const item = (id: string, x: number, z: number, width: number, depth: number, rotation = 0): PlacedItem => ({
  id,
  roomId: 'r1',
  slot: 'sofa',
  kind: 'sofa_3seat',
  position: { x, z },
  elevationM: 0,
  rotation,
  size: { width, depth, height: 0.8 },
  product: null,
});

describe('rotateItem', () => {
  it('turns a piece that has room to turn', () => {
    const sofa = item('sofa', 2, 1.5, 2, 0.9);
    const result = rotateItem(room, sofa, 2, []);
    expect(result.valid).toBe(true);
    expect(result.rotation).toBeCloseTo(Math.PI / 2, 6);
  });

  it('still turns when nothing fits, and says so', () => {
    // A 2.6 m sofa against the top wall of a 3 m deep room with a table in the middle:
    // turned, it is 2.6 m deep and lands on the table wherever the nudge puts it.
    const sofa = item('sofa', 2, 0.45, 2.6, 0.9);
    const table = item('t', 2, 1.5, 1.2, 0.8);
    const result = rotateItem(room, sofa, 2, [sofa, table]);
    expect(result.rotation).toBeCloseTo(Math.PI / 2, 6);
    expect(result.valid).toBe(false);
    // Turned in place but kept inside the room, so it never pokes through a wall.
    expect(result.position.z - 1.3).toBeGreaterThanOrEqual(-1e-9);
    expect(result.position.z + 1.3).toBeLessThanOrEqual(3 + 1e-9);
    expect(isPlacementValid(room, { ...sofa, position: result.position, rotation: result.rotation }, [sofa, table])).toBe(false);
  });
});

describe('isPlacementValid', () => {
  it('is false outside the room or on top of another piece', () => {
    expect(isPlacementValid(room, item('a', 3.9, 1.5, 1, 1), [])).toBe(false);
    const table = item('t', 2, 1.5, 1.2, 0.8);
    expect(isPlacementValid(room, item('a', 2.2, 1.6, 1, 1), [table])).toBe(false);
    expect(isPlacementValid(room, item('a', 0.8, 0.8, 1, 1), [table])).toBe(true);
  });

  it('agrees with what a drop is judged by', () => {
    const table = item('t', 2, 1.5, 1.2, 0.8);
    const dropped = snapPlacement(room, item('a', 0, 0, 1, 1), { position: { x: 2.1, z: 1.4 }, rotation: 0 }, [table]);
    expect(dropped.valid).toBe(false);
    expect(isPlacementValid(room, { ...item('a', 0, 0, 1, 1), position: dropped.position, rotation: dropped.rotation }, [table])).toBe(false);
  });
});

describe('placeAdditional with a real product size', () => {
  it('never seats a product where it overlaps, and finds free floor when the walls are taken', async () => {
    const { placeAdditional } = await import('@/lib/design/autoLayout');
    // Every wall has something on it; the only free floor is the middle of the room.
    const existing: PlacedItem[] = [
      item('a', 2, 0.35, 3.8, 0.6),
      item('b', 2, 2.65, 3.8, 0.6),
      item('c', 0.3, 1.5, 1.6, 0.5, Math.PI / 2),
      item('d', 3.7, 1.5, 1.6, 0.5, Math.PI / 2),
    ];
    const size = { width: 1.9, depth: 0.63, height: 1.11 };
    const placed = placeAdditional(room, 'shoe_cabinet', existing, size);
    expect(placed).not.toBeNull();
    expect(placed!.size).toEqual(size);
    expect(isPlacementValid(room, placed!, existing)).toBe(true);
  });

  it('refuses when nothing of that size fits anywhere', async () => {
    const { placeAdditional } = await import('@/lib/design/autoLayout');
    const table = item('t', 2, 1.5, 3.6, 2.6);
    expect(placeAdditional(room, 'shoe_cabinet', [table], { width: 1.9, depth: 0.63, height: 1.11 })).toBeNull();
  });
});

describe('a rug gets in nothing’s way, and nothing gets in a rug’s', () => {
  const sofa = item('sofa', 2, 0.5, 2, 0.9);
  const rug: PlacedItem = { ...item('rug', 2, 2.4, 2, 1.4), slot: 'rug', kind: 'rug' };

  it('lets furniture stand on a rug', () => {
    expect(isPlacementValid(room, { ...sofa, position: { x: 2, z: 2.4 } }, [rug])).toBe(true);
  });

  it('lets the rug be put down under the furniture — it used to have nowhere to go once picked up', () => {
    const under = { ...rug, position: { x: 2, z: 0.8 } };
    expect(isPlacementValid(room, under, [sofa])).toBe(true);
    expect(snapPlacement(room, rug, { position: { x: 2, z: 0.8 }, rotation: 0 }, [sofa]).valid).toBe(true);
    expect(rotateItem(room, under, 2, [sofa]).valid).toBe(true);
  });

  it('still keeps it inside the room', () => {
    expect(isPlacementValid(room, { ...rug, position: { x: 3.8, z: 2.4 } }, [sofa])).toBe(false);
  });
});

describe('the floor a model really covers', () => {
  // A corner sofa, 2.4 × 1.8: the back runs the whole width, the arm comes forward on the
  // right, and the front-left corner of its box is empty.
  const L = Array.from({ length: 12 }, (_, row) => Array.from({ length: 12 }, (_, column) => row < 5 || column >= 6));
  const url = '/models/test-corner.glb';
  const corner = (extra: Partial<PlacedItem> = {}): PlacedItem => ({
    ...item('corner', 1.3, 0.95, 2.4, 1.8),
    kind: 'sofa_corner',
    product: { productId: 1, nameKa: 'corner', slug: 'c', brand: null, pricePerUnit: 1, unit: 'piece', qty: 1, totalPrice: 1, imageUrl: null, colorHex: null, textureUrl: null, model3dUrl: url, categorySlug: 'sofas', store: null },
    ...extra,
  });
  const table = (x: number, z: number): PlacedItem => ({ ...item('table', x, z, 0.6, 0.6), slot: 'coffee_table', kind: 'coffee_table' });

  it('merges a grid into a few rectangles, and calls a nearly full one full', () => {
    const mask = maskFromGrid(L)!;
    expect(mask).toHaveLength(2);
    expect(mask[0]).toEqual({ x0: 0, x1: 1, z0: 0, z1: 5 / 12 });
    expect(mask[1]).toEqual({ x0: 0.5, x1: 1, z0: 5 / 12, z1: 1 });
    expect(maskFromGrid(Array.from({ length: 12 }, () => new Array(12).fill(true)))).toBeNull();
    expect(maskFromGrid(Array.from({ length: 12 }, (_, r) => Array.from({ length: 12 }, (_, c) => !(r === 11 && c === 0))))).toBeNull();
  });

  it('lets a table stand in the corner a corner sofa is wrapped round, once the model has said where that is', () => {
    clearFootprintMasks();
    // In the empty front-left of the sofa's box: refused while the sofa is only its box…
    const spot = table(0.55, 1.45);
    expect(isPlacementValid(room, spot, [corner()])).toBe(false);
    registerFootprintMask(url, maskFromGrid(L));
    // …and fine once it is an L; on the seat it is still refused.
    expect(isPlacementValid(room, spot, [corner()])).toBe(true);
    expect(isPlacementValid(room, table(2.0, 1.45), [corner()])).toBe(false);
    expect(isPlacementValid(room, table(0.55, 0.5), [corner()])).toBe(false);
    // The same the other way round: the sofa dragged up to a table standing there.
    expect(snapPlacement(room, corner(), { position: { x: 1.3, z: 0.95 }, rotation: 0 }, [spot]).valid).toBe(true);
    clearFootprintMasks();
  });

  it('turns and mirrors the shape with the piece', () => {
    registerFootprintMask(url, maskFromGrid(L));
    // Mirrored, the arm is on the left and the empty corner front-right.
    expect(isPlacementValid(room, table(0.55, 1.45), [corner({ mirrored: true })])).toBe(false);
    expect(isPlacementValid(room, table(2.05, 1.45), [corner({ mirrored: true })])).toBe(true);
    // Turned a quarter, every part is still a box on the axes, inside the turned bounding box.
    const turned = itemFootprints(corner({ rotation: Math.PI / 2 }));
    expect(turned).toHaveLength(2);
    for (const part of turned) {
      expect(part.maxX - part.minX).toBeLessThanOrEqual(1.8 + 1e-9);
      expect(part.maxZ - part.minZ).toBeLessThanOrEqual(2.4 + 1e-9);
    }
    clearFootprintMasks();
  });
});


describe('fitSwapped — where a piece stands once its product is another size', () => {
  it('keeps the back on the wall, deeper or shallower', () => {
    // A sofa 0.9 m deep with its back on the top wall (z = 0), now 1.3 m deep: the same centre
    // would put 20 cm of it inside the wall.
    const deeper = fitSwapped(room, item('sofa', 2, 0.47, 2, 1.3), []);
    expect(deeper).not.toBeNull();
    expect(deeper!.position.z - 0.65).toBeGreaterThanOrEqual(0);
    expect(deeper!.position.z - 0.65).toBeLessThan(0.05);
    // …and 0.6 m deep: it would stand a hand off the wall.
    const shallower = fitSwapped(room, item('sofa', 2, 0.47, 2, 0.6), []);
    expect(shallower!.position.z - 0.3).toBeLessThan(0.05);
    // Only towards the wall: a piece standing off the 5 cm grid is not rounded onto it sideways.
    const offGrid = fitSwapped(room, item('sofa', 2.0295, 0.47, 2, 1.3), []);
    expect(offGrid!.position.x).toBeCloseTo(2.0295, 6);
    expect(offGrid!.position.z - 0.65).toBeLessThan(0.05);
  });

  it('leaves a piece in the middle of the floor exactly where it is', () => {
    const table = item('t', 2.03, 1.52, 1.2, 0.8);
    expect(fitSwapped(room, table, [])).toBe(table);
  });

  it('eases one that pokes out back inside the room', () => {
    // Against the left wall and now wider than the space to it.
    const wide = fitSwapped(room, item('a', 0.6, 1.5, 1.6, 0.8), []);
    expect(wide).not.toBeNull();
    expect(wide!.position.x - 0.8).toBeGreaterThanOrEqual(-1e-9);
  });

  it('says so when there is no room for it here, and never goes looking across the room', () => {
    const table = item('t', 2, 1.45, 1.2, 0.8);
    expect(fitSwapped(room, item('sofa', 2, 0.47, 3.2, 1.6), [table])).toBeNull();
  });
});

describe('hangOnWall', () => {
  /** A wall clock: 32 cm square, 5 cm deep, hung with its centre at 1.55 m by the layout. */
  const clock = (): PlacedItem => ({ id: 'clock', roomId: 'r1', slot: 'artwork', kind: 'artwork', position: { x: 2, z: 1.5 }, elevationM: 1.39, rotation: 0, size: { width: 0.32, depth: 0.05, height: 0.32 }, product: null });
  const edges = roomEdges(room.polygon);
  const south = edges[0]; // (0,0) → (4,0)

  it('knows which pieces hang', () => {
    expect(isWallHung(clock())).toBe(true);
    expect(isWallHung(item('sofa', 2, 1.5, 2, 0.9))).toBe(false);
  });

  it('hangs the piece flat on the named wall, under the pointer, at the height the pointer met the face', () => {
    const hung = hangOnWall(room, clock(), 0, { x: 1.5, z: 0 }, 1.7, [])!;
    expect(hung.valid).toBe(true);
    expect(hung.rotation).toBe(south.facing);
    // Centred under the pointer along the wall, its back 1 cm off the plaster.
    expect(hung.position.x).toBeCloseTo(1.5, 6);
    expect(hung.position.z).toBeCloseTo(south.inward.z * (0.025 + 0.01), 6);
    // The pointer's height is the centre of the piece; the base is half its height lower.
    expect(hung.elevationM).toBeCloseTo(1.54, 6);
  });

  it('takes the wall it is told, not the nearest one to the point', () => {
    // A point a hand from the west wall, but the pointer was on the south wall's face.
    const hung = hangOnWall(room, clock(), 0, { x: 0.05, z: 0.02 }, 1.5, [])!;
    expect(hung.rotation).toBe(south.facing);
    expect(hung.position.z).toBeCloseTo(0.035, 6);
    // Kept off the wall's end by half its width.
    expect(hung.position.x).toBeCloseTo(0.16, 6);
  });

  it("keeps the piece between the floor and the ceiling and off the wall's ends", () => {
    const high = hangOnWall(room, clock(), 0, { x: 3.99, z: 0 }, 9, [])!;
    expect(high.position.x).toBeCloseTo(3.84, 6);
    expect(high.elevationM).toBeCloseTo(2.8 - 0.32, 6);
    const low = hangOnWall(room, clock(), 0, { x: 2, z: 0 }, -1, [])!;
    expect(low.elevationM).toBe(0);
  });

  it('keeps the offset a piece was grabbed at, along the wall and up it', () => {
    // Grabbed 8 cm left of its centre and 10 cm below it: the centre stays that far from the pointer.
    const hung = hangOnWall(room, clock(), 0, { x: 1.5, z: 0 }, 1.5, [], { along: 0.08, up: 0.1 })!;
    expect(hung.position.x).toBeCloseTo(1.6, 6);
    expect(hung.elevationM).toBeCloseTo(1.6 - 0.16, 6);
  });

  it('centres a piece wider than its wall, and answers null for a wall the room has not got', () => {
    const wide = { ...clock(), size: { width: 5, depth: 0.05, height: 0.7 } };
    expect(hangOnWall(room, wide, 0, { x: 3.5, z: 0 }, 1.5, [])!.position.x).toBeCloseTo(2, 6);
    expect(hangOnWall(room, clock(), 7, { x: 1, z: 0 }, 1.5, [])).toBeNull();
  });
});

describe('a room separator is a line on the floor, not a wall', () => {
  const P = (x: number, z: number): Vec2 => ({ x, z });
  const wall = (id: string, a: Vec2, b: Vec2, extra: Partial<Wall> = {}): Wall => ({ id, a, b, thicknessM: 0.12, origin: 'existing', ...extra });
  const base: FloorPlan = { rooms: [], metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', wallThicknessM: 0.12, wallHeightM: 2.8, walls: [] };
  const roomAt = (plan: FloorPlan, p: Vec2): PlanRoom => plan.rooms.find((r) => pointInPolygon(p, r.polygon))!;
  const piece = (id: string, roomId: string, x: number, z: number, width: number, depth: number, kind = 'sofa_3seat'): PlacedItem => ({ ...item(id, x, z, width, depth), roomId, kind });

  /**
   * The separators suite's corner of a flat: a partial wall (x 2 → 4.26 along z 3.73) carried on
   * to the left wall by the app's separator (x 0 → 2), dividing the living room from a kitchen
   * that opens onto it.
   */
  const plan = (() => {
    const walls = [
      wall('top', P(0, 0), P(6.82, 0)),
      wall('right', P(6.82, 0), P(6.82, 7.87)),
      wall('bottom', P(6.82, 7.87), P(0, 7.87)),
      wall('left', P(0, 7.87), P(0, 0)),
      wall('bed-top', P(4.26, 3.73), P(6.82, 3.73)),
      wall('bed-left', P(4.26, 3.73), P(4.26, 7.87)),
      wall('stub', P(2, 3.73), P(4.26, 3.73)),
    ];
    const built = rebuildRooms(base, walls);
    // A living room is what the app divides along a partial wall; the bedroom stays whole.
    const typed: FloorPlan = { ...built, rooms: built.rooms.map((r) => ({ ...r, type: pointInPolygon(P(5.5, 6), r.polygon) ? 'bedroom' : 'living_room' })) };
    return withSplitRoomTypes(typed.rooms, withPartialWallSeparators(typed));
  })();
  const living = roomAt(plan, P(1, 1));
  const kitchen = roomAt(plan, P(1, 6));
  const bedroom = roomAt(plan, P(5.5, 6));

  it('joins the rooms a separator divides into one floor, and no others', () => {
    expect(openFloor(living, plan.rooms).map((r) => r.id).sort()).toEqual([living.id, kitchen.id].sort());
    expect(openFloor(kitchen, plan.rooms).map((r) => r.id).sort()).toEqual([living.id, kitchen.id].sort());
    expect(openFloor(bedroom, plan.rooms)).toEqual([bedroom]);
    // The separator's line is open; the partial wall it carries on from still holds a piece in.
    const walls = floorWalls([living, kitchen]);
    expect(walls.some((e) => Math.abs(e.a.z - 3.73) < 1e-6 && Math.abs(e.b.z - 3.73) < 1e-6 && Math.max(e.a.x, e.b.x) <= 2 + 1e-6)).toBe(false);
    expect(walls.filter((e) => Math.min(e.a.x, e.b.x) >= 2 - 1e-6 && Math.abs(e.a.z - e.b.z) < 1e-6 && Math.abs(e.a.z - 3.73) < 0.1)).toHaveLength(2);
  });

  it('lets a sofa stand over the line — it was refused in both rooms', () => {
    const sofa = piece('sofa', living.id, 1, 3.73, 1.4, 0.9);
    expect(isPlacementValid(living, sofa, [], plan.rooms)).toBe(true);
    expect(isPlacementValid(kitchen, { ...sofa, roomId: kitchen.id }, [], plan.rooms)).toBe(true);
    // Judged against its own room alone, as before: poking into the kitchen is poking out.
    expect(isPlacementValid(living, sofa, [])).toBe(false);
  });

  it('drags across the line instead of being held back at it', () => {
    const sofa = piece('sofa', living.id, 1, 2, 1.4, 0.9);
    const across = snapPlacement(living, sofa, { position: P(1, 3.8), rotation: 0 }, [], plan.rooms);
    expect(across.valid).toBe(true);
    expect(across.position.z).toBeCloseTo(3.8, 6);
    // Without the plan's rooms it stops against the line as if it were a wall.
    expect(snapPlacement(living, sofa, { position: P(1, 3.8), rotation: 0 }, []).position.z).toBeLessThan(3.73 - 0.44);
  });

  it('never lets a piece through the partial wall the separator carries on from', () => {
    expect(isPlacementValid(living, piece('sofa', living.id, 3, 3.73, 1.4, 0.9), [], plan.rooms)).toBe(false);
    // Nor through the room's other walls: the floor is the two rooms, not their box.
    expect(isPlacementValid(living, piece('sofa', living.id, 4.5, 3.73, 1.4, 0.9), [], plan.rooms)).toBe(false);
  });

  it('keeps pieces on either side of the line out of each other’s way', () => {
    const table = piece('table', kitchen.id, 1, 4.4, 1.2, 0.8, 'dining_table');
    const sofa = piece('sofa', living.id, 1, 3.73, 1.4, 0.9);
    expect(isPlacementValid(living, sofa, [table], plan.rooms)).toBe(false);
    expect(snapPlacement(living, sofa, { position: P(1, 3.8), rotation: 0 }, [table], plan.rooms).valid).toBe(false);
    expect(isPlacementValid(living, { ...sofa, position: P(1, 3.4) }, [table], plan.rooms)).toBe(true);
  });

  it('turns a piece where it stands over the line', () => {
    const chair = piece('chair', living.id, 1, 3.73, 0.6, 0.6, 'armchair');
    const turned = rotateItem(living, chair, 1, [], plan.rooms);
    expect(turned.valid).toBe(true);
    expect(turned.position).toEqual(chair.position);
  });

  it('squares up to its own room at the end of a partial wall, never jumping through to the far face', () => {
    // Project 219's corner: a diagonal partial wall from the bedroom's corner to (3, 2.5), carried
    // on by a separator to the left wall. Near the wall's end both of its faces are within reach.
    const walls = [
      wall('top', P(0, 0), P(6.82, 0)),
      wall('right', P(6.82, 0), P(6.82, 7.87)),
      wall('bottom', P(6.82, 7.87), P(0, 7.87)),
      wall('left', P(0, 7.87), P(0, 0)),
      wall('bed-top', P(4.26, 3.73), P(6.82, 3.73)),
      wall('bed-left', P(4.26, 3.73), P(4.26, 7.87)),
      wall('diagonal', P(4.26, 3.73), P(3, 2.5), { origin: 'user' }),
      wall('diagonal-sep', P(3, 2.5), P(0, 3.73), { thicknessM: 0, separator: true, origin: 'generated' }),
    ];
    const corner = rebuildRooms(base, walls);
    const lounge = roomAt(corner, P(1, 1));
    const nook = roomAt(corner, P(1, 6));
    expect(openFloor(lounge, corner.rooms).map((r) => r.id).sort()).toEqual([lounge.id, nook.id].sort());
    const table = piece('table', lounge.id, 1.5, 1.2, 1.2, 1.2, 'coffee_table');
    const dragged = snapPlacement(lounge, table, { position: P(2.7, 2.62), rotation: 0 }, [], corner.rooms);
    expect(Math.hypot(dragged.position.x - 2.7, dragged.position.z - 2.62)).toBeLessThan(0.05);
    // A TV unit with the wall's end inside its box stands through the wall, although every
    // corner of it is in the room — in its room alone or on the floor across the separator.
    const tv = { ...piece('tv', lounge.id, 2.96, 2.52, 1.8, 0.58, 'tv_unit'), rotation: Math.PI };
    expect(isPlacementValid(lounge, tv, [])).toBe(false);
    expect(isPlacementValid(lounge, tv, [], corner.rooms)).toBe(false);
  });

  it('lets furniture over a diagonal separator too', () => {
    // A 6 m square cut corner to corner-ish, like the plan in the report: from the left wall at
    // z 2 to the bottom wall at x 4.
    const walls = [
      wall('top', P(0, 0), P(6, 0)),
      wall('right', P(6, 0), P(6, 6)),
      wall('bottom', P(6, 6), P(0, 6)),
      wall('left', P(0, 6), P(0, 0)),
      wall('line', P(0, 2), P(4, 6), { thicknessM: 0, separator: true }),
    ];
    const split = rebuildRooms(base, walls);
    expect(split.rooms).toHaveLength(2);
    const upper = roomAt(split, P(4, 2));
    const chair = piece('chair', upper.id, 2, 4, 0.6, 0.6, 'armchair');
    expect(isPlacementValid(upper, chair, [], split.rooms)).toBe(true);
    expect(isPlacementValid(upper, chair, [])).toBe(false);
    const dragged = snapPlacement(upper, chair, { position: P(1.6, 4.4), rotation: 0 }, [], split.rooms);
    expect(dragged.valid).toBe(true);
    expect(dragged.position).toEqual(P(1.6, 4.4));
    // The outer walls still hold it in.
    expect(isPlacementValid(upper, { ...chair, position: P(0.1, 4) }, [], split.rooms)).toBe(false);
  });
});
