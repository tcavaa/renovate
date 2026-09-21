import { describe, expect, it } from 'vitest';
import { cellAt, cellPolygon, cellsAreaM2, paintCell, paintPatch, paintSpan, paintedProductAt, patchAreaM2, patchAt, patchInRange, patchSpans, patchSpansOnWall, spanAreaM2, stripAt, wallPatches, wallSpans } from '@/lib/design/paint';
import { finishQuantity } from '@/lib/design/finishQuantity';
import { polygonAreaM2, polygonPerimeterM } from '@/lib/design/planGeometry';
import type { CatalogProduct } from '@/lib/design/matcher';
import type { PlanRoom, SurfaceFinish } from '@/lib/design/types';

const polygon = [
  { x: 1, z: 1 },
  { x: 4.32, z: 1 },
  { x: 4.32, z: 3.5 },
  { x: 1, z: 3.5 },
];
const room: PlanRoom = { id: 'r', type: 'bedroom', name: 'Bedroom', polygon, heightM: 2.8, areaM2: polygonAreaM2(polygon), perimeterM: polygonPerimeterM(polygon), openings: [{ id: 'd', kind: 'door', wallIndex: 0, t: 0.5, widthM: 0.9, heightM: 2.1, sillM: 0, roomId: 'r', exterior: false }] };
const product = (id: number, price: number): CatalogProduct => ({ id, nameKa: `p${id}`, slug: `p${id}`, brand: null, categorySlug: 'paint', pricePerUnit: price, unit: 'm2', imageUrl: null, colorHex: '#aabbcc', textureUrl: '/t.jpg', model3dKind: null, model3dUrl: null, widthCm: null, depthCm: null, heightCm: null, styleTags: [], tags: [], isFeatured: false, specs: { surfaces: ['floor', 'wall'] }, coveragePerUnit: null, store: null }) as unknown as CatalogProduct;

describe('floor tiles', () => {
  it('counts tiles from the room’s own corner and clips the last column to the room', () => {
    expect(cellAt(room, { x: 1.2, z: 1.2 })).toEqual([0, 0]);
    expect(cellAt(room, { x: 4.2, z: 3.4 })).toEqual([3, 2]);
    expect(cellAt(room, { x: 0.5, z: 1.2 })).toBeNull();
    expect(polygonAreaM2(cellPolygon(room, [0, 0]))).toBeCloseTo(1, 6);
    expect(polygonAreaM2(cellPolygon(room, [3, 2]))).toBeCloseTo(0.32 * 0.5, 6);
    expect(cellPolygon(room, [9, 9])).toEqual([]);
  });

  it('keeps all the tiles of one product in one finish, moves a tile between products, and erases', () => {
    let finishes: SurfaceFinish[] = [];
    finishes = paintCell(finishes, room, [0, 0], product(1, 40));
    finishes = paintCell(finishes, room, [1, 0], product(1, 40));
    expect(finishes).toHaveLength(1);
    expect(finishes[0].cells).toHaveLength(2);
    expect(finishes[0].product?.qty).toBeCloseTo(2, 6);
    expect(finishes[0].product?.totalPrice).toBeCloseTo(80, 6);
    // The same tile again changes nothing.
    expect(paintCell(finishes, room, [0, 0], product(1, 40))).toBe(finishes);
    // Another product takes the tile over.
    finishes = paintCell(finishes, room, [1, 0], product(2, 10));
    expect(finishes).toHaveLength(2);
    expect(finishes.find((f) => f.product?.productId === 1)?.cells).toEqual([[0, 0]]);
    expect(paintedProductAt(finishes, { roomId: 'r', surface: 'floor', cell: [1, 0] })?.productId).toBe(2);
    // The eraser: the finish that loses its last tile goes.
    finishes = paintCell(finishes, room, [1, 0], null);
    expect(finishes).toHaveLength(1);
    expect(cellsAreaM2(room, finishes[0].cells!)).toBeCloseTo(1, 6);
  });
});

