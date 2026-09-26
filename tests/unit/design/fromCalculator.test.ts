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
});
