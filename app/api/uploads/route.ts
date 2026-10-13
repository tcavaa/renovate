import { z } from 'zod';
import { auth } from '@/auth';
import { RATE_RULES, rateLimited } from '@/lib/api/rateLimit';
import { fail, handle, ok, requireCatalogEditor, requireSession, requireUploader } from '@/lib/api/route';
import { grantUpload } from '@/lib/uploads/claim';
import { UPLOAD_KIND_NAMES, type UploadKindName } from '@/lib/uploads/kinds';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const signSchema = z.object({
  kind: z.enum(UPLOAD_KIND_NAMES),
  /** What the browser says the file weighs; checked again against what arrives. */
  size: z.number().int().positive(),
  /** What the browser says the file is; only decides the staged object's content type. */
  type: z.string().max(100).optional(),
});

/**
 * Asks for a place to send a file (docs/uploads.md): the first of a direct upload's three
 * requests. The answer is a one-time URL in the private staging area of storage, where the
 * browser sends the bytes itself; the route the file is for then claims it by `id`.
 *
 * Who may ask is who may finish: each kind takes the guard its finishing route has always had —
 * a picture admin and linked partners (`/api/upload`), a catalogue model admin, catalogue agents
 * and stores (`/api/upload/model`), a floor plan anyone, as the plan step is open to visitors,
 * with the plan route's per-address limit (`/api/design/upload-plan`), a studio photo and one's
 * own furniture a signed-in person (`/api/design/renders`, `/api/design/models`).
 */
export const POST = handle('POST /api/uploads', 'Upload could not be started', async (req) => {
  const parsed = signSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.message, 400);
  const { kind, size, type } = parsed.data;

  const allowed = await mayUpload(req, kind);
  if ('response' in allowed) return allowed.response;

  const limited = await rateLimited(req, RATE_RULES.uploads);
  if (limited) return limited;

  const granted = await grantUpload({ kind, userId: allowed.userId, declaredSize: size, declaredType: type });
  return ok({ id: granted.id, url: granted.target.url, method: granted.target.method, headers: granted.target.headers, maxBytes: granted.maxBytes, expiresAt: granted.expiresAt });
});

async function mayUpload(req: Request, kind: UploadKindName): Promise<{ userId: number | null } | { response: Response }> {
  switch (kind) {
    case 'image': {
      const uploader = await requireUploader();
      return uploader.response ? { response: uploader.response } : { userId: Number(uploader.session.user.id) };
    }
    case 'model': {
      const editor = await requireCatalogEditor();
      return editor.response ? { response: editor.response } : { userId: Number(editor.session.user.id) };
    }
    case 'plan': {
      const limited = await rateLimited(req, RATE_RULES.uploadPlan);
      if (limited) return { response: limited };
      const session = await auth();
      return { userId: session?.user?.id ? Number(session.user.id) : null };
    }
    case 'render': {
      const signedIn = await requireSession();
      if (signedIn.response) return { response: signedIn.response };
      const limited = await rateLimited(req, RATE_RULES.render);
      if (limited) return { response: limited };
      return { userId: Number(signedIn.session.user.id) };
    }
    case 'own_model':
    case 'own_photo': {
      const signedIn = await requireSession();
      return signedIn.response ? { response: signedIn.response } : { userId: Number(signedIn.session.user.id) };
    }
  }
}
