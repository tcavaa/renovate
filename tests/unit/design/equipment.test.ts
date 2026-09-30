import { describe, expect, it } from 'vitest';
import { clearOfOpenings, equipmentCandidates, equipmentProductKind, equipmentSignature, pointProductKind, withEquipmentProduct, withEquipmentProducts } from '@/lib/design/equipment';
import { COOKER_HOOD_ELEVATION_M, TECHNICAL_KINDS } from '@/lib/design/technical';
import { dressBoard } from '@/lib/design/boardPicks';
import { priceScene } from '@/lib/design/pricing';
import { tickFor } from '@/lib/design/ticks';
import { refreshRoom } from '@/lib/design/planGeometry';
import type { CatalogProduct } from '@/lib/design/matcher';
import type { DesignScene, FloorPlan, PlanRoom, SceneStore, TechnicalPoint, Vec2 } from '@/lib/design/types';

const P = (x: number, z: number): Vec2 => ({ x, z });
const rect = (id: string, x: number, z: number, w: number, d: number, type: PlanRoom['type']): PlanRoom =>
  refreshRoom({ id, type, name: id, polygon: [P(x, z), P(x + w, z), P(x + w, z + d), P(x, z + d)], heightM: 2.7, areaM2: 0, perimeterM: 0, openings: [] });

const sanPlus: SceneStore = { id: 8, nameKa: 'სან-პლუს სანტექნიკა', logoUrl: null, websiteUrl: null, phone: null, address: null, city: null, rating: null, deliveryDays: 3, deliveryFeeGel: 40 };

const product = (id: number, kind: string, price: number, extra: Partial<CatalogProduct> = {}): CatalogProduct =>
  ({ id, nameKa: `p${id}`, slug: `p${id}`, brand: null, categorySlug: 'engineering', pricePerUnit: price, unit: 'piece', imageUrl: null, colorHex: null, textureUrl: null, model3dKind: kind, model3dUrl: `/models/equipment/p${id}.glb`, widthCm: 80, depthCm: 25, heightCm: 30, styleTags: ['modern'], tags: [], isFeatured: false, specs: null, coveragePerUnit: null, store: sanPlus, ...extra }) as unknown as CatalogProduct;

function plan(points: TechnicalPoint[]): FloorPlan {
  return {
    rooms: [rect('living', 0, 0, 5, 4, 'living_room'), rect('kitchen', 5.12, 0, 3, 3, 'kitchen'), rect('bath', 5.12, 3.12, 2.5, 2, 'bathroom')],
    metresPerPixel: null,
    bounds: { width: 8.12, depth: 5.12 },
    source: 'manual',
    wallThicknessM: 0.12,
    technical: { points },
  };
}
const point = (id: string, kind: TechnicalPoint['kind'], roomId: string, position: Vec2, extra: Partial<TechnicalPoint> = {}): TechnicalPoint => ({ id, kind, roomId, position, elevationM: TECHNICAL_KINDS[kind].defaultElevationM, origin: 'user', ...extra });

describe('what a technical point is bought as', () => {
  it('makes an extractor a cooker hood in a kitchen and a fan anywhere else; pipes are no product', () => {
    expect(equipmentProductKind('extractor', 'kitchen')).toBe('cooker_hood');
    expect(equipmentProductKind('extractor', 'studio')).toBe('cooker_hood');
    expect(equipmentProductKind('extractor', 'bathroom')).toBe('bathroom_fan');
    expect(equipmentProductKind('boiler', 'kitchen')).toBe('boiler');
    expect(equipmentProductKind('floor_drain', 'bathroom')).toBe('floor_drain');
    expect(equipmentProductKind('water_supply', 'bathroom')).toBeNull();
    expect(equipmentProductKind('radiator', 'living_room')).toBeNull();
    const p = plan([point('e1', 'extractor', 'kitchen', P(6.5, 0.1)), point('e2', 'extractor', 'bath', P(6, 3.2))]);
    expect(p.technical!.points.map((x) => pointProductKind(p, x))).toEqual(['cooker_hood', 'bathroom_fan']);
  });

  it('offers the products of the kind that have a model: the style’s first, then the catalogue’s rank, then the cheapest', () => {
    const catalog = [
      product(1, 'boiler', 900, { styleTags: ['industrial'] }),
      product(2, 'boiler', 1400, { styleTags: ['modern'], specs: { rank: 2 } }),
      product(3, 'boiler', 1200, { styleTags: ['modern'], specs: { rank: 1 } }),
      product(4, 'boiler', 500, { model3dUrl: null }),
      product(5, 'ac_unit', 1000),
    ];
    expect(equipmentCandidates('boiler', catalog, 'modern').map((p) => p.id)).toEqual([3, 2, 1]);
    expect(equipmentCandidates('boiler', catalog, 'industrial').map((p) => p.id)).toEqual([1, 3, 2]);
  });

  it('sizes an air conditioner to its room: the smallest that cools it, else the biggest there is', () => {
    const catalog = [product(1, 'ac_unit', 1800, { specs: { coverM2: 35 } }), product(2, 'ac_unit', 1100, { specs: { coverM2: 20 } }), product(3, 'ac_unit', 1400, { specs: { coverM2: 25 } })];
    expect(equipmentCandidates('ac_unit', catalog, 'modern', { areaM2: 18 })[0].id).toBe(2);
    expect(equipmentCandidates('ac_unit', catalog, 'modern', { areaM2: 24 })[0].id).toBe(3);
    expect(equipmentCandidates('ac_unit', catalog, 'modern', { areaM2: 60 })[0].id).toBe(1);
  });
});

