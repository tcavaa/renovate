import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { auth } from '@/auth';
import { saveDesignSchema } from '@/lib/validations/design.schema';
import { planToCalculatorRooms, totalFloorAreaM2 } from '@/lib/design/planGeometry';
import { priceScene } from '@/lib/design/pricing';
import { quantityFor } from '@/lib/design/matcher';
import { finishQuantity } from '@/lib/design/finishQuantity';
import { isTrimSurface } from '@/lib/design/trims';
import { fixtureQuantity } from '@/lib/design/electrical';
import { radiatorSections } from '@/lib/design/radiators';
import type { DesignScene, FloorPlan, SceneProduct } from '@/lib/design/types';
import { RATE_RULES, rateLimited } from '@/lib/api/rateLimit';
import { loadProductPrices, repriceFinishSnapshot, repriceSnapshot } from '@/lib/api/productPrices';
import { isUnknownProduct, ownProject, repriceCalculatorPicks } from '@/lib/api/projectSave';
import type { SelectedProduct } from '@/lib/calculator/types';
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
  const parsed = saveDesignSchema.safeParse(await req.json());
  // Autosaves come every few seconds while someone works; they get their own, wider bucket.
  const limited = rateLimited(req, parsed.success && parsed.data.draft ? RATE_RULES.autosave : RATE_RULES.saveProject);
  if (limited) return limited;
  if (!parsed.success) return fail(parsed.error.message, 400);

  const { nameKa, homeState, floorPlanUrl, projectId, draft, versions } = parsed.data;
  const submittedPlan = parsed.data.plan as FloorPlan;
  const submitted = parsed.data.scene as DesignScene;
  const roomsById = new Map(submittedPlan.rooms.map((r) => [r.id, r]));

  // The client's prices and quantities are a preview. Every product snapshot in the scene is
  // repriced from the catalogue and re-quantified from the slot or the room before anything
  // is summed or stored, so a figure edited in devtools never becomes the record. That
  // goes for the plan's snapshots as much as the scene's: a door, a socket and a radiator
  // are order lines a store is sent, exactly as a sofa is.
  const known = await loadProductPrices(
    [
      ...submitted.items.map((i) => i.product?.productId),
      ...submitted.finishes.map((f) => f.product?.productId),
      ...(submitted.electrical ?? []).map((p) => p.product?.productId),
      ...submittedPlan.rooms.flatMap((r) => r.openings.map((o) => o.product?.productId)),
      ...(submittedPlan.technical?.points ?? []).map((p) => p.product?.productId),
    ].filter((id): id is number => typeof id === 'number')
  );

  // Doors and windows are bought one apiece; a radiator by the section, as many as its room
  // calls for — counted on the plan as submitted, which is the plan the sections belong to.
  const unknownProducts: number[] = [];
  const repriced = <T extends { product?: SceneProduct | null }>(holder: T, qty: number): T => {
    if (!holder.product) return holder;
    const product = repriceSnapshot(holder.product, known, qty);
    if (!product) unknownProducts.push(holder.product.productId);
    return product ? { ...holder, product } : holder;
  };
  const plan: FloorPlan = {
    ...submittedPlan,
    rooms: submittedPlan.rooms.map((room) => ({ ...room, openings: room.openings.map((opening) => repriced(opening, 1)) })),
    ...(submittedPlan.technical
      ? { technical: { ...submittedPlan.technical, points: submittedPlan.technical.points.map((point) => (point.kind === 'radiator' ? repriced(point, radiatorSections(submittedPlan, point)) : point)) } }
      : {}),
  };
  // A double socket is two plates and a strip is bought by the metre (`fixtureQuantity`).
  const electrical = submitted.electrical?.map((point) => repriced(point, fixtureQuantity(point)));
  if (unknownProducts.length > 0) return fail(`Unknown product ${unknownProducts[0]}`, 400);

  const scene: DesignScene = { ...submitted, items: [], finishes: [], ...(electrical ? { electrical } : {}) };
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
    // What the finish covers decides the quantity (one wall, a strip, a zone, painted tiles,
    // the whole room); a moulding is sold by the metre at its own price, the rest per m².
    const quantity = finishQuantity(room, finish);
    const product = isTrimSurface(finish.surface) ? repriceSnapshot(finish.product, known, quantity) : repriceFinishSnapshot(finish.product, known, quantity);
    if (!product) return fail(`Unknown product ${finish.product.productId}`, 400);
    scene.finishes.push({ ...finish, product });
  }

  // Same rate book the studio's cost bar used, so a `full`-mode save matches the preview.
  const cost = priceScene(plan, scene, { homeState, book: await loadRateBook() });
  const rooms = planToCalculatorRooms(plan);

  // A design that came straight out of the calculator carries the calculator's picks, so the
  // one row has both halves from the start. They are repriced like the calculator save does.
  let calculatorColumns: { selectedProducts: Record<string, SelectedProduct>; selectedFurniture: Record<string, SelectedProduct[]>; calculatorEdits: unknown } | null = null;
  if (parsed.data.calculator) {
    const repriced = await repriceCalculatorPicks(
      parsed.data.calculator.rooms,
      parsed.data.calculator.selectedProducts as Record<string, SelectedProduct>,
      parsed.data.calculator.selectedFurniture as Record<string, SelectedProduct[]>
    );
    if (isUnknownProduct(repriced)) return fail(`Unknown product ${repriced.unknownProductId}`, 400);
    // With whatever the person made of that estimate on the calculator's summary.
    calculatorColumns = { ...repriced, calculatorEdits: parsed.data.calculator.edits ?? null };
  }

  const session = await auth();
  const userId = session?.user?.id ? Number(session.user.id) : null;

  const designColumns = {
    homeState,
    mode: scene.mode,
    styleId: scene.styleId,
    budgetGel: scene.budgetGel != null ? String(scene.budgetGel) : null,
    floorPlanUrl: floorPlanUrl ?? plan.imageUrl ?? null,
    totalM2: String(totalFloorAreaM2(plan)),
    rooms,
    plan,
    scene,
    // Versions are snapshots the person keeps to come back to; they are stored as sent (the
    // live scene above is the one that is repriced).
    ...(versions ? { versions } : {}),
    totalMaterialsCost: String(cost.materialsTotal + cost.finishesTotal + cost.technicalTotal + cost.openingsTotal),
    totalFurnitureCost: String(cost.furnitureTotal),
    totalWorkersCost: String(cost.labourTotal),
    totalCost: String(cost.grandTotal),
  };

  // Writing into the caller's own project keeps whatever calculator half it already has.
  const existing = await ownProject(projectId, userId);
  if (existing) {
    await db
      .update(projects)
      .set({
        ...designColumns,
        ...(calculatorColumns ?? {}),
        // An explicit save confirms a draft; an autosave leaves the status as it is.
        ...(!draft && existing.status === 'draft' ? { status: 'saved' as const } : {}),
      })
      .where(eq(projects.id, existing.id));
    return ok({ id: existing.id, cost });
  }

  const inserted = await db.insert(projects).values({
    userId,
    sessionId: null,
    nameKa,
    ...designColumns,
    selectedProducts: calculatorColumns?.selectedProducts ?? null,
    selectedFurniture: calculatorColumns?.selectedFurniture ?? null,
    calculatorEdits: calculatorColumns?.calculatorEdits ?? null,
    status: userId && !draft ? 'saved' : 'draft',
  });

  return ok({ id: inserted[0].insertId, cost });
});

