import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { API_ERRORS, fail, handle, ok, requireCatalogEditor } from '@/lib/api/route';
import { safeKey, storage } from '@/lib/storage';
import { claimUpload } from '@/lib/uploads/claim';
import { MODEL_EXTENSION, sniffModel } from '@/lib/uploads/sniff';
import { inspectGlb, unsupportedExtension } from '@/lib/uploads/glb';
import { optimizeUploadedModel } from '@/lib/uploads/glbOptimizeServer';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A large scan through the recipe takes tens of seconds on one vCPU (docs/3d-assets.md#uploads-are-optimized).
export const maxDuration = 300;

const bodySchema = z.object({
  /** The direct upload (`POST /api/uploads`, kind `model`) whose bytes this publishes. */
  upload: z.string().uuid(),
});

/**
 * Publishes a furniture model for the studio, by admin or a store for its own products. The
 * file came straight to storage (docs/uploads.md, 40 MB at most — `lib/uploads/kinds.ts`); here
 * it is claimed and identified by its bytes: GLB only, with meshes, without a compression the
 * studio cannot read. The product form stores the returned URL in `products.model3dUrl`, which
 * is what makes a product placeable at all. What is stored is the optimized file
 * (`glbOptimizeServer`) — usually the one the form's browser already optimized, kept as it came.
 */
export const POST = handle('POST /api/upload/model', 'Upload failed', async (req) => {
  const editor = await requireCatalogEditor();
  if (editor.response) return editor.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.message, 400);

  const { bytes } = await claimUpload(parsed.data.upload, ['model'], Number(editor.session.user.id));
  const mime = sniffModel(bytes);
  if (!mime) return fail(API_ERRORS.MODEL_INVALID, 400);
  const info = inspectGlb(bytes);
  if (!info || info.meshes === 0) return fail(API_ERRORS.MODEL_INVALID, 400);
  const blocked = unsupportedExtension(info);
  if (blocked) {
    log.info('model refused: unsupported extension', { extension: blocked, generator: info.generator });
    return fail(API_ERRORS.MODEL_UNSUPPORTED_COMPRESSION, 400);
  }

  const { body, result } = await optimizeUploadedModel(bytes);
  const key = safeKey('models', `${Date.now()}-${randomBytes(6).toString('hex')}.${MODEL_EXTENSION}`);
  const stored = await storage.put(key, body, mime);
  log.info('model uploaded', { key, bytes: stored.size, received: bytes.length, optimized: result.status === 'optimized' ? 'server' : result.reason, by: editor.session.user.id, generator: info.generator, meshes: info.meshes, images: info.images });
  return ok({ url: stored.url, filename: key.split('/').pop(), size: stored.size });
});
