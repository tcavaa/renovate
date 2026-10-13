import { and, eq, gt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { uploads } from '@/lib/db/schema';
import { API_ERRORS, fail, handle, ok } from '@/lib/api/route';
import { storage } from '@/lib/storage';
import { writeLocalStaged } from '@/lib/storage/local';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The local driver's stand-in for a storage service's signed upload URL (development and the
 * e2e flows): the browser `PUT`s a granted upload's bytes here, under the staging key the server
 * chose. Only for an upload still pending and in time, only up to its kind's limit — counted as
 * the bytes arrive, not believed from `Content-Length` — and only once. With Supabase Storage
 * this route answers 404: the bytes go to Supabase.
 */
export const PUT = handle('PUT /api/uploads/staging', 'Upload failed', async (req) => {
  if (storage.name !== 'local') return fail(API_ERRORS.NOT_FOUND, 404);
  const key = new URL(req.url).searchParams.get('key') ?? '';
  const [row] = await db
    .select({ maxBytes: uploads.maxBytes })
    .from(uploads)
    .where(and(eq(uploads.stagingKey, key), eq(uploads.status, 'pending'), gt(uploads.expiresAt, new Date())))
    .limit(1);
  if (!row) return fail(API_ERRORS.UPLOAD_EXPIRED, 410);
  if ((await storage.stagedSize(key)) != null) return fail(API_ERRORS.UPLOAD_EXPIRED, 409);

  const chunks: Uint8Array[] = [];
  let received = 0;
  const reader = req.body?.getReader();
  if (!reader) return fail(API_ERRORS.UPLOAD_MISSING, 400);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > row.maxBytes) {
      await reader.cancel();
      return fail(API_ERRORS.FILE_TOO_LARGE, 413);
    }
    chunks.push(value);
  }
  await writeLocalStaged(key, Buffer.concat(chunks));
  return ok({ key, size: received });
});
