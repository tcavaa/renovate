/* eslint-disable no-console */
/**
 * Makes the database match `public/models/manifest.json`.
 *
 *   pnpm models:seed
 *
 * One product per converted model, and *only* those: every other product the Design Studio
 * could place is deleted. The studio furnishes rooms exclusively with things a partner
 * actually sells, and the manifest is the list of what that is.
 *
 * The renovation calculator's own catalogue — tiles, paint, doors, sanitary ware — is not
 * touched; those products have no `model3dKind` and were never furniture.
 *
 * Re-running is safe: products are matched by slug and updated in place, so a price or store
 * edited in admin survives a re-seed unless the manifest says otherwise.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { and, eq, inArray, isNotNull, isNull, notInArray } from 'drizzle-orm';
import { db, pool } from '../lib/db';
import { categories, products, stores } from '../lib/db/schema';
import { archetypeLabel, getArchetype } from '../lib/design/catalog';
import type { ManifestModel } from './convert-models';

interface Manifest {
  models: ManifestModel[];
}

const SLUG_PREFIX = 'model-';

async function main() {
  // Two manifests, one catalogue: the partner drop and the CC0 stock that fills its gaps.
  const manifestPaths = [
    path.join(process.cwd(), 'public', 'models', 'manifest.json'),
    path.join(process.cwd(), 'public', 'models', 'stock', 'manifest.json'),
  ];
  const manifest: Manifest = { models: [] };
  for (const manifestPath of manifestPaths) {
    try {
      const part = JSON.parse(await readFile(manifestPath, 'utf8')) as Manifest;
      manifest.models.push(...part.models);
      console.log(`  ${part.models.length} models in ${path.relative(process.cwd(), manifestPath)}`);
    } catch {
      console.log(`  (no ${path.relative(process.cwd(), manifestPath)})`);
    }
  }
  if (manifest.models.length === 0) {
    console.error('✗ no manifest — run `pnpm models:convert` and/or `pnpm models:stock` first');
    process.exit(1);
  }

  const storeRows = await db.select({ id: stores.id, nameKa: stores.nameKa }).from(stores);
  const categoryRows = await db.select({ id: categories.id, slug: categories.slug }).from(categories);
  const categoryBySlug = new Map(categoryRows.map((c) => [c.slug, c.id]));

  // Stores are matched by the slug used in seed-design.ts, which is derived from the name.
  const storeBySlug = new Map<string, number>();
  for (const row of storeRows) storeBySlug.set(storeSlugFor(row.nameKa), row.id);

  const keepSlugs: string[] = [];
  let upserted = 0;

  for (const model of manifest.models) {
    const archetype = getArchetype(model.kind);
    if (!archetype) {
      console.log(`  ! ${model.name}: unknown archetype "${model.kind}" — skipped`);
      continue;
    }
    const categoryId = categoryBySlug.get(archetype.categorySlug ?? 'decor');
    if (!categoryId) {
      console.log(`  ! ${model.name}: no category "${archetype.categorySlug}" — skipped`);
      continue;
    }
    const storeId = storeBySlug.get(model.storeSlug) ?? null;
    if (!storeId) console.log(`  ! ${model.name}: store "${model.storeSlug}" not found — left without a store`);

    const slug = `${SLUG_PREFIX}${model.name}`;
    keepSlugs.push(slug);

    const row = {
      categoryId,
      storeId,
      nameKa: model.nameKa,
      nameEn: `${archetypeLabel(model.kind, 'en')} ${model.displayName}`,
      nameRu: `${archetypeLabel(model.kind, 'ru')} ${model.displayName}`,
      descriptionKa: model.displayName,
      slug,
      sku: `PM-${model.name.toUpperCase().replace(/[^A-Z0-9]+/g, '-')}`,
      pricePerUnit: String(model.priceGel),
      unit: 'piece' as const,
      brand: model.brand ?? model.displayName.split(' ')[0],
      imageUrl: model.imageUrl,
      styleTags: model.styles ?? [model.style],
      model3dKind: model.kind,
      model3dUrl: model.url,
      model3dStatus: 'ready' as const,
      colorHex: model.colorHex,
      widthCm: model.widthCm,
      depthCm: model.depthCm,
      heightCm: model.heightCm,
      isActive: true,
      isFeatured: true,
    };

    const existing = await db.select({ id: products.id }).from(products).where(eq(products.slug, slug)).limit(1);
    if (existing.length) {
      await db.update(products).set(row).where(eq(products.id, existing[0].id));
    } else {
      await db.insert(products).values(row);
    }
    upserted++;
    console.log(
      `  ✓ ${slug.padEnd(38)} ${(model.styles ?? [model.style]).join(',').padEnd(40)} ${model.kind.padEnd(14)} ` +
        `${model.widthCm}×${model.depthCm}×${model.heightCm}  ${model.priceGel} ₾`
    );
  }

  // Everything else the studio could have placed goes. The studio must never draw a product
  // that has no partner model behind it.
  const stale = await db
    .select({ id: products.id, slug: products.slug })
    .from(products)
    .where(
      keepSlugs.length
        ? and(isNotNull(products.model3dKind), notInArray(products.slug, keepSlugs))
        : isNotNull(products.model3dKind)
    );

  if (stale.length) {
    await db.delete(products).where(inArray(products.id, stale.map((s) => s.id)));
  }

  // The calculator's own lists show only what the studio can draw: a sofa, a toilet or a
  // pendant without a model, or a tile without a texture, is switched off rather than
  // deleted, so admin can bring it back the day a model arrives. Doors, windows and sockets
  // have no 3D counterpart at all and are left alone.
  const threeD = await db
    .select({ id: categories.id, slug: categories.slug, isFurniture: categories.isFurniture })
    .from(categories);
  const modelCategoryIds = threeD.filter((c) => c.isFurniture || c.slug === 'sanitary' || c.slug === 'lighting').map((c) => c.id);
  const surfaceCategoryIds = threeD.filter((c) => ['laminate', 'floor-tiles', 'wall-tiles', 'paint'].includes(c.slug)).map((c) => c.id);
  let hidden = 0;
  if (modelCategoryIds.length) {
    const rows = await db
      .select({ id: products.id })
      .from(products)
      .where(and(inArray(products.categoryId, modelCategoryIds), isNull(products.model3dUrl), eq(products.isActive, true)));
    if (rows.length) await db.update(products).set({ isActive: false }).where(inArray(products.id, rows.map((r) => r.id)));
    hidden += rows.length;
  }
  if (surfaceCategoryIds.length) {
    const rows = await db
      .select({ id: products.id })
      .from(products)
      .where(and(inArray(products.categoryId, surfaceCategoryIds), isNull(products.textureUrl), eq(products.isActive, true)));
    if (rows.length) await db.update(products).set({ isActive: false }).where(inArray(products.id, rows.map((r) => r.id)));
    hidden += rows.length;
  }

  console.log(`\n${upserted} placeable products in the catalogue · ${stale.length} other product(s) removed · ${hidden} product(s) without a model or texture hidden`);
  await pool.end();
}

/** The same derivation seed-design.ts uses, so the two agree on which store is which. */
function storeSlugFor(nameKa: string): string {
  const known: Record<string, string> = {
    'ქართული ავეჯი': 'kartuli-aveji',
    'Nordic Home Tbilisi': 'nordic-home',
    'LOFT 42': 'loft-42',
    'Domus Interior': 'domus-interior',
    'ანტიკვარი — ვინტაჟის სალონი': 'antikvari',
    'ლუმინა განათება': 'lumina',
    'ტექსტილ+ ხალიჩები': 'textil-plus',
    'სან-პლუს სანტექნიკა': 'san-plus',
  };
  return known[nameKa] ?? nameKa.toLowerCase().replace(/\s+/g, '-');
}

main().catch(async (error) => {
  console.error('✗ seed failed:', error);
  await pool.end();
  process.exit(1);
});
