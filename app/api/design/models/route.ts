import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { categories, products } from '@/lib/db/schema';
import { API_ERRORS, fail, handle, ok, requireSession } from '@/lib/api/route';
import { loadOwnProducts } from '@/lib/api/designCatalog';
import { ARCHETYPES, type Archetype } from '@/lib/design/catalog';
import { isFixtureProductKind } from '@/lib/design/electrical';
import { isOpeningProductKind } from '@/lib/design/openings';
import { isRadiatorProductKind } from '@/lib/design/radiators';
import { safeKey, storage } from '@/lib/storage';
import { IMAGE_EXTENSION, MODEL_EXTENSION, sniffImage, sniffModel } from '@/lib/uploads/sniff';
import { inspectGlb, unsupportedExtension } from '@/lib/uploads/glb';
import { slugify } from '@/lib/utils';
import { log } from '@/lib/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** As for a partner's model: the studio would stall on anything bigger. */
const MAX_MODEL_BYTES = 40 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const fieldsSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.string().min(1).max(64),
  widthCm: z.coerce.number().int().min(1).max(2000).optional(),
  depthCm: z.coerce.number().int().min(1).max(2000).optional(),
  heightCm: z.coerce.number().int().min(1).max(2000).optional(),
});

/** A furniture archetype a person may upload a piece as — not a fitting, a door or a radiator. */
function furnitureArchetype(kind: string): Archetype | null {
  const archetype = (ARCHETYPES as Record<string, Archetype | undefined>)[kind];
  if (!archetype || isFixtureProductKind(kind) || isOpeningProductKind(kind) || isRadiatorProductKind(kind)) return null;
  return archetype;
}

/** A person's own uploads, newest first. */
export const GET = handle('GET /api/design/models', 'Failed to load models', async () => {
  const { session, response } = await requireSession();
  if (response) return response;
  return ok(await loadOwnProducts(Number(session.user.id)));
});

/**
 * A piece of the person's own furniture for their flats — one they have and mean to keep,
 * or one they simply want in the picture. A GLB goes in as a product that is placeable at
 * once, priced at nothing and sold by nobody; a photo goes in as a product waiting for its
 * model (`model3dStatus: 'pending'`), listed under "my items" until something makes one.
 * Either is the person's alone: `ownerUserId` keeps it out of every public list.
 */
export const POST = handle('POST /api/design/models', 'Upload failed', async (req) => {
  const { session, response } = await requireSession();
  if (response) return response;
  const userId = Number(session.user.id);

  const form = await req.formData();
  const text = (key: string) => {
    const value = form.get(key);
    return typeof value === 'string' && value.trim() !== '' ? value : undefined;
  };
  const parsed = fieldsSchema.safeParse({ name: text('name'), kind: text('kind'), widthCm: text('widthCm'), depthCm: text('depthCm'), heightCm: text('heightCm') });
  if (!parsed.success) return fail(parsed.error.message, 400);
  const archetype = furnitureArchetype(parsed.data.kind);
  // An archetype with no category of its own has no shelf to stand on.
  if (!archetype?.categorySlug) return fail(API_ERRORS.OWN_MODEL_KIND, 400);

  const file = form.get('file');
  if (!(file instanceof File)) return fail(API_ERRORS.MODEL_INVALID, 400);
  const bytes = Buffer.from(await file.arrayBuffer());
  const modelMime = sniffModel(bytes);
  const imageMime = modelMime ? null : sniffImage(bytes);
  if (!modelMime && !imageMime) return fail(API_ERRORS.MODEL_INVALID, 400);

  const stamp = `own-${userId}-${Date.now()}-${randomBytes(4).toString('hex')}`;
  let modelUrl: string | null = null;
  let imageUrl: string | null = null;
  let status: 'ready' | 'pending';

  if (modelMime) {
    if (bytes.length > MAX_MODEL_BYTES) return fail(API_ERRORS.MODEL_TOO_LARGE, 400);
    const info = inspectGlb(bytes);
    if (!info || info.meshes === 0) return fail(API_ERRORS.MODEL_INVALID, 400);
    const blocked = unsupportedExtension(info);
    if (blocked) return fail(API_ERRORS.MODEL_UNSUPPORTED_COMPRESSION, 400);
    modelUrl = (await storage.put(safeKey('models', `${stamp}.${MODEL_EXTENSION}`), bytes, modelMime)).url;
    status = 'ready';
    // The dialog renders a photo of the model on its turntable, so the tile has a picture.
    const photo = form.get('photo');
    if (photo instanceof File && photo.size > 0 && photo.size <= MAX_IMAGE_BYTES) {
      const photoBytes = Buffer.from(await photo.arrayBuffer());
      const photoMime = sniffImage(photoBytes);
      if (photoMime) imageUrl = (await storage.put(safeKey('products', `${stamp}.${IMAGE_EXTENSION[photoMime]}`), photoBytes, photoMime)).url;
    }
  } else {
    if (bytes.length > MAX_IMAGE_BYTES) return fail(API_ERRORS.IMAGE_TOO_LARGE, 400);
    imageUrl = (await storage.put(safeKey('products', `${stamp}.${IMAGE_EXTENSION[imageMime!]}`), bytes, imageMime!)).url;
    status = 'pending';
  }

  const [category] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, archetype.categorySlug)).limit(1);
  if (!category) return fail(API_ERRORS.NOT_FOUND, 400);

  const slug = `own-${userId}-${slugify(parsed.data.name) || 'item'}-${randomBytes(3).toString('hex')}`;
  const inserted = await db.insert(products).values({
    categoryId: category.id,
    storeId: null,
    ownerUserId: userId,
    nameKa: parsed.data.name,
    slug,
    pricePerUnit: '0',
    unit: 'piece',
    imageUrl,
    images: [],
    specs: { own: true },
    tags: [],
    styleTags: [],
    model3dKind: archetype.kind,
    model3dUrl: modelUrl,
    model3dStatus: status,
    widthCm: parsed.data.widthCm ?? Math.round(archetype.size.width * 100),
    depthCm: parsed.data.depthCm ?? Math.round(archetype.size.depth * 100),
    heightCm: parsed.data.heightCm ?? Math.round(archetype.size.height * 100),
    isActive: true,
    isFeatured: false,
  });
  const id = Number(inserted[0].insertId);
  log.info('own model added', { id, userId, kind: archetype.kind, status, bytes: bytes.length });

  const product = (await loadOwnProducts(userId)).find((p) => p.id === id);
  if (!product) return fail(API_ERRORS.NOT_FOUND, 500);
  return ok(product, { status: 201 });
});
