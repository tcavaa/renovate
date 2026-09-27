import { aggregateRoomTotals } from '@/lib/calculator/materials';
import { categorySlugFromKey, isCartKey, roomFinishQuantity, roomIdFromKey, SURFACE_OF_SLUG, suggestedQuantity, suggestedQuantityForRoom } from '@/lib/calculator/quantities';
import { normalizeRoomFinishes } from '@/lib/calculator/roomFinishes';
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
 * Used by the calculator's save.
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
  // A room's finishes in the shape the catalogue step keeps them — each on the surface its
  // category is for (the seeds' categories say; one made in admin is taken at the surface the
  // pick was made for), a floor in at most two products whose shares make the whole, every
  // wall in one product — whatever was sent: the same function the browser's store runs.
  const sent = normalizeRoomFinishes(
    Object.fromEntries(
      Object.entries(incomingProducts).map(([key, snapshot]) => {
        const categorySlug = snapshot.categorySlug ?? categorySlugFromKey(key);
        const surface = roomIdFromKey(key) ? (SURFACE_OF_SLUG[categorySlug] ?? snapshot.surface) : snapshot.surface;
        return [key, { ...snapshot, categorySlug, ...(surface ? { surface } : {}) }];
      })
    ),
    rooms
  );
  const known = await loadProductPrices([
    ...Object.values(sent).map((p) => p.productId),
    ...Object.values(incomingFurniture).flat().map((p) => p.productId),
  ]);

  const selectedProducts: Record<string, SelectedProduct> = {};
  for (const [key, snapshot] of Object.entries(sent)) {
    const categorySlug = snapshot.categorySlug ?? categorySlugFromKey(key);
    // A room's floor or walls are counted from that room — the same function the catalogue
    // step shows the figure with (`roomFinishQuantity`: the whole surface, a share of the
    // floor, the walls chosen one by one), in the catalogue's own unit and coverage for the
    // product; a room that no longer exists (deleted after the pick) is dropped rather than
    // priced for the whole flat.
    const roomId = roomIdFromKey(key);
    const room = roomId ? rooms.find((r) => r.id === roomId) : null;
    if (roomId && !room) continue;
    const catalogue = known.get(snapshot.productId);
    if (!catalogue) return { unknownProductId: snapshot.productId };
    if (room) {
      const surface = snapshot.surface ?? null;
      const unit = catalogue.unit as SelectedProduct['unit'];
      const qty = surface ? roomFinishQuantity({ unit, categorySlug, coveragePerUnit: catalogue.coveragePerUnit, share: snapshot.share, walls: snapshot.walls }, surface, room) : suggestedQuantityForRoom(categorySlug, room);
      const repriced = repriceSnapshot({ ...snapshot, categorySlug, unit }, known, qty);
      if (!repriced) return { unknownProductId: snapshot.productId };
      selectedProducts[key] = { ...repriced, roomId: room.id, ...(surface ? { surface } : {}) };
      continue;
    }
    // A material from the cart, laid on the rooms by hand on the placement step before every
    // room took its own (no longer made; a tab left open from before can still send one), is
    // bought at the area it was laid on, held within what the flat could possibly take;
    // everything else is quantified from the rooms alone.
    const qty = isCartKey(key) ? cartQuantity(snapshot.qty, totals) : suggestedQuantity(categorySlug, totals);
    const repriced = repriceSnapshot({ ...snapshot, categorySlug }, known, qty);
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

/** A laid area, as the client counted it, kept within a few times the flat's whole surface. */
function cartQuantity(sent: number, totals: ReturnType<typeof aggregateRoomTotals>): number {
  const ceiling = (totals.totalFloorM2 + totals.totalWallM2) * 3 + 10;
  return Number.isFinite(sent) && sent > 0 ? Math.min(Math.round(sent * 100) / 100, ceiling) : 0;
}

export function isUnknownProduct(result: RepricedPicks | { unknownProductId: number }): result is { unknownProductId: number } {
  return 'unknownProductId' in result;
}

/**
 * The caller's own project — the row a save writes into instead of adding a new one. Guests
 * never update (nothing proves the row is theirs). An ordered project stays the same
 * project: the orders are snapshots of what was sent, so saving the other half into the row
 * later (the 3D design after the calculation was ordered) desyncs nothing, and the next
 * checkout charges and sends only what is new.
 */
export async function ownProject(projectId: number | undefined, userId: number | null) {
  if (!projectId || !userId) return null;
  const rows = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.userId, userId))).limit(1);
  return rows[0] ?? null;
}
