import { describe, expect, it } from 'vitest';
import { FREE_DELIVERY_THRESHOLD_GEL, priceScene } from '@/lib/design/pricing';
import { tickFor } from '@/lib/design/ticks';
import type { RateBook } from '@/lib/calculator/rates';
import { HOME_STATE_VALUES } from '@/lib/calculator/types';
import type { DesignScene, FloorPlan, PlacedItem, SceneProduct, SceneStore, SurfaceFinish } from '@/lib/design/types';

function rect(id: string, w: number, d: number, type: FloorPlan['rooms'][number]['type'] = 'living_room') {
  return {
    id,
    type,
    name: id,
    polygon: [
      { x: 0, z: 0 },
      { x: w, z: 0 },
      { x: w, z: d },
      { x: 0, z: d },
    ],
    heightM: 2.7,
    areaM2: w * d,
    perimeterM: 2 * (w + d),
    openings: [],
  };
}

const plan: FloorPlan = {
  rooms: [rect('living', 5, 4), rect('bath', 2, 2, 'bathroom')],
  metresPerPixel: null,
  bounds: { width: 5, depth: 4 },
  source: 'manual',
  wallThicknessM: 0.12,
};

const storeA: SceneStore = { id: 1, nameKa: 'A', logoUrl: null, websiteUrl: null, phone: null, address: null, city: null, rating: null, deliveryDays: 3, deliveryFeeGel: 40 };
const storeB: SceneStore = { ...storeA, id: 2, nameKa: 'B', deliveryFeeGel: null };

function product(id: number, price: number, store: SceneStore | null, qty = 1): SceneProduct {
  return {
    productId: id,
    nameKa: `p${id}`,
    slug: `p${id}`,
    brand: null,
    pricePerUnit: price,
    unit: 'piece',
    qty,
    totalPrice: price * qty,
    imageUrl: null,
    colorHex: null,
    textureUrl: null,
    model3dUrl: '/models/x.glb',
    categorySlug: 'sofas',
    store,
  };
}

function item(id: string, roomId: string, p: SceneProduct | null): PlacedItem {
  return {
    id,
    roomId,
    slot: 'sofa',
    kind: 'sofa_3seat',
    position: { x: 1, z: 1 },
    elevationM: 0,
    rotation: 0,
    size: { width: 2, depth: 0.9, height: 0.8 },
    product: p,
  };
}

function scene(items: PlacedItem[], mode: DesignScene['mode'] = 'design_only'): DesignScene {
  return { styleId: 'scandinavian', mode, budgetGel: null, items, finishes: [] };
}

describe('priceScene — furniture and delivery', () => {
  it('sums furniture, groups baskets per store and charges delivery once per store', () => {
    const cost = priceScene(
      plan,
      scene([
        item('i1', 'living', product(1, 900, storeA)),
        item('i2', 'living', product(2, 300, storeA)),
        item('i3', 'bath', product(3, 100, storeB)),
        item('i4', 'bath', null),
      ])
    );
    expect(cost.furnitureTotal).toBe(1300);
    expect(cost.baskets).toHaveLength(2);
    const a = cost.baskets.find((b) => b.store?.id === 1)!;
    expect(a.subtotal).toBe(1200);
    expect(a.deliveryFee).toBe(40);
    const b = cost.baskets.find((bk) => bk.store?.id === 2)!;
    expect(b.deliveryFee).toBe(50); // the default when a store has no fee configured
    expect(cost.deliveryTotal).toBe(90);
    expect(cost.grandTotal).toBe(1390);
  });

  it('waives delivery above the free-delivery threshold and for products without a store', () => {
    const cost = priceScene(
      plan,
      scene([item('i1', 'living', product(1, FREE_DELIVERY_THRESHOLD_GEL, storeA)), item('i2', 'living', product(2, 10, null))])
    );
    expect(cost.deliveryTotal).toBe(0);
    expect(cost.baskets.find((b) => b.store === null)?.deliveryFee).toBe(0);
  });

  it('reports a per-room total for every room in the plan, including empty ones', () => {
    const cost = priceScene(plan, scene([item('i1', 'living', product(1, 250, storeA))]));
    expect(cost.perRoom).toEqual([
      { roomId: 'living', roomName: 'living', total: 250 },
      { roomId: 'bath', roomName: 'bath', total: 0 },
    ]);
  });

  it('adds nothing for renovation work in design-only mode', () => {
    const cost = priceScene(plan, scene([]));
    expect(cost.materialsTotal).toBe(0);
    expect(cost.labourTotal).toBe(0);
    expect(cost.grandTotal).toBe(0);
  });
});

