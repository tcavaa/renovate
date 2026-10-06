import { describe, expect, it } from 'vitest';
import { calculatorCheckoutPart, designCheckoutPart } from '@/lib/projects/checkoutParts';
import type { Room, SelectedProduct } from '@/lib/calculator/types';
import type { CalculationInput } from '@/lib/summary/calculatorSheet';
import { planFromCalculatorRooms } from '@/lib/design/planGeometry';
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
  const input = (selectedProducts: Record<string, SelectedProduct>, selectedFurniture: Record<string, SelectedProduct[]>, extra: Partial<CalculationInput> = {}): CalculationInput => ({ rooms, homeState: 'white_frame', picks: { selectedProducts, selectedFurniture }, board: null, electrical: [], ...extra });

  it('lists the priced calculation’s product lines still ticked, and names the room of each', () => {
    const part = calculatorCheckoutPart(
      input({ sanitary_global: pick(1, { categorySlug: 'sanitary' }), 'laminate_room:r2': pick(2, { roomId: 'r2', surface: 'floor', unit: 'm2', categorySlug: 'laminate' }) }, { r1: [pick(3), pick(4)] }, { edits: { excluded: ['furniture:r1:4:0'] } }),
      'ka'
    );
    expect(part.lines.map((l) => l.productId).sort()).toEqual([1, 2, 3]);
    expect(part.lines.find((l) => l.productId === 3)?.where).toBe('მისაღები');
    expect(part.lines.find((l) => l.productId === 2)?.where).toBe('საძინებელი');
  });

  it('puts the furniture under furniture and every other product under the building materials', () => {
    const part = calculatorCheckoutPart(
      input({ sanitary_global: pick(1, { categorySlug: 'sanitary' }), 'laminate_room:r2': pick(2, { roomId: 'r2', surface: 'floor', unit: 'm2', categorySlug: 'laminate' }) }, { r1: [pick(3)] }),
      'ka'
    );
    expect(part.lines.filter((l) => l.furniture).map((l) => l.productId)).toEqual([3]);
    expect(part.lines.filter((l) => !l.furniture).map((l) => l.productId).sort()).toEqual([1, 2]);
  });

  it('lists what the summary left in the order: a line ticked off is out, a changed quantity is the quantity', () => {
    const part = calculatorCheckoutPart(input({ sanitary_global: pick(1, { categorySlug: 'sanitary' }) }, { r1: [pick(3), pick(3)] }, { edits: { excluded: ['furniture:r1:3:1'], quantities: { 'pick:sanitary_global': 3 } } }), 'ka');
    expect(part.lines.map((l) => [l.productId, l.qty, l.total])).toEqual([
      [1, 3, 300],
      [3, 1, 100],
    ]);
  });

  it('orders the doors on the board in the door picked for the whole flat — one door for its two halves', () => {
    const board = planFromCalculatorRooms([{ ...rooms[0], x: 0, z: 0 }, { ...rooms[1], x: 4, z: 0 }]);
    const part = calculatorCheckoutPart(input({ doors_global: pick(21, { categorySlug: 'doors', model3dKind: 'door' }) }, {}, { board }), 'ka');
    const doors = board.rooms.reduce((n, r) => n + r.openings.filter((o) => o.kind === 'door' && !o.exterior && (!o.connectsToRoomId || r.id < o.connectsToRoomId)).length, 0);
    expect(doors).toBeGreaterThan(0);
    expect(part.lines.find((l) => l.productId === 21)?.qty).toBe(doors);
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
    const part = designCheckoutPart(plan, cost, 'en')!;
    expect(part.kind).toBe('design');
    expect(part.lines).toEqual([{ key: 'opening:21', productId: 21, name: 'Door', qty: 2, unitPrice: 620, total: 1240, where: 'მისაღები, სამზარეულო', furniture: false }]);
  });

  it('is nothing without a plan or a budget to read', () => {
    expect(designCheckoutPart(null, { lines: [] }, 'ka')).toBeNull();
    expect(designCheckoutPart(plan, null, 'ka')).toBeNull();
  });
});
