import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOILER_CABINET_MATERIALS, KITCHEN_STORE } from '../../../scripts/lib/kitchenMaterials';
import { BOILER_CABINET_CATEGORY } from '@/lib/design/catalog';

/**
 * The boiler cabinet's materials reach a database two ways: the migration a deploy runs
 * (`0011_boiler_cabinet_materials.sql`) and `pnpm models:seed`. They must say the same.
 */
const SQL = readFileSync(path.join(process.cwd(), 'lib/db/migrations/0011_boiler_cabinet_materials.sql'), 'utf8');
const STATEMENTS = SQL.split('--> statement-breakpoint');

describe('the boiler cabinet materials migration', () => {
  it('inserts each of the seed’s materials once, in its category, from the kitchen maker, by the m²', () => {
    expect(STATEMENTS).toHaveLength(BOILER_CABINET_MATERIALS.length);
    for (const material of BOILER_CABINET_MATERIALS) {
      const insert = STATEMENTS.find((s) => s.includes(`'${material.slug}'`));
      expect(insert, material.slug).toBeDefined();
      expect(insert).toContain(`WHERE "slug" = '${BOILER_CABINET_CATEGORY}'`);
      expect(insert).toContain(`WHERE "name_ka" = '${KITCHEN_STORE.nameKa}'`);
      expect(insert).toContain(`'${material.priceGelPerM2}.00', 'm2'`);
      expect(insert).toContain(`'${material.nameKa}'`);
      expect(insert).toContain(`'${JSON.stringify(material.styles)}'::jsonb`);
      expect(insert).toContain('ON CONFLICT ("slug") DO NOTHING');
    }
  });
});
