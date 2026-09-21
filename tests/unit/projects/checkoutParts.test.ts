import { describe, expect, it } from 'vitest';
import { calculatorCheckoutPart, designCheckoutPart } from '@/lib/projects/checkoutParts';
import type { Room, SelectedProduct } from '@/lib/calculator/types';
import type { DesignCost, FloorPlan } from '@/lib/design/types';

const room = (id: string, nameKa: string): Room => ({
  id,
  type: 'living_room',
  nameKa,
  width: 4,
  length: 3,
  height: 2.7,
  floorM2: 12,
  wallM2: 37.8,
  ceilingM2: 12,
  perimeterM: 14,
  isWetRoom: false,
});

const pick = (productId: number, extra: Partial<SelectedProduct> = {}): SelectedProduct => ({
  productId,
  nameKa: `პროდუქტი ${productId}`,
  pricePerUnit: 100,
  unit: 'piece',
  qty: 1,
  totalPrice: 100,
  imageUrl: null,
  ...extra,
});

describe('calculatorCheckoutPart', () => {
  const rooms = [room('r1', 'მისაღები'), room('r2', 'საძინებელი')];

  it('leaves out what was ticked off the order, and names the room of what stays', () => {
    const part = calculatorCheckoutPart(
      rooms,
      { floor_global: pick(1), tiles_room: pick(2, { roomId: 'r2', excluded: true }) },
      { r1: [pick(3), pick(4, { excluded: true })] },
      2,
      'ka'
    );
    expect(part.lines.map((l) => l.productId)).toEqual([1, 3]);
    expect(part.lines.map((l) => l.where)).toEqual([null, 'მისაღები']);
    expect(part.totalM2).toBe(24);
    expect(part.feePerM2).toBe(2);
  });

  it('keeps a per-room material line under its own room', () => {
    const part = calculatorCheckoutPart(rooms, { tiles_room: pick(9, { roomId: 'r2' }) }, {}, 2, 'ka');
    expect(part.lines).toHaveLength(1);
    expect(part.lines[0].where).toBe('საძინებელი');
  });
});

describe('designCheckoutPart', () => {
  const line = (extra: Partial<DesignCost['lines'][number]>): DesignCost['lines'][number] => ({ section: 'furniture', key: 'x', qty: 1, unit: 'piece', unitPrice: 100, total: 100, estimated: false, ...extra });
  const door = { productId: 21, nameKa: 'კარი', nameEn: 'Door', nameRu: null, slug: 'door', brand: null, pricePerUnit: 620, unit: 'piece', qty: 2, totalPrice: 1240, imageUrl: null, colorHex: null, textureUrl: null, model3dUrl: null, categorySlug: 'doors', store: null };
  const plan = { rooms: [{ id: 'r1', name: 'მისაღები', type: 'living_room', polygon: [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 5, z: 4 }, { x: 0, z: 4 }], heightM: 2.7, areaM2: 20, perimeterM: 18, openings: [] }], metresPerPixel: null, bounds: { width: 5, depth: 4 }, source: 'manual', wallThicknessM: 0.12 } as FloorPlan;

  it('lists the budget’s product lines that are still ticked, and nothing else on the sheet', () => {
    const cost = {
      lines: [
        line({ section: 'openings', key: 'product-21', tick: 'opening:21', qty: 2, unitPrice: 620, total: 1240, roomName: 'მისაღები, სამზარეულო', product: door }),
        line({ section: 'openings', key: 'product-22', tick: 'opening:22', excluded: true, product: { ...door, productId: 22 } }),
        line({ section: 'openings', key: 'window', estimated: true }),
        line({ section: 'labour', key: 'electrical_point', estimated: true }),
        line({ section: 'delivery', key: 'delivery-1' }),
      ],
    };
    const part = designCheckoutPart(plan, cost, 12, 'en')!;
    expect(part).toMatchObject({ kind: 'design', totalM2: 20, feePerM2: 12 });
    expect(part.lines).toEqual([{ key: 'opening:21', productId: 21, name: 'Door', qty: 2, unitPrice: 620, total: 1240, where: 'მისაღები, სამზარეულო' }]);
  });

  it('is nothing without a plan or a budget to read', () => {
    expect(designCheckoutPart(null, { lines: [] }, 12, 'ka')).toBeNull();
    expect(designCheckoutPart(plan, null, 12, 'ka')).toBeNull();
  });
});
