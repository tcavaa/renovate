import { describe, expect, it } from 'vitest';
import { wcBoxes } from '@/lib/design/decor/wcBox';
import { decorUses, piecePurchases } from '@/lib/design/decor/quantities';
import { AI_DECOR_FAMILIES, DECOR_FAMILY_LIST } from '@/lib/design/decor/families';
import { clearOfDecor } from '@/lib/design/aiProposal';
import { reanchorDecor } from '@/lib/design/decor/resolve';
import { refreshRoom } from '@/lib/design/planGeometry';
import type { CatalogProduct } from '@/lib/design/matcher';
import type { FloorPlan, PlacedItem, PlanRoom, Vec2 } from '@/lib/design/types';

const P = (x: number, z: number): Vec2 => ({ x, z });
const rect = (id: string, type: PlanRoom['type'], w: number, d: number): PlanRoom =>
  refreshRoom({ id, type, name: id, polygon: [P(0, 0), P(w, 0), P(w, d), P(0, d)], heightM: 2.7, areaM2: 0, perimeterM: 0, openings: [] });
const material = (id: number, kind: string, price: number): CatalogProduct =>
  ({ id, nameKa: kind, slug: kind, brand: null, categorySlug: `decor-${kind}`, pricePerUnit: price, unit: 'm2', imageUrl: null, colorHex: '#eeeeee', textureUrl: null, model3dKind: null, model3dUrl: null, widthCm: null, depthCm: null, heightCm: null, styleTags: [], tags: [], isFeatured: false, specs: null, coveragePerUnit: null, store: null }) as unknown as CatalogProduct;
const catalog = [material(1, 'gypsum', 40), material(2, 'tile', 60)];
const wc = (x: number, z = 0.36): PlacedItem => ({ id: 'wc', roomId: 'b', slot: 'toilet', kind: 'toilet', position: P(x, z), rotation: 0, elevationM: 0, size: { width: 0.4, depth: 0.68, height: 0.82 }, product: { productId: 9, nameKa: 'wc', pricePerUnit: 1, unit: 'piece', qty: 1, totalPrice: 1, model3dUrl: '/m.glb' } as PlacedItem['product'] });

describe('the WC’s installation box', () => {
  it('builds a 20 cm box behind the WC, 80 cm wide, half height, tiled over plasterboard', () => {
    const room = rect('b', 'bathroom', 3, 2.5);
    const [box] = wcBoxes([room], [wc(1.5)], catalog);
    expect(box.family).toBe('box');
    expect(box.wallIndex).toBe(0);
    expect(box.span.from).toBeCloseTo(1.1, 3);
    expect(box.span.to).toBeCloseTo(1.9, 3);
    expect(box.height).toEqual({ from: 0, to: 1 });
    expect(box.materials.body?.product?.productId).toBe(1);
    expect(box.materials.face?.product?.productId).toBe(2);
    // Front 0.8 × 1, two sides 0.2 × 1, the shelf on top 0.8 × 0.2: 1.36 m², in plasterboard and in tiles.
    const uses = decorUses(box, room);
    expect(uses.find((u) => u.slot === 'body')!.m2).toBeCloseTo(1.36, 2);
    expect(uses.find((u) => u.slot === 'face')!.m2).toBeCloseTo(1.36, 2);
    // Painted instead of tiled: the plasterboard alone.
    const painted = { ...box, materials: { body: box.materials.body } };
    expect(piecePurchases(painted, room).map((l) => l.slot)).toEqual(['body']);
    // To the ceiling: no shelf, the full height.
    const full = { ...box, params: { ...box.params, full: true }, height: { from: 0, to: 20 } };
    expect(decorUses(full, room).find((u) => u.slot === 'body')!.m2).toBeCloseTo(0.8 * 2.7 + 2 * 0.2 * 2.7, 2);
    // Only one per WC.
    expect(wcBoxes([room], [wc(1.5)], catalog, [box])).toEqual([]);
  });

  it('takes the whole wall when what is left beside it would be a sliver', () => {
    const room = rect('b', 'toilet', 1.0, 1.6);
    const [box] = wcBoxes([room], [wc(0.5)], catalog);
    expect(box.span).toEqual({ from: 0, to: 1 });
  });

  it('stands the WC in front of it, and follows the WC to another wall', () => {
    const room = rect('b', 'bathroom', 3, 2.5);
    const plan: FloorPlan = { rooms: [room], metresPerPixel: null, bounds: { width: 3, depth: 2.5 }, source: 'manual', wallThicknessM: 0.12 };
    const [box] = wcBoxes([room], [wc(1.5)], catalog);
    const [moved] = clearOfDecor([wc(1.5)], [box], plan);
    expect(moved.position.z).toBeGreaterThanOrEqual(0.36 + 0.2 - 0.03);
    const onRight: PlacedItem = { ...wc(1.5), position: P(2.64, 1.2), rotation: -Math.PI / 2 };
    const [followed] = reanchorDecor([box], [onRight], [room]);
    expect(followed.wallIndex).toBe(1);
  });

  it('is not one of the AI designer’s families', () => {
    expect(DECOR_FAMILY_LIST).toContain('box');
    expect(AI_DECOR_FAMILIES).not.toContain('box');
  });
});
