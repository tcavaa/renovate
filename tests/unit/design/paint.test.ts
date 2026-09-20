import { describe, expect, it } from 'vitest';
import { cellAt, cellPolygon, cellsAreaM2, paintCell, paintSpan, paintedProductAt, spanAreaM2, stripAt, wallSpans } from '@/lib/design/paint';
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
    expect(finishQuantity(room, { ...base, surface: 'cornice' })).toBeCloseTo(11.6, 6);
    expect(finishQuantity(room, { ...base, surface: 'skirting' })).toBeCloseTo(10.7, 6);
  });
});
