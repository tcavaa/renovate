import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fail, handle, ok, requireAdmin } from '@/lib/api/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const MAX_BYTES = 8 * 1024 * 1024;
const FOLDER_WHITELIST = new Set(['products', 'workers', 'categories', 'misc']);

/** Admin image upload for products, workers and categories. Visitors upload plans elsewhere. */
export const POST = handle('POST /api/upload', 'Upload failed', async (req) => {
  const admin = await requireAdmin();
  if (admin.response) return admin.response;

  const formData = await req.formData();
  const file = formData.get('file');
  const folderInput = String(formData.get('folder') ?? 'products');
  const folder = FOLDER_WHITELIST.has(folderInput) ? folderInput : 'products';

  if (!(file instanceof File)) return fail('No file provided', 400);
  const ext = EXTENSION_BY_TYPE[file.type];
  if (!ext) return fail('Unsupported file type', 400);
  if (file.size > MAX_BYTES) return fail('File too large (max 8MB)', 400);

  const filename = `${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`;
  const dir = path.join(process.cwd(), 'public', 'uploads', folder);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));

  return ok({ url: `/uploads/${folder}/${filename}`, filename, size: file.size });
});
