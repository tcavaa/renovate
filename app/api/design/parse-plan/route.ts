import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  MissingApiKeyError,
  buildPlanFromReading,
  readPlanWithClaude,
} from '@/lib/design/aiPlan';
import { parsePlanRequestSchema } from '@/lib/validations/plan.schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Reads an uploaded floor plan with Claude.
 *
 * Open to visitors, like the upload endpoint it follows — a guest planning their flat has not
 * signed in yet. The cost guard is that it only ever reads a file this app already wrote to
 * `public/uploads/plans`, so it cannot be pointed at arbitrary paths or used as a general
 * image-analysis proxy.
 *
 * When no API key is configured this returns 503 with `fallback: 'cv'`, and the client parses
 * the plan locally instead. That is a deliberate degradation rather than an error: the
 * deterministic parser is still there and still works, it just reads fewer plans correctly.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = parsePlanRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ data: null, error: parsed.error.message }, { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        {
          data: null,
          error: 'AI plan reading is not configured',
          fallback: 'cv',
        },
        { status: 503 }
      );
    }

    const file = await readUploadedPlan(parsed.data.imageUrl);
    if (!file) {
      return NextResponse.json({ data: null, error: 'Plan image not found' }, { status: 404 });
    }

    const reading = await readPlanWithClaude({
      imageBase64: file.base64,
      mediaType: file.mediaType,
    });

    if (!Array.isArray(reading.rooms) || reading.rooms.length === 0) {
      return NextResponse.json(
        { data: null, error: 'No rooms could be read from the plan', fallback: 'cv' },
        { status: 422 }
      );
    }

    const result = buildPlanFromReading(reading, {
      imageUrl: parsed.data.imageUrl,
      ceilingHeightM: parsed.data.ceilingHeightM,
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
    console.error('POST /api/design/parse-plan', e);
    return NextResponse.json(
      { data: null, error: 'Failed to read the plan', fallback: 'cv' },
      { status: 500 }
    );
  }
}

const MEDIA_TYPES: Record<string, 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

/**
 * Loads a plan this app uploaded.
 *
 * The path is rebuilt from the basename rather than trusted, so `../` in the request cannot
 * walk out of the uploads directory.
 */
async function readUploadedPlan(
  imageUrl: string
): Promise<{ base64: string; mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' } | null> {
  const name = path.basename(imageUrl);
  const extension = path.extname(name).toLowerCase();
  const mediaType = MEDIA_TYPES[extension];
  if (!mediaType) return null;

  const isSample = imageUrl.startsWith('/samples/');
  const directory = isSample
    ? path.join(process.cwd(), 'public', 'samples')
    : path.join(process.cwd(), 'public', 'uploads', 'plans');

  try {
    const buffer = await readFile(path.join(directory, name));
    return { base64: buffer.toString('base64'), mediaType };
  } catch {
    return null;
  }
}
