import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { auth } from '@/auth';
import { API_ERRORS, fail, handle, ok } from '@/lib/api/route';
import { safeKey, storage } from '@/lib/storage';
import { claimUpload } from '@/lib/uploads/claim';
import { IMAGE_EXTENSION, sniffImage } from '@/lib/uploads/sniff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const bodySchema = z.object({
  /** The direct upload (`POST /api/uploads`, kind `plan`) whose bytes this publishes. */
  upload: z.string().uuid(),
});

/**
 * Publishes a floor plan.
 *
 * Open to visitors, not just accounts — uploading a plan is the first thing anyone does in the
 * studio, and requiring an account before they have seen anything would kill the funnel. It is
 * therefore deliberately narrow: the bytes were granted under the plan's own per-address limit
 * and size (`POST /api/uploads`, kind `plan`, 20 MB — docs/uploads.md), they are images only
 * (checked by their bytes, not the declared type; no GIF), and they land in a fixed folder
 * under a generated name. The plan is kept exactly as it came — its thin lines and small figures
 * are what it is read by.
 *
 * Parsing happens in the browser or in `/api/design/parse-plan`; this endpoint only keeps the
 * image so a saved project can show the plan it came from.
 */
export const POST = handle('POST /api/design/upload-plan', 'Upload failed', async (req) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.message, 400);

  const session = await auth();
  const userId = session?.user?.id ? Number(session.user.id) : null;
  const { bytes } = await claimUpload(parsed.data.upload, ['plan'], userId);
  const mime = sniffImage(bytes);
  if (!mime || mime === 'image/gif') return fail(API_ERRORS.IMAGE_INVALID, 400);

  const owner = userId ? `u${userId}` : 'guest';
  const key = safeKey('plans', `${owner}-${Date.now()}-${randomBytes(6).toString('hex')}.${IMAGE_EXTENSION[mime]}`);
  const stored = await storage.put(key, bytes, mime);
  return ok({ url: stored.url, size: stored.size });
});
