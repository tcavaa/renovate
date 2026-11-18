import { describe, expect, it } from 'vitest';
import { matchProducts, type CatalogProduct } from '@/lib/design/matcher';
import { applyFurniturePicks } from '@/lib/design/fromCalculator';
import { isPlacementValid, snapPlacement } from '@/lib/design/manipulate';
import { tightSpots } from '@/lib/design/clearance';
import { reviewFindings } from '@/lib/design/aiReview';
import { ruleViolations } from '@/lib/design/ruleChecks';
import { refreshRoom } from '@/lib/design/planGeometry';
import type { FloorPlan, Opening, PlacedItem, PlanRoom, TechnicalPoint } from '@/lib/design/types';

/**
 * A shower's floor is its tray and glass (`floorTaken`, docs/design-studio/generation-audit.md O2),
 * not the 50 cm column standing at its back — for the matcher's fit test, the studio's drag test,
 * the tight passages, the AI check's findings and the boiler's clearance alike.
 */

function product(id: number, kind: string, widthCm: number, depthCm: number, heightCm: number): CatalogProduct {
  return { id, nameKa: `p${id}`, slug: `p${id}`, brand: null, categorySlug: kind, pricePerUnit: 1000 + id, unit: 'piece', imageUrl: null, colorHex: null, textureUrl: null, model3dKind: kind, model3dUrl: `/models/p${id}.glb`, widthCm, depthCm, heightCm, styleTags: ['modern'], tags: [], isFeatured: false, specs: null, coveragePerUnit: null, store: null };
}

/** A bathroom 3 × 2.4 m with its corner at the origin: wall 0 runs along z = 0 and faces +z. */
const bathroom = (openings: Opening[] = []): PlanRoom =>
  refreshRoom({ id: 'b', type: 'bathroom', name: 'b', polygon: [{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: 3, z: 2.4 }, { x: 0, z: 2.4 }], heightM: 2.8, areaM2: 0, perimeterM: 0, openings });

/** A shower column 25 × 15 cm on wall 0 at x 0.45, its tray 0.9 × 0.9 in the corner (x 0–0.9, z 0–0.9). */
const shower = (patch: Partial<PlacedItem> = {}): PlacedItem => ({
  id: 'shower',
  roomId: 'b',
  slot: 'shower',
  kind: 'shower',
  position: { x: 0.45, z: 0.075 },
  rotation: 0,
  elevationM: 0,
  size: { width: 0.25, depth: 0.15, height: 2.1 },
  areaM: { width: 0.9, depth: 0.9 },
  product: { productId: 9, nameKa: 'p9', nameEn: null, nameRu: null, slug: 'p9', brand: null, pricePerUnit: 1, unit: 'piece', qty: 1, totalPrice: 1, imageUrl: null, colorHex: null, textureUrl: null, model3dUrl: '/models/p9.glb', categorySlug: 'shower', store: null },
  pinned: true,
  ...patch,
});

const piece = (id: string, kind: string, slot: PlacedItem['slot'], x: number, z: number, size: [number, number, number], rotation = 0): PlacedItem => ({
  id,
  roomId: 'b',
  slot,
  kind,
  position: { x, z },
  rotation,
  elevationM: 0,
  size: { width: size[0], depth: size[1], height: size[2] },
  product: null,
});

describe('the matcher', () => {
  // A WC's slot on wall 0 beside the shower; the WC picked for it is 1.2 m wide and reaches 10 cm
  // into the tray (x 0.8), well clear of the column (x 0.325–0.575).
  const wc = piece('wc', 'toilet', 'toilet', 1.4, 0.34, [0.4, 0.68, 0.82]);
  const wide = product(1, 'toilet', 120, 68, 82);
  const narrow = product(2, 'toilet', 50, 68, 82);

  it('keeps a product out of a shower\'s tray where one does', () => {
    const [, placed] = matchProducts([shower(), wc], [wide, narrow], { styleId: 'modern', rooms: [bathroom()], picks: { 'toilet|b': 1 } });
    expect(placed.product?.productId).toBe(2);
  });

  it('keeps out of the tray of a shower matched after it', () => {
    const slotFirst = shower({ pinned: false, product: null, size: { width: 0.9, depth: 0.9, height: 2.05 }, position: { x: 0.45, z: 0.45 } });
    const [placed] = matchProducts([wc, slotFirst], [wide, narrow, product(3, 'shower', 25, 15, 210)], { styleId: 'modern', rooms: [bathroom()], picks: { 'toilet|b': 1 } });
    expect(placed.product?.productId).toBe(2);
  });

  it('keeps a WC out of the tray once its cistern\'s box stands it further out', () => {
    // A bathroom 1.7 m wide: the tray in the corner reaches x 0.9; a WC on the wall across (x 1.7)
    // facing it. The 65 cm WC stands clear of the tray — until the box behind it (20 cm) stands it
    // 5 cm into the tray; a 50 cm one stays clear with its box.
    const narrowRoom = refreshRoom({ id: 'b', type: 'bathroom', name: 'b', polygon: [{ x: 0, z: 0 }, { x: 1.7, z: 0 }, { x: 1.7, z: 2.4 }, { x: 0, z: 2.4 }], heightM: 2.8, areaM2: 0, perimeterM: 0, openings: [] });
    const across = { ...piece('wc', 'toilet', 'toilet', 1.7 - 0.34, 0.6, [0.4, 0.68, 0.82]), rotation: -Math.PI / 2 };
    const deep = product(4, 'toilet', 40, 65, 82);
    const shallow = product(5, 'toilet', 40, 50, 82);
    const [, placed] = matchProducts([shower(), across], [deep, shallow], { styleId: 'modern', rooms: [narrowRoom], picks: { 'toilet|b': 4 } });
    expect(placed.product?.productId).toBe(5);
    const [, kept] = matchProducts([shower(), across], [deep], { styleId: 'modern', rooms: [narrowRoom] });
    expect(kept.product?.productId).toBe(4);
  });

  it('never costs the room its piece: with none that keeps out, the one it would have had', () => {
    const [, placed] = matchProducts([shower(), wc], [wide], { styleId: 'modern', rooms: [bathroom()] });
    expect(placed.product?.productId).toBe(1);
  });

  it('with none that keeps out of the tray, still keeps clear what the layout kept clear, as before', () => {
    // A 1.2 m WC 60 cm deep in the 68 cm slot: it reaches the tray wherever it stands. Flush to the
    // wall (where it belongs) it would stand on a strip kept clear along the wall; where the slot
    // was, 4 cm off the wall, it does not — the matcher's careful pass of old, before its careless one.
    const shallowWide = product(6, 'toilet', 120, 60, 82);
    const strip = { minX: 1, maxX: 1.8, minZ: 0, maxZ: 0.03 };
    const [, placed] = matchProducts([shower(), wc], [shallowWide], { styleId: 'modern', rooms: [bathroom()], keepClear: { b: [strip] } });
    expect(placed.product?.productId).toBe(6);
    expect(placed.position.z).toBeCloseTo(0.34, 6);
    const [, careless] = matchProducts([shower(), wc], [shallowWide], { styleId: 'modern', rooms: [bathroom()] });
    expect(careless.position.z).toBeCloseTo(0.3, 6);
  });
});

