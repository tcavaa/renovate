import { randomBytes } from 'node:crypto';
import { fail, handle, ok, requireUploader } from '@/lib/api/route';
import { safeKey, storage } from '@/lib/storage';
import { IMAGE_EXTENSION, sniffImage } from '@/lib/uploads/sniff';
import { colorsOfImage } from '@/lib/uploads/textureColors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 8 * 1024 * 1024;
const FOLDER_WHITELIST = new Set(['products', 'textures', 'workers', 'categories', 'stores', 'misc']);

/**
 * Image upload for products, workers, categories and stores — admin and linked partners.
 * Visitors upload plans elsewhere. A texture (a floor or wall finish's tileable image) comes
 * back with the colours read off it, for the studio's colour filter (`specs.colors`).
 */
export const POST = handle('POST /api/upload', 'Upload failed', async (req) => {
  const uploader = await requireUploader();
  if (uploader.response) return uploader.response;

  const formData = await req.formData();
  const file = formData.get('file');
  const folderInput = String(formData.get('folder') ?? 'products');
  const folder = FOLDER_WHITELIST.has(folderInput) ? folderInput : 'products';

  if (!(file instanceof File)) return fail('No file provided', 400);
  if (file.size > MAX_BYTES) return fail('File too large (max 8MB)', 400);

  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = sniffImage(bytes);
  if (!mime) return fail('Unsupported file type', 400);

  const key = safeKey(folder, `${Date.now()}-${randomBytes(6).toString('hex')}.${IMAGE_EXTENSION[mime]}`);
  const stored = await storage.put(key, bytes, mime);
  const colors = folder === 'textures' ? await colorsOfImage(bytes) : undefined;
  return ok({ url: stored.url, filename: key.split('/').pop(), size: stored.size, colors });
});
