import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORY_TREE, DEFAULT_KIND_CATEGORY, DEFAULT_SHELF_ROOMS } from '@/lib/catalog/defaultTree';
import { MAX_CATEGORY_DEPTH } from '@/lib/catalog/tree';
import { PRODUCT_KINDS } from '@/lib/catalog/kinds';
import { iconNodeFor } from '@/lib/catalog/iconNodes';
import { ARCHETYPES, SHELF_ROOMS } from '@/lib/design/catalog';

/**
 * The tree the platform starts with, and migrations 0018 and 0020, which write it into a
 * database that had the flat catalogue (0020 the categories added since) — kept in step: every
 * category, product move and studio room the definition has is in the SQL.
 */

const MIGRATION = ['0018_category_tree_defaults.sql', '0020_equipment_kitchen_categories.sql'].map((file) => readFileSync(path.join(process.cwd(), 'lib/db/migrations', file), 'utf8')).join('\n');
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

describe('migrations 0018 and 0020', () => {
  it('makes and places every category of the starting tree', () => {
    for (const c of DEFAULT_CATEGORY_TREE) {
      expect(MIGRATION, c.slug).toContain(`WHERE \`slug\` = '${c.slug}' AND \`parent_id\` IS NULL;`);
      if (c.parent) expect(MIGRATION, c.slug).toContain(`-- ${c.slug} under ${c.parent}`);
    }
  });

  it('moves the products of every kind to the kind\'s category', () => {
    for (const [kind, slug] of Object.entries(DEFAULT_KIND_CATEGORY)) expect(MIGRATION, kind).toContain(`WHERE \`slug\` = '${slug}') WHERE \`model_3d_kind\` = '${kind}';`);
  });

  it('makes every studio room with its categories', () => {
    for (const room of DEFAULT_SHELF_ROOMS) {
      expect(MIGRATION, room.slug).toContain(`WHERE \`slug\` = '${room.slug}');`);
      for (const slug of room.categories) expect(MIGRATION, `${room.slug} → ${slug}`).toContain(`ON c.\`slug\` = '${slug}' WHERE r.\`slug\` = '${room.slug}';`);
    }
  });
});
