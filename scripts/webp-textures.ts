/* eslint-disable no-console */
/**
 * Every finish texture in `public/textures` as WebP: each JPEG or PNG is written as
 * `<name>.webp` beside it (`lib/uploads/textureOptimize.ts` — colour and roughness maps at 80,
 * normal maps at 90) and the original is deleted. The maps were JPEGs saved near quality 100:
 * 47 MB for 93 of them, about 7 MB as WebP.
 *
 * The files keep their names, so a URL changes only in its extension: migration 0021 rewrote the
 * stored ones (products, saved designs, brigade portfolios), the code and seeds name `.webp`, and
 * `next.config.mjs` redirects any `/textures/….jpg` still asked for to its `.webp`.
 * `pnpm assets:extract` runs this after extracting the partner's maps; `pnpm textures:stock`
 * converts what it downloads itself.
 *
 *   pnpm textures:webp             convert what is not WebP yet
 *   pnpm textures:webp --dry-run   report what would change, write nothing
 */

import { readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { encodeTextureWebp, textureKind } from '../lib/uploads/textureOptimize';

const DIR = path.join(process.cwd(), 'public', 'textures');

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const sources = (await readdir(DIR)).filter((name) => /\.(jpe?g|png)$/i.test(name)).sort();
  let before = 0;
  let after = 0;
  for (const name of sources) {
    const source = path.join(DIR, name);
    const bytes = await readFile(source);
    const webp = await encodeTextureWebp(bytes, textureKind(name));
    before += bytes.byteLength;
    after += webp.byteLength;
    const target = path.join(DIR, name.replace(/\.(jpe?g|png)$/i, '.webp'));
    console.log(`  ${dryRun ? 'would convert' : 'webp'} ${name}: ${(bytes.byteLength / 1024).toFixed(0)} KB → ${(webp.byteLength / 1024).toFixed(0)} KB${textureKind(name) === 'normal' ? ' (normal map)' : ''}`);
    if (dryRun) continue;
    await writeFile(target, webp);
    await unlink(source);
  }
  console.log(`${dryRun ? '[dry run] ' : ''}${sources.length} textures${sources.length ? `: ${(before / 1e6).toFixed(1)} MB → ${(after / 1e6).toFixed(1)} MB` : ' — all WebP already'}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
