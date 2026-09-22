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

import './lib/loadEnv';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { and, eq, inArray, isNotNull, isNull, like, notInArray, or } from 'drizzle-orm';
import { db, pool } from '../lib/db';
import { categories, products, stores } from '../lib/db/schema';
import { archetypeLabel, getArchetype } from '../lib/design/catalog';
import type { ManifestModel } from './convert-models';
import type { FixtureManifestModel } from './fixture-models';
import type { RadiatorManifestModel } from './radiator-models';
import { TRIM_PRODUCTS } from './lib/trimProducts';

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

  /**
   * The category, made when it is missing. The cPanel deploy runs this script alone
   * (bundled), so it cannot count on `db:seed:design` having been run for the categories the
   * newer products live in.
   */
  const ensureCategory = async (spec: { slug: string; nameKa: string; nameEn: string; nameRu: string; phase: number; calculationType: 'per_m2_floor' | 'per_m2_wall' | 'per_m2_ceiling' | 'per_linear_m' | 'per_unit' | 'per_room' | 'fixed'; icon?: string; sortOrder?: number; isFurniture?: boolean }): Promise<number> => {
    const known = categoryBySlug.get(spec.slug);
    if (known) return known;
    const inserted = await db.insert(categories).values({
      nameKa: spec.nameKa,
      nameEn: spec.nameEn,
      nameRu: spec.nameRu,
      slug: spec.slug,
      icon: spec.icon ?? null,
      phase: spec.phase,
      calculationType: spec.calculationType,
      isVisible: true,
      isFurniture: spec.isFurniture ?? false,
      sortOrder: spec.sortOrder ?? spec.phase * 10,
    });
    const id = Number(inserted[0].insertId);
    categoryBySlug.set(spec.slug, id);
    console.log(`  + category ${spec.slug}`);
    return id;
  };

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

    const existing = await db.select({ id: products.id, specs: products.specs }).from(products).where(eq(products.slug, slug)).limit(1);
    // The colours read off the model (`pnpm models:colors`) ride in `specs.colors`, beside
    // whatever else the row's specs already hold; `colorHex` above is the first of them.
    const kept = existing[0]?.specs && typeof existing[0].specs === 'object' && !Array.isArray(existing[0].specs) ? (existing[0].specs as Record<string, unknown>) : {};
    const specs = model.colors?.length ? { ...kept, colors: model.colors } : Object.keys(kept).length ? kept : null;
    if (existing.length) {
      await db.update(products).set({ ...row, specs }).where(eq(products.id, existing[0].id));
    } else {
      await db.insert(products).values({ ...row, specs });
    }
    upserted++;
    console.log(
      `  ✓ ${slug.padEnd(38)} ${(model.styles ?? [model.style]).join(',').padEnd(40)} ${model.kind.padEnd(14)} ` +
        `${model.widthCm}×${model.depthCm}×${model.heightCm}  ${model.priceGel} ₾`
    );
  }

  // The electrical layer's fittings — the sockets, the switches, the lamps — and the doors
  // and windows are products too, in their own categories, with the fixture's own model.
  try {
    const fixtures = JSON.parse(await readFile(path.join(process.cwd(), 'public', 'models', 'fixtures', 'manifest.json'), 'utf8')) as { models: FixtureManifestModel[] };
    for (const model of fixtures.models) {
      if (!model.product) continue;
      const categoryId = categoryBySlug.get(model.product.categorySlug);
      if (!categoryId) {
        console.log(`  ! fixture ${model.slug}: no category "${model.product.categorySlug}" — skipped`);
        continue;
      }
      const storeId = storeBySlug.get(model.product.storeSlug) ?? null;
      const slug = `${SLUG_PREFIX}fixture-${model.slug}`;
      keepSlugs.push(slug);
      const row = {
        categoryId,
        storeId,
        nameKa: model.product.nameKa,
        nameEn: model.product.nameEn,
        nameRu: model.product.nameRu,
        descriptionKa: `${model.title} · ${model.author} · ${model.license}`,
        slug,
        sku: `FX-${model.slug.toUpperCase().replace(/[^A-Z0-9]+/g, '-')}`,
        pricePerUnit: String(model.product.priceGel),
        unit: model.product.unit ?? ('piece' as const),
        brand: model.author,
        imageUrl: model.imageUrl,
        styleTags: model.product.styles ?? ['modern', 'scandinavian', 'industrial', 'vintage'],
        model3dKind: model.product.kind,
        model3dUrl: model.url,
        model3dStatus: 'ready' as const,
        colorHex: null,
        widthCm: model.widthCm,
        depthCm: model.depthCm,
        heightCm: model.heightCm,
        isActive: true,
        isFeatured: false,
      };
      const existing = await db.select({ id: products.id }).from(products).where(eq(products.slug, slug)).limit(1);
      if (existing.length) await db.update(products).set(row).where(eq(products.id, existing[0].id));
      else await db.insert(products).values(row);
      upserted++;
      console.log(`  ✓ ${slug.padEnd(38)} ${model.product.kind.padEnd(14)} ${model.widthCm}×${model.depthCm}×${model.heightCm}  ${model.product.priceGel} ₾`);
    }
  } catch {
    console.log('  (no public/models/fixtures/manifest.json — run `pnpm models:fixtures` for the fittings, doors and windows)');
  }

  // Central-heating radiators. Each model is one *section* and is sold by the section, so
  // the price is per section and the stored size is the section's — the studio repeats it
  // as many times as the room's heat calls for (see `lib/design/radiators.ts`).
  try {
    const radiators = JSON.parse(await readFile(path.join(process.cwd(), 'public', 'models', 'radiators', 'manifest.json'), 'utf8')) as { models: RadiatorManifestModel[] };
    const categoryId = await ensureCategory({ slug: 'radiators', nameKa: 'რადიატორები', nameEn: 'Radiators', nameRu: 'Радиаторы', phase: 15, calculationType: 'per_unit', icon: 'flame', sortOrder: 155 });
    for (const model of radiators.models) {
      if (!model.product) continue;
      const storeId = storeBySlug.get(model.product.storeSlug) ?? null;
      const slug = `${SLUG_PREFIX}radiator-${model.slug}`;
      keepSlugs.push(slug);
      const row = {
        categoryId,
        storeId,
        nameKa: model.product.nameKa,
        nameEn: model.product.nameEn,
        nameRu: model.product.nameRu,
        descriptionKa: `${model.title} · ${model.wattsPerSection} ვტ / სექცია`,
        slug,
        sku: `RD-${model.slug.toUpperCase().replace(/[^A-Z0-9]+/g, '-')}`,
        pricePerUnit: String(model.product.priceGel),
        unit: 'piece' as const,
        brand: model.author,
        imageUrl: model.imageUrl,
        styleTags: model.product.styles,
        specs: { wattsPerSection: model.wattsPerSection, sectionWidthCm: model.sectionWidthCm },
        model3dKind: model.product.kind,
        model3dUrl: model.url,
        model3dStatus: 'ready' as const,
        colorHex: null,
        widthCm: model.sectionWidthCm,
        depthCm: model.depthCm,
        heightCm: model.heightCm,
        isActive: true,
        isFeatured: false,
      };
      const existing = await db.select({ id: products.id }).from(products).where(eq(products.slug, slug)).limit(1);
      if (existing.length) await db.update(products).set(row).where(eq(products.id, existing[0].id));
      else await db.insert(products).values(row);
      upserted++;
      console.log(`  ✓ ${slug.padEnd(38)} radiator       ${model.sectionWidthCm}×${model.depthCm}×${model.heightCm}  ${model.product.priceGel} ₾/სექცია`);
    }
  } catch {
    console.log('  (no public/models/radiators/manifest.json — run `pnpm models:radiators` for the radiators)');
  }

  // Skirting boards and cornices. These carry no model file at all: the studio sweeps the
  // profile their `specs` name along every wall of the room (`lib/design/trims.ts`), so what
  // is drawn is what is bought, by the running metre.
  for (const kind of ['skirting', 'cornice'] as const) {
    const meta = kind === 'skirting'
      ? { nameKa: 'იატაკის პლინტუსი', nameEn: 'Skirting boards', nameRu: 'Напольные плинтусы', icon: 'minus', sortOrder: 111 }
      : { nameKa: 'ჭერის პლინტუსი', nameEn: 'Cornices', nameRu: 'Потолочные плинтусы', icon: 'minus', sortOrder: 121 };
    const categoryId = await ensureCategory({ slug: kind, phase: kind === 'skirting' ? 11 : 12, calculationType: 'per_linear_m', ...meta });
    for (const trim of TRIM_PRODUCTS.filter((p) => p.kind === kind)) {
      const slug = `trim-${trim.slug}`;
      const row = {
        categoryId,
        storeId: storeBySlug.get(trim.storeSlug) ?? null,
        nameKa: trim.nameKa,
        nameEn: trim.nameEn,
        nameRu: trim.nameRu,
        descriptionKa: trim.descriptionKa,
        slug,
        sku: `TR-${trim.slug.toUpperCase().replace(/[^A-Z0-9]+/g, '-')}`,
        pricePerUnit: String(trim.priceGelPerM),
        unit: 'linear_m' as const,
        brand: trim.brand,
        imageUrl: null,
        styleTags: trim.styles,
        specs: { profile: trim.profile, heightCm: trim.heightCm, depthCm: trim.depthCm },
        colorHex: trim.colorHex,
        widthCm: null,
        depthCm: trim.depthCm,
        heightCm: trim.heightCm,
        isActive: true,
        isFeatured: false,
      };
      const existing = await db.select({ id: products.id }).from(products).where(eq(products.slug, slug)).limit(1);
      if (existing.length) await db.update(products).set(row).where(eq(products.id, existing[0].id));
      else await db.insert(products).values(row);
      upserted++;
    }
  }
  console.log(`  ✓ ${TRIM_PRODUCTS.length} skirting boards and cornices`);

  // Everything else the studio could have placed goes. The studio must never draw a product
  // that has no partner model behind it.
  // Only the manifest's own products are the seed's to remove. A model admin uploaded through
  // the product form lives under /uploads/models (or on the object store) and stays.
  const manifestManaged = or(isNull(products.model3dUrl), like(products.model3dUrl, '/models/%'));
  const stale = await db
    .select({ id: products.id, slug: products.slug })
    .from(products)
    .where(
      keepSlugs.length
        ? and(isNotNull(products.model3dKind), notInArray(products.slug, keepSlugs), manifestManaged)
        : and(isNotNull(products.model3dKind), manifestManaged)
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
