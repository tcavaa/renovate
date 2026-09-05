import { NextResponse } from 'next/server';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { auth } from '@/auth';
import { RATE_RULES, rateLimited } from '@/lib/api/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Floor-plan upload.
 *
 * Unlike `/api/upload` this is open to visitors, not just admins — uploading a plan is the
 * first thing anyone does in the studio, and requiring an account before they have seen
 * anything would kill the funnel. It is therefore deliberately narrow: images only, 12 MB,
 * a fixed destination folder, and a generated filename so nothing the user sends can steer
 * where the file lands.
 *
 * Parsing happens in the browser; this endpoint only keeps the image so a saved project can
 * show the plan it came from.
 */

const ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
};

const MAX_BYTES = 12 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const limited = rateLimited(req, RATE_RULES.uploadPlan);
    if (limited) return limited;

    const formData = await req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ data: null, error: 'No file provided' }, { status: 400 });
    }
    const ext = ALLOWED_TYPES[file.type];
    if (!ext) {
      return NextResponse.json(
        { data: null, error: 'Unsupported file type' },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { data: null, error: 'File too large (max 12MB)' },
        { status: 400 }
      );
    }

    const session = await auth();
    const owner = session?.user?.id ? `u${session.user.id}` : 'guest';
    const filename = `${owner}-${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`;

    const dir = path.join(process.cwd(), 'public', 'uploads', 'plans');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));

    return NextResponse.json({
      data: { url: `/uploads/plans/${filename}`, size: file.size },
      error: null,
    });
  } catch (e) {
    console.error('POST /api/design/upload-plan', e);
    return NextResponse.json({ data: null, error: 'Upload failed' }, { status: 500 });
  }
}
