import { describe, expect, it } from 'vitest';
import { fitSwapped, isPlacementValid, itemFootprints, rotateItem, snapPlacement } from '@/lib/design/manipulate';
import { clearFootprintMasks, maskFromGrid, registerFootprintMask } from '@/lib/design/footprintMasks';
import { refreshRoom } from '@/lib/design/planGeometry';
import type { PlacedItem, PlanRoom } from '@/lib/design/types';

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
