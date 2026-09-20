import { describe, expect, it } from 'vitest';
import { clipPolygon, finishCoverage, halfZone, wallEdgeAreaM2, wallFinishFor, wallStripZone, zoneAreaM2, zoneFromRect } from '@/lib/design/zones';
import { addOpening } from '@/lib/design/openings';
import { polygonAreaM2, refreshRoom } from '@/lib/design/planGeometry';
import type { PlanRoom, SceneProduct, SurfaceFinish, Vec2 } from '@/lib/design/types';

const P = (x: number, z: number): Vec2 => ({ x, z });
const room: PlanRoom = refreshRoom({ id: 'bath', type: 'bathroom', name: 'bath', polygon: [P(0, 0), P(3, 0), P(3, 2), P(0, 2)], heightM: 2.5, areaM2: 0, perimeterM: 0, openings: [] });
const lRoom: PlanRoom = refreshRoom({ id: 'l', type: 'living_room', name: 'l', polygon: [P(0, 0), P(6, 0), P(6, 3), P(3, 3), P(3, 5), P(0, 5)], heightM: 2.8, areaM2: 0, perimeterM: 0, openings: [] });

describe('zones', () => {
  it('clips a rectangle to the room and prices it by its own area', () => {
    const zone = zoneFromRect(room, { x: -1, z: 0.5, width: 2.5, depth: 5 }, 'z1')!;
    expect(zone).not.toBeNull();
    expect(zoneAreaM2(zone)).toBeCloseTo(1.5 * 1.5, 2);
    expect(zoneFromRect(room, { x: 10, z: 10, width: 1, depth: 1 }, 'z2')).toBeNull();
  });

  it('cuts an L-shaped room down to the drawn rectangle without leaking into the notch', () => {
    const clipped = clipPolygon(lRoom.polygon, [P(2, 2), P(7, 2), P(7, 6), P(2, 6)]);
    // Inside the L: x 2..6 for z 2..3, and x 2..3 for z 3..5.
    expect(polygonAreaM2(clipped)).toBeCloseTo(4 * 1 + 1 * 2, 2);
  });

  it('halves a room and strips a wall', () => {
    const left = halfZone(room, 'left', 'h')!;
    expect(zoneAreaM2(left)).toBeCloseTo(3, 2);
    const bottom = halfZone(room, 'bottom', 'h2')!;
    expect(bottom.polygon.every((p) => p.z >= 1 - 1e-6)).toBe(true);
    const strip = wallStripZone(room, 0, 0.6, 's')!;
    expect(zoneAreaM2(strip)).toBeCloseTo(3 * 0.6, 2);
  });

  it('measures one wall less its openings', () => {
    const withDoor = addOpening([room], 'bath', 'door', 0, 0.12).rooms[0];
    expect(wallEdgeAreaM2(room, 0)).toBeCloseTo(7.5, 1);
    expect(wallEdgeAreaM2(withDoor, 0)).toBeCloseTo(7.5 - 0.9 * 2.05, 1);
    expect(wallEdgeAreaM2(room, 9)).toBe(0);
  });

  it('resolves a wall finish to the wall’s own or the room’s base, and sums coverage per product', () => {
    const product = (id: number, qty: number): SceneProduct => ({ productId: id, nameKa: `p${id}`, slug: `p${id}`, brand: null, pricePerUnit: 40, unit: 'm2', qty, totalPrice: 40 * qty, imageUrl: null, colorHex: null, textureUrl: null, model3dUrl: null, categorySlug: 'wall-tiles', store: null });
    const base: SurfaceFinish = { roomId: 'bath', surface: 'wall', colorHex: '#fff', textureUrl: null, textureScaleM: 1, product: product(1, 20) };
    const one: SurfaceFinish = { ...base, wallIndex: 2, product: product(2, 5) };
    const finishes = [base, one, { ...base, roomId: 'other', product: product(1, 12.4) }];
    expect(wallFinishFor(finishes, 'bath', 2)?.product?.productId).toBe(2);
    expect(wallFinishFor(finishes, 'bath', 0)?.product?.productId).toBe(1);
    const coverage = finishCoverage(finishes);
    expect(coverage[0].product.productId).toBe(1);
    expect(coverage[0].areaM2).toBeCloseTo(32.4, 2);
    expect(coverage[0].rooms).toEqual(['bath', 'other']);
    expect(coverage[1].areaM2).toBe(5);
  });
});

describe('a wall that has been painted on', () => {
  const room: PlanRoom = refreshRoom({
    id: 'r',
    type: 'bedroom',
    name: 'r',
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
  const base = (over: Partial<SurfaceFinish> = {}): SurfaceFinish => ({ roomId: room.id, surface: 'wall', colorHex: '#fff', textureUrl: null, textureScaleM: 1, product: null, ...over });

  it('keeps its own finish: a painted square metre lies on top, it is not the wall', () => {
    const whole = base();
    // A square metre painted on wall 1, and a metre-wide strip of it — neither is the wall.
    const patch = base({ wallIndex: 1, cells: [[0, 1]] });
    const strip = base({ wallIndex: 1, span: { from: 0, to: 1 } });
    expect(wallFinishFor([whole, patch, strip], room.id, 1)).toBe(whole);
    // A finish chosen for that one wall is.
    const ownFinish = base({ wallIndex: 1 });
    expect(wallFinishFor([whole, patch, strip, ownFinish], room.id, 1)).toBe(ownFinish);
  });
});
