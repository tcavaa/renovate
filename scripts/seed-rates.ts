/* eslint-disable no-console */
/**
 * Creates the `rates` table if it is missing, deletes the rows of the rate book the renovation
 * team's replaced (`RETIRED_RATE_KEYS` — they are never read anyway), and fills in every
 * default the calculator ships with — without touching a row admin has already edited.
 *
 *   pnpm db:seed:rates
 *
 * `drizzle-kit push` is interactive and hangs in scripts, so the DDL is applied directly.
 */

import './lib/loadEnv';

import { inArray, sql } from 'drizzle-orm';
import { db, pool } from '../lib/db';
import { rates } from '../lib/db/schema';
import { defaultRateRows } from '../lib/calculator/rates';
import { RETIRED_RATE_KEYS } from '../lib/calculator/constants';

async function main() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS rates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      kind ENUM('material','labour') NOT NULL,
      \`key\` VARCHAR(100) NOT NULL UNIQUE,
      label_ka VARCHAR(255) NOT NULL,
      phase INT NOT NULL,
      unit VARCHAR(20) NOT NULL,
      basis VARCHAR(20) NULL,
      qty_per_m2 DECIMAL(10,4) NULL,
      waste_factor_pct DECIMAL(6,2) NULL,
      price_per_unit DECIMAL(12,2) NOT NULL,
      linked_category_slug VARCHAR(100) NULL,
      sort_order INT NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  const [retired] = await db.delete(rates).where(inArray(rates.key, [...RETIRED_RATE_KEYS]));
  console.log(`🗑  rates: ${retired.affectedRows} rows of the retired book deleted`);

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
