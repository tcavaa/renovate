import { auth } from '@/auth';
import { getDesignCatalog, loadOwnProducts } from '@/lib/api/designCatalog';
import { handle, ok } from '@/lib/api/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The whole design catalogue in one response.
 *
 * The studio matches products to furniture slots on the client, so it needs the full set
 * rather than a page of it. That is a deliberate trade: ~190 KB before gzip for ~200
 * products, and in exchange changing style, budget or an individual product is instant and
 * needs no network. The payload is assembled once on the server and cached until an admin
 * write invalidates it (see `lib/api/designCatalog.ts`).
 */
export const GET = handle('GET /api/design/catalog', 'Failed to load design catalogue', async () => {
  const catalog = await getDesignCatalog();
  // A signed-in person's own uploads come after the shared list, read fresh: they are theirs alone.
  const session = await auth();
  const own = session?.user?.id ? await loadOwnProducts(Number(session.user.id)) : [];
  return ok(own.length ? { ...catalog, products: [...catalog.products, ...own] } : catalog, {
    headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' },
  });
});
