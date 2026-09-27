import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { shelfRooms } from '@/lib/db/schema';
import { shelfRoomReorderSchema } from '@/lib/validations/category.schema';
import { API_ERRORS, fail, handle, ok, requireStaff } from '@/lib/api/route';
import { invalidateDesignCatalog } from '@/lib/api/designCatalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The studio's rooms in a new order: every room, each once (a stale page is told so). */
export const POST = handle('POST /api/shelf-rooms/reorder', 'Failed to reorder studio rooms', async (req) => {
  const staff = await requireStaff('categories');
  if (staff.response) return staff.response;
  const parsed = shelfRoomReorderSchema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);
  const { ids } = parsed.data;

  const rooms = (await db.select({ id: shelfRooms.id }).from(shelfRooms)).map((r) => r.id);
  if (rooms.length !== ids.length || new Set(ids).size !== ids.length || !ids.every((id) => rooms.includes(id))) return fail(API_ERRORS.STALE_ORDER, 409);

  for (const [i, id] of ids.entries()) await db.update(shelfRooms).set({ sortOrder: (i + 1) * 10 }).where(eq(shelfRooms.id, id));
  // The studio's cached catalogue must not outlive this write.
  invalidateDesignCatalog();
  return ok({ ids });
});
