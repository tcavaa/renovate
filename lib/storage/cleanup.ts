import { eq, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { products, stores, teams, workerWorks, workers } from '@/lib/db/schema';
import { log } from '@/lib/log';
import { storage } from './index';
import { isRuntimeUploadKey } from './uploadKeys';

export { droppedUrls, productFileUrls } from './uploadKeys';

/**
 * Files nobody points at any more, removed when the row that pointed at them goes.
 *
 * A product deleted used to leave its photo and its 3D model in storage for ever, and so did a
 * photo replaced in the form. This is called with the URLs a deleted or edited row let go of,
 * *after* the write, and removes each one only when:
 *
 *  - storage made it (`storage.keyFor` knows the URL — a static `/models/…` or `/textures/…`
 *    asset, or a link to another site, is not ours to delete);
 *  - it is a runtime upload (`isRuntimeUploadKey`) — the seed pictures under `public/uploads`
 *    ship with the repo, and deleting one would delete a tracked file;
 *  - no row anywhere still uses it (another product, a logo, an avatar, a portfolio photo).
 *
 * Never fatal: a file left behind is a few kilobytes, a failed delete of the row is not.
 */
export async function removeUnusedUploads(urls: Array<string | null | undefined>): Promise<number> {
  let removed = 0;
  for (const url of new Set(urls.filter((u): u is string => typeof u === 'string' && u.length > 0))) {
    const key = storage.keyFor(url);
    if (!key || !isRuntimeUploadKey(key)) continue;
    try {
      if (await stillUsed(url)) continue;
      await storage.delete(key);
      removed++;
    } catch (e) {
      log.warn('unused upload not removed', { key, err: e });
    }
  }
  if (removed > 0) log.info('unused uploads removed', { removed });
  return removed;
}

async function stillUsed(url: string): Promise<boolean> {
  const hits = await Promise.all([
    db.select({ id: products.id }).from(products).where(or(eq(products.imageUrl, url), eq(products.model3dUrl, url), eq(products.textureUrl, url))).limit(1),
    db.select({ id: stores.id }).from(stores).where(eq(stores.logoUrl, url)).limit(1),
    db.select({ id: teams.id }).from(teams).where(eq(teams.logoUrl, url)).limit(1),
    db.select({ id: workers.id }).from(workers).where(eq(workers.avatarUrl, url)).limit(1),
    db.select({ id: workerWorks.id }).from(workerWorks).where(eq(workerWorks.imageUrl, url)).limit(1),
  ]);
  return hits.some((rows) => rows.length > 0);
}
