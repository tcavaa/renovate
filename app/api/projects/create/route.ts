import { db } from '@/lib/db';
import { CALCULATOR_STEPS } from '@/lib/calculator/steps';
import { projects } from '@/lib/db/schema';
import { createProjectSchema } from '@/lib/validations/project.schema';
import { emptyPlan, emptyScene } from '@/lib/projects/saved';
import { RATE_RULES, rateLimited } from '@/lib/api/rateLimit';
import { fail, handle, ok, requireSession } from '@/lib/api/route';

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
 */
export const POST = handle('POST /api/projects/create', 'Failed to create project', async (req) => {
  const { session, response } = await requireSession();
  if (response) return response;
  const limited = rateLimited(req, RATE_RULES.createProject);
  if (limited) return limited;
  const parsed = createProjectSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.message, 400);
  const { name, journey } = parsed.data;

  const common = { userId: Number(session.user.id), sessionId: null, nameKa: name, status: 'draft' as const, homeState: null, totalM2: '0', rooms: [] };
  const inserted =
    journey === 'calculator'
      ? await db.insert(projects).values({
          ...common,
          mode: 'full',
          selectedProducts: {},
          selectedFurniture: {},
          calculatorEdits: { progress: { step: 1, calculated: false, at: 1, steps: CALCULATOR_STEPS } },
        })
      : await db.insert(projects).values({
          ...common,
          mode: 'design_only',
          plan: emptyPlan(),
          scene: emptyScene(),
        });
  return ok({ id: inserted[0].insertId }, { status: 201 });
});
