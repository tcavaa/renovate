/**
 * The model pipelines' product photos, as WebP (`lib/uploads/imageOptimize.ts`, what `pnpm
 * photos:webp` made of the seed pictures): a photo a script renders, fetches or copies is written
 * as `<name>.webp`, and one it expects to find under its old name (`ind-bed-woody.jpg`, a
 * rendered `fixture-x.png`) is found as its `.webp` twin.
 */

import { existsSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { encodePhotoWebp } from '../../lib/uploads/imageOptimize';

/** `file` with its extension swapped for `.webp`. */
export function webpPath(file: string): string {
  return file.replace(/\.(png|jpe?g|webp)$/i, '') + '.webp';
}

/** The photo that stands for `file`: its `.webp` twin when there is one, else the file itself, else null. */
export function existingPhoto(file: string): string | null {
  const webp = webpPath(file);
  if (existsSync(webp)) return webp;
  return existsSync(file) ? file : null;
}

/** Writes `image` (any format sharp reads) as `<file>.webp`, removes an older PNG or JPEG of the same name, and returns the `.webp` path. */
export async function writePhotoWebp(image: Uint8Array, file: string): Promise<string> {
  const dest = webpPath(file);
  await writeFile(dest, await encodePhotoWebp(image));
  const base = dest.slice(0, -'.webp'.length);
  for (const ext of ['png', 'jpg', 'jpeg']) await rm(`${base}.${ext}`, { force: true });
  return dest;
}

/** A public URL for a file under `public/`. */
export function publicUrl(root: string, file: string): string {
  return '/' + path.relative(path.join(root, 'public'), file).split(path.sep).join('/');
}
