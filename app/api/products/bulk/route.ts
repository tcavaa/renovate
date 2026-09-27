import { inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { products } from '@/lib/db/schema';
import { API_ERRORS, fail, handle, ok, requireCatalogEditor } from '@/lib/api/route';
import { invalidateDesignCatalog } from '@/lib/api/designCatalog';
import { canDeleteProduct, canEditProduct } from '@/lib/api/productAccess';
import { canDeleteIn } from '@/lib/auth/roles';
import { productFileUrls, removeUnusedUploads } from '@/lib/storage/cleanup';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bulkSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(200),
  action: z.enum(['show', 'hide', 'delete']),
});

/**
 * Many products at once — shown, hidden or deleted — from the admin's product list and a
 * store's own shelf. The same rules as one product: showing and hiding follow `canEditProduct`
 * (staff whose job covers the products — any; a store — its own), deleting `canDeleteProduct`
 * (admin — any; a store — its own; the catalogue agent — none, refused outright); anything else
 * in the selection is skipped, not refused wholesale. A deleted product's photo, model and
 * texture go with it when nothing else uses them.
 */
export const POST = handle('POST /api/products/bulk', 'Bulk change failed', async (req) => {
  const editor = await requireCatalogEditor();
  if (editor.response) return editor.response;
  const parsed = bulkSchema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);
  const { ids, action } = parsed.data;
  // Deleting is admin's and a store's own; the catalogue agent shows and hides, and deletes nothing.
  const { role } = editor.session.user;
  if (action === 'delete' && role !== 'store' && !canDeleteIn(role, 'products')) return fail(API_ERRORS.FORBIDDEN, 403);
  const may = action === 'delete' ? canDeleteProduct : canEditProduct;

  const rows = await db
    .select({ id: products.id, storeId: products.storeId, imageUrl: products.imageUrl, model3dUrl: products.model3dUrl, textureUrl: products.textureUrl, ownerUserId: products.ownerUserId })
    .from(products)
    .where(inArray(products.id, [...new Set(ids)]));
  // Someone's own furniture is theirs alone, whoever is editing the catalogue.
  const allowed = rows.filter((p) => p.ownerUserId == null && may(p, editor.session.user));
  const allowedIds = allowed.map((p) => p.id);
  const skipped = ids.length - allowedIds.length;

  if (allowedIds.length > 0) {
    if (action === 'delete') {
      await db.delete(products).where(inArray(products.id, allowedIds));
      await removeUnusedUploads(allowed.flatMap(productFileUrls));
    } else {
      await db.update(products).set({ isActive: action === 'show' }).where(inArray(products.id, allowedIds));
    }
    invalidateDesignCatalog();
  }
  log.info('products changed in bulk', { by: editor.session.user.id, action, done: allowedIds.length, skipped });
  return ok({ done: allowedIds.length, skipped });
});
