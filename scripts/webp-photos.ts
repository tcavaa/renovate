/* eslint-disable no-console */
/**
 * The seed pictures in `public/uploads/products` and `/furniture` as WebP: each PNG or JPEG is
 * written as `<name>.webp` beside it (`lib/uploads/imageOptimize.ts`: quality 85, within 1600 px,
 * transparency kept) and the original deleted; 327 of them went from 89.7 MB to 7.4 MB. The model
 * manifests' `imageUrl` follow, so `pnpm models:seed` (and the deploy's catalogue sync) names the
 * `.webp`; migration 0022 rewrote the URLs already stored.
 *
 * Runtime uploads are left alone — a `<timestamp>-<hex>` or `own-<user>-…` name
 * (`isRuntimeUploadKey`) is a person's file with no seed behind it, and new ones arrive as WebP
 * anyway. The model pipelines write WebP photos themselves; `pnpm assets:extract` runs this after
 * extracting the partner's renders.
 *
 *   pnpm photos:webp             convert what is not WebP yet
 *   pnpm photos:webp --dry-run   report what would change, write nothing
 */

import { readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { encodePhotoWebp } from '../lib/uploads/imageOptimize';
import { isRuntimeUploadKey } from '../lib/storage/uploadKeys';

const ROOT = process.cwd();
const FOLDERS = ['products', 'furniture'];
const MODELS = path.join(ROOT, 'public', 'models');

async function manifests(): Promise<string[]> {
  const dirs = (await readdir(MODELS, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => path.join(MODELS, e.name, 'manifest.json'));
  return [path.join(MODELS, 'manifest.json'), ...dirs];
}

/** Every manifest entry's `imageUrl` that names a converted picture, pointed at its `.webp`. */
async function updateManifests(renamed: Map<string, string>, dryRun: boolean): Promise<number> {
  let updated = 0;
  for (const file of await manifests()) {
    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    const data = JSON.parse(text) as unknown;
    let changed = false;
    const visit = (node: unknown) => {
      if (Array.isArray(node)) node.forEach(visit);
      else if (node && typeof node === 'object') {
        const entry = node as Record<string, unknown>;
        if (typeof entry.imageUrl === 'string' && renamed.has(entry.imageUrl)) {
          entry.imageUrl = renamed.get(entry.imageUrl);
          changed = true;
          updated++;
        }
        Object.values(entry).forEach(visit);
      }
    };
    visit(data);
    if (changed && !dryRun) await writeFile(file, JSON.stringify(data, null, 2) + (text.endsWith('\n') ? '\n' : ''));
  }
  return updated;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const renamed = new Map<string, string>();
  let before = 0;
  let after = 0;
  for (const folder of FOLDERS) {
    const dir = path.join(ROOT, 'public', 'uploads', folder);
    const names = (await readdir(dir)).filter((name) => /\.(png|jpe?g)$/i.test(name) && !isRuntimeUploadKey(`${folder}/${name}`)).sort();
    for (const name of names) {
      const webpName = name.replace(/\.(png|jpe?g)$/i, '.webp');
      if (names.includes(webpName)) throw new Error(`${folder}/${name}: ${webpName} exists already`);
      const bytes = await readFile(path.join(dir, name));
      const webp = await encodePhotoWebp(bytes);
      before += bytes.byteLength;
      after += webp.byteLength;
      renamed.set(`/uploads/${folder}/${name}`, `/uploads/${folder}/${webpName}`);
      if (dryRun) continue;
      await writeFile(path.join(dir, webpName), webp);
      await unlink(path.join(dir, name));
    }
  }
  const entries = await updateManifests(renamed, dryRun);
  console.log(`${dryRun ? '[dry run] ' : ''}${renamed.size} seed pictures${renamed.size ? `: ${(before / 1e6).toFixed(1)} MB → ${(after / 1e6).toFixed(1)} MB` : ' — all WebP already'}; ${entries} manifest entries ${dryRun ? 'would be ' : ''}pointed at the .webp`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
