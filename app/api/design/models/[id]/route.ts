import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { products } from '@/lib/db/schema';
import { API_ERRORS, fail, handle, ok, parseId, requireSession } from '@/lib/api/route';
import { storage } from '@/lib/storage';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A person removes one of their own uploads: the row and its files. Only the owner may. */
export const DELETE = handle('DELETE /api/design/models/[id]', 'Delete failed', async (_req, { params }) => {
  const { session, response } = await requireSession();
  if (response) return response;
  const { id, response: bad } = parseId(params.id);
  if (bad) return bad;
  const userId = Number(session.user.id);

  const [row] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, id), eq(products.ownerUserId, userId)))
    .limit(1);
  if (!row) return fail(API_ERRORS.NOT_FOUND, 404);

  await db.delete(products).where(eq(products.id, row.id));
  for (const url of [row.model3dUrl, row.imageUrl]) {
    const key = url ? storage.keyFor(url) : null;
    if (key) await storage.delete(key).catch((e: unknown) => log.warn('own model file not removed', { key, error: String(e) }));
  }
  log.info('own model removed', { id: row.id, userId });
  return ok({ id: row.id });
});
