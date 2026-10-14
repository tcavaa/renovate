import { revalidateTag, unstable_cache } from 'next/cache';
import { EMPTY_SHELF } from '@/lib/design/shelf';
import { loadDesignCatalog, type DesignCatalog } from './designCatalogLoad';

export { loadOwnProducts, type DesignCatalog } from './designCatalogLoad';

/**
 * Cache tag for the design catalogue. Admin writes to products, stores, categories or the studio's rooms call
 * `invalidateDesignCatalog()`, so the studio never sees a stale price for longer than one
 * request; the daily expiry below is only a safety net for writes that bypass the API (seed
 * scripts run from a laptop — those reach the studio within a day or at the next admin edit).
 */
export const DESIGN_CATALOG_TAG = 'design-catalog';

/**
 * The whole design catalogue — ~200 products with their stores and the shelf — assembled once
 * and served from the server cache. Every studio visit used to run the queries below.
 */
export async function getDesignCatalog(): Promise<DesignCatalog> {
  const first = await cachedPart(0);
  const rest = await Promise.all(Array.from({ length: first.parts - 1 }, (_, i) => cachedPart(i + 1)));
  // Parts revalidate one by one, so for a moment two may come from different loads: no product twice.
  const seen = new Set<number>();
  const products = [first, ...rest].flatMap((p) => p.products).filter((p) => !seen.has(p.id) && seen.add(p.id));
  return { stores: first.stores, shelf: first.shelf, products };
}

/**
 * Products per cached part. Next's data cache refuses an entry over 2 MB, and the whole
 * catalogue passed that with the 3D library (~1.2 KB a product, its files' long storage URLs) —
 * the refusal kept serving the last copy that fitted. Part 0 also carries the stores and the shelf.
 */
const PRODUCTS_PER_PART = 600;

const cachedPart = unstable_cache(
  async (part: number): Promise<DesignCatalog & { parts: number }> => {
    const catalog = await loadShared();
    const parts = Math.max(1, Math.ceil(catalog.products.length / PRODUCTS_PER_PART));
    const products = catalog.products.slice(part * PRODUCTS_PER_PART, (part + 1) * PRODUCTS_PER_PART);
    return part === 0 ? { ...catalog, products, parts } : { products, stores: [], shelf: EMPTY_SHELF, parts };
  },
  // Per deployment: a deploy runs `models:seed`, and Vercel's data cache outlives deployments.
  [DESIGN_CATALOG_TAG, 'parts', process.env.VERCEL_DEPLOYMENT_ID ?? ''],
  // A day: admin writes invalidate the tag at once, so expiry only catches writes that bypass the
  // API (a script run from a laptop). Every rebuild reads ~2–3 MB of rows from Supabase, which
  // counts against its monthly egress — every 5 minutes, that alone came to gigabytes.
  { tags: [DESIGN_CATALOG_TAG], revalidate: 86_400 },
);

/** One load for the parts that miss together on this instance, instead of one per part. */
let shared: { at: number; load: Promise<DesignCatalog> } | null = null;
function loadShared(): Promise<DesignCatalog> {
  if (!shared || Date.now() - shared.at > 10_000) {
    const load = loadDesignCatalog().catch((err: unknown) => {
      shared = null;
      throw err;
    });
    shared = { at: Date.now(), load };
  }
  return shared.load;
}

export function invalidateDesignCatalog(): void {
  revalidateTag(DESIGN_CATALOG_TAG, 'max');
}

