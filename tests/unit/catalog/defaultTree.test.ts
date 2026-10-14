import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORY_TREE, DEFAULT_KIND_CATEGORY, DEFAULT_SHELF_ROOMS } from '@/lib/catalog/defaultTree';
import { MAX_CATEGORY_DEPTH } from '@/lib/catalog/tree';
import { PRODUCT_KINDS } from '@/lib/catalog/kinds';
import { iconNodeFor } from '@/lib/catalog/iconNodes';
import { ARCHETYPES, SHELF_ROOMS } from '@/lib/design/catalog';

/**
 * The tree the platform starts with, and the migration that writes it into a new database
 * (`0001_starting_catalogue.sql`, made from this definition when the app moved to Postgres;
 * MySQL's 0018 and 0020 did it before) — kept in step: every category, 3D kind and studio room
 * the definition has is in the SQL.
 */

// The starting catalogue and every data migration after it (0002 put the kitchen made to measure on the kitchen's shelf).
const MIGRATIONS_DIR = path.join(process.cwd(), 'lib/db/migrations');
const MIGRATION = readdirSync(MIGRATIONS_DIR)
  .filter((name) => /^\d{4}_.*\.sql$/.test(name) && name >= '0001')
  .sort()
  .map((name) => readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8'))
  .join('\n');
const STATEMENTS = MIGRATION.split('--> statement-breakpoint');
/** The statement that makes the category with this slug. */
const categoryInsert = (slug: string) => STATEMENTS.find((s) => s.includes('INSERT INTO "categories"') && s.includes(`, '${slug}', `));
const FLAT = ['floor-tiles', 'wall-tiles', 'laminate', 'doors', 'windows', 'paint', 'sanitary', 'lighting', 'sockets-switches', 'beds', 'sofas', 'tables', 'chairs', 'wardrobes', 'kitchen-furniture', 'storage', 'rugs', 'decor', 'radiators', 'skirting', 'cornice'];

describe('the starting tree', () => {
  const bySlug = new Map(DEFAULT_CATEGORY_TREE.map((c) => [c.slug, c]));
  const depth = (slug: string): number => (bySlug.get(slug)?.parent ? 1 + depth(bySlug.get(slug)!.parent!) : 1);

  it('lists each category once, parents first, three levels at most', () => {
    expect(bySlug.size).toBe(DEFAULT_CATEGORY_TREE.length);
    DEFAULT_CATEGORY_TREE.forEach((c, i) => {
      if (c.parent) expect(DEFAULT_CATEGORY_TREE.findIndex((p) => p.slug === c.parent), c.slug).toBeLessThan(i);
      expect(depth(c.slug), c.slug).toBeLessThanOrEqual(MAX_CATEGORY_DEPTH);
      expect(c.slug).toMatch(/^[a-z0-9-]+$/);
    });
  });

  it('keeps every flat category, and only those, as the calculator\'s tabs', () => {
    expect(DEFAULT_CATEGORY_TREE.filter((c) => c.existing).map((c) => c.slug).sort()).toEqual([...FLAT].sort());
    expect(DEFAULT_CATEGORY_TREE.filter((c) => c.inCalculator).map((c) => c.slug).sort()).toEqual([...FLAT].sort());
  });

  it('gives every piece of furniture the studio places a category of its kind', () => {
    for (const kind of Object.keys(ARCHETYPES)) expect(DEFAULT_KIND_CATEGORY[kind], kind).toBeDefined();
    for (const kind of Object.keys(DEFAULT_KIND_CATEGORY)) expect(PRODUCT_KINDS, kind).toContain(kind);
  });

  it('draws every icon it names', () => {
    for (const c of DEFAULT_CATEGORY_TREE) expect(iconNodeFor(c.icon), `${c.slug}: ${c.icon}`).not.toBeNull();
    for (const r of DEFAULT_SHELF_ROOMS) expect(iconNodeFor(r.icon), `${r.slug}: ${r.icon}`).not.toBeNull();
  });

  it('has a studio room per shelf room type, listing only categories of the tree', () => {
    expect(DEFAULT_SHELF_ROOMS.map((r) => r.roomTypes[0])).toEqual(SHELF_ROOMS);
    for (const room of DEFAULT_SHELF_ROOMS) {
      expect(room.categories.length, room.slug).toBeGreaterThan(0);
      for (const slug of room.categories) expect(bySlug.has(slug), `${room.slug} → ${slug}`).toBe(true);
    }
    expect(DEFAULT_SHELF_ROOMS.find((r) => r.slug === 'bedroom')?.categories).toEqual(expect.arrayContaining(['beds-double', 'nightstands', 'wardrobes']));
  });
});

describe('the starting catalogue migration', () => {
  it('makes and places every category of the starting tree, parents first', () => {
    for (const c of DEFAULT_CATEGORY_TREE) {
      const insert = categoryInsert(c.slug);
      expect(insert, c.slug).toBeDefined();
      expect(insert, c.slug).toContain('ON CONFLICT ("slug") DO NOTHING');
      if (c.parent) {
        expect(insert, c.slug).toContain(`(SELECT "id" FROM "categories" WHERE "slug" = '${c.parent}')`);
        expect(MIGRATION.indexOf(`, '${c.parent}', `), c.slug).toBeLessThan(MIGRATION.indexOf(`, '${c.slug}', `));
        expect(MIGRATION, c.slug).toContain(`-- ${c.slug} under ${c.parent}`);
      }
    }
  });

  it('gives every kind\'s category its 3D kind', () => {
    for (const [kind, slug] of Object.entries(DEFAULT_KIND_CATEGORY)) expect(categoryInsert(slug), kind).toContain(`'${kind}'`);
  });

  it('makes every studio room with its categories', () => {
    for (const room of DEFAULT_SHELF_ROOMS) {
      expect(MIGRATION, room.slug).toContain(`INSERT INTO "shelf_rooms" ("slug", "name_ka", "name_en", "name_ru", "icon", "room_types", "is_visible", "sort_order") VALUES ('${room.slug}', `);
      for (const slug of room.categories) expect(MIGRATION, `${room.slug} → ${slug}`).toContain(`ON c."slug" = '${slug}' WHERE r."slug" = '${room.slug}' ON CONFLICT DO NOTHING;`);
    }
  });
});
