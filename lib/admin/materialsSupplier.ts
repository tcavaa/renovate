import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { stores } from '@/lib/db/schema';
import { loadPlatformSettings } from '@/lib/finance/settings';

/**
 * The construction materials' supplier as the admin's store form shows it: whether this store
 * (`null` for a new one) is the supplier, and the name of the store that is.
 */
export async function materialsSupplierFor(storeId: number | null): Promise<{ supplier: boolean; currentName: string | null }> {
  const { materialsStoreId } = await loadPlatformSettings();
  if (materialsStoreId == null) return { supplier: false, currentName: null };
  const [row] = await db.select({ nameKa: stores.nameKa }).from(stores).where(eq(stores.id, materialsStoreId)).limit(1);
  return { supplier: materialsStoreId === storeId, currentName: row?.nameKa ?? null };
}