describe('priceScene — full mode', () => {
  const book: RateBook = {
    materials: {
      lam: { labelKa: 'l', qtyPerM2: 1, unit: 'm2', wasteFactorPct: 0, phase: 11, basis: 'floor', estimatedPriceGEL: 10 },
    },
    labour: { debris_new: { labelKa: 'f', unit: 'm2', price: 5 } },
  };

  it('prices materials and labour with the rate book it is given', () => {
    const cost = priceScene(plan, scene([], 'full'), { homeState: 'white_frame', book });
    // floor area is 20 + 4 = 24 m²
    expect(cost.materialsTotal).toBe(240);
    expect(cost.labourTotal).toBe(120);
    expect(cost.grandTotal).toBe(360);
  });

  it('falls back to the shipped defaults without a book', () => {
    const cost = priceScene(plan, scene([], 'full'), { homeState: 'white_frame' });
    expect(cost.materialsTotal).toBeGreaterThan(0);
    expect(cost.labourTotal).toBeGreaterThan(0);
  });
});

describe('priceScene — finishes', () => {
  it('prices chosen finishes, labels them in the caller’s language and leaves defaults free', () => {
    const chosen = product(9, 7, storeA, 20); // 20 m² at 7 GEL
    const cost = priceScene(
      plan,
      {
        ...scene([]),
        finishes: [
          { roomId: 'living', surface: 'floor', colorHex: '#fff', textureUrl: null, textureScaleM: 1, product: chosen },
          { roomId: 'bath', surface: 'wall', colorHex: '#fff', textureUrl: null, textureScaleM: 1, product: null },
        ],
      },
      { surfaceLabels: { floor: 'Floor covering', wall: 'Wall covering', ceiling: 'Ceiling' } }
    );
    expect(cost.finishesTotal).toBe(140);
    expect(cost.baskets[0].lines[0].item).toBe('Floor covering');
    expect(cost.perRoom[0].total).toBe(140);
  });
});

describe('priceScene — the floors and walls the flat is shown in', () => {
  // What generation lays: the style's own laminate in the living room and its tiles on the
  // bathroom's walls — products, marked as the style's (`styleFinish`).
  const laid = (roomId: string, surface: 'floor' | 'wall', p: SceneProduct, origin: SurfaceFinish['origin'] = 'style'): SurfaceFinish => ({ roomId, surface, colorHex: '#fff', textureUrl: '/t.jpg', textureScaleM: 1, product: { ...p, unit: 'm2' }, origin });
  const laminate = laid('living', 'floor', product(11, 25, storeA, 20));
  const tiles = laid('bath', 'wall', product(12, 40, storeB, 21.6));
  const finishLines = (cost: ReturnType<typeof priceScene>) => cost.lines.filter((l) => l.section === 'finishes').map((l) => [l.product?.productId, l.qty, l.total]);

  it('buys the style’s own in a renovation, whatever condition the home is in', () => {
    for (const homeState of HOME_STATE_VALUES) {
      const cost = priceScene(plan, { ...scene([], 'full'), finishes: [laminate, tiles] }, { homeState });
      expect(finishLines(cost)).toEqual([
        [12, 21.6, 864],
        [11, 20, 500],
      ]);
      expect(cost.finishesTotal).toBe(1364);
      expect(cost.baskets.map((b) => b.store?.id).sort()).toEqual([1, 2]);
    }
  });

  it('buys them in a design-only project too, and not a line ticked off on the summary', () => {
    const chosen = laid('bath', 'floor', product(13, 30, storeA, 4), 'studio');
    const designOnly: DesignScene = { ...scene([]), finishes: [laminate, tiles, chosen] };
    expect(finishLines(priceScene(plan, designOnly))).toEqual([
      [12, 21.6, 864],
      [11, 20, 500],
      [13, 4, 120],
    ]);
    // The person keeps the living room's floor: its line is ticked off, and nobody is sent it.
    const kept = priceScene(plan, { ...designOnly, excluded: [tickFor.finish(11)] });
    expect(kept.finishesTotal).toBe(984);
    expect(kept.baskets.flatMap((b) => b.lines.map((l) => l.product.productId)).sort()).toEqual([12, 13]);
  });

  it('leaves out a surface the flat already has', () => {
    const withFloors: FloorPlan = { ...plan, technical: { points: [], existing: ['floor'] } };
    const cost = priceScene(withFloors, { ...scene([], 'full'), finishes: [laminate, tiles] }, { homeState: 'old_renovation' });
    expect(finishLines(cost)).toEqual([[12, 21.6, 864]]);
  });
});
