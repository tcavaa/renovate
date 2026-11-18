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

  it('stops at a piece standing on its wall beside the WC, as at a door — never built into it', () => {
    const room = rect('b', 'bathroom', 3, 2.5);
    // A basin on a console, 81 cm deep, its side 20 cm from the WC's middle: inside the box's 80 cm.
    const basin: PlacedItem = { ...wc(1.5), id: 'basin', slot: 'sink', kind: 'sink', position: P(1.7 + 0.345, 0.02 + 0.405), size: { width: 0.69, depth: 0.81, height: 0.91 } };
    const [box] = wcBoxes([room], [wc(1.5), basin], catalog);
    expect(box.span.to).toBeLessThanOrEqual(1.7 + 1e-6);
    // The WC keeps its box behind the whole of it, the other side as wide as ever.
    expect(box.span.from).toBeCloseTo(1.1, 3);
    expect(box.span.to).toBeGreaterThanOrEqual(1.5 + 0.2);
    // A piece standing off the wall, in front of the box's depth, does not cut it.
    const away = { ...basin, position: P(2.05, 0.2 + 0.4 + 0.05) };
    expect(wcBoxes([room], [wc(1.5), away], catalog)[0].span.to).toBeCloseTo(1.9, 3);
  });

  it('is built under a window whose sill is over its top, and not under a lower one', () => {
    const withWindow = (sillM: number): PlanRoom => ({ ...rect('b', 'toilet', 1.6, 1.4), openings: [{ id: 'w', roomId: 'b', kind: 'window', wallIndex: 0, t: 0.5, widthM: 0.6, heightM: 0.5, sillM, exterior: true }] });
    // A toilet's high window, 1.5 m up: the box's metre fits under it.
    const [box] = wcBoxes([withWindow(1.5)], [wc(0.8)], catalog);
    expect(box).toBeDefined();
    expect(box.span).toEqual({ from: 0.4, to: 1.2 });
    expect(box.height.to).toBeLessThanOrEqual(1.5);
    // A window at 90 cm: the box would stand in it.
    expect(wcBoxes([withWindow(0.9)], [wc(0.8)], catalog)).toEqual([]);
  });

  it('runs on under a high window behind the whole of a WC standing partly under it, not cut short at the window', () => {
    // A window 0.68–1.24 m along wall 0, 1.5 m up; the WC 1.17–1.57 m along it.
    const toilet = (d: number): PlanRoom => ({ ...rect('b', 'toilet', 1.9, d), openings: [{ id: 'w', roomId: 'b', kind: 'window', wallIndex: 0, t: 0.96 / 1.9, widthM: 0.56, heightM: 0.5, sillM: 1.5, exterior: true }] });
    const [box] = wcBoxes([toilet(1.4)], [wc(1.37)], catalog);
    expect(box.span.from).toBeCloseTo(0.97, 3);
    expect(box.span.to).toBeCloseTo(1.9, 3);
    // Where the WC would not stand clear out in front of that box, the box between the openings, as before.
    const [short] = wcBoxes([toilet(0.8)], [wc(1.37)], catalog);
    expect(short.span.from).toBeCloseTo(1.29, 3);
    expect(short.span.to).toBeCloseTo(1.9, 3);
  });

  it('is not one of the AI designer’s families', () => {
    expect(DECOR_FAMILY_LIST).toContain('box');
    expect(AI_DECOR_FAMILIES).not.toContain('box');
  });
});