describe('wall strips', () => {
  it('cuts a wall into metre strips, the sliver at the end joining the last one', () => {
    expect(stripAt({ length: 3.32 }, 0.4)).toEqual({ from: 0, to: 1 });
    expect(stripAt({ length: 3.32 }, 3.1)).toEqual({ from: 3, to: 3.32 });
    expect(stripAt({ length: 3.1 }, 3.05)).toEqual({ from: 2, to: 3.1 });
    expect(stripAt({ length: 0.8 }, 0.5)).toEqual({ from: 0, to: 0.8 });
  });

  it('takes the part of a door that falls in the strip off its area', () => {
    // The door is 0.9 m wide, centred at 1.66 m: 0.21 m of it lies in the strip 1–2 m… and 0.79 in all.
    expect(spanAreaM2(room, 0, { from: 0, to: 1 })).toBeCloseTo(2.8, 2);
    expect(spanAreaM2(room, 0, { from: 1, to: 2 })).toBeCloseTo(2.8 - 0.79 * 2.1, 2);
  });

  it('runs touching strips of one product together and splits a span another product is painted into', () => {
    let finishes: SurfaceFinish[] = [];
    finishes = paintSpan(finishes, room, 1, { from: 0, to: 1 }, product(1, 20));
    finishes = paintSpan(finishes, room, 1, { from: 1, to: 2 }, product(1, 20));
    expect(wallSpans(finishes, 'r', 1)).toHaveLength(1);
    expect(wallSpans(finishes, 'r', 1)[0].span).toEqual({ from: 0, to: 2 });
    finishes = paintSpan(finishes, room, 1, { from: 2, to: 2.5 }, product(1, 20));
    finishes = paintSpan(finishes, room, 1, { from: 1, to: 2 }, product(2, 5));
    const spans = wallSpans(finishes, 'r', 1);
    expect(spans.map((f) => [f.span!.from, f.span!.to, f.product?.productId])).toEqual([
      [0, 1, 1],
      [1, 2, 2],
      [2, 2.5, 1],
    ]);
    expect(spans[1].product?.qty).toBeCloseTo(2.8, 6);
    // The eraser takes the middle strip away and leaves its neighbours.
    finishes = paintSpan(finishes, room, 1, { from: 1, to: 2 }, null);
    expect(wallSpans(finishes, 'r', 1)).toHaveLength(2);
    expect(wallSpans(finishes, 'r', 0)).toHaveLength(0);
  });

  it('prices every kind of finish by what it covers', () => {
    const base = { roomId: 'r', colorHex: '#fff', textureUrl: null, textureScaleM: 1, product: null } as const;
    expect(finishQuantity(room, { ...base, surface: 'floor' })).toBeCloseTo(8.3, 6);
    expect(finishQuantity(room, { ...base, surface: 'wall', wallIndex: 1 })).toBeCloseTo(7, 6);
    expect(finishQuantity(room, { ...base, surface: 'wall', wallIndex: 1, span: { from: 0, to: 1 } })).toBeCloseTo(2.8, 6);
    expect(finishQuantity(room, { ...base, surface: 'floor', cells: [[0, 0], [3, 2]] })).toBeCloseTo(1.16, 6);
    // The same two pairs on a wall are square metres of that wall — a whole one at its foot
    // and the 0.8 m left under a 2.8 m ceiling — not floor tiles that happen to share the numbers.
    expect(finishQuantity(room, { ...base, surface: 'wall', wallIndex: 1, cells: [[0, 0], [0, 2]] })).toBeCloseTo(1.8, 6);
    expect(finishQuantity(room, { ...base, surface: 'cornice' })).toBeCloseTo(11.6, 6);
    expect(finishQuantity(room, { ...base, surface: 'skirting' })).toBeCloseTo(10.7, 6);
  });
});

