import { randomBytes } from 'node:crypto';
import { fail, handle, ok, requireAdmin } from '@/lib/api/route';
import { safeKey, storage } from '@/lib/storage';
import { MODEL_EXTENSION, sniffModel } from '@/lib/uploads/sniff';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Textures are most of a furniture GLB; the partner drop's largest single model is under
 * 4 MB after compression, an uncompressed export with 2k maps can reach 30. Anything bigger
 * would stall the studio on a phone anyway.
 */
export const MAX_MODEL_BYTES = 40 * 1024 * 1024;

/**
 * Admin upload of a furniture model for the studio. GLB only, identified by its bytes: the
 * product form stores the returned URL in `products.model3dUrl`, which is what makes a
 * product placeable at all.
 */
export const POST = handle('POST /api/upload/model', 'Upload failed', async (req) => {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;

  const formData = await req.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) return fail('No file provided', 400);
  if (file.size > MAX_MODEL_BYTES) return fail(`File too large (max ${MAX_MODEL_BYTES / 1024 / 1024}MB)`, 400);

  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = sniffModel(bytes);
  if (!mime) return fail('Not a binary glTF (.glb) file', 400);

  const key = safeKey('models', `${Date.now()}-${randomBytes(6).toString('hex')}.${MODEL_EXTENSION}`);
  const stored = await storage.put(key, bytes, mime);
  log.info('model uploaded', { key, bytes: stored.size, by: admin.session.user.id });
  return ok({ url: stored.url, filename: key.split('/').pop(), size: stored.size });
});
