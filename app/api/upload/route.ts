import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { auth } from '@/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);
const MAX_BYTES = 8 * 1024 * 1024;

const FOLDER_WHITELIST = new Set(['products', 'workers', 'categories', 'misc']);

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json(
        { data: null, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file');
    const folderInput = String(formData.get('folder') ?? 'products');
    const folder = FOLDER_WHITELIST.has(folderInput) ? folderInput : 'products';

    if (!(file instanceof File)) {
      return NextResponse.json(
        { data: null, error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { data: null, error: 'Unsupported file type' },
        { status: 400 }
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { data: null, error: 'File too large (max 8MB)' },
        { status: 400 }
      );
    }

    const ext = extensionFromType(file.type) ?? safeExt(file.name);
    const filename = `${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`;

    const dir = path.join(process.cwd(), 'public', 'uploads', folder);
    await mkdir(dir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(dir, filename), buffer);

    const url = `/uploads/${folder}/${filename}`;
    return NextResponse.json({ data: { url, filename, size: file.size }, error: null });
  } catch (e) {
    console.error('POST /api/upload', e);
    return NextResponse.json(
      { data: null, error: 'Upload failed' },
      { status: 500 }
    );
  }
}

function extensionFromType(type: string): string | null {
  switch (type) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    default:
      return null;
  }
}

function safeExt(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]{1,6})$/);
  return m ? m[1] : 'png';
}
