import { z } from 'zod';
import { auth } from '@/auth';
import { env } from '@/lib/env';
import { RATE_RULES, rateLimited } from '@/lib/api/rateLimit';
import { API_ERRORS, fail, handle, ok } from '@/lib/api/route';
import { readJson } from '@/lib/api/body';
import { afterResponse } from '@/lib/api/after';
import { generationStatus, jobView, runDesignStage, startDesignJob } from '@/lib/api/designJob';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// The answer goes at once; the designer's call (a minute or two), the layout and the write run
// after it in this same function, which Vercel keeps alive for at most this long from the request.
export const maxDuration = 300;

const startSchema = z.object({
  projectId: z.number().int().positive(),
  /** The design's revision as the page has just saved it: the job writes over that one only. */
  baseRev: z.number().int().min(0),
  locale: z.enum(['ka', 'en', 'ru']).default('ka'),
});

/**
 * Whether the AI designer is there (a key on the server) — the style page words its overlay by
 * it — and, with `?projectId=`, that project's last generation job and whether its design is laid
 * out on the server (`lib/api/designJob`): what the style page asks every few seconds while a job
 * runs, and once whenever it opens.
 */
export const GET = handle('GET /api/design/ai-generate', 'Failed', async (req) => {
  const enabled = !!env.ANTHROPIC_API_KEY;
  const projectId = Number(new URL(req.url).searchParams.get('projectId'));
  if (!projectId) return ok({ enabled });
  const session = await auth();
  const userId = session?.user?.id ? Number(session.user.id) : null;
  if (!userId) return fail(API_ERRORS.UNAUTHORIZED, 401);
  const status = await generationStatus(projectId, userId);
  if (!status) return fail('PROJECT_NOT_FOUND', 404);
  return ok({ enabled, ...status });
});

/**
 * Starts the AI designer on the project's design as the page has just saved it: the job is
 * written and answered at once (`{ job }`), and the flat is designed, laid out, written and then
 * checked on the server whether the page stays open or not (`lib/api/designJob`). Every way it
 * cannot start — no key, the per-design cap, the design changed since — is a 503, 429 or 409 with
 * `fallback: 'engine'`, and the page lays the flat out with the engine as before. Only the plan's
 * geometry, the style and the budget go to the designer; never a name, an address or a contact.
 */
export const POST = handle('POST /api/design/ai-generate', 'Failed to generate', async (req) => {
  const limited = await rateLimited(req, RATE_RULES.aiGenerate);
  if (limited) return limited;
  const parsed = startSchema.safeParse(await readJson(req));
  if (!parsed.success) return fail(parsed.error.message, 400);
  if (!env.ANTHROPIC_API_KEY) return Response.json({ data: null, error: 'AI_UNAVAILABLE', fallback: 'engine' }, { status: 503 });

  const session = await auth();
  const userId = session?.user?.id ? Number(session.user.id) : null;
  if (!userId) return fail(API_ERRORS.UNAUTHORIZED, 401);
  const started = await startDesignJob({ id: userId, role: session?.user?.role }, parsed.data);
  if (!started.ok) {
    if (started.error === 'PLAN_REQUIRED') return fail(API_ERRORS.PLAN_REQUIRED, 402, { headers: { 'X-Plan-Required': started.plan ?? 'none', 'X-Plan-Feature': started.feature ?? 'catalog' } });
    return Response.json({ data: null, error: started.error, fallback: 'engine' }, { status: started.status });
  }
  // The check is the server's own request to this same deployment, so it goes where this one came.
  if (started.started) {
    const origin = new URL(req.url).origin;
    afterResponse(() => runDesignStage(started.job.id, origin));
  }
  return ok({ job: jobView(started.job) }, { status: 202 });
});
