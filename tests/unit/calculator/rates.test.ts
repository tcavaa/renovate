import { describe, expect, it } from 'vitest';
import { DEFAULT_RATE_BOOK, defaultRateRows, rateBookFromRows, ratesForAdmin, type RateRow } from '@/lib/calculator/rates';
import { MATERIAL_RATES_PER_M2, RETIRED_RATE_KEYS, WORKER_RATES } from '@/lib/calculator/constants';

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
    expect(book.materials.on).toBeDefined();
    expect(book.materials.off).toBeUndefined();
  });

  it('prices a default the table has never heard of at its shipped rate', () => {
    // A database seeded before the strip-out lines existed: every other key, none of phase 0.
    const seededBefore = defaultRateRows()
      .filter((r) => r.phase !== 0)
      .map((r, i) => ({ ...r, id: i + 1 }));
    const book = rateBookFromRows(seededBefore);
    expect(book.labour.demolish_floor).toEqual(DEFAULT_RATE_BOOK.labour.demolish_floor);
    expect(book.labour.debris_old).toEqual({ labelKa: WORKER_RATES.debris_old.labelKa, unit: 'm2', price: 40 });
  });

  it('lets a row override its default, and keeps a switched-off default switched off', () => {
    const book = rateBookFromRows([
      row({ kind: 'labour', key: 'demolish_floor', phase: 0, unit: 'm2', pricePerUnit: '9.50' }),
      row({ id: 2, kind: 'labour', key: 'debris_old', phase: 0, unit: 'm2', isActive: false }),
      row({ id: 3, key: 'wall_putty', phase: 6, unit: 'm2', isActive: false }),
    ]);
    expect(book.labour.demolish_floor.price).toBe(9.5);
    expect(book.labour.debris_old).toBeUndefined();
    expect(book.materials.wall_putty).toBeUndefined();
    // Absent from the table altogether, so still the default.
    expect(book.labour.demolish_walls).toEqual(DEFAULT_RATE_BOOK.labour.demolish_walls);
    expect(book.materials.plaster_mix.estimatedPriceGEL).toBe(MATERIAL_RATES_PER_M2.plaster_mix.estimatedPriceGEL);
  });

  it('never reads a row of the retired book, whatever it says', () => {
    // A database seeded with the book before the renovation team's: its rows are all still there.
    const old = [
      row({ kind: 'labour', key: 'plastering', phase: 7, unit: 'm2', pricePerUnit: '18' }),
      row({ id: 2, kind: 'labour', key: 'electrical_point', phase: 14, unit: 'unit', pricePerUnit: '25' }),
      row({ id: 3, key: 'gas_block', phase: 1, unit: 'm3', basis: 'floor', pricePerUnit: '320' }),
      row({ id: 4, key: 'cement', phase: 6, unit: 'kg', basis: 'floor', pricePerUnit: '0.65' }),
    ];
    const book = rateBookFromRows(old);
    expect(book).toBe(DEFAULT_RATE_BOOK);
    for (const key of RETIRED_RATE_KEYS) {
      expect(book.labour[key]).toBeUndefined();
      expect(book.materials[key]).toBeUndefined();
    }
    // …and alongside rows of today's book, they are ignored just the same.
    const mixed = rateBookFromRows([...old, row({ id: 5, kind: 'labour', key: 'paint_walls', phase: 6, unit: 'm2', pricePerUnit: '36' })]);
    expect(mixed.labour.paint_walls.price).toBe(36);
    expect(mixed.labour.plastering).toBeUndefined();
    expect(mixed.materials.gas_block).toBeUndefined();
  });

  it('shares no key between the retired book and today’s', () => {
    for (const key of [...Object.keys(WORKER_RATES), ...Object.keys(MATERIAL_RATES_PER_M2)]) expect(RETIRED_RATE_KEYS).not.toContain(key);
  });

  it('keeps the merged book in phase order, so the strip-out leads the ledger', () => {
    const seededBefore = defaultRateRows()
      .filter((r) => r.phase !== 0)
      .map((r, i) => ({ ...r, id: i + 1 }));
    const labour = Object.keys(rateBookFromRows(seededBefore).labour);
    expect(labour.slice(0, 4)).toEqual(['demolish_floor', 'demolish_walls', 'demolish_tiles', 'debris_old']);
    expect(Object.keys(rateBookFromRows(seededBefore).materials)).toHaveLength(Object.keys(MATERIAL_RATES_PER_M2).length);
  });

  it('maps labour rows with their unit', () => {
    const book = rateBookFromRows([
      row({ kind: 'labour', key: 'door_install', unit: 'unit', pricePerUnit: '150' }),
      row({ id: 2, kind: 'labour', key: 'bath_tiling', unit: 'm2', pricePerUnit: '40' }),
    ]);
    expect(book.labour.door_install).toEqual({ labelKa: 'l', unit: 'unit', price: 150 });
    expect(book.labour.bath_tiling.unit).toBe('m2');
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

describe('ratesForAdmin', () => {
  it('lists every rate the estimate uses: the table’s rows, then the defaults it has no row for, never a retired one', () => {
    const table = [
      row({ id: 7, kind: 'labour', key: 'paint_walls', phase: 6, unit: 'm2', pricePerUnit: '36' }),
      row({ id: 8, kind: 'labour', key: 'plastering', phase: 7, unit: 'm2', pricePerUnit: '18' }),
    ];
    const listed = ratesForAdmin(table);
    // The table's own row, as it is.
    expect(listed.find((r) => r.key === 'paint_walls')).toMatchObject({ id: 7, pricePerUnit: '36' });
    // A retired row is not offered.
    expect(listed.some((r) => r.key === 'plastering')).toBe(false);
    // Every other rate of the book is there, as a default to be created on save.
    const defaults = listed.filter((r) => r.id < 0);
    expect(defaults).toHaveLength(defaultRateRows().length - 1);
    expect(defaults.find((r) => r.key === 'door_install')).toMatchObject({ kind: 'labour', pricePerUnit: 150, isActive: true });
    expect(new Set(listed.map((r) => r.id)).size).toBe(listed.length);
    // In phase order, the strip-out first.
    expect(listed[0].phase).toBe(0);
    // And the book the engine reads from the table is the one admin sees.
    const book = rateBookFromRows(table);
    for (const rate of listed) expect(rate.kind === 'labour' ? book.labour[rate.key] : book.materials[rate.key]).toBeDefined();
  });
});
