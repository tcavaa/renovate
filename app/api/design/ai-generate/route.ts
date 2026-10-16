import { z } from 'zod';
import { auth } from '@/auth';
import { env } from '@/lib/env';
import { log } from '@/lib/log';
import { RATE_RULES, rateLimited } from '@/lib/api/rateLimit';
import { fail, handle, ok } from '@/lib/api/route';
import { readJson } from '@/lib/api/body';
import { ownProject } from '@/lib/api/projectSave';
import { getDesignCatalog } from '@/lib/api/designCatalog';
import { designWithClaude } from '@/lib/design/aiDesign';
import { MAX_AI_GENERATIONS } from '@/lib/design/aiProposal';
import { draftPlanSchema, styleProfileSchema } from '@/lib/validations/design.schema';
import type { DesignScene, FloorPlan } from '@/lib/design/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// One Claude answer for a whole flat takes a minute or two; the most a Vercel Hobby function may run.
export const maxDuration = 300;

const requestSchema = z.object({
  projectId: z.number().int().positive(),
  plan: draftPlanSchema,
  styleId: z.enum(['modern', 'scandinavian', 'industrial', 'vintage']),
  styleProfile: styleProfileSchema.nullable().optional(),
  budgetGel: z.number().min(0).max(10_000_000).nullable().optional(),
  locale: z.enum(['ka', 'en', 'ru']).default('ka'),
});

/** Whether the AI designer is there — the style page words its overlay by it. */
export const GET = handle('GET /api/design/ai-generate', 'Failed', async () => ok({ enabled: !!env.ANTHROPIC_API_KEY }));

/**
 * The AI designer furnishes and finishes the flat and plans its wall decor (`lib/design/aiDesign`).
 * It answers a proposal the store lays the flat out with (`designStore.generate`); every way it can
 * fail — no key, the per-design cap, an error, a refusal, an answer that does not validate — is a
 * 503 or 429 with `fallback: 'engine'`, and the client generates with the engine as before. The
 * plan's geometry, the style and the budget are sent; never a name, an address or a contact.
 */
export const POST = handle('POST /api/design/ai-generate', 'Failed to generate', async (req) => {
  const limited = await rateLimited(req, RATE_RULES.aiGenerate);
  if (limited) return limited;
  const parsed = requestSchema.safeParse(await readJson(req));
  if (!parsed.success) return fail(parsed.error.message, 400);
  if (!env.ANTHROPIC_API_KEY) return Response.json({ data: null, error: 'AI_UNAVAILABLE', fallback: 'engine' }, { status: 503 });

  const session = await auth();
  const userId = session?.user?.id ? Number(session.user.id) : null;
  if (!userId) return fail('Unauthorized', 401);
  const project = await ownProject(parsed.data.projectId, userId);
  if (!project) return fail('PROJECT_NOT_FOUND', 404);
  // A cap per design keeps a flat's cost bounded; past it, the engine lays it out.
  const done = ((project.scene as DesignScene | null)?.generation?.aiCount ?? 0);
  if (done >= MAX_AI_GENERATIONS) return Response.json({ data: null, error: 'AI_LIMIT', fallback: 'engine' }, { status: 429 });

  const plan = parsed.data.plan as FloorPlan;
  if (plan.rooms.length === 0) return fail('No rooms', 400);
  try {
    const { products } = await getDesignCatalog();
    const { proposal, usage } = await designWithClaude({
      plan,
      styleId: parsed.data.styleId,
      styleProfile: parsed.data.styleProfile ?? null,
      budgetGel: parsed.data.budgetGel ?? null,
      locale: parsed.data.locale,
      catalog: products,
    });
    log.info('ai-generate', { projectId: project.id, rooms: plan.rooms.length, decor: proposal.rooms.reduce((n, r) => n + r.decor.length, 0), ...usage });
    return ok({ proposal });
  } catch (err) {
    log.warn('ai-generate failed, the engine lays the flat out', { projectId: project.id, err });
    return Response.json({ data: null, error: 'AI_FAILED', fallback: 'engine' }, { status: 503 });
  }
});
