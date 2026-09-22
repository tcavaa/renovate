/**
 * Reads every furniture model's colours off the model and writes them into the manifests —
 * `colors` (up to three, the largest first) and `colorHex` (the first, unless the entry was
 * given one by hand in its converter) — for the shelf's colour filter. See
 * `scripts/lib/modelColor.ts` for how a colour is read and `lib/design/colors.ts` for the
 * families. `pnpm models:seed` then carries them to the products.
 *
 *   pnpm models:colors            # fill in what is missing
 *   pnpm models:colors --force    # read every model again
 *
 * The converters call the same reader, so a model converted from now on arrives with its
 * colours; this script is for the manifests that are already there.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { colorFamily } from '../lib/design/colors';
import { colorsOfGlb } from './lib/modelColor';

const MANIFESTS = ['public/models/manifest.json', 'public/models/stock/manifest.json'];

interface Entry {
  url: string;
  name: string;
  colorHex: string | null;
  colors?: string[];
}

async function main() {
  const force = process.argv.includes('--force');
  for (const relative of MANIFESTS) {
    const file = path.join(process.cwd(), relative);
    const manifest = JSON.parse(await readFile(file, 'utf8')) as { models: Entry[] };
    let read = 0;
    for (const model of manifest.models) {
      if (!force && model.colors && model.colors.length > 0) continue;
      const colors = await colorsOfGlb(path.join(process.cwd(), 'public', model.url)).catch((error: unknown) => {
        console.log(`  ! ${model.name}: ${error instanceof Error ? error.message : String(error)}`);
        return [] as string[];
      });
      if (colors.length === 0) continue;
      model.colors = colors;
      // A colour given by hand in the converter stays the product's one colour.
      model.colorHex = model.colorHex ?? colors[0];
      read++;
      console.log(`  ✓ ${model.name.padEnd(34)} ${colors.map((hex) => `${hex} ${colorFamily(hex)}`).join(' · ')}`);
    }
    await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`${relative}: ${read} of ${manifest.models.length} read`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
