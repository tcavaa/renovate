import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { saveProjectSchema } from '@/lib/validations/project.schema';
import { aggregateRoomTotals, buildProjectSummary } from '@/lib/calculator/materials';
import { categorySlugFromKey, suggestedQuantity } from '@/lib/calculator/quantities';
import type { SelectedProduct } from '@/lib/calculator/types';
import { auth } from '@/auth';
import { RATE_RULES, rateLimited } from '@/lib/api/rateLimit';
import { loadProductPrices, repriceSnapshot } from '@/lib/api/productPrices';
import { loadRateBook } from '@/lib/api/rateBook';
import { fail, handle, ok } from '@/lib/api/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handle('GET /api/projects', 'Failed to load projects', async () => {
  const session = await auth();
  if (!session?.user?.id) return ok([]);

  const data = await db
    .select()
    .from(projects)
    .where(eq(projects.userId, Number(session.user.id)))
    .orderBy(desc(projects.createdAt));
  return ok(data);
});

export const POST = handle('POST /api/projects', 'Failed to save project', async (req) => {
  const limited = rateLimited(req, RATE_RULES.saveProject);
  if (limited) return limited;

  const parsed = saveProjectSchema.safeParse(await req.json());
  if (!parsed.success) return fail(parsed.error.message, 400);

  const { rooms, homeState, nameKa } = parsed.data;

  // The client's prices and quantities are a preview. Every snapshot is repriced from the
  // catalogue and its quantity recomputed from the rooms, so nothing edited in devtools
  // reaches the database or the admin dashboard.
  const totals = aggregateRoomTotals(rooms);
  const incomingProducts = parsed.data.selectedProducts as Record<string, SelectedProduct>;
  const incomingFurniture = parsed.data.selectedFurniture as Record<string, SelectedProduct[]>;
  const known = await loadProductPrices([
    ...Object.values(incomingProducts).map((p) => p.productId),
    ...Object.values(incomingFurniture).flat().map((p) => p.productId),
  ]);

  const selectedProducts: Record<string, SelectedProduct> = {};
  for (const [key, snapshot] of Object.entries(incomingProducts)) {
    const categorySlug = snapshot.categorySlug ?? categorySlugFromKey(key);
    const repriced = repriceSnapshot({ ...snapshot, categorySlug }, known, suggestedQuantity(categorySlug, totals));
    if (!repriced) return fail(`Unknown product ${snapshot.productId}`, 400);
    selectedProducts[key] = repriced;
  }
  const selectedFurniture: Record<string, SelectedProduct[]> = {};
  for (const [roomId, list] of Object.entries(incomingFurniture)) {
    const repricedList: SelectedProduct[] = [];
    for (const snapshot of list) {
      // Furniture is picked piece by piece; one selection is one item.
      const repriced = repriceSnapshot(snapshot, known, 1);
      if (!repriced) return fail(`Unknown product ${snapshot.productId}`, 400);
      repricedList.push(repriced);
    }
    selectedFurniture[roomId] = repricedList;
  }

  // Same rate book the calculator UI used, so the saved total matches what was shown.
  const summary = buildProjectSummary(
    rooms,
    homeState,
    Object.values(selectedProducts),
    Object.values(selectedFurniture).flat(),
    await loadRateBook()
  );
  const totalM2 = rooms.reduce((s, r) => s + r.floorM2, 0);

  const session = await auth();
  const userId = session?.user?.id ? Number(session.user.id) : null;

  const inserted = await db.insert(projects).values({
    userId,
    sessionId: null,
    nameKa,
    homeState,
    totalM2: String(totalM2),
    rooms,
    selectedProducts,
    selectedFurniture,
    totalMaterialsCost: String(summary.subtotalMaterials + summary.subtotalProducts),
    totalFurnitureCost: String(summary.subtotalFurniture),
    totalWorkersCost: String(summary.subtotalWorkers),
    totalCost: String(summary.grandTotalWithMargin),
    status: userId ? 'saved' : 'draft',
  });

  return ok({ id: inserted[0].insertId, summary });
});