describe('wall patches', () => {
  // Wall 0 runs 3.32 m along the room and the ceiling is 2.8 m up: four columns (the last
  // 32 cm wide) and three rows (the top one 80 cm tall).
  it('counts a patch from the wall’s first corner and from the floor', () => {
    const edge = { length: 3.32 };
    expect(patchAt(edge, room.heightM, 0.4, 0.4)).toEqual([0, 0]);
    expect(patchAt(edge, room.heightM, 3.2, 2.5)).toEqual([3, 2]);
    // Past the end of the wall or through the ceiling: clamped onto the grid, never beyond it.
    expect(patchAt(edge, room.heightM, 99, 99)).toEqual([3, 2]);
    expect(patchSpans(edge, room.heightM, [3, 2])).toEqual({ along: { from: 3, to: 3.32 }, up: { from: 2, to: 2.8 } });
    expect(patchInRange(room, 0, [3, 2])).toBe(true);
    expect(patchInRange(room, 0, [4, 0])).toBe(false);
    expect(patchInRange(room, 0, [0, 3])).toBe(false);
  });

  it('takes the door out of the patches it falls in', () => {
    // The door is 90 cm wide in the middle of a 3.32 m wall and 2.1 m tall.
    expect(patchAreaM2(room, 0, [0, 0])).toBeCloseTo(1, 2);
    expect(patchAreaM2(room, 0, [1, 0])).toBeLessThan(1);
    // The top row runs 2.0–2.8 m and the door's head is at 2.1, so it eats the first 10 cm
    // of it across the 79 cm the leaf covers: 0.8 − 0.079.
    expect(patchAreaM2(room, 0, [1, 2])).toBeCloseTo(0.72, 2);
  });

  it('keeps every patch of one product in one finish, moves one between products, and erases', () => {
    let finishes: SurfaceFinish[] = [];
    finishes = paintPatch(finishes, room, 2, [0, 0], product(1, 30));
    finishes = paintPatch(finishes, room, 2, [1, 0], product(1, 30));
    expect(wallPatches(finishes, room.id, 2)).toHaveLength(1);
    expect(wallPatches(finishes, room.id, 2)[0].cells).toHaveLength(2);
    expect(wallPatches(finishes, room.id, 2)[0].product?.qty).toBeCloseTo(2, 2);

    // The same patch in another product leaves the first finish and joins the second.
    finishes = paintPatch(finishes, room, 2, [1, 0], product(2, 50));
    expect(wallPatches(finishes, room.id, 2)).toHaveLength(2);
    expect(paintedProductAt(finishes, { roomId: room.id, surface: 'wall', wallIndex: 2, span: { from: 1, to: 2 }, patch: [1, 0] })?.productId).toBe(2);

    // No product is the eraser; the finish it emptied goes with it.
    finishes = paintPatch(finishes, room, 2, [1, 0], null);
    expect(wallPatches(finishes, room.id, 2)).toHaveLength(1);
    expect(paintedProductAt(finishes, { roomId: room.id, surface: 'wall', wallIndex: 2, span: { from: 1, to: 2 }, patch: [1, 0] })).toBeNull();
  });

  it('is a different layer from the strips: one wall can carry both', () => {
    let finishes: SurfaceFinish[] = paintSpan([], room, 1, { from: 0, to: 1 }, product(1, 30));
    finishes = paintPatch(finishes, room, 1, [1, 1], product(2, 50));
    expect(wallSpans(finishes, room.id, 1)).toHaveLength(1);
    expect(wallPatches(finishes, room.id, 1)).toHaveLength(1);
  });

  it('lies on top of a strip it is painted over, and says so', () => {
    let finishes: SurfaceFinish[] = paintSpan([], room, 1, { from: 0, to: 1 }, product(1, 30));
    finishes = paintPatch(finishes, room, 1, [0, 1], product(2, 50));
    // Both are there — the strip whole, the square on it — and the square is what the spot wears.
    expect(wallSpans(finishes, room.id, 1)[0].span).toEqual({ from: 0, to: 1 });
    expect(paintedProductAt(finishes, { roomId: 'r', surface: 'wall', wallIndex: 1, span: { from: 0, to: 1 }, patch: [0, 1] })?.productId).toBe(2);
  });

  it('gives way to a strip painted over it, and only in that strip', () => {
    let finishes: SurfaceFinish[] = paintPatch([], room, 1, [0, 1], product(2, 50));
    finishes = paintPatch(finishes, room, 1, [1, 1], product(2, 50));
    finishes = paintSpan(finishes, room, 1, { from: 0, to: 1 }, product(1, 30));
    // The square in the first column is under the new strip and goes; its neighbour stays.
    expect(wallPatches(finishes, room.id, 1)[0].cells).toEqual([[1, 1]]);
    expect(wallPatches(finishes, room.id, 1)[0].product?.qty).toBeCloseTo(1, 6);
    expect(wallSpans(finishes, room.id, 1)).toHaveLength(1);
  });

  it('keeps the squares lying on a strip when the same strip is run on beside it', () => {
    let finishes: SurfaceFinish[] = paintSpan([], room, 1, { from: 0, to: 1 }, product(1, 30));
    finishes = paintPatch(finishes, room, 1, [0, 1], product(2, 50));
    finishes = paintSpan(finishes, room, 1, { from: 1, to: 2 }, product(1, 30));
    // One span now, 0 → 2 — but only the second metre was painted, so the square on the first stays.
    expect(wallSpans(finishes, room.id, 1).map((f) => f.span)).toEqual([{ from: 0, to: 2 }]);
    expect(wallPatches(finishes, room.id, 1)[0].cells).toEqual([[0, 1]]);
  });

  it('erases a strip and the squares on it together', () => {
    let finishes: SurfaceFinish[] = paintSpan([], room, 1, { from: 0, to: 1 }, product(1, 30));
    finishes = paintPatch(finishes, room, 1, [0, 1], product(2, 50));
    expect(paintSpan(finishes, room, 1, { from: 0, to: 1 }, null)).toEqual([]);
  });

  it('takes one square out of a strip with the eraser: the rest of the column stays painted', () => {
    // Wall 1 of the room is 2.5 m long and 2.8 m high: a strip over its first two metres.
    let finishes: SurfaceFinish[] = paintSpan([], room, 1, { from: 0, to: 2 }, product(1, 30));
    const before = finishes[0].product!.qty;
    finishes = paintPatch(finishes, room, 1, [0, 1], null);
    // The first metre left the strip…
    expect(wallSpans(finishes, room.id, 1).map((f) => f.span)).toEqual([{ from: 1, to: 2 }]);
    // …and wears the same product as squares, every row but the erased one.
    const squares = wallPatches(finishes, room.id, 1);
    expect(squares).toHaveLength(1);
    expect(squares[0].product?.productId).toBe(1);
    expect(squares[0].cells!.some(([column, row]) => column === 0 && row === 1)).toBe(false);
    expect(squares[0].cells!.every(([column]) => column === 0)).toBe(true);
    // Priced as what is left: the strip's area less the one square.
    const after = finishes.reduce((sum, f) => sum + (f.product?.qty ?? 0), 0);
    expect(after).toBeCloseTo(before - 1, 1);
    // The eraser on bare wall still does nothing.
    expect(paintPatch(finishes, room, 1, [0, 1], null)).toBe(finishes);
  });
});

describe('a patch on a wall with a height of its own', () => {
  const edge = { length: 3.32 };

  it('is the room’s grid, the top row running on to the top of the wall', () => {
    // A 2.8 m room: rows 0–1, 1–2 and 2–2.8. On a wall raised to 3.5 m the top row goes up with it…
    expect(patchSpansOnWall(edge, 2.8, 3.5, [0, 2])?.up).toEqual({ from: 2, to: 3.5 });
    // …the rows under it are what they were, and on an ordinary wall nothing changes.
    expect(patchSpansOnWall(edge, 2.8, 3.5, [0, 1])?.up).toEqual({ from: 1, to: 2 });
    expect(patchSpansOnWall(edge, 2.8, 2.8, [0, 2])).toEqual(patchSpans(edge, 2.8, [0, 2]));
  });

  it('is cut off by a wall that stops short of the ceiling, and gone above it', () => {
    expect(patchSpansOnWall(edge, 2.8, 1.4, [0, 1])?.up).toEqual({ from: 1, to: 1.4 });
    expect(patchSpansOnWall(edge, 2.8, 1.4, [0, 2])).toBeNull();
    expect(patchSpansOnWall(edge, 2.8, 1, [0, 1])).toBeNull();
  });
});
