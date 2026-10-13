/**
 * What can be uploaded, and how much of it (docs/uploads.md). Isomorphic: the browser checks a
 * file against the same limits before it asks for a place to send it, the sign route checks the
 * size it is told, and the route that claims the upload checks the size that actually arrived.
 *
 * Every limit is below the 50 MB a file may have in Supabase Storage on the free plan (the
 * staging bucket's own limit), and none depends on Vercel's 4.5 MB request cap any more: the
 * bytes go to storage directly.
 */

export const UPLOAD_KIND_NAMES = ['image', 'model', 'plan', 'render', 'own_model', 'own_photo'] as const;
export type UploadKindName = (typeof UPLOAD_KIND_NAMES)[number];

const MB = 1024 * 1024;

export interface UploadKindSpec {
  /** The most a file of this kind may weigh, bytes. */
  maxBytes: number;
  /** The types a browser may declare for it (never trusted — the bytes decide). */
  types: readonly string[];
}

const IMAGES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
const STILLS = ['image/png', 'image/jpeg', 'image/webp'] as const;
const GLB = ['model/gltf-binary', 'application/octet-stream'] as const;

export const UPLOAD_KINDS: Record<UploadKindName, UploadKindSpec> = {
  /** A product, finish, store, worker or category picture (admin and partners): stored as WebP. */
  image: { maxBytes: 8 * MB, types: IMAGES },
  /** A furniture model for the catalogue (admin, catalogue agents, stores). */
  model: { maxBytes: 40 * MB, types: GLB },
  /**
   * A floor plan — a photo, a scan or a PDF page rendered to PNG in the browser. Kept as it came
   * (thin lines and small figures are what it is read by); 20 MB is room for a large scan.
   */
  plan: { maxBytes: 20 * MB, types: STILLS },
  /** A studio photo (the screenshot a render is asked from). */
  render: { maxBytes: 8 * MB, types: STILLS },
  /** A person's own piece: a GLB, or a photo of it waiting for a model. */
  own_model: { maxBytes: 40 * MB, types: [...GLB, ...IMAGES] },
  /** The picture rendered of a person's own model, for its tile. */
  own_photo: { maxBytes: 8 * MB, types: IMAGES },
};

/** A photo of one's own piece (rather than its model) has the photo's limit. */
export const OWN_PHOTO_MAX_BYTES = UPLOAD_KINDS.own_photo.maxBytes;

/** How long a granted upload may take to arrive and be claimed. */
export const UPLOAD_TTL_MS = 30 * 60_000;

export function isUploadKind(value: unknown): value is UploadKindName {
  return typeof value === 'string' && (UPLOAD_KIND_NAMES as readonly string[]).includes(value);
}

/** The type the staging object is stored under: what the browser declared when it is one this kind takes, else opaque bytes. */
export function stagingContentType(kind: UploadKindName, declared: string | undefined): string {
  const type = (declared ?? '').toLowerCase().split(';')[0].trim();
  return UPLOAD_KINDS[kind].types.includes(type) ? type : 'application/octet-stream';
}

export function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / MB)} MB`;
}
