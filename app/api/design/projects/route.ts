import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { auth } from '@/auth';
import { saveDesignSchema } from '@/lib/validations/design.schema';
import type { DesignScene, DesignVersion, FloorPlan } from '@/lib/design/types';
import { RATE_RULES, rateLimited } from '@/lib/api/rateLimit';
import { ownProject } from '@/lib/api/projectSave';
import { designWriteColumns, refusedDesignChange } from '@/lib/api/designWrite';
import { API_ERRORS, fail, handle, ok } from '@/lib/api/route';
import { readJson } from '@/lib/api/body';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle('POST /api/design/projects', 'Failed to save design', async (req) => {
  const parsed = saveDesignSchema.safeParse(await readJson(req));
  // Autosaves come every few seconds while someone works; they get their own, wider bucket.
  const limited = await rateLimited(req, parsed.success && parsed.data.draft ? RATE_RULES.autosave : RATE_RULES.saveProject);
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
  const plan = parsed.data.plan as FloorPlan;
  const scene = parsed.data.scene as DesignScene;

  // The studio's locks, here too (docs/subscriptions.md): against the design stored, a change the
  // plan does not allow — furniture or a finish changed, a piece moved — is refused, so the
  // browser's locks are not the only ones. What happens by itself on every plan (a generation,
  // the designer's check, the calculator's picks, a wall moved) passes (`refusedSceneChange`).
  const refused = await refusedDesignChange(existing, { plan, scene }, { id: userId, role: session?.user?.role });
  if (refused) return fail(API_ERRORS.PLAN_REQUIRED, 402, { headers: { 'X-Plan-Required': refused.plan ?? 'none', 'X-Plan-Feature': refused.feature } });

  // Repriced from the catalogue and its budget worked out here (`designWriteColumns`), as the
  // server's own generation writes it.
  const write = await designWriteColumns(existing, { plan, scene, homeState: parsed.data.homeState ?? null, floorPlanUrl: floorPlanUrl ?? null, versions: versions as DesignVersion[] | undefined, draft: !!draft });
  if (!write.ok) return fail(write.error, write.status);

  // Writing into the project keeps whatever calculator half it already has.
  const written = await db
    .update(projects)
    .set({ ...write.set, designRev: sql`${projects.designRev} + 1`, designSaveId: saveId ?? null })
    // The revision is checked again in the write itself, forced or not: two saves racing each
    // other cannot both win, and the revision this one made is the one it names back.
    .where(and(eq(projects.id, existing.id), eq(projects.designRev, existing.designRev)))
    .returning({ id: projects.id });
  if (written.length === 0) return fail('PROJECT_CHANGED', 409);
  return ok({ id: existing.id, cost: write.cost, rev: existing.designRev + 1 });
});
