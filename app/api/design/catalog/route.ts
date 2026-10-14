import { createHash } from 'node:crypto';
import { auth } from '@/auth';
import { getDesignCatalog, loadOwnProducts } from '@/lib/api/designCatalog';
import { handle } from '@/lib/api/route';
import { packCatalog } from '@/lib/design/catalogWire';
import { storage } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The whole design catalogue in one response.
 *
 * The studio matches products to furniture slots on the client, so it needs the full set
 * rather than a page of it — with the 3D library about 2 000 products. In exchange, changing
 * style, budget or an individual product is instant and needs no network. The payload is
 * assembled once on the server and cached until an admin write invalidates it (see
 * `lib/api/designCatalog.ts`), and it is sent packed (`lib/design/catalogWire.ts`: stores by id,
 * storage URLs without their shared prefix, no `null`s) — about half the JSON.
 *
 * The browser keeps its copy and asks again with its ETag every time (`no-cache`): the answer
 * is a 304 with no body until the catalogue — or the person's own uploads, which are in the
 * tag — has changed, so a studio opened again downloads nothing.
 */
export const GET = handle('GET /api/design/catalog', 'Failed to load design catalogue', async (req) => {
  const catalog = await getDesignCatalog();
  // A signed-in person's own uploads come after the shared list, read fresh: they are theirs alone.
  const session = await auth();
  const own = session?.user?.id ? await loadOwnProducts(Number(session.user.id)) : [];
  const data = packCatalog(own.length ? { ...catalog, products: [...catalog.products, ...own] } : catalog, storage.urlFor(''));
  const body = JSON.stringify({ data, error: null });
  const etag = `"${createHash('sha1').update(body).digest('base64url')}"`;
  const headers = { ETag: etag, 'Cache-Control': 'private, no-cache', Vary: 'Cookie' };
  // The CDN may have weakened the tag it passed on (W/"…") when it compressed the body.
  const asked = req.headers.get('if-none-match')?.split(',').map((tag) => tag.trim().replace(/^W\//, '')) ?? [];
  if (asked.includes(etag)) return new Response(null, { status: 304, headers });
  return new Response(body, { headers: { ...headers, 'Content-Type': 'application/json' } });
});
