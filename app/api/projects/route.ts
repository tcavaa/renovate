import { and, desc, eq, sql } from 'drizzle-orm';
import { isCalculatorPending, projectKind } from '@/lib/projects/saved';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { saveCalculatorSchema } from '@/lib/validations/calculatorSave.schema';
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

/**
 * A project's calculation, written into the project's row. The row exists before the first
 * step (`POST /api/projects/create`); a save never makes one, and only ever writes into a
 * project of the caller's.
 */
export const POST = handle('POST /api/projects', 'Failed to save project', async (req) => {
  const parsed = saveCalculatorSchema.safeParse(await req.json());
  // Autosaves come every few seconds while someone works; they get their own, wider bucket.
  const limited = rateLimited(req, parsed.success && parsed.data.draft ? RATE_RULES.autosave : RATE_RULES.saveProject);
  if (limited) return limited;
  if (!parsed.success) return fail(parsed.error.message, 400);

  const session = await auth();
  const userId = session?.user?.id ? Number(session.user.id) : null;
  if (!userId) return fail('Unauthorized', 401);

  const { rooms, homeState, projectId, draft, baseRev, force, saveId, prevSaveId } = parsed.data;
  const existing = await ownProject(projectId, userId);
  if (!existing) return fail('PROJECT_NOT_FOUND', 404);
  // Made from an older copy than the row has — another tab or computer saved since: refused,
  // so the person chooses (`lib/flow/saveQueue`), rather than one copy silently replacing the
  // other. Unless the write it follows is this browser's own, which landed with no answer.
  const ownUnconfirmed = prevSaveId != null && existing.calculatorSaveId === prevSaveId && baseRev === existing.calculatorRev - 1;
  if (!force && baseRev != null && baseRev < existing.calculatorRev && !ownUnconfirmed) return fail('PROJECT_CHANGED', 409);

  // The client's prices and quantities are a preview; see repriceCalculatorPicks.
  const repriced = await repriceCalculatorPicks(
    rooms,
    parsed.data.selectedProducts as Record<string, SelectedProduct>,
    parsed.data.selectedFurniture as Record<string, SelectedProduct[]>
  );
  if (isUnknownProduct(repriced)) return fail(`Unknown product ${repriced.unknownProductId}`, 400);
  const { selectedProducts, selectedFurniture } = repriced;

  // Saved before "start the calculation" was pressed: the rooms, the home state and the board
  // are kept, but the figures are not an estimate anybody has asked for yet — they are not the
  // project's totals, and a design already in the row is not turned into a renovation by it.
  const edits = parsed.data.edits ?? null;
  const pending = isCalculatorPending(edits) || !homeState || rooms.length === 0;

  let summary: ReturnType<typeof buildProjectSummary> | null = null;
  let costColumns: Record<'totalMaterialsCost' | 'totalFurnitureCost' | 'totalWorkersCost' | 'totalCost', string | null> | null = null;
  if (!pending && homeState) {
    // Same rate book the calculator UI used, so the saved total matches what was shown.
    summary = buildProjectSummary(rooms, homeState, Object.values(selectedProducts), Object.values(selectedFurniture).flat(), await loadRateBook(), { choices: edits?.choices });
    // What the person made of the estimate — lines ticked off, quantities of their own — is
    // laid over the figures just worked out, never over the client's. The row keeps the edits
    // and the totals *as edited*: what the estimate was before them is worked out again from
    // the rooms and the picks whenever somebody wants to see it.
    const sheet = calculatorSheet(summary, { selectedProducts, selectedFurniture }, { rooms, edits });
    costColumns = {
      totalMaterialsCost: String(Math.round((sheet.subtotalMaterials + sheet.subtotalProducts) * 100) / 100),
      totalFurnitureCost: String(sheet.subtotalFurniture),
      totalWorkersCost: String(sheet.subtotalWorkers),
      totalCost: String(sheet.grandTotalWithMargin),
    };
  }
  const noCosts = { totalMaterialsCost: null, totalFurnitureCost: null, totalWorkersCost: null, totalCost: null };

  // One project, both halves. The home state and the rooms are shared with the design: a
  // calculation still on its first step (no home state, no rooms yet) must not blank out what
  // a design already in the row has.
  const hasDesign = existing.plan != null;
  const board = parsed.data.board;
  const calculatorColumns = {
    // A calculation with no design writes its home state as it is — null until step 1 is answered.
    ...(homeState != null || !hasDesign ? { homeState } : {}),
    ...(rooms.length > 0 || !hasDesign ? { totalM2: String(rooms.reduce((s, r) => s + r.floorM2, 0)), rooms } : {}),
    selectedProducts,
    selectedFurniture,
    calculatorEdits: edits && ((edits.excluded?.length ?? 0) > 0 || Object.keys(edits.quantities ?? {}).length > 0 || Object.keys(edits.choices ?? {}).length > 0 || edits.progress != null) ? edits : null,
    ...(board !== undefined ? { calculatorBoard: board } : {}),
  };

  // A project with a calculation is renovation + design, whatever the studio was told when
  // the design was saved first; the scene's mode follows so reopening it prices the works —
  // set in place, and counted as a write to the design (its cache is out of date now).
  const scene = existing.scene as { mode?: string } | null;
  const flipScene = !pending && scene != null && scene.mode !== 'full';
  // A pending calculation leaves a finished design's totals where they are, and empties any it
  // wrote itself before.
  const designDone = hasDesign && existing.scene != null && !projectKind(existing).designPending;
  const [result] = await db
    .update(projects)
    .set({
      ...calculatorColumns,
      ...(pending || !costColumns ? (designDone ? {} : noCosts) : costColumns),
      ...(pending ? {} : { mode: 'full' as const }),
      ...(flipScene ? { scene: sql`JSON_SET(${projects.scene}, '$.mode', 'full')`, designRev: sql`${projects.designRev} + 1` } : {}),
      calculatorRev: sql`${projects.calculatorRev} + 1`,
      calculatorSaveId: saveId ?? null,
      // An explicit save confirms a draft; an autosave leaves the status as it is, and an
      // ordered project stays ordered either way.
      ...(!draft && existing.status === 'draft' ? { status: 'saved' as const } : {}),
    })
    // The revision is checked again in the write itself, forced or not: two saves racing each
    // other cannot both win, and the revision this one made is the one it names back.
    .where(and(eq(projects.id, existing.id), eq(projects.calculatorRev, existing.calculatorRev)));
  if ((result as { affectedRows?: number } | undefined)?.affectedRows === 0) return fail('PROJECT_CHANGED', 409);
  return ok({ id: existing.id, summary, rev: existing.calculatorRev + 1 });
});
