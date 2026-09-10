import { describe, expect, it } from 'vitest';
import { aggregateRoomTotals, computeRoomAreas } from '@/lib/calculator/materials';
import { categorySlugFromKey, suggestedQuantity } from '@/lib/calculator/quantities';

const totals = aggregateRoomTotals([
  computeRoomAreas({ id: 'a', type: 'living_room', nameKa: 'a', width: 5, length: 6, height: 2.7 }),
  computeRoomAreas({ id: 'b', type: 'bathroom', nameKa: 'b', width: 2, length: 2, height: 2.7 }),
]);

describe('suggestedQuantity', () => {
  it('puts floor tiles in the wet rooms and laminate everywhere else, both with 10 % waste', () => {
    expect(suggestedQuantity('floor-tiles', totals)).toBe(Math.round(4 * 1.1));
    expect(suggestedQuantity('laminate', totals)).toBe(Math.round(30 * 1.1));
  });

  it('falls back to the whole floor when the flat has no wet room', () => {
    const dry = aggregateRoomTotals([computeRoomAreas({ id: 'a', type: 'bedroom', nameKa: 'a', width: 4, length: 4, height: 2.7 })]);
    expect(suggestedQuantity('floor-tiles', dry)).toBe(Math.round(16 * 1.1));
    expect(suggestedQuantity('laminate', dry)).toBe(Math.round(16 * 1.1));
  });

  it('counts openings for doors and windows', () => {
    expect(suggestedQuantity('doors', totals)).toBe(2);
    expect(suggestedQuantity('windows', totals)).toBe(1);
  });

  it('never suggests zero', () => {
    const empty = aggregateRoomTotals([]);
    for (const slug of ['floor-tiles', 'laminate', 'wall-tiles', 'paint', 'doors', 'windows', 'sanitary', 'lighting', 'sockets-switches', 'anything']) {
      expect(suggestedQuantity(slug, empty)).toBeGreaterThanOrEqual(1);
    }
  });

  it('defaults to one for categories it does not know', () => {
    expect(suggestedQuantity('curtains', totals)).toBe(1);
  });
});

describe('categorySlugFromKey', () => {
  it('strips the calculator selection suffix', () => {
    expect(categorySlugFromKey('laminate_global')).toBe('laminate');
    expect(categorySlugFromKey('paint')).toBe('paint');
  });
});

describe('per-room selection keys', () => {
  it('round-trips the room through the key', async () => {
    const { roomIdFromKey, selectionKey } = await import('@/lib/calculator/quantities');
    expect(selectionKey('laminate')).toBe('laminate_global');
    expect(selectionKey('laminate', 'r1_x-y')).toBe('laminate_room:r1_x-y');
    expect(categorySlugFromKey('laminate_room:r1_x-y')).toBe('laminate');
    expect(roomIdFromKey('laminate_room:r1_x-y')).toBe('r1_x-y');
    expect(roomIdFromKey('laminate_global')).toBeNull();
  });

  it('quantifies a finish for one room from that room alone', async () => {
    const { suggestedQuantityForRoom } = await import('@/lib/calculator/quantities');
    const bathroom = computeRoomAreas({ id: 'b', type: 'bathroom', nameKa: 'b', width: 2, length: 2, height: 2.7 });
    expect(suggestedQuantityForRoom('floor-tiles', bathroom)).toBe(Math.round(4 * 1.1));
    expect(suggestedQuantityForRoom('wall-tiles', bathroom)).toBe(Math.round(bathroom.wallM2));
    expect(suggestedQuantityForRoom('paint', bathroom)).toBe(Math.round(bathroom.wallM2 * 0.16) || 1);
    expect(suggestedQuantityForRoom('doors', bathroom)).toBe(1);
  });
});
