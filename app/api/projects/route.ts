import { desc, eq } from 'drizzle-orm';
import { isCalculatorPending, projectKind } from '@/lib/projects/saved';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { saveProjectSchema } from '@/lib/validations/project.schema';
import { buildProjectSummary } from '@/lib/calculator/materials';
import { calculatorSheet } from '@/lib/summary/calculatorSheet';
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
  const parsed = saveProjectSchema.safeParse(await req.json());
  // Autosaves come every few seconds while someone works; they get their own, wider bucket.
  const limited = rateLimited(req, parsed.success && parsed.data.draft ? RATE_RULES.autosave : RATE_RULES.saveProject);
  if (limited) return limited;
  if (!parsed.success) return fail(parsed.error.message, 400);

  const { rooms, homeState, nameKa, projectId, draft } = parsed.data;

  // The client's prices and quantities are a preview; see repriceCalculatorPicks.
  const repriced = await repriceCalculatorPicks(
    rooms,
    parsed.data.selectedProducts as Record<string, SelectedProduct>,
    parsed.data.selectedFurniture as Record<string, SelectedProduct[]>
  );
  if (isUnknownProduct(repriced)) return fail(`Unknown product ${repriced.unknownProductId}`, 400);
  const { selectedProducts, selectedFurniture } = repriced;

  // Same rate book the calculator UI used, so the saved total matches what was shown.
  const edits = parsed.data.edits ?? null;
  const summary = buildProjectSummary(
    rooms,
    homeState,
    Object.values(selectedProducts),
    Object.values(selectedFurniture).flat(),
    await loadRateBook(),
    { choices: edits?.choices }
  );
  const totalM2 = rooms.reduce((s, r) => s + r.floorM2, 0);
  // What the person made of the estimate — lines ticked off, quantities of their own — is
  // laid over the figures just worked out, never over the client's. The row keeps the edits
  // and the totals *as edited*: what the estimate was before them is worked out again from
  // the rooms and the picks whenever somebody wants to see it.
  const sheet = calculatorSheet(summary, { selectedProducts, selectedFurniture }, { rooms, edits });

  const session = await auth();
  const userId = session?.user?.id ? Number(session.user.id) : null;

  // Autosaved before "start the calculation" was pressed: the rooms and the home state are
  // kept, but the figures are not an estimate anybody has asked for yet — they are not the
  // project's totals, and a design already in the row is not turned into a renovation by it.
  const pending = isCalculatorPending(edits);
  const costColumns = {
    totalMaterialsCost: String(Math.round((sheet.subtotalMaterials + sheet.subtotalProducts) * 100) / 100),
    totalFurnitureCost: String(sheet.subtotalFurniture),
    totalWorkersCost: String(sheet.subtotalWorkers),
    totalCost: String(sheet.grandTotalWithMargin),
  };
  const noCosts = { totalMaterialsCost: null, totalFurnitureCost: null, totalWorkersCost: null, totalCost: null };
  const calculatorColumns = {
    homeState,
    totalM2: String(totalM2),
    rooms,
    selectedProducts,
    selectedFurniture,
    calculatorEdits: edits && ((edits.excluded?.length ?? 0) > 0 || Object.keys(edits.quantities ?? {}).length > 0 || Object.keys(edits.choices ?? {}).length > 0 || edits.progress != null) ? edits : null,
  };

  // One project, both halves: a saved design (or an earlier calculation) of the caller's is
  // written into rather than duplicated. An ordered project is history and gets a new row.
  const existing = await ownProject(projectId, userId);
  if (existing) {
    // A project with a calculation is renovation + design, whatever the studio was told when
    // the design was saved first; the scene's mode follows so reopening it prices the works.
    const scene = existing.scene as { mode?: string } | null;
    // A pending calculation leaves a finished design's totals where they are, and empties
    // any it wrote itself before.
    const designDone = existing.plan != null && existing.scene != null && !projectKind(existing).designPending;
    await db
      .update(projects)
      .set({
        ...calculatorColumns,
        ...(pending ? (designDone ? {} : noCosts) : costColumns),
        ...(pending ? {} : { mode: 'full' as const, ...(scene && scene.mode !== 'full' ? { scene: { ...scene, mode: 'full' } } : {}) }),
        // An explicit save confirms a draft; an autosave leaves the status as it is, and an
        // ordered project stays ordered either way.
        ...(!draft && existing.status === 'draft' ? { status: 'saved' as const } : {}),
      })
      .where(eq(projects.id, existing.id));
    return ok({ id: existing.id, summary });
  }

  const inserted = await db.insert(projects).values({
    userId,
    sessionId: null,
    nameKa,
    ...calculatorColumns,
    ...(pending ? noCosts : costColumns),
    status: userId && !draft ? 'saved' : 'draft',
  });

  return ok({ id: inserted[0].insertId, summary });
});

