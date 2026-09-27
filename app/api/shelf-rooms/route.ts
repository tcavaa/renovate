import { asc, max } from 'drizzle-orm';
import { db } from '@/lib/db';
import { shelfRoomCategories, shelfRooms } from '@/lib/db/schema';
import { shelfRoomSchema } from '@/lib/validations/category.schema';
import { API_ERRORS, fail, handle, ok, requireStaff } from '@/lib/api/route';
import { invalidateDesignCatalog } from '@/lib/api/designCatalog';
import { roomTypesOf } from '@/lib/catalog/queries';
import { setRoomCategories } from '@/lib/catalog/shelfRooms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The studio's rooms — the furniture shelf's top row — in order, each with the categories it
 * lists. Staff with the categories section; the studio reads them with its catalogue
 * (`/api/design/catalog`), not here.
 */
export const GET = handle('GET /api/shelf-rooms', 'Failed to load studio rooms', async () => {
  const staff = await requireStaff('categories');
  if (staff.response) return staff.response;
  const [rooms, links] = await Promise.all([
    db.select().from(shelfRooms).orderBy(asc(shelfRooms.sortOrder), asc(shelfRooms.id)),
    db.select().from(shelfRoomCategories).orderBy(asc(shelfRoomCategories.sortOrder)),
  ]);
  return ok(rooms.map((r) => ({ ...r, roomTypes: roomTypesOf(r.roomTypes), categoryIds: links.filter((l) => l.shelfRoomId === r.id).map((l) => l.categoryId) })));
});

/** A new room goes last. */
export const POST = handle('POST /api/shelf-rooms', 'Failed to create studio room', async (req) => {
  const staff = await requireStaff('categories');
  if (staff.response) return staff.response;
  const parsed = shelfRoomSchema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);
  const { categoryIds, ...fields } = parsed.data;

  const existing = await db.select({ slug: shelfRooms.slug }).from(shelfRooms);
  if (existing.some((r) => r.slug === fields.slug)) return fail(API_ERRORS.SLUG_EXISTS, 409);
  const [{ last }] = await db.select({ last: max(shelfRooms.sortOrder) }).from(shelfRooms);

  const inserted = await db.insert(shelfRooms).values({ ...fields, sortOrder: (last ?? 0) + 10 });
  const id = Number(inserted[0].insertId);
  await setRoomCategories(id, categoryIds);
  // The studio's cached catalogue must not outlive this write.
  invalidateDesignCatalog();
  return ok({ id });
});
