import { and, eq, isNull, or } from 'drizzle-orm';
import { products, stores } from '@/lib/db/schema';
import { canAdmin, type UserRole } from '@/lib/auth/roles';

/**
 * Who may see a product and who may change it — one set of rules for every read and write.
 *
 * A product is **public** when it is active, sold by no store or by an active one (a store that
 * registered itself stays inactive until admin approves it, and so do its products, whatever
 * their own flag says), and not somebody's own furniture (`ownerUserId`), which is theirs alone.
 * A query says it with `publicProductCondition()`; a row already read, with `isPublicProduct()`.
 *
 * Beyond the public, a person sees their own furniture; staff whose job covers the products
 * (admin, catalogue agents) see and change any product; a store sees and changes its own.
 * Anyone else asking for a product they may not see is told it does not exist.
 */

/** The public-product condition for a query that left-joins `stores` on `products.storeId`. */
export const publicProductCondition = () =>
  and(eq(products.isActive, true), or(isNull(products.storeId), eq(stores.isActive, true)), isNull(products.ownerUserId));

/** What a product's visibility depends on, read with it (the store's switch through a left join). */
export interface ProductVisibility {
  isActive: boolean;
  storeId: number | null;
  /** The store's own `isActive`; null when the product has no store. */
  storeActive: boolean | null;
  ownerUserId: number | null;
}

/** The signed-in caller as these rules need them; null for a visitor. */
export interface ProductViewer {
  id: number;
  role: UserRole;
  storeId: number | null;
}

/** A product row and its store's switch, as the rules read them. */
export function visibilityOf(
  product: { isActive: boolean; storeId: number | null; ownerUserId: number | null },
  storeActive: boolean | null | undefined
): ProductVisibility {
  return { isActive: product.isActive, storeId: product.storeId, storeActive: storeActive ?? null, ownerUserId: product.ownerUserId };
}

/** The session's user as a `ProductViewer`, or null when nobody usable is signed in. */
export function productViewer(
  user: { id?: string | null; role?: UserRole | null; storeId?: number | null } | null | undefined
): ProductViewer | null {
  const id = Number(user?.id);
  if (!user || !Number.isInteger(id) || id <= 0) return null;
  return { id, role: user.role ?? 'user', storeId: user.storeId ?? null };
}

export function isPublicProduct(p: ProductVisibility): boolean {
  return p.isActive && (p.storeId == null || p.storeActive === true) && p.ownerUserId == null;
}

/** A person's own furniture, looked at by that person. */
function isOwnersOwn(p: ProductVisibility, viewer: ProductViewer | null): boolean {
  return p.ownerUserId != null && viewer != null && viewer.id === p.ownerUserId;
}

/**
 * Whether the product page (`/catalog/<slug>`) is shown: to everybody when the product is
 * public, to its owner when it is their own furniture, to nobody else.
 */
export function canViewProductPage(p: ProductVisibility, viewer: ProductViewer | null): boolean {
  return isPublicProduct(p) || isOwnersOwn(p, viewer);
}

/**
 * Whether a product may be edited or deleted: by staff whose job covers the products (admin,
 * catalogue agents) whatever store it belongs to, and by a store for its own products only.
 */
export function canEditProduct(
  p: { storeId: number | null },
  editor: { role: UserRole; storeId: number | null } | null
): boolean {
  if (!editor) return false;
  if (canAdmin(editor.role, 'products')) return true;
  return editor.role === 'store' && editor.storeId != null && p.storeId === editor.storeId;
}

/**
 * Whether `GET /api/products/[id]` answers with the product: a public one to anybody; any
 * other to whoever may edit it (staff, its own store) and a person's own furniture to them.
 */
export function canReadProduct(p: ProductVisibility, viewer: ProductViewer | null): boolean {
  return canViewProductPage(p, viewer) || canEditProduct(p, viewer);
}
