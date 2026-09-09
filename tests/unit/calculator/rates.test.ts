import { describe, expect, it } from 'vitest';
import { DEFAULT_RATE_BOOK, defaultRateRows, rateBookFromRows, type RateRow } from '@/lib/calculator/rates';
import { MATERIAL_RATES_PER_M2, WORKER_RATES } from '@/lib/calculator/constants';

function row(overrides: Partial<RateRow>): RateRow {
  return {
    id: 1,
    kind: 'material',
    key: 'k',
    labelKa: 'l',
    phase: 11,
    unit: 'm2',
    basis: 'floor',
    qtyPerM2: '1.0000',
    wasteFactorPct: '5.00',
    pricePerUnit: '12.50',
    linkedCategorySlug: null,
    sortOrder: 0,
    isActive: true,
    ...overrides,
  };
}

describe('rateBookFromRows', () => {
  it('falls back to the shipped defaults when the table is empty', () => {
    expect(rateBookFromRows([])).toBe(DEFAULT_RATE_BOOK);
  });

  it('turns decimal strings into numbers', () => {
    const book = rateBookFromRows([row({ key: 'lam' })]);
    expect(book.materials.lam.qtyPerM2).toBe(1);
    expect(book.materials.lam.wasteFactorPct).toBe(5);
    expect(book.materials.lam.estimatedPriceGEL).toBe(12.5);
  });

  it('ignores inactive rows entirely', () => {
    const book = rateBookFromRows([row({ key: 'on' }), row({ id: 2, key: 'off', isActive: false })]);
    expect(Object.keys(book.materials)).toEqual(['on']);
  });

  it('maps labour rows with their unit', () => {
    const book = rateBookFromRows([
      row({ kind: 'labour', key: 'doors', unit: 'unit', pricePerUnit: '150' }),
      row({ id: 2, kind: 'labour', key: 'tiling', unit: 'm2', pricePerUnit: '40' }),
    ]);
    expect(book.labour.doors).toEqual({ labelKa: 'l', unit: 'unit', price: 150 });
    expect(book.labour.tiling.unit).toBe('m2');
  });
});

describe('defaultRateRows', () => {
  it('round-trips the constants through rows back into an equivalent book', () => {
    const rows = defaultRateRows().map((r, i) => ({ ...r, id: i + 1 }));
    const book = rateBookFromRows(rows);
    expect(Object.keys(book.materials).sort()).toEqual(Object.keys(MATERIAL_RATES_PER_M2).sort());
    expect(Object.keys(book.labour).sort()).toEqual(Object.keys(WORKER_RATES).sort());
    for (const [key, rate] of Object.entries(MATERIAL_RATES_PER_M2)) {
      expect(book.materials[key].qtyPerM2).toBe(rate.qtyPerM2);
      expect(book.materials[key].phase).toBe(rate.phase);
    }
  });
});
