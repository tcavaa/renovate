import { describe, expect, it } from 'vitest';
import { calculatorCheckoutPart } from '@/lib/projects/checkoutParts';
import type { Room, SelectedProduct } from '@/lib/calculator/types';

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
