import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { auth } from '@/auth';
import { saveDesignSchema } from '@/lib/validations/design.schema';
import { planToCalculatorRooms, totalFloorAreaM2 } from '@/lib/design/planGeometry';
import { priceScene } from '@/lib/design/pricing';
import { quantityFor } from '@/lib/design/matcher';
import { wallAreaM2 } from '@/lib/design/surfaces';
import type { DesignScene, FloorPlan, PlanRoom } from '@/lib/design/types';
import { RATE_RULES, rateLimited } from '@/lib/api/rateLimit';
import { loadProductPrices, repriceFinishSnapshot, repriceSnapshot } from '@/lib/api/productPrices';
import { loadRateBook } from '@/lib/api/rateBook';
import { fail, handle, ok } from '@/lib/api/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle('GET /api/design/projects', 'Failed to load designs', async () => {
  const session = await auth();
  if (!session?.user?.id) return ok([]);

  const rows = await db
    .select()
    .from(projects)
    // Only design-studio projects — the calculator has its own list.
    .where(and(eq(projects.userId, Number(session.user.id)), isNotNull(projects.plan)))
    .orderBy(desc(projects.createdAt));
  return ok(rows);
});

export const POST = handle('POST /api/design/projects', 'Failed to save design', async (req) => {
  const limited = rateLimited(req, RATE_RULES.saveProject);
  if (limited) return limited;

  const parsed = saveDesignSchema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);

  const { nameKa, homeState, floorPlanUrl } = parsed.data;
  const plan = parsed.data.plan as FloorPlan;
  const submitted = parsed.data.scene as DesignScene;
  const roomsById = new Map(plan.rooms.map((r) => [r.id, r]));

  // The client's prices and quantities are a preview. Every product snapshot in the scene is
  // repriced from the catalogue and re-quantified from the slot or the room before anything
  // is summed or stored, so a figure edited in devtools never becomes the record.
  const known = await loadProductPrices(
    [
      ...submitted.items.map((i) => i.product?.productId),
      ...submitted.finishes.map((f) => f.product?.productId),
    ].filter((id): id is number => typeof id === 'number')
  );

  const scene: DesignScene = { ...submitted, items: [], finishes: [] };
  for (const item of submitted.items) {
    if (!item.product) {
      scene.items.push(item);
      continue;
    }
    const product = repriceSnapshot(item.product, known, quantityFor(item));
    if (!product) return fail(`Unknown product ${item.product.productId}`, 400);
    scene.items.push({ ...item, product });
  }
  for (const finish of submitted.finishes) {
    if (!finish.product) {
      scene.finishes.push(finish);
      continue;
    }
    const room = roomsById.get(finish.roomId);
    if (!room) return fail(`Unknown room ${finish.roomId}`, 400);
    const product = repriceFinishSnapshot(finish.product, known, surfaceAreaM2(room, finish.surface));
    if (!product) return fail(`Unknown product ${finish.product.productId}`, 400);
    scene.finishes.push({ ...finish, product });
  }

  // Same rate book the studio's cost bar used, so a `full`-mode save matches the preview.
  const cost = priceScene(plan, scene, { homeState, book: await loadRateBook() });
  const rooms = planToCalculatorRooms(plan);

  const session = await auth();
  const userId = session?.user?.id ? Number(session.user.id) : null;

  const inserted = await db.insert(projects).values({
    userId,
    sessionId: null,
    nameKa,
    homeState,
    mode: scene.mode,
    styleId: scene.styleId,
    budgetGel: scene.budgetGel != null ? String(scene.budgetGel) : null,
    floorPlanUrl: floorPlanUrl ?? plan.imageUrl ?? null,
    totalM2: String(totalFloorAreaM2(plan)),
    rooms,
    plan,
    scene,
    selectedProducts: null,
    selectedFurniture: null,
    totalMaterialsCost: String(cost.materialsTotal + cost.finishesTotal),
    totalFurnitureCost: String(cost.furnitureTotal),
    totalWorkersCost: String(cost.labourTotal),
    totalCost: String(cost.grandTotal),
    status: userId ? 'saved' : 'draft',
  });

  return ok({ id: inserted[0].insertId, cost });
});

/** Square metres a finish covers — the same rule `finishFromProduct` uses on the client. */
function surfaceAreaM2(room: PlanRoom, surface: 'floor' | 'wall' | 'ceiling'): number {
  if (surface === 'wall') return wallAreaM2(room);
  return Math.round(room.areaM2 * 10) / 10;
}
