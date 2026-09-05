/* eslint-disable no-console */
/**
 * Fills in English and Russian names for rows that only have Georgian ones.
 *
 *   pnpm db:backfill-translations
 *
 * Idempotent and additive: a name an admin already typed is never overwritten. Sources, in
 * order of quality: the hand-written maps in scripts/lib/translations.ts (seed products,
 * stores, workers, categories), the archetype label plus the model's display name for 3D
 * products (`Double bed Woody`), and a humanised slug for texture products.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { and, eq, isNull } from 'drizzle-orm';
import { db, pool } from '../lib/db';
import { categories, products, stores, workers } from '../lib/db/schema';
import { archetypeLabel } from '../lib/design/catalog';
import { CATEGORY_RU, PRODUCT_I18N, STORE_I18N, WORKER_I18N, humanizeSlug } from './lib/translations';

async function main() {
  let changed = 0;

  for (const [slug, ru] of Object.entries(CATEGORY_RU)) {
    const r = await db.update(categories).set({ nameRu: ru }).where(and(eq(categories.slug, slug), isNull(categories.nameRu)));
    changed += r[0].affectedRows;
  }

  for (const [nameKa, t] of Object.entries(STORE_I18N)) {
    const r = await db.update(stores).set({ nameEn: t.en, nameRu: t.ru }).where(and(eq(stores.nameKa, nameKa), isNull(stores.nameEn)));
    changed += r[0].affectedRows;
  }

  for (const [nameKa, t] of Object.entries(WORKER_I18N)) {
    const r = await db.update(workers).set({ nameEn: t.en, nameRu: t.ru }).where(and(eq(workers.nameKa, nameKa), isNull(workers.nameEn)));
    changed += r[0].affectedRows;
  }

  const rows = await db
    .select({ id: products.id, slug: products.slug, model3dKind: products.model3dKind, descriptionKa: products.descriptionKa })
    .from(products)
    .where(isNull(products.nameEn));

  for (const row of rows) {
    let en: string | null = null;
    let ru: string | null = null;
    const known = PRODUCT_I18N[row.slug];
    if (known) {
      en = known.en;
      ru = known.ru;
    } else if (row.model3dKind) {
      // 3D products keep the model's display name in descriptionKa (see seed-models.ts).
      const display = row.descriptionKa?.trim();
      en = `${archetypeLabel(row.model3dKind, 'en')}${display ? ` ${display}` : ''}`;
      ru = `${archetypeLabel(row.model3dKind, 'ru')}${display ? ` ${display}` : ''}`;
    } else {
      en = humanizeSlug(row.slug);
    }
    await db.update(products).set({ nameEn: en, nameRu: ru }).where(eq(products.id, row.id));
    changed++;
  }

  console.log(`✅ translations backfilled — ${changed} row(s) updated, ${rows.length} product(s) named`);
  await pool.end();
}

main().catch((err) => {
  console.error('❌ backfill failed:', err);
  process.exit(1);
});
