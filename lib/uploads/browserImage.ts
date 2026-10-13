/**
 * Pictures made smaller in the browser before they are sent (docs/uploads.md): a quicker upload
 * on a phone line, less for the server to do, less staged. Each helper keeps the file as it came
 * whenever re-encoding would not help or the browser cannot do it (Safari writes no WebP) — the
 * server's own pass (`imageOptimize.ts`, `textureOptimize.ts`) still runs on whatever arrives.
 *
 * Browser-only (`createImageBitmap`, `<canvas>`).
 */
import { UPLOAD_KINDS } from './kinds';

/** As the server's photo pass (`PHOTO_MAX_PX`): a product page shows 800 CSS px, twice that on a retina screen. */
const PHOTO_MAX_PX = 1600;
/**
 * A plan's longest side. Past this a plan is a scan larger than anything reads it at — the
 * Claude reader works at about 1600 px, the parser at 1100, the board shows it at screen size —
 * and 4096 px still draws a 10 cm wall of a 25 m flat about 16 px thick.
 */
const PLAN_MAX_PX = 4096;
const WEBP_PHOTO_QUALITY = 0.9;
const RENDER_QUALITY = 0.9;

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}

async function decode(file: Blob): Promise<Decoded | null> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  } catch {
    // Safari refuses some encodings here; the <img> path decodes them.
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('decode'));
        el.src = url;
      });
      return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
    } catch {
      URL.revokeObjectURL(url);
      return null;
    }
  }
}

async function encode(image: Decoded, scale: number, type: string, quality: number | undefined, paper: boolean): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  // A plan is ink on paper: transparency reads as white, never as the black a JPEG would make of it.
  if (paper) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image.source, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  // A browser that cannot write the type quietly writes PNG instead.
  return blob && blob.type === type ? blob : null;
}

const renamed = (name: string, ext: string) => `${name.replace(/\.[a-z0-9]+$/i, '') || 'image'}.${ext}`;

/**
 * A photo for the catalogue (a product, a store's logo, one's own piece): within 1600 px, as
 * WebP, when that is smaller — a GIF (perhaps animated) and a small WebP stay as they are.
 */
export async function optimizePhotoForUpload(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  const image = await decode(file);
  if (!image) return file;
  try {
    const scale = Math.min(1, PHOTO_MAX_PX / Math.max(image.width, image.height));
    if (scale === 1 && file.type === 'image/webp') return file;
    const webp = await encode(image, scale, 'image/webp', WEBP_PHOTO_QUALITY, false);
    if (!webp || (scale === 1 && webp.size >= file.size)) return file;
    return new File([webp], renamed(file.name, 'webp'), { type: 'image/webp' });
  } finally {
    image.close();
  }
}

/**
 * A floor plan, kept exactly as it came unless it is larger than anything will read it at
 * (`PLAN_MAX_PX`) or than storage takes (`UPLOAD_KINDS.plan`): then it is scaled down, aspect
 * kept, smoothed at the best quality the browser has — a PNG to PNG, lossless, so thin lines
 * and small figures stay sharp; a photo or a scan to JPEG at 0.92. Never squeezed to fit a
 * request limit: the file goes to storage directly.
 */
export async function optimizePlanForUpload(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  const image = await decode(file);
  if (!image) return file;
  try {
    const longest = Math.max(image.width, image.height);
    if (longest <= PLAN_MAX_PX && file.size <= UPLOAD_KINDS.plan.maxBytes) return file;
    const scale = Math.min(1, PLAN_MAX_PX / longest);
    const lossless = file.type === 'image/png';
    const out = lossless ? await encode(image, scale, 'image/png', undefined, true) : await encode(image, scale, 'image/jpeg', 0.92, true);
    if (out && out.size <= UPLOAD_KINDS.plan.maxBytes) return new File([out], renamed(file.name, lossless ? 'png' : 'jpg'), { type: out.type });
    // A huge line drawing that stays too big as PNG: JPEG at high quality keeps it legible.
    const jpeg = await encode(image, scale, 'image/jpeg', 0.9, true);
    return jpeg ? new File([jpeg], renamed(file.name, 'jpg'), { type: 'image/jpeg' }) : file;
  } finally {
    image.close();
  }
}

/**
 * The studio's screenshot (a PNG of the canvas, several MB at a retina size) for a photo: WebP,
 * or JPEG where the browser writes no WebP — the view is opaque, and at 0.9 the render made
 * from it later loses nothing it would use.
 */
export async function compressScreenshot(png: Blob): Promise<File> {
  const image = await decode(png);
  if (!image) return new File([png], 'studio-view.png', { type: 'image/png' });
  try {
    const out = (await encode(image, 1, 'image/webp', RENDER_QUALITY, false)) ?? (await encode(image, 1, 'image/jpeg', RENDER_QUALITY, false));
    if (!out || out.size >= png.size) return new File([png], 'studio-view.png', { type: 'image/png' });
    return new File([out], `studio-view.${out.type === 'image/webp' ? 'webp' : 'jpg'}`, { type: out.type });
  } finally {
    image.close();
  }
}
