'use client';

/**
 * Browser-side bridge between an uploaded file and the (isomorphic) plan parser.
 *
 * Everything the parser needs is raw RGBA, so this is the only part of the pipeline that
 * touches `window`, `Image` or `<canvas>`. Keeping it separate is what lets the parser be
 * unit-tested in Node with a synthetic bitmap.
 */

import type { RasterImage } from './planParser';
import { claimWith, sendToStorage } from '@/lib/uploads/direct';

/**
 * Working resolution for parsing.
 *
 * The parser sweeps ~22 thresholds over the whole image, so cost scales with pixel count.
 * 1100 px on the long edge keeps a typical plan under half a second while still resolving a
 * 10 cm wall as several pixels.
 */
export const MAX_PARSE_EDGE = 1100;

export interface LoadedPlanImage {
  raster: RasterImage;
  /** Object URL for showing the plan behind the editor. Revoke it when done. */
  previewUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  /** raster px → original image px. */
  scale: number;
}

export async function loadPlanImage(file: File): Promise<LoadedPlanImage> {
  const previewUrl = URL.createObjectURL(file);

  try {
    const image = await decode(file, previewUrl);
    const naturalWidth = image.width;
    const naturalHeight = image.height;

    const scale = Math.min(1, MAX_PARSE_EDGE / Math.max(naturalWidth, naturalHeight));
    const width = Math.max(1, Math.round(naturalWidth * scale));
    const height = Math.max(1, Math.round(naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('canvas-unavailable');

    // Plans are line drawings on white; anything transparent should read as paper, not ink.
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image as CanvasImageSource, 0, 0, width, height);

    const data = ctx.getImageData(0, 0, width, height);
    if ('close' in image && typeof image.close === 'function') image.close();

    return {
      raster: { data: data.data, width, height },
      previewUrl,
      naturalWidth,
      naturalHeight,
      scale: 1 / scale,
    };
  } catch (error) {
    URL.revokeObjectURL(previewUrl);
    throw error;
  }
}

async function decode(file: File, url: string): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // Safari refuses some encodings here; fall through to the <img> path.
    }
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image-decode-failed'));
    img.src = url;
  });
}

/**
 * Uploads the plan so a saved project can display the drawing it came from (and the Claude
 * reader can read it): straight to storage, then published by `/api/design/upload-plan`
 * (docs/uploads.md). Kept as it came unless it is bigger than anything reads
 * (`optimizePlanForUpload`).
 */
export async function uploadPlanImage(file: File): Promise<string | null> {
  try {
    const { optimizePlanForUpload } = await import('@/lib/uploads/browserImage');
    const ready = await optimizePlanForUpload(file);
    const upload = await sendToStorage('plan', ready);
    const { url } = await claimWith<{ url: string }>('/api/design/upload-plan', { upload });
    return url;
  } catch {
    // A failed upload should not block the design — the parse already happened locally.
    return null;
  }
}
