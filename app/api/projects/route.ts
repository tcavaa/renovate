import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { saveProjectSchema } from '@/lib/validations/project.schema';
import { buildProjectSummary } from '@/lib/calculator/materials';
import type { SelectedProduct } from '@/lib/calculator/types';
import { auth } from '@/auth';
import { RATE_RULES, rateLimited } from '@/lib/api/rateLimit';
import { isUnknownProduct, ownProject, repriceCalculatorPicks } from '@/lib/api/projectSave';
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

  const { rooms, homeState, nameKa, projectId } = parsed.data;

  // The client's prices and quantities are a preview; see repriceCalculatorPicks.
  const repriced = await repriceCalculatorPicks(
    rooms,
    parsed.data.selectedProducts as Record<string, SelectedProduct>,
    parsed.data.selectedFurniture as Record<string, SelectedProduct[]>
  );
  if (isUnknownProduct(repriced)) return fail(`Unknown product ${repriced.unknownProductId}`, 400);
  const { selectedProducts, selectedFurniture } = repriced;

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

  const calculatorColumns = {
    homeState,
    totalM2: String(totalM2),
    rooms,
    selectedProducts,
    selectedFurniture,
    totalMaterialsCost: String(summary.subtotalMaterials + summary.subtotalProducts),
    totalFurnitureCost: String(summary.subtotalFurniture),
    totalWorkersCost: String(summary.subtotalWorkers),
    totalCost: String(summary.grandTotalWithMargin),
  };

  // One project, both halves: a saved design (or an earlier calculation) of the caller's is
  // written into rather than duplicated. An ordered project is history and gets a new row.
  const existing = await ownProject(projectId, userId);
  if (existing) {
    await db.update(projects).set(calculatorColumns).where(eq(projects.id, existing.id));
    return ok({ id: existing.id, summary });
  }

  const inserted = await db.insert(projects).values({
    userId,
    sessionId: null,
    nameKa,
    ...calculatorColumns,
    status: userId ? 'saved' : 'draft',
  });

  return ok({ id: inserted[0].insertId, summary });
});

