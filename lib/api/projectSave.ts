import { aggregateRoomTotals } from '@/lib/calculator/materials';
import { categorySlugFromKey, suggestedQuantity } from '@/lib/calculator/quantities';
import type { Room, SelectedProduct } from '@/lib/calculator/types';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { loadProductPrices, repriceSnapshot } from '@/lib/api/productPrices';

/**
 * The calculator's picks, repriced from the catalogue before they are stored.
 *
 * The client's prices and quantities are a preview. Every snapshot is repriced and its
 * quantity recomputed from the rooms, so nothing edited in devtools reaches the database.
 * Shared by the calculator save and the design save (a design that came out of the
 * calculator stores the calculator's picks in the same row).
 */
export interface RepricedPicks {
  selectedProducts: Record<string, SelectedProduct>;
  selectedFurniture: Record<string, SelectedProduct[]>;
}

export async function repriceCalculatorPicks(
  rooms: Room[],
  incomingProducts: Record<string, SelectedProduct>,
  incomingFurniture: Record<string, SelectedProduct[]>
): Promise<RepricedPicks | { unknownProductId: number }> {
  const totals = aggregateRoomTotals(rooms);
  const known = await loadProductPrices([
    ...Object.values(incomingProducts).map((p) => p.productId),
    ...Object.values(incomingFurniture).flat().map((p) => p.productId),
  ]);

  const selectedProducts: Record<string, SelectedProduct> = {};
  for (const [key, snapshot] of Object.entries(incomingProducts)) {
    const categorySlug = snapshot.categorySlug ?? categorySlugFromKey(key);
    const repriced = repriceSnapshot({ ...snapshot, categorySlug }, known, suggestedQuantity(categorySlug, totals));
    if (!repriced) return { unknownProductId: snapshot.productId };
    selectedProducts[key] = repriced;
  }
  const selectedFurniture: Record<string, SelectedProduct[]> = {};
  for (const [roomId, list] of Object.entries(incomingFurniture)) {
    const repricedList: SelectedProduct[] = [];
    for (const snapshot of list) {
      // Furniture is picked piece by piece; one selection is one item.
      const repriced = repriceSnapshot(snapshot, known, 1);
      if (!repriced) return { unknownProductId: snapshot.productId };
      repricedList.push(repriced);
    }
    selectedFurniture[roomId] = repricedList;
  }
  return { selectedProducts, selectedFurniture };
}

export function isUnknownProduct(result: RepricedPicks | { unknownProductId: number }): result is { unknownProductId: number } {
  return 'unknownProductId' in result;
}

/**
 * The caller's own, not yet ordered project — the row a save writes into instead of adding a
 * new one. Guests never update (nothing proves the row is theirs), and an ordered project is
 * history: saving over it would desync the partners' orders, so it gets a new row.
 */
export async function ownProject(projectId: number | undefined, userId: number | null) {
  if (!projectId || !userId) return null;
  const rows = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.userId, userId))).limit(1);
  const project = rows[0];
  if (!project || project.status === 'submitted') return null;
  return project;
}
