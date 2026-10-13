import { randomUUID } from 'node:crypto';
import { and, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { uploads, type UploadRow } from '@/lib/db/schema';
import { storage, type UploadTarget } from '@/lib/storage';
import { API_ERRORS, type ApiErrorCode } from '@/lib/api/route';
import { log } from '@/lib/log';
import { UPLOAD_KINDS, UPLOAD_TTL_MS, stagingContentType, type UploadKindName } from './kinds';

/**
 * The server's two halves of a direct upload (docs/uploads.md).
 *
 * `grantUpload` (behind `POST /api/uploads`): the caller may upload this kind, at this declared
 * size → a row in `uploads` and a one-time place in the private staging area, under a key the
 * server made. `claimUpload` (in the route the file is for): the row is taken — once, by whoever
 * asked for it, before it expires — and the staged bytes are read back, their real size checked
 * against the kind's limit, and removed from staging. What the bytes *are* (an image, a GLB) is
 * the route's to check, as it always was (`sniff.ts`, `glb.ts`): nothing a browser says about a
 * file — its name, its type, its size, a URL — is believed.
 */

export class UploadError extends Error {
  // `handle()` (lib/api/route.ts) answers one with its code and status instead of a 500.
  override readonly name = 'UploadError';
  constructor(
    readonly code: ApiErrorCode,
    readonly status: number
  ) {
    super(code);
  }
}

export interface GrantedUpload {
  id: string;
  target: UploadTarget;
  maxBytes: number;
  expiresAt: string;
}

/** Where a file of this kind waits: `<kind>/<day>/<upload id>`, nothing the browser named. */
function stagingKeyFor(kind: UploadKindName, id: string, now: Date): string {
  return `${kind}/${now.toISOString().slice(0, 10)}/${id}`;
}

export async function grantUpload(args: { kind: UploadKindName; userId: number | null; declaredSize: number; declaredType?: string; now?: Date }): Promise<GrantedUpload> {
  const { kind, userId, declaredSize, declaredType } = args;
  const spec = UPLOAD_KINDS[kind];
  if (declaredSize > spec.maxBytes) throw new UploadError(kind === 'plan' ? API_ERRORS.PLAN_TOO_LARGE : API_ERRORS.FILE_TOO_LARGE, 413);
  const now = args.now ?? new Date();
  const id = randomUUID();
  const stagingKey = stagingKeyFor(kind, id, now);
  const expiresAt = new Date(now.getTime() + UPLOAD_TTL_MS);
  await db.insert(uploads).values({
    id,
    kind,
    userId,
    stagingKey,
    maxBytes: spec.maxBytes,
    declaredType: declaredType?.slice(0, 100) ?? null,
    declaredSize,
    expiresAt,
  });
  try {
    const target = await storage.createUploadTarget(stagingKey, stagingContentType(kind, declaredType));
    return { id, target, maxBytes: spec.maxBytes, expiresAt: expiresAt.toISOString() };
  } catch (e) {
    await db.delete(uploads).where(eq(uploads.id, id));
    throw e;
  }
}

const uploadId = z.string().uuid();

export interface ClaimedUpload {
  bytes: Buffer;
  row: UploadRow;
}

/**
 * Takes a granted upload for the route it was meant for: the row is marked used in the same
 * statement that checks it (two claims of one upload cannot both win), then the staged file is
 * read, measured and deleted. Throws `UploadError` with the code the client translates.
 */
export async function claimUpload(id: unknown, kinds: readonly UploadKindName[], userId: number | null, now = new Date()): Promise<ClaimedUpload> {
  const parsed = uploadId.safeParse(id);
  if (!parsed.success) throw new UploadError(API_ERRORS.UPLOAD_EXPIRED, 400);
  const [row] = await db
    .update(uploads)
    .set({ status: 'consumed', consumedAt: now })
    .where(
      and(
        eq(uploads.id, parsed.data),
        eq(uploads.status, 'pending'),
        inArray(uploads.kind, [...kinds]),
        gt(uploads.expiresAt, now),
        // A visitor's plan is the one upload made without an account; any other is its maker's.
        userId == null ? isNull(uploads.userId) : or(isNull(uploads.userId), eq(uploads.userId, userId))
      )
    )
    .returning();
  if (!row) throw new UploadError(API_ERRORS.UPLOAD_EXPIRED, 410);

  try {
    const size = await storage.stagedSize(row.stagingKey);
    if (size == null) throw new UploadError(API_ERRORS.UPLOAD_MISSING, 400);
    if (size > row.maxBytes) throw new UploadError(row.kind === 'plan' ? API_ERRORS.PLAN_TOO_LARGE : API_ERRORS.FILE_TOO_LARGE, 413);
    const bytes = await storage.getStaged(row.stagingKey);
    if (!bytes) throw new UploadError(API_ERRORS.UPLOAD_MISSING, 400);
    if (bytes.byteLength > row.maxBytes) throw new UploadError(API_ERRORS.FILE_TOO_LARGE, 413);
    return { bytes, row };
  } finally {
    // Read or refused, the staged copy has served its purpose; the daily sweep catches a failed delete.
    await storage.deleteStaged(row.stagingKey).catch((e: unknown) => log.warn('staged upload not removed', { key: row.stagingKey, err: e }));
  }
}

/** The route's `{ data, error }` answer for an `UploadError`, or null for anything else. */
export function uploadErrorCode(e: unknown): { code: ApiErrorCode; status: number } | null {
  return e instanceof UploadError ? { code: e.code, status: e.status } : null;
}

/** The daily sweep: rows long used or expired, and staged files nobody claimed. */
export async function sweepUploads(olderThan: Date): Promise<{ rows: number; files: number }> {
  const gone = await db
    .delete(uploads)
    .where(sql`${uploads.createdAt} < ${olderThan}`)
    .returning({ id: uploads.id });
  let files = 0;
  for (const object of await storage.listStaged('')) {
    if (object.lastModified >= olderThan) continue;
    await storage.deleteStaged(object.key).then(
      () => files++,
      (e: unknown) => log.warn('stale staged upload not removed', { key: object.key, err: e })
    );
  }
  return { rows: gone.length, files };
}
