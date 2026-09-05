import { randomBytes } from 'node:crypto';
import { auth } from '@/auth';
import { RATE_RULES, rateLimited } from '@/lib/api/rateLimit';
import { fail, handle, ok } from '@/lib/api/route';
import { safeKey, storage } from '@/lib/storage';
import { IMAGE_EXTENSION, sniffImage } from '@/lib/uploads/sniff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 12 * 1024 * 1024;

/**
 * Floor-plan upload.
 *
 * Unlike `/api/upload` this is open to visitors, not just admins — uploading a plan is the
 * first thing anyone does in the studio, and requiring an account before they have seen
 * anything would kill the funnel. It is therefore deliberately narrow: images only (checked
 * by their bytes, not the declared type), 12 MB, a fixed folder, a generated filename, and
 * a per-IP rate limit.
 *
 * Parsing happens in the browser or in `/api/design/parse-plan`; this endpoint only keeps
 * the image so a saved project can show the plan it came from.
 */
export const POST = handle('POST /api/design/upload-plan', 'Upload failed', async (req) => {
  const limited = rateLimited(req, RATE_RULES.uploadPlan);
  if (limited) return limited;

  const file = (await req.formData()).get('file');
  if (!(file instanceof File)) return fail('No file provided', 400);
  if (file.size > MAX_BYTES) return fail('File too large (max 12MB)', 400);

  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = sniffImage(bytes);
  if (!mime || mime === 'image/gif') return fail('Unsupported file type', 400);

  const session = await auth();
  const owner = session?.user?.id ? `u${session.user.id}` : 'guest';
  const key = safeKey('plans', `${owner}-${Date.now()}-${randomBytes(6).toString('hex')}.${IMAGE_EXTENSION[mime]}`);

  const stored = await storage.put(key, bytes, mime);
  return ok({ url: stored.url, size: stored.size });
});
