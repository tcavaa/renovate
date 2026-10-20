import { projects } from '@/lib/db/schema';
import { createProjectSchema } from '@/lib/validations/project.schema';
import { emptyPlan, emptyScene } from '@/lib/projects/saved';
import { RATE_RULES, rateLimited } from '@/lib/api/rateLimit';
import { API_ERRORS, fail, handle, ok, requireSession } from '@/lib/api/route';
import { withProjectSlot } from '@/lib/plans/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * "New project": a named, empty row, made before the first step so that everything the
 * calculator or the studio does from then on is saved into it (`ProjectGate`, the autosaves).
 *
 * The row says which hub lists it with the same columns every saved project does
 * (`projectKind`): a calculation has `selectedProducts` (empty) and its progress on step 1, not
 * calculated; a design has a blank plan and a scene on step 1, not generated, and is
 * `design_only` until step 1 says otherwise — `mode = 'full'` would list it as a calculation
 * too. The home state is null until the first step chooses it.
 *
 * The plan decides how many (docs/subscriptions.md): two at a time on Free, five or ten made a
 * month on Premium and Professional — counted with the insert, in one transaction, so two tabs
 * cannot both take the last one. None left is 402 `PLAN_PROJECT_LIMIT`.
 */
export const POST = handle('POST /api/projects/create', 'Failed to create project', async (req) => {
  const { session, response } = await requireSession();
  if (response) return response;
  const limited = await rateLimited(req, RATE_RULES.createProject);
  if (limited) return limited;
  const parsed = createProjectSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.message, 400);
  const { name, journey } = parsed.data;

  const userId = Number(session.user.id);
  const common = { userId, sessionId: null, nameKa: name, status: 'draft' as const, homeState: null, totalM2: '0', rooms: [] };
  const made = await withProjectSlot({ id: userId, role: session.user.role }, async (tx) => {
    const inserted =
      journey === 'calculator'
        ? await tx.insert(projects).values({
            ...common,
            mode: 'full',
            selectedProducts: {},
            selectedFurniture: {},
            calculatorEdits: { progress: { step: 1, calculated: false, at: 1 } },
          }).returning({ id: projects.id })
        : await tx.insert(projects).values({
            ...common,
            mode: 'design_only',
            plan: emptyPlan(),
            scene: emptyScene(),
          }).returning({ id: projects.id });
    return inserted[0].id;
  });
  if (!made.ok) return fail(API_ERRORS.PLAN_PROJECT_LIMIT, 402);
  return ok({ id: made.id }, { status: 201 });
});
