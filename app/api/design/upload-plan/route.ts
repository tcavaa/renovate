import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { API_ERRORS, fail, handle, ok } from '@/lib/api/route';
import { safeKey, storage } from '@/lib/storage';
import { claimUpload } from '@/lib/uploads/claim';
import { IMAGE_EXTENSION, sniffImage } from '@/lib/uploads/sniff';
import { requirePlanFeature } from '@/lib/plans/server';

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
 * Premium's and Professional's (docs/subscriptions.md — `PLAN_REQUIRED` otherwise; Free draws its
 * plan, and a project is a signed-in person's anyway). Deliberately narrow: the bytes were granted
 * under the plan's own per-address limit and size (`POST /api/uploads`, kind `plan`, 20 MB —
 * docs/uploads.md), they are images only (checked by their bytes, not the declared type; no GIF),
 * and they land in a fixed folder under a generated name. The plan is kept exactly as it came —
 * its thin lines and small figures are what it is read by.
 *
 * Parsing happens in the browser or in `/api/design/parse-plan`; this endpoint only keeps the
 * image so a saved project can show the plan it came from.
 */
export const POST = handle('POST /api/design/upload-plan', 'Upload failed', async (req) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.message, 400);

  const allowed = await requirePlanFeature('planUpload');
  if (allowed.response) return allowed.response;
  const userId = Number(allowed.session.user.id);
  const { bytes } = await claimUpload(parsed.data.upload, ['plan'], userId);
  const mime = sniffImage(bytes);
  if (!mime || mime === 'image/gif') return fail(API_ERRORS.IMAGE_INVALID, 400);

  const key = safeKey('plans', `u${userId}-${Date.now()}-${randomBytes(6).toString('hex')}.${IMAGE_EXTENSION[mime]}`);
  const stored = await storage.put(key, bytes, mime);
  return ok({ url: stored.url, size: stored.size });
});