describe('equipment on the plan', () => {
  it('buys one piece per point, drawn at the product’s size, and brings a hood down to the hob', () => {
    const fan = withEquipmentProduct(point('e1', 'extractor', 'bath', P(6, 3.2)), product(7, 'bathroom_fan', 95, { widthCm: 15, depthCm: 10, heightCm: 15 }));
    expect(fan.product).toMatchObject({ productId: 7, qty: 1, totalPrice: 95 });
    expect(fan.sizeM).toEqual({ width: 0.15, depth: 0.1, height: 0.15 });
    expect(fan.elevationM).toBe(TECHNICAL_KINDS.extractor.defaultElevationM);

    const hood = withEquipmentProduct(point('e2', 'extractor', 'kitchen', P(6.5, 0.1)), product(8, 'cooker_hood', 480));
    expect(hood.elevationM).toBe(COOKER_HOOD_ELEVATION_M);
    // A height somebody set stays theirs.
    expect(withEquipmentProduct(point('e3', 'extractor', 'kitchen', P(6.5, 0.1), { elevationM: 1.7 }), product(8, 'cooker_hood', 480)).elevationM).toBe(1.7);

    const back = withEquipmentProduct(fan, null);
    expect(back.product).toBeUndefined();
    expect(back.sizeM).toBeUndefined();
  });

  it('gives every point the catalogue’s best, a moved extractor the kind its new room calls for, and leaves the plan alone otherwise', () => {
    const catalog = [product(1, 'boiler', 1200), product(2, 'cooker_hood', 480), product(3, 'bathroom_fan', 95), product(4, 'ac_unit', 1400, { specs: { coverM2: 25 } })];
    const bare = plan([point('b', 'boiler', 'kitchen', P(8, 1)), point('e', 'extractor', 'bath', P(6, 3.2)), point('a', 'ac_unit', 'living', P(2, 0.1)), point('w', 'water_supply', 'bath', P(5.3, 3.3))]);
    const equipped = withEquipmentProducts(bare, catalog, 'modern');
    expect(equipped.technical!.points.map((p) => p.product?.productId ?? null)).toEqual([1, 3, 4, null]);
    // Nothing more to do: the same plan comes back.
    expect(withEquipmentProducts(equipped, catalog, 'modern')).toBe(equipped);

    // The bathroom's fan, moved into the kitchen, becomes a hood.
    const moved = { ...equipped, technical: { points: equipped.technical!.points.map((p) => (p.id === 'e' ? { ...p, roomId: 'kitchen', position: P(6.5, 0.1) } : p)) } };
    expect(withEquipmentProducts(moved, catalog, 'modern').technical!.points.find((p) => p.id === 'e')!.product!.productId).toBe(2);

    // A product the catalogue no longer lists is kept — the save refuses it, not this.
    const gone = withEquipmentProducts(equipped, catalog.filter((p) => p.id !== 1), 'modern');
    expect(gone.technical!.points[0].product!.productId).toBe(1);
  });

  it('says when something the products depend on changed', () => {
    expect(equipmentSignature(plan([point('w', 'water_supply', 'bath', P(5.3, 3.3))]))).toBe('');
    const p = plan([point('e', 'extractor', 'bath', P(6, 3.2))]);
    const retyped = { ...p, rooms: p.rooms.map((r) => (r.id === 'bath' ? { ...r, type: 'kitchen' as const } : r)) };
    expect(equipmentSignature(p)).not.toBe('');
    expect(equipmentSignature(retyped)).not.toBe(equipmentSignature(p));
  });

  it('puts a product chosen for the whole flat on every point it is bought for', () => {
    const p = plan([point('b1', 'boiler', 'kitchen', P(8, 1)), point('e1', 'extractor', 'kitchen', P(6.5, 0.1)), point('e2', 'extractor', 'bath', P(6, 3.2))]);
    const dressed = dressBoard(p, [], [{ key: 'hood', product: product(2, 'cooker_hood', 480) }, { key: 'boiler', product: product(1, 'boiler', 1200) }]);
    expect(dressed.placed).toEqual({ hood: 1, boiler: 1 });
    expect(dressed.plan.technical!.points.map((x) => x.product?.productId ?? null)).toEqual([1, 2, null]);
  });
});

