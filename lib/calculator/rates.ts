/**
 * The rate book: everything the estimate multiplies room areas by.
 *
 * `lib/calculator/constants.ts` holds the defaults the app shipped with. The `rates` table
 * holds what admin has since changed. This module turns either into one `RateBook` the
 * engine reads, so the calculator never depends on the database being seeded — an empty
 * table means the defaults, and a row overrides its key. Isomorphic: no database access here.
 */

import { MATERIAL_RATES_PER_M2, WORKER_RATES, type MaterialRate } from './constants';

export interface LabourRate {
  labelKa: string;
  unit: 'm2' | 'unit';
  /** GEL per m² or per unit, depending on `unit`. */
  price: number;
}

export interface RateBook {
  materials: Record<string, MaterialRate>;
  labour: Record<string, LabourRate>;
}

/** The shape a `rates` row takes once it has crossed the API (decimals arrive as strings). */
export interface RateRow {
  id: number;
  kind: 'material' | 'labour';
  key: string;
  labelKa: string;
  phase: number;
  unit: string;
  basis: string | null;
  qtyPerM2: string | number | null;
  wasteFactorPct: string | number | null;
  pricePerUnit: string | number;
  linkedCategorySlug: string | null;
  sortOrder: number;
  isActive: boolean;
}

export const DEFAULT_RATE_BOOK: RateBook = {
  materials: MATERIAL_RATES_PER_M2,
  labour: Object.fromEntries(
    Object.entries(WORKER_RATES).map(([key, rate]) => [
      key,
      {
        labelKa: rate.labelKa,
        unit: rate.unit,
        price: 'pricePerM2' in rate ? rate.pricePerM2 : rate.pricePerUnit,
      } satisfies LabourRate,
    ])
  ),
};

/** The default book as rows, for seeding the table and for showing admin what a reset means. */
export function defaultRateRows(): Array<Omit<RateRow, 'id'>> {
  const materials = Object.entries(MATERIAL_RATES_PER_M2).map(([key, rate], i) => ({
    kind: 'material' as const,
    key,
    labelKa: rate.labelKa,
    phase: rate.phase,
    unit: rate.unit,
    basis: rate.basis,
    qtyPerM2: rate.qtyPerM2,
    wasteFactorPct: rate.wasteFactorPct,
    pricePerUnit: rate.estimatedPriceGEL ?? 0,
    linkedCategorySlug: rate.linkedCategorySlug ?? null,
    sortOrder: i,
    isActive: true,
  }));
  const labour = Object.entries(DEFAULT_RATE_BOOK.labour).map(([key, rate], i) => ({
    kind: 'labour' as const,
    key,
    labelKa: rate.labelKa,
    phase: LABOUR_PHASE[key] ?? 0,
    unit: rate.unit,
    basis: null,
    qtyPerM2: null,
    wasteFactorPct: null,
    pricePerUnit: rate.price,
    linkedCategorySlug: null,
    sortOrder: 100 + i,
    isActive: true,
  }));
  return [...materials, ...labour];
}

/** Which renovation phase each labour line belongs to — mirrors `calculateWorkerCosts`. */
export const LABOUR_PHASE: Record<string, number> = {
  demolition: 1,
  plumbing_rough: 2,
  electrical_rough: 3,
  insulation: 5,
  screed: 6,
  plastering: 7,
  waterproofing: 8,
  tiling: 9,
  windows: 10,
  doors: 10,
  flooring: 11,
  ceiling: 12,
  painting: 13,
  electrical_finish: 14,
  plumbing_finish: 15,
};

/**
 * Rows from the table become the book the engine reads. Only active rows count; a table
 * with no rows at all means "nobody has seeded it yet" and yields the defaults.
 */
export function rateBookFromRows(rows: RateRow[]): RateBook {
  if (rows.length === 0) return DEFAULT_RATE_BOOK;
  const materials: Record<string, MaterialRate> = {};
  const labour: Record<string, LabourRate> = {};
  const ordered = [...rows].sort((a, b) => a.phase - b.phase || a.sortOrder - b.sortOrder);
  for (const row of ordered) {
    if (!row.isActive) continue;
    if (row.kind === 'material') {
      materials[row.key] = {
        labelKa: row.labelKa,
        qtyPerM2: Number(row.qtyPerM2 ?? 0),
        unit: row.unit as MaterialRate['unit'],
        wasteFactorPct: Number(row.wasteFactorPct ?? 0),
        phase: row.phase,
        basis: (row.basis ?? 'floor') as MaterialRate['basis'],
        linkedCategorySlug: row.linkedCategorySlug,
        estimatedPriceGEL: Number(row.pricePerUnit),
      };
    } else {
      labour[row.key] = {
        labelKa: row.labelKa,
        unit: row.unit === 'unit' ? 'unit' : 'm2',
        price: Number(row.pricePerUnit),
      };
    }
  }
  return { materials, labour };
}
