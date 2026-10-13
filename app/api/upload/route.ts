import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { API_ERRORS, fail, handle, ok, requireUploader } from '@/lib/api/route';
import { safeKey, storage } from '@/lib/storage';
import { claimUpload } from '@/lib/uploads/claim';
import { IMAGE_EXTENSION, sniffImage } from '@/lib/uploads/sniff';
import { colorsOfImage } from '@/lib/uploads/textureColors';
import { optimizeUploadedTexture } from '@/lib/uploads/textureOptimize';
import { optimizeUploadedImage } from '@/lib/uploads/imageOptimize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const FOLDERS = ['products', 'textures', 'workers', 'categories', 'stores', 'misc'] as const;

const bodySchema = z.object({
  /** The direct upload (`POST /api/uploads`, kind `image`) whose bytes this publishes. */
  upload: z.string().uuid(),
  folder: z.enum(FOLDERS).catch('products').default('products'),
});

/**
 * Publishes an image for products, workers, categories and stores — admin and linked partners.
 * The bytes came straight to storage (docs/uploads.md); here they are claimed, identified by
 * themselves and stored as WebP: a photo within 1600 px at quality 85
 * (`lib/uploads/imageOptimize.ts`), a texture (a floor or wall finish's tileable image) within
 * 2048 px as the shipped finishes are (`lib/uploads/textureOptimize.ts`) — a GIF, or a file WebP
 * would not make smaller, stays as it came. A texture comes back with the colours read off it,
 * for the studio's colour filter (`specs.colors`).
 */
export const POST = handle('POST /api/upload', 'Upload failed', async (req) => {
  const uploader = await requireUploader();
  if (uploader.response) return uploader.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.message, 400);
  const { folder } = parsed.data;

  const { bytes } = await claimUpload(parsed.data.upload, ['image'], Number(uploader.session.user.id));
  const sniffed = sniffImage(bytes);
  if (!sniffed) return fail(API_ERRORS.IMAGE_INVALID, 400);

  const optimized = folder === 'textures' ? await optimizeUploadedTexture(bytes) : await optimizeUploadedImage(bytes, sniffed);
  const mime = optimized.converted ? 'image/webp' : sniffed;
  const key = safeKey(folder, `${Date.now()}-${randomBytes(6).toString('hex')}.${IMAGE_EXTENSION[mime]}`);
  const stored = await storage.put(key, optimized.body, mime);
  const colors = folder === 'textures' ? await colorsOfImage(bytes) : undefined;
  return ok({ url: stored.url, filename: key.split('/').pop(), size: stored.size, colors });
});
