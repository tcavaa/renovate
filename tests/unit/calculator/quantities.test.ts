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
