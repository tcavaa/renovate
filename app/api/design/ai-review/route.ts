import { z } from 'zod';
import { auth } from '@/auth';
import { env } from '@/lib/env';
import { log } from '@/lib/log';
import { RATE_RULES, rateLimited } from '@/lib/api/rateLimit';
import { fail, handle, ok } from '@/lib/api/route';
import { readJson } from '@/lib/api/body';
import { ownProject } from '@/lib/api/projectSave';
import { getDesignCatalog } from '@/lib/api/designCatalog';
import { reviewWithClaude } from '@/lib/design/aiReview';
import { getArchetype } from '@/lib/design/catalog';
import { toSceneProduct } from '@/lib/design/matcher';
import { decorPieceSchema, draftPlanSchema } from '@/lib/validations/design.schema';
import type { DecorPiece, FloorPlan, PlacedItem } from '@/lib/design/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const vec = z.object({ x: z.number().finite(), z: z.number().finite() });
const itemSchema = z.object({
  id: z.string().min(1).max(120),
  roomId: z.string().min(1).max(120),
  kind: z.string().min(1).max(64),
  productId: z.number().int().positive().nullable(),
  position: vec,
  rotation: z.number().finite(),
  elevationM: z.number().finite().min(-1).max(10),
  size: z.object({ width: z.number().positive().max(30), depth: z.number().positive().max(30), height: z.number().nonnegative().max(10) }),
});
const requestSchema = z.object({
  projectId: z.number().int().positive(),
  plan: draftPlanSchema,
  items: z.array(itemSchema).max(600),
  decor: z.array(decorPieceSchema).max(200).optional(),
  styleId: z.enum(['modern', 'scandinavian', 'industrial', 'vintage']),
  locale: z.enum(['ka', 'en', 'ru']).default('ka'),
});

/**
 * The AI designer checks the flat it has just furnished, room by room (`lib/design/aiReview`), and
 * answers what to replace and what to take out; the store applies what fits
 * (`designStore.applyReview`). Every failure is a 503 and the flat stays as laid out. The rooms'
 * geometry and the pieces' products are sent; never a name, an address or a contact.
 */
export const POST = handle('POST /api/design/ai-review', 'Failed to review', async (req) => {
  const limited = await rateLimited(req, RATE_RULES.aiReview);
  if (limited) return limited;
  const parsed = requestSchema.safeParse(await readJson(req));
  if (!parsed.success) return fail(parsed.error.message, 400);
  if (!env.ANTHROPIC_API_KEY) return Response.json({ data: null, error: 'AI_UNAVAILABLE' }, { status: 503 });

  const session = await auth();
  const userId = session?.user?.id ? Number(session.user.id) : null;
  if (!userId) return fail('Unauthorized', 401);
  const project = await ownProject(parsed.data.projectId, userId);
  if (!project) return fail('PROJECT_NOT_FOUND', 404);

  const plan = parsed.data.plan as FloorPlan;
  try {
    const { products } = await getDesignCatalog();
    const byId = new Map(products.map((p) => [p.id, p]));
    // The pieces as the server knows their products: names and prices from the catalogue, not the browser.
    const items: PlacedItem[] = parsed.data.items.flatMap((i) => {
      const archetype = getArchetype(i.kind);
      const product = i.productId ? byId.get(i.productId) : undefined;
      if (!archetype || !product) return [];
      return [{ id: i.id, roomId: i.roomId, kind: i.kind, slot: archetype.slot, position: i.position, rotation: i.rotation, elevationM: i.elevationM, size: i.size, product: toSceneProduct(product, 1) }];
    });
    const { review, usage } = await reviewWithClaude({ plan, items, decor: (parsed.data.decor ?? []) as DecorPiece[], styleId: parsed.data.styleId, locale: parsed.data.locale, catalog: products });
    log.info('ai-review', { projectId: project.id, items: items.length, fixes: review.fixes.length, ...usage });
    return ok({ review });
  } catch (err) {
    log.warn('ai-review failed, the flat stays as laid out', { projectId: project.id, err });
    return Response.json({ data: null, error: 'AI_FAILED' }, { status: 503 });
  }
});
