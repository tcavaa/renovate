import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BLIND_CATEGORY, BLIND_MODEL_CM, BLIND_PRODUCTS, blindModelUrl, blindPhotoUrl } from '../../../scripts/lib/blindProducts';
import { DEFAULT_KIND_CATEGORY } from '@/lib/catalog/defaultTree';

/**
 * The roller blinds reach a database two ways: the migration a deploy runs
 * (`0013_roller_blinds.sql`) and `pnpm models:seed`. They must say the same, and the files they
 * name must be there.
 */
const SQL = readFileSync(path.join(process.cwd(), 'lib/db/migrations/0013_roller_blinds.sql'), 'utf8');
const STATEMENTS = SQL.split('--> statement-breakpoint');

describe('the roller blinds migration', () => {
  it('makes their category under decor, of the blind kind', () => {
    expect(DEFAULT_KIND_CATEGORY.blind).toBe(BLIND_CATEGORY);
    const insert = STATEMENTS.find((s) => s.includes('INSERT INTO "categories"'));
    expect(insert).toContain(`'${BLIND_CATEGORY}'`);
    expect(insert).toContain(`'blind'`);
    expect(insert).toContain(`WHERE "slug" = 'decor'`);
  });

  it('inserts each of the seed’s blinds once, from the textile shop, by the piece, with its model and photo', () => {
    for (const blind of BLIND_PRODUCTS) {
      const inserts = STATEMENTS.filter((s) => s.includes(`'${blind.slug}'`));
      expect(inserts, blind.slug).toHaveLength(1);
      const insert = inserts[0];
      expect(insert).toContain(`WHERE "slug" = '${BLIND_CATEGORY}'`);
      expect(insert).toContain(`WHERE "name_ka" = '${blind.storeNameKa}'`);
      expect(insert).toContain(`'${blind.priceGel}.00', 'piece'`);
      expect(insert).toContain(`'${blind.nameKa}'`);
      expect(insert).toContain(`'${blind.descriptionKa}'`);
      expect(insert).toContain(`'${JSON.stringify(blind.styles)}'::jsonb`);
      expect(insert).toContain(`'${blindModelUrl(blind.slug)}', 'ready', '${blind.fabric}', ${BLIND_MODEL_CM.width}, ${BLIND_MODEL_CM.depth}, ${BLIND_MODEL_CM.height}`);
      expect(insert).toContain(`'${blindPhotoUrl(blind.slug)}'`);
      expect(insert).toContain('ON CONFLICT ("slug") DO NOTHING');
      expect(existsSync(path.join(process.cwd(), 'public', blindModelUrl(blind.slug))), blind.slug).toBe(true);
      expect(existsSync(path.join(process.cwd(), 'public', blindPhotoUrl(blind.slug))), blind.slug).toBe(true);
    }
  });
});