describe('hanging equipment on a wall', () => {
  const window = { id: 'w1', kind: 'window' as const, wallIndex: 2, t: 0.5, widthM: 1.2, heightM: 1.4, sillM: 0.9, roomId: 'k', exterior: true };
  const door = { id: 'd1', kind: 'door' as const, wallIndex: 2, t: 0.1, widthM: 0.8, heightM: 2.1, sillM: 0, roomId: 'k', exterior: false };
  const wall = { index: 2, length: 4 };

  it('keeps a piece where its point is when nothing is in the way', () => {
    expect(clearOfOpenings([window], wall, 3.4, 0.6, 1.55, 0.6)).toBe(3.4);
    // Another wall's window is no obstacle.
    expect(clearOfOpenings([{ ...window, wallIndex: 1 }], wall, 2, 0.6, 1.55, 0.6)).toBe(2);
    // A piece above the window head clears it.
    expect(clearOfOpenings([window], wall, 2, 0.8, 2.35, 0.28)).toBe(2);
  });

  it('slides a piece off a window to the nearest side, and off a door too', () => {
    // A 60 cm hood at the window's middle: the window spans 1.4–2.6 m, so the hood goes to 2.95 m (or 1.05 m).
    const moved = clearOfOpenings([window], wall, 2.1, 0.6, 1.55, 0.6);
    expect(moved).toBeCloseTo(2.95, 6);
    expect(clearOfOpenings([window], wall, 1.9, 0.6, 1.55, 0.6)).toBeCloseTo(1.05, 6);
    // With the door by the corner, only the far side of the window is clear.
    expect(clearOfOpenings([window, door], wall, 1.9, 0.6, 1.55, 0.6)).toBeCloseTo(2.95, 6);
  });

  it('leaves it where it is when the wall has no clear spot, and never past the wall’s ends', () => {
    const wide = { ...window, widthM: 3.8 };
    expect(clearOfOpenings([wide], wall, 2, 0.6, 1.55, 0.6)).toBe(2);
    expect(clearOfOpenings([], wall, 3.95, 0.6, 1.55, 0.6)).toBeCloseTo(3.68, 6);
  });
});

describe('equipment in the budget', () => {
  const scene: DesignScene = { styleId: 'modern', mode: 'design_only', budgetGel: null, items: [], finishes: [], electrical: [] };

  it('prices bought equipment as a real line of its shop, the same product folded, and no estimate beside it', () => {
    const ac = product(4, 'ac_unit', 1400);
    const p = plan([point('a1', 'ac_unit', 'living', P(2, 0.1)), point('a2', 'ac_unit', 'kitchen', P(6, 0.1)), point('p1', 'electrical_panel', 'living', P(0.1, 2))]);
    const equipped = { ...p, technical: { points: p.technical!.points.map((x) => (x.kind === 'ac_unit' ? withEquipmentProduct(x, ac) : x)) } };
    const cost = priceScene(equipped, scene);
    const line = cost.lines.find((l) => l.key === 'product-4')!;
    expect(line).toMatchObject({ section: 'climate', bucket: 'technical', qty: 2, unit: 'piece', unitPrice: 1400, total: 2800, estimated: false, tick: tickFor.equipment(4), item: 'კონდიციონერი' });
    expect(line.product?.store?.id).toBe(sanPlus.id);
    expect(cost.lines.some((l) => l.key === 'technical_ac_unit')).toBe(false);
    // Fitting them is still the installer's work, a unit a point.
    expect(cost.lines.find((l) => l.section === 'labour' && l.key === 'ac_install')!.qty).toBe(2);
    // The panel with no product stays the estimate.
    expect(cost.lines.find((l) => l.key === 'technical_electrical_panel')).toMatchObject({ qty: 1, estimated: true });
  });

  it('names an extractor’s line by what it was bought as', () => {
    const p = plan([point('e1', 'extractor', 'kitchen', P(6.5, 0.1)), point('e2', 'extractor', 'bath', P(6, 3.2))]);
    const equipped = withEquipmentProducts(p, [product(2, 'cooker_hood', 480), product(3, 'bathroom_fan', 95)], 'modern');
    const cost = priceScene(equipped, scene);
    expect(cost.lines.find((l) => l.key === 'product-2')!.item).toBe('სამზარეულოს გამწოვი');
    expect(cost.lines.find((l) => l.key === 'product-3')!.item).toBe('გამწოვი ვენტილატორი');
  });
});