describe('a calculator pick', () => {
  it('is fitted as before: a WC clear of the shower\'s column stands where it belongs, its box not measured', () => {
    // A bathroom 1.7 m wide, the tray in the corner to x 0.9, the WC's slot on the wall across: the
    // 65 cm WC picked in the calculator stands flush to its wall (x 1.375) as it always did.
    const narrowRoom = refreshRoom({ id: 'b', type: 'bathroom', name: 'b', polygon: [{ x: 0, z: 0 }, { x: 1.7, z: 0 }, { x: 1.7, z: 2.4 }, { x: 0, z: 2.4 }], heightM: 2.8, areaM2: 0, perimeterM: 0, openings: [] });
    const plan: FloorPlan = { rooms: [narrowRoom], metresPerPixel: null, bounds: { width: 1.7, depth: 2.4 }, source: 'manual', imageUrl: null, wallThicknessM: 0.12, wallHeightM: 2.8, walls: [] };
    const across = { ...piece('wc', 'toilet', 'toilet', 1.7 - 0.34, 0.6, [0.4, 0.68, 0.82]), rotation: -Math.PI / 2 };
    const [, picked] = applyFurniturePicks([shower(), across], plan, { furniture: [], productIds: [4] }, [product(4, 'toilet', 40, 65, 82)]);
    expect(picked.product?.productId).toBe(4);
    expect(picked.position.x).toBeCloseTo(1.375, 6);
  });
});

describe('the studio\'s drag test', () => {
  it('refuses a piece set down in the tray, clear of the column', () => {
    const stool = piece('stool', 'stool', 'stool', 0.6, 0.6, [0.35, 0.35, 0.45]);
    expect(isPlacementValid(bathroom(), stool, [shower()])).toBe(false);
    expect(isPlacementValid(bathroom(), { ...stool, position: { x: 1.4, z: 0.6 } }, [shower()])).toBe(true);
    expect(snapPlacement(bathroom(), stool, { position: stool.position, rotation: 0 }, [shower()]).valid).toBe(false);
  });

  it('refuses a shower dragged so its tray stands on a piece', () => {
    const cabinet = piece('cab', 'washer', 'washer', 1.0, 0.6, [0.3, 0.3, 0.9]);
    expect(isPlacementValid(bathroom(), shower(), [cabinet])).toBe(false);
  });
});

describe('tight passages', () => {
  it('measure a door\'s way to the tray', () => {
    // A door on wall 1 (x = 3) is far; one on wall 3 (x = 0) at z 1.2: its inside point is 45 cm in,
    // 30 cm past the tray's edge (z 0.9) — the column is a metre off.
    const room = bathroom([{ id: 'd', roomId: 'b', kind: 'door', wallIndex: 3, t: 0.5, widthM: 0.7, heightM: 2, sillM: 0, exterior: false }]);
    const big = shower({ areaM: { width: 0.9, depth: 1.2 } });
    expect(tightSpots(room, [big]).map((s) => s.against)).toContain('door');
  });
});

describe('the AI check\'s findings', () => {
  it('see a piece standing in the tray', () => {
    const room = bathroom();
    const plan: FloorPlan = { rooms: [room], metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', imageUrl: null, wallThicknessM: 0.12, wallHeightM: 2.8, walls: [] };
    const stool = { ...piece('stool', 'stool', 'stool', 0.6, 0.6, [0.35, 0.35, 0.45]), product: shower().product };
    expect(reviewFindings(plan, [shower(), stool]).get('stool')?.some((t) => t.includes('overlaps the shower'))).toBe(true);
  });
});

describe('the boiler\'s clearance', () => {
  it('is measured from the tray', () => {
    const room = bathroom();
    // 50 cm past the tray's front (z 0.9), 1.3 m from the column: by the shower all the same.
    const boiler: TechnicalPoint = { id: 'boiler', kind: 'boiler', roomId: 'b', position: { x: 0.45, z: 1.4 }, origin: 'generated' };
    const plan: FloorPlan = { rooms: [room], metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', imageUrl: null, wallThicknessM: 0.12, wallHeightM: 2.8, walls: [], technical: { points: [boiler] } };
    expect(ruleViolations(plan, [shower()]).map((v) => v.code)).toContain('boiler_by_bath');
  });
});
