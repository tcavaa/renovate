import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { isDesignPending, projectKind } from '@/lib/projects/saved';
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
import { ownProject } from '@/lib/api/projectSave';
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

  // A project's design is written into the project's row, made before its first step
  // (`POST /api/projects/create`); a save never makes one, and only writes into the caller's.
  const session = await auth();
  const userId = session?.user?.id ? Number(session.user.id) : null;
  if (!userId) return fail('Unauthorized', 401);
  const existing = await ownProject(parsed.data.projectId, userId);
  if (!existing) return fail('PROJECT_NOT_FOUND', 404);
  const { floorPlanUrl, draft, versions, baseRev, force, saveId, prevSaveId } = parsed.data;
  // Made from an older copy than the row has — another tab or computer saved since: refused,
  // so the person chooses (`lib/flow/saveQueue`), rather than one copy silently replacing the
  // other. Unless the write it follows is this browser's own, which landed with no answer.
  const ownUnconfirmed = prevSaveId != null && existing.designSaveId === prevSaveId && baseRev === existing.designRev - 1;
  if (!force && baseRev != null && baseRev < existing.designRev && !ownUnconfirmed) return fail('PROJECT_CHANGED', 409);
  // The home's condition belongs to the calculation when the project has one; the studio's own
  // choice counts only in a project designed first.
  const calculatorOwns = existing.selectedProducts != null;
  const calculatorDone = calculatorOwns && !projectKind(existing).calculatorPending;
  const homeState = (calculatorOwns ? existing.homeState : parsed.data.homeState) ?? null;
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
  const cost = priceScene(plan, scene, { homeState: homeState ?? undefined, book: await loadRateBook() });
  const rooms = planToCalculatorRooms(plan);

  const designColumns = {
    // The columns the two halves share are the calculation's once it exists: its home state,
    // its rooms and area, and — once it has been worked out — the renovation it makes of the
    // project. The design writes them only for a project designed first.
    ...(calculatorOwns ? {} : { homeState, totalM2: String(totalFloorAreaM2(plan)), rooms }),
    ...(calculatorDone ? {} : { mode: scene.mode }),
    styleId: scene.styleId,
    budgetGel: scene.budgetGel != null ? String(scene.budgetGel) : null,
    floorPlanUrl: floorPlanUrl ?? plan.imageUrl ?? null,
    plan,
    scene,
    // Versions are snapshots the person keeps to come back to; they are stored as sent (the
    // live scene above is the one that is repriced).
    ...(versions ? { versions } : {}),
  };
  // Autosaved before it was generated: the flat and the choices so far are kept, but its
  // budget is not the project's total yet (in a renovation it would be the works alone).
  const pending = isDesignPending(scene);
  const costColumns = {
    totalMaterialsCost: String(cost.materialsTotal + cost.finishesTotal + cost.technicalTotal + cost.openingsTotal),
    totalFurnitureCost: String(cost.furnitureTotal),
    totalWorkersCost: String(cost.labourTotal),
    totalCost: String(cost.grandTotal),
  };
  const noCosts = { totalMaterialsCost: null, totalFurnitureCost: null, totalWorkersCost: null, totalCost: null };

  // Writing into the project keeps whatever calculator half it already has.
  const [result] = await db
    .update(projects)
    .set({
      ...designColumns,
      // A calculation already worked out keeps the scene a renovation, whatever this copy says.
      ...(calculatorDone && scene.mode !== 'full' ? { scene: { ...scene, mode: 'full' as const } } : {}),
      // A pending design leaves a finished calculation's totals where they are.
      ...(pending ? (calculatorDone ? {} : noCosts) : costColumns),
      designRev: sql`${projects.designRev} + 1`,
      designSaveId: saveId ?? null,
      // An explicit save confirms a draft; an autosave leaves the status as it is.
      ...(!draft && existing.status === 'draft' ? { status: 'saved' as const } : {}),
    })
    // The revision is checked again in the write itself, forced or not: two saves racing each
    // other cannot both win, and the revision this one made is the one it names back.
    .where(and(eq(projects.id, existing.id), eq(projects.designRev, existing.designRev)));
  if ((result as { affectedRows?: number } | undefined)?.affectedRows === 0) return fail('PROJECT_CHANGED', 409);
  return ok({ id: existing.id, cost, rev: existing.designRev + 1 });
});
