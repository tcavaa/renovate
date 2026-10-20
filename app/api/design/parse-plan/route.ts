import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { MissingApiKeyError, buildPlanFromReading, readPlanWithClaudeDetailed } from '@/lib/design/aiPlan';
import { prepareForVision, type VisionInput } from '@/lib/design/planVision';
import { parsePlanRequestSchema } from '@/lib/validations/plan.schema';
import { RATE_RULES, rateLimited } from '@/lib/api/rateLimit';
import { requirePlanFeature } from '@/lib/plans/server';
import { env } from '@/lib/env';
import { log } from '@/lib/log';
import { storage } from '@/lib/storage';
import { sniffImage } from '@/lib/uploads/sniff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A Claude read of a large plan takes minutes; the most a Vercel Hobby function may run.
export const maxDuration = 300;

/**
 * Reads an uploaded floor plan with Claude.
 *
 * Premium's and Professional's: reading an uploaded plan is a paid feature (docs/subscriptions.md
 * — `PLAN_REQUIRED` otherwise; Free draws its plan). The other cost guards are the per-IP rate
 * limit and that it only ever reads a file this app already stored (or the bundled sample), so
 * it cannot be pointed at arbitrary paths or used as a general image-analysis proxy.
 *
 * When no API key is configured this returns 503 with `fallback: 'cv'`, and the client parses
 * the plan locally instead. That is a deliberate degradation rather than an error: the
 * deterministic parser is still there and still works, it just reads fewer plans correctly.
 */
export async function POST(req: Request) {
  try {
    const limited = await rateLimited(req, RATE_RULES.parsePlan);
    if (limited) return limited;
    const allowed = await requirePlanFeature('planUpload');
    if (allowed.response) return allowed.response;

    const parsed = parsePlanRequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 });
    }

    if (!env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { data: null, error: 'AI plan reading is not configured', fallback: 'cv' },
        { status: 503 }
      );
    }

    const vision = await readPlanImage(parsed.data.imageUrl);
    if (!vision) {
      return NextResponse.json({ data: null, error: 'Plan image not found' }, { status: 404 });
    }

    const { reading, usage } = await readPlanWithClaudeDetailed({
      imageBase64: vision.image.base64,
      mediaType: vision.image.mediaType,
      ruler: vision.ruler,
    });

    if (!Array.isArray(reading.rooms) || reading.rooms.length === 0) {
      return NextResponse.json(
        { data: null, error: 'No rooms could be read from the plan', fallback: 'cv' },
        { status: 422 }
      );
    }

    const result = buildPlanFromReading(reading, {
      ink: vision.ink,
      imageUrl: parsed.data.imageUrl,
      ceilingHeightM: parsed.data.ceilingHeightM,
    });
    log.info('plan read with Claude', {
      image: parsed.data.imageUrl,
      rooms: result.plan.rooms.length,
      walls: result.plan.walls?.length ?? 0,
      separators: result.plan.walls?.filter((w) => w.separator).length ?? 0,
      ink: !!vision.ink,
      ruler: vision.ruler,
      openings: result.plan.rooms.reduce((n, r) => n + r.openings.length, 0),
      worstResidualM: Number(result.worstResidualM.toFixed(3)),
      lowConfidence: result.lowConfidence,
      unitSystem: reading.unitSystem,
      ...usage,
    });

    return NextResponse.json({
      data: {
        plan: result.plan,
        lowConfidence: result.lowConfidence,
        worstResidualM: result.worstResidualM,
        notes: result.notes,
      },
      error: null,
    });
  } catch (e) {
    if (e instanceof MissingApiKeyError) {
      return NextResponse.json(
        { data: null, error: 'AI plan reading is not configured', fallback: 'cv' },
        { status: 503 }
      );
    }
    log.error('POST /api/design/parse-plan failed', { err: e });
    return NextResponse.json(
      { data: null, error: 'Failed to read the plan', fallback: 'cv' },
      { status: 500 }
    );
  }
}

/**
 * Loads a plan this app stored, or the bundled sample, prepared for the reader: the image the
 * model sees (with its coordinate ruler) and the ink the geometry is measured on.
 *
 * The sample is read from `public/samples` by basename; everything else goes through the
 * storage driver, which only knows keys it produced itself — so `../` or a foreign URL in the
 * request cannot reach anything.
 */
async function readPlanImage(imageUrl: string): Promise<VisionInput | null> {
  let bytes: Buffer | null = null;
  if (imageUrl.startsWith('/samples/')) {
    try {
      bytes = await readFile(path.join(process.cwd(), 'public', 'samples', path.basename(imageUrl)));
    } catch {
      return null;
    }
  } else {
    const key = storage.keyFor(imageUrl);
    if (!key || !key.startsWith('plans/')) return null;
    bytes = await storage.get(key);
  }
  if (!bytes) return null;
  const mediaType = sniffImage(bytes);
  if (!mediaType) return null;
  return prepareForVision(bytes, mediaType);
}
