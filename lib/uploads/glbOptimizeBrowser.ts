/**
 * The uploader's own pass of the GLB recipe (`glbOptimize.ts`), run in the browser before the
 * file is sent: the upload is quicker, and a 5–10 MB export comes out at 0.4–1 MB. Textures go
 * through a canvas. A browser that cannot
 * write WebP (Safari: `convertToBlob` quietly answers with a PNG) shrinks an oversized JPEG as a
 * JPEG and leaves the rest to the server's pass (`glbOptimizeServer.ts`), which finishes the job
 * either way. The two upload forms import this on demand: its libraries are a few hundred kB
 * nobody needs until they pick a file.
 */

import { WebIO } from '@gltf-transform/core';
import { configureGlbIO, optimizeGlb, WEBP_QUALITY, type GlbOptimizeResult, type TextureEncoder } from './glbOptimize';
import { MODEL_MIME } from './sniff';

let io: WebIO | null = null;

type Context2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

/** A 2D surface to draw a texture on, and to write it back out as an image file. */
function surface(width: number, height: number): { ctx: Context2D | null; toBlob: (type: string, quality: number) => Promise<Blob | null> } {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    return { ctx: canvas.getContext('2d'), toBlob: (type, quality) => canvas.convertToBlob({ type, quality }) };
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { ctx: canvas.getContext('2d'), toBlob: (type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality)) };
}

const encodeWithCanvas: TextureEncoder = async (image, mimeType, maxPx) => {
  // The pixels as stored — no colour management, no premultiplying — which is how three's
  // loader hands them to the GPU too.
  const bitmap = await createImageBitmap(new Blob([image.slice()], { type: mimeType }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  try {
    const scale = maxPx ? Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height)) : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const { ctx, toBlob } = surface(width, height);
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);
    const webp = await toBlob('image/webp', WEBP_QUALITY / 100);
    if (webp?.type === 'image/webp') return { image: new Uint8Array(await webp.arrayBuffer()), mimeType: 'image/webp' };
    // No WebP writer here: a JPEG that has to shrink shrinks as a JPEG; the rest waits for the server.
    if (mimeType === 'image/jpeg' && scale < 1) {
      const jpeg = await toBlob('image/jpeg', 0.9);
      if (jpeg?.type === 'image/jpeg') return { image: new Uint8Array(await jpeg.arrayBuffer()), mimeType: 'image/jpeg' };
    }
    return null;
  } finally {
    bitmap.close();
  }
};

/**
 * The file to send: the optimized one when the recipe made it smaller, otherwise the one that
 * was picked (and `result` says why). Never throws.
 */
export async function optimizeModelFile(file: File): Promise<{ file: File; result: GlbOptimizeResult | null }> {
  try {
    io ??= configureGlbIO(new WebIO());
    const result = await optimizeGlb(io, new Uint8Array(await file.arrayBuffer()), encodeWithCanvas);
    if (result.status !== 'optimized') return { file, result };
    return { file: new File([result.bytes.slice()], file.name, { type: MODEL_MIME }), result };
  } catch {
    return { file, result: null };
  }
}
