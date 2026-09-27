/**
 * The colours a floor or wall finish is, read off its texture — for the finishes' colour
 * filter in the studio, the way a piece of furniture's are read off its model
 * (`scripts/lib/modelColor.ts`). Nobody types "this oak is beige and brown" into a form, and
 * the product photo of a finish *is* the texture anyway.
 *
 * The image is shrunk to a small square first (every pixel of a 2048-pixel tile would say the
 * same thing a hundred times) and its pixels are sorted into the families of
 * `lib/design/colors` (`colorsOfPixels`). Server-only: sharp is a native module. The upload
 * route reads a texture's colours as it stores it, `pnpm textures:stock` as it writes a
 * finish, and `pnpm textures:colors` for the finishes already in the catalogue.
 */

import sharp from 'sharp';
import { colorsOfPixels } from '@/lib/design/colors';

const SAMPLE_PX = 96;

/** The colours of an image (JPEG, PNG, WebP…), the largest first; empty when it cannot be read. */
export async function colorsOfImage(bytes: Uint8Array): Promise<string[]> {
  try {
    const data = await sharp(bytes).resize(SAMPLE_PX, SAMPLE_PX, { fit: 'fill' }).ensureAlpha().toColourspace('srgb').raw().toBuffer();
    return colorsOfPixels(data, 4);
  } catch {
    return [];
  }
}
