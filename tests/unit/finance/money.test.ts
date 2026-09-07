import { describe, expect, it } from 'vitest';
import {
  buildStoreOrders,
  calculatorLinesByStore,
  commissionFor,
  eachDay,
  effectiveCommissionPct,
  labourLines,
  orderTotals,
  periodRange,
  platformFee,
  sceneLinesByStore,
} from '@/lib/finance/money';
import type { SelectedProduct } from '@/lib/calculator/types';
import type { DesignScene, FloorPlan } from '@/lib/design/types';

const pick = (productId: number, price: number, qty = 1, extra: Partial<SelectedProduct> = {}): SelectedProduct => ({
  productId,
  nameKa: `პროდუქტი ${productId}`,
  pricePerUnit: price,
  unit: 'piece',
  qty,
  totalPrice: price * qty,
  imageUrl: null,
  ...extra,
});

describe('platform fee and commission', () => {
  it('charges per square metre and rounds to tetri', () => {
    expect(platformFee(72.35, 2)).toBe(144.7);
    expect(platformFee(72.35, 12.5)).toBeCloseTo(904.38, 1);
    expect(platformFee(0, 12)).toBe(0);
    expect(platformFee(-5, 12)).toBe(0);
  });

  it('takes a percentage of the subtotal', () => {
    expect(commissionFor(1000, 5)).toBe(50);
    expect(commissionFor(333.33, 7.5)).toBe(25);
    expect(commissionFor(0, 5)).toBe(0);
  });

  it("uses the partner's own rate when it has one and the default otherwise", () => {
    expect(effectiveCommissionPct('8.50', 5)).toBe(8.5);
    expect(effectiveCommissionPct(null, 5)).toBe(5);
    expect(effectiveCommissionPct('', 5)).toBe(5);
    expect(effectiveCommissionPct('abc', 5)).toBe(5);
    expect(effectiveCommissionPct(0, 5)).toBe(0);
  });

  it('leaves struck-out lines out of the totals', () => {
    const totals = orderTotals(
      [
        { qty: 2, unitPrice: '100.00' },
        { qty: '1', unitPrice: 50, removed: true },
        { qty: 3, unitPrice: 10 },
      ],
      5
    );
    expect(totals.subtotal).toBe(230);
    expect(totals.commissionAmount).toBe(11.5);
  });
});

describe('grouping a project into partner orders', () => {
  it('splits calculator picks by store and keeps the room on furniture', () => {
    const storeOf = (id: number) => ({ 1: 10, 2: 10, 3: 20 } as Record<number, number>)[id] ?? null;
    const result = calculatorLinesByStore(
      { laminate: pick(1, 40, 30, { unit: 'm2', categorySlug: 'laminate' }), paint: pick(9, 15, 4) },
      { r1: [pick(2, 900), pick(3, 1200)] },
      [{ id: 'r1', nameKa: 'მისაღები' }],
      storeOf
    );
    expect([...result.groups.keys()]).toEqual([10, 20]);
    const store10 = result.groups.get(10)!;
    expect(store10).toHaveLength(2);
    expect(store10[0].roomName).toBeNull();
    expect(store10[1].roomName).toBe('მისაღები');
    expect(store10[0].total).toBe(1200);
    expect(result.unassigned).toHaveLength(1);
    expect(result.unassigned[0].productId).toBe(9);
  });

  it('prices each store order with its own commission and delivery rule', () => {
    const groups = new Map([
      [10, [{ productId: 1, nameKa: 'a', nameEn: null, nameRu: null, categorySlug: null, roomName: null, unit: 'piece', qty: 1, unitPrice: 1500, total: 1500 }]],
      [20, [{ productId: 3, nameKa: 'b', nameEn: null, nameRu: null, categorySlug: null, roomName: null, unit: 'piece', qty: 2, unitPrice: 1200, total: 2400 }]],
    ]);
    const stores = new Map([
      [10, { id: 10, commissionRate: '8.00', deliveryFeeGel: '30.00' }],
      [20, { id: 20, commissionRate: null, deliveryFeeGel: '60.00' }],
    ]);
    const orders = buildStoreOrders(groups, stores, 5);
    expect(orders.map((o) => o.storeId)).toEqual([20, 10]);
    const big = orders[0];
    expect(big.subtotal).toBe(2400);
    expect(big.deliveryFee).toBe(0);
    expect(big.commissionPct).toBe(5);
    expect(big.commissionAmount).toBe(120);
    const small = orders[1];
    expect(small.deliveryFee).toBe(30);
    expect(small.commissionPct).toBe(8);
    expect(small.commissionAmount).toBe(120);
  });

  it('reads the store off a scene snapshot and names the room', () => {
    const plan = { rooms: [{ id: 'r1', name: 'საძინებელი' }] } as unknown as FloorPlan;
    const product = { productId: 5, nameKa: 'საწოლი', pricePerUnit: 2000, unit: 'piece', qty: 1, totalPrice: 2000, store: { id: 7 } };
    const scene = {
      items: [{ roomId: 'r1', product }, { roomId: 'r1', product: null }],
      finishes: [{ roomId: 'r1', product: { ...product, productId: 6, nameKa: 'ლამინატი', unit: 'm2', qty: 14.2, pricePerUnit: 45, store: null } }],
    } as unknown as DesignScene;
    const result = sceneLinesByStore(plan, scene, (id) => (id === 6 ? 9 : null));
    expect(result.groups.get(7)![0].roomName).toBe('საძინებელი');
    expect(result.groups.get(9)![0].total).toBe(639);
    expect(result.unassigned).toHaveLength(0);
  });

  it('turns the labour estimate into booking lines', () => {
    const lines = labourLines({
      workerCosts: [
        { key: 'tiling', labelKa: 'ფილის დაგება', qty: 12.5, qtyUnit: 'm2', pricePerQty: 40, totalGEL: 500 },
        { key: 'nothing', labelKa: '—', qty: 0, qtyUnit: 'unit', pricePerQty: 0, totalGEL: 0 },
      ],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].categorySlug).toBe('labour:tiling');
    expect(lines[0].total).toBe(500);
  });
});

describe('report periods', () => {
  const now = new Date(2026, 8, 8, 15, 30); // 8 September 2026

  it('covers whole days, exclusive at the end', () => {
    const today = periodRange('today', { now });
    expect(today.from).toEqual(new Date(2026, 8, 8));
    expect(today.to).toEqual(new Date(2026, 8, 9));
    expect(eachDay(periodRange('7d', { now }))).toHaveLength(7);
    expect(eachDay(periodRange('30d', { now }))).toHaveLength(30);
    expect(periodRange('month', { now }).from).toEqual(new Date(2026, 8, 1));
    expect(periodRange('year', { now }).to).toEqual(new Date(2027, 0, 1));
  });

  it('reads a custom window inclusively and falls back when it is nonsense', () => {
    const custom = periodRange('custom', { now, from: '2026-08-01', to: '2026-08-15' });
    expect(eachDay(custom)).toHaveLength(15);
    expect(eachDay(custom)[0]).toBe('2026-08-01');
    const open = periodRange('custom', { now, from: '2026-09-01' });
    expect(eachDay(open)).toHaveLength(8);
    const broken = periodRange('custom', { now, from: 'yesterday', to: '2026-13-40' });
    expect(eachDay(broken)).toHaveLength(30);
  });
});
