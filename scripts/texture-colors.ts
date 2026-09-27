/* eslint-disable no-console */
/**
 * Reads every floor and wall finish's colours off its texture into `specs.colors`, for the
 * studio's colour filter — what `pnpm models:colors` is for the furniture. How a colour is
 * read is `lib/uploads/textureColors.ts`, the families are `lib/design/colors.ts`.
 *
 *   pnpm textures:colors            # fill in what is missing
 *   pnpm textures:colors --force    # read every texture again
 *
 * A texture uploaded in the product form has its colours read as it arrives, and
 * `pnpm textures:stock` reads them as it writes a finish; this script is for the finishes a
 * database already holds. Only `specs.colors` is written. A texture under `public/` is read
 * from disk, one in the bucket (an absolute URL) is fetched.
 */

import './lib/loadEnv';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { eq, isNotNull } from 'drizzle-orm';
import { db, pool } from '../lib/db';
import { products } from '../lib/db/schema';
import { colorFamily } from '../lib/design/colors';
import { colorsOfImage } from '../lib/uploads/textureColors';

async function bytesOf(url: string): Promise<Uint8Array> {
  if (/^https?:\/\//i.test(url)) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return new Uint8Array(await response.arrayBuffer());
  }
  const file = path.join(process.cwd(), 'public', decodeURIComponent(url.split(/[?#]/)[0]).replace(/^\/+/, ''));
  return new Uint8Array(await readFile(file));
}

async function main() {
  const force = process.argv.includes('--force');
  const rows = await db
    .select({ id: products.id, slug: products.slug, textureUrl: products.textureUrl, specs: products.specs })
    .from(products)
    .where(isNotNull(products.textureUrl));

  let read = 0;
  let kept = 0;
  const failed: string[] = [];
  for (const row of rows) {
    if (!row.textureUrl) continue;
    const specs = row.specs && typeof row.specs === 'object' && !Array.isArray(row.specs) ? (row.specs as Record<string, unknown>) : {};
    if (!force && Array.isArray(specs.colors) && specs.colors.length > 0) {
      kept++;
      continue;
    }
    let colors: string[] = [];
    try {
      colors = await colorsOfImage(await bytesOf(row.textureUrl));
    } catch (error) {
      console.log(`  ! ${row.slug}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (colors.length === 0) {
      failed.push(row.slug);
      continue;
    }
    await db.update(products).set({ specs: { ...specs, colors } }).where(eq(products.id, row.id));
    read++;
    console.log(`  ✓ ${row.slug.padEnd(36)} ${colors.map((hex) => `${hex} ${colorFamily(hex)}`).join(' · ')}`);
  }

  console.log(`\n${read} read · ${kept} already had their colours${failed.length ? ` · ${failed.length} unreadable: ${failed.join(', ')}` : ''}`);
  console.log('The studio\'s cached catalogue picks them up within five minutes (or on the next admin edit).');
  await pool.end();
  if (failed.length) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error('✗ texture colours failed:', error);
  await pool.end();
  process.exit(1);
});
