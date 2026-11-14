import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOILER_CABINET_MATERIALS, BOILER_CABINET_THERMAL_MATERIALS, KITCHEN_STORE, type BoilerCabinetMaterialSpec } from '../../../scripts/lib/kitchenMaterials';
import { isThermalCabinet } from '@/lib/design/boilerCabinet';
import { BOILER_CABINET_CATEGORY } from '@/lib/design/catalog';

/**
 * The boiler cabinet's materials reach a database two ways: the migrations a deploy runs
 * (`0011_boiler_cabinet_materials.sql`, `0016_boiler_cabinet_thermal.sql`) and `pnpm models:seed`.
 * They must say the same.
 */
const statements = (file: string) => readFileSync(path.join(process.cwd(), 'lib/db/migrations', file), 'utf8').split('--> statement-breakpoint');

function expectInserts(file: string, materials: BoilerCabinetMaterialSpec[]) {
  const all = statements(file);
  expect(all).toHaveLength(materials.length);
  for (const material of materials) {
    const insert = all.find((s) => s.includes(`'${material.slug}'`));
    expect(insert, material.slug).toBeDefined();
    expect(insert).toContain(`WHERE "slug" = '${BOILER_CABINET_CATEGORY}'`);
    expect(insert).toContain(`WHERE "name_ka" = '${KITCHEN_STORE.nameKa}'`);
    expect(insert).toContain(`'${material.priceGelPerM2}.00', 'm2'`);
    expect(insert).toContain(`'${material.nameKa}'`);
    expect(insert).toContain(`'${JSON.stringify(material.styles)}'::jsonb`);
    expect(insert).toContain('ON CONFLICT ("slug") DO NOTHING');
  }
}

describe('the boiler cabinet materials migration', () => {
  it('inserts each of the seed’s materials once, in its category, from the kitchen maker, by the m²', () => {
    expectInserts('0011_boiler_cabinet_materials.sql', BOILER_CABINET_MATERIALS);
  });

  it('brings the insulated outdoor cupboard the same way, and only it is thermal', () => {
    expectInserts('0016_boiler_cabinet_thermal.sql', BOILER_CABINET_THERMAL_MATERIALS);
    expect(BOILER_CABINET_THERMAL_MATERIALS.every(isThermalCabinet)).toBe(true);
    expect(BOILER_CABINET_MATERIALS.some(isThermalCabinet)).toBe(false);
  });
});
