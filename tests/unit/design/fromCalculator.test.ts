import { describe, expect, it } from 'vitest';
import { applyFinishPicks, picksFromCalculator } from '@/lib/design/fromCalculator';
import { catalogProductFromPick } from '@/lib/calculator/roomFinishes';
import { refreshRoom } from '@/lib/design/planGeometry';
import type { SelectedProduct } from '@/lib/calculator/types';
import type { FloorPlan } from '@/lib/design/types';

/**
 * A room's floor and walls chosen in the calculator reach the 3D design on the surface they
 * were chosen for: a wall tile that could also be laid on a floor stays on the walls.
 */

const plan: FloorPlan = {
  rooms: [
    refreshRoom({ id: 'bath', type: 'bathroom', name: 'bath', polygon: [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 2 }, { x: 0, z: 2 }], heightM: 2.7, areaM2: 0, perimeterM: 0, openings: [] }),
  ],
  metresPerPixel: null,
  bounds: { width: 2, depth: 2 },
  source: 'manual',
  wallThicknessM: 0.12,
};

const wallTile: SelectedProduct = {
  productId: 11,
  nameKa: 'მარმარილოს ფილა',
  pricePerUnit: 45,
  unit: 'm2',
  qty: 23.8,
  totalPrice: 1071,
  imageUrl: null,
  categorySlug: 'wall-tiles',
  roomId: 'bath',
  surface: 'wall',
  textureUrl: '/marble.jpg',
  // Sold for walls and floors alike.
  specs: { surfaces: ['wall', 'floor'], wet: true },
};

describe('the calculator’s room finishes in 3D', () => {
  it('carry the surface they were chosen for', () => {
    const picks = picksFromCalculator({ 'wall-tiles_room:bath': wallTile }, {});
    expect(picks.roomProducts).toEqual([{ roomId: 'bath', productId: 11, surface: 'wall' }]);
    // A pick from before it carried its surface is read by its category.
    const { surface: _surface, ...older } = wallTile;
    expect(picksFromCalculator({ 'wall-tiles_room:bath': older }, {}).roomProducts).toEqual([{ roomId: 'bath', productId: 11, surface: 'wall' }]);
  });

  it('go on that surface only, even when the product would suit another', () => {
    const catalog = [catalogProductFromPick(wallTile)];
    const finishes = applyFinishPicks([], plan, picksFromCalculator({ 'wall-tiles_room:bath': wallTile }, {}), catalog);
    expect(finishes.map((f) => `${f.roomId}:${f.surface}:${f.product?.productId}`)).toEqual(['bath:wall:11']);
  });

  it('go on the walls they were chosen for one by one, and a floor two products share in both, the one with more of it first', () => {
    const paint: SelectedProduct = { ...wallTile, productId: 12, categorySlug: 'paint', textureUrl: '/paint.jpg', specs: { surfaces: ['wall'] }, walls: [0, 2, 3] };
    const tile: SelectedProduct = { ...wallTile, walls: [1] };
    const floor = (productId: number, share: number): SelectedProduct => ({ ...wallTile, productId, categorySlug: 'floor-tiles', surface: 'floor', textureUrl: `/floor-${productId}.jpg`, specs: { surfaces: ['floor'] }, share });
    const selected = { 'paint_room:bath/walls12': paint, 'wall-tiles_room:bath/walls11': tile, 'floor-tiles_room:bath': floor(21, 0.3), 'floor-tiles_room:bath/floor2': floor(22, 0.7) };
    const picks = picksFromCalculator(selected, {});
    expect(picks.roomProducts).toContainEqual({ roomId: 'bath', productId: 12, surface: 'wall', walls: [0, 2, 3] });
    expect(picks.roomProducts).toContainEqual({ roomId: 'bath', productId: 21, surface: 'floor', share: 0.3 });
    const finishes = applyFinishPicks([], plan, picks, Object.values(selected).map(catalogProductFromPick));
    const walls = finishes.filter((f) => f.surface === 'wall').map((f) => [f.wallIndex, f.product?.productId]);
    expect(walls.sort((a, b) => Number(a[0]) - Number(b[0]))).toEqual([
      [0, 12],
      [1, 11],
      [2, 12],
      [3, 12],
    ]);
    // Each wall is bought by its own area: two metres of wall 2.7 m high.
    expect(finishes.find((f) => f.wallIndex === 1)?.product?.qty).toBe(5.4);
    // Both, each bought for its share of the floor, as the calculator priced them; the one with more of it drawn.
    expect(finishes.filter((f) => f.surface === 'floor').map((f) => [f.product?.productId, f.share])).toEqual([
      [22, 0.7],
      [21, 0.3],
    ]);
  });
});
