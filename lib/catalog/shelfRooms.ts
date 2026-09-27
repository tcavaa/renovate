import { and, eq, inArray, max, notInArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { shelfRoomCategories, shelfRooms } from '@/lib/db/schema';

/**
 * Writing which categories the studio's rooms list (`shelf_room_categories`). A room keeps its
 * categories in its own order; a category added to a room from the category form goes last.
 */

/** The room's categories, replaced by these in this order. */
export async function setRoomCategories(roomId: number, categoryIds: readonly number[]): Promise<void> {
  const ids = [...new Set(categoryIds)];
  await db.delete(shelfRoomCategories).where(eq(shelfRoomCategories.shelfRoomId, roomId));
  if (ids.length) await db.insert(shelfRoomCategories).values(ids.map((categoryId, i) => ({ shelfRoomId: roomId, categoryId, sortOrder: (i + 1) * 10 })));
}

/**
 * The rooms that list a category, made to be exactly these: dropped from the others, added
 * at the end of the ones that did not list it yet. Rooms that do not exist are ignored.
 */
export async function setCategoryRooms(categoryId: number, roomIds: readonly number[]): Promise<void> {
  const wanted = [...new Set(roomIds)];
  if (wanted.length) await db.delete(shelfRoomCategories).where(and(eq(shelfRoomCategories.categoryId, categoryId), notInArray(shelfRoomCategories.shelfRoomId, wanted)));
  else await db.delete(shelfRoomCategories).where(eq(shelfRoomCategories.categoryId, categoryId));
  if (!wanted.length) return;
  const [rooms, listed] = await Promise.all([
    db.select({ id: shelfRooms.id }).from(shelfRooms).where(inArray(shelfRooms.id, wanted)),
    db.select({ roomId: shelfRoomCategories.shelfRoomId }).from(shelfRoomCategories).where(eq(shelfRoomCategories.categoryId, categoryId)),
  ]);
  const already = new Set(listed.map((l) => l.roomId));
  for (const room of rooms) {
    if (already.has(room.id)) continue;
    const [{ last }] = await db.select({ last: max(shelfRoomCategories.sortOrder) }).from(shelfRoomCategories).where(eq(shelfRoomCategories.shelfRoomId, room.id));
    await db.insert(shelfRoomCategories).values({ shelfRoomId: room.id, categoryId, sortOrder: (last ?? 0) + 10 });
  }
}

/** The ids of the rooms that list a category. */
export async function roomsOfCategory(categoryId: number): Promise<number[]> {
  const rows = await db.select({ roomId: shelfRoomCategories.shelfRoomId }).from(shelfRoomCategories).where(eq(shelfRoomCategories.categoryId, categoryId));
  return rows.map((r) => r.roomId);
}
