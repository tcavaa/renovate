/* eslint-disable no-console */
/**
 * Fills in every default rate the calculator ships with — without touching a row admin has
 * already edited. The table itself comes from the migrations (`pnpm db:migrate`).
 *
 *   pnpm db:seed:rates
 *
 * Optional, and never needed in production: the engine prices a default the table has no row
 * for, and the admin rates page lists those defaults and creates a row when one is saved
 * (`ratesForAdmin`).
 */

import './lib/loadEnv';

import { db, pool } from '../lib/db';
import { rates } from '../lib/db/schema';
import { defaultRateRows } from '../lib/calculator/rates';

async function main() {
  const existing = new Set((await db.select({ key: rates.key }).from(rates)).map((r) => r.key));
  let inserted = 0;
  for (const row of defaultRateRows()) {
    if (existing.has(row.key)) continue;
    await db.insert(rates).values({
      kind: row.kind,
      key: row.key,
      labelKa: row.labelKa,
      phase: row.phase,
      unit: row.unit,
      basis: row.basis,
      qtyPerM2: row.qtyPerM2 == null ? null : String(row.qtyPerM2),
      wasteFactorPct: row.wasteFactorPct == null ? null : String(row.wasteFactorPct),
      pricePerUnit: String(row.pricePerUnit),
      linkedCategorySlug: row.linkedCategorySlug,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
    });
    inserted++;
  }
  console.log(`✅ rates: ${inserted} inserted, ${existing.size} already there (kept as admin left them)`);
  await pool.end();
}

main().catch(async (error) => {
  console.error('✗ seed-rates failed:', error);
  await pool.end();
  process.exit(1);
});
