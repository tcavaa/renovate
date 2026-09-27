/**
 * Which stored files the app made at runtime — and may therefore delete — as opposed to the
 * seed pictures under `public/uploads/products` and `/furniture`, which are tracked in git.
 *
 * `/api/upload` and `/api/upload/model` name a file `<ms timestamp>-<hex>.<ext>`
 * (`1790515337257-a1b2c3d4e5f6.png`), and a person's own model is `own-<user>-<ms>-<hex>.<ext>`;
 * `.gitignore` ignores exactly the first shape. Nothing the seeds write looks like either.
 */
export function isRuntimeUploadKey(key: string): boolean {
  const name = key.split('/').pop() ?? '';
  return /^\d{13}-[0-9a-f]{6,}\.[a-z0-9]{2,5}$/i.test(name) || /^own-\d+-\d{13}-[0-9a-f]{4,}\.[a-z0-9]{2,5}$/i.test(name);
}

/** The files a product row points at — what goes with it when it is deleted. */
export function productFileUrls(row: { imageUrl?: string | null; model3dUrl?: string | null; textureUrl?: string | null }): Array<string | null | undefined> {
  return [row.imageUrl, row.model3dUrl, row.textureUrl];
}

/** The files an edit let go of: each one the row had before and does not have after. */
export function droppedUrls(before: Record<string, string | null | undefined>, after: Record<string, string | null | undefined>): string[] {
  const out: string[] = [];
  for (const [field, previous] of Object.entries(before)) {
    if (!previous || !(field in after) || after[field] === undefined) continue;
    if ((after[field] || null) !== previous) out.push(previous);
  }
  return out;
}
