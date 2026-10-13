/**
 * The browser's half of a direct upload (docs/uploads.md): ask for a place (`POST /api/uploads`),
 * send the bytes there yourself — to Supabase Storage in production, straight from the browser
 * and never through a Vercel function (which refuses bodies over 4.5 MB) — and hand the route
 * the file is for the upload's id. That route claims it, checks it and publishes it.
 *
 *   const id = await sendToStorage('image', file, { onProgress });
 *   await fetch('/api/upload', { method: 'POST', body: JSON.stringify({ upload: id, folder }) });
 *
 * Browser-only (XMLHttpRequest, for the progress events `fetch` does not have).
 */
import { UPLOAD_KINDS, type UploadKindName } from './kinds';

/** An upload refused or failed, with the API's error code when there is one (`apiErrorMessage`). */
export class DirectUploadError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'DirectUploadError';
  }
}

export interface SendOptions {
  /** 0…1 as the bytes go out. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

interface Granted {
  id: string;
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
}

/** Sends a file to storage for an upload of `kind`; resolves to the upload's id. */
export async function sendToStorage(kind: UploadKindName, file: Blob, options: SendOptions = {}): Promise<string> {
  if (file.size > UPLOAD_KINDS[kind].maxBytes) throw new DirectUploadError(kind === 'plan' ? 'PLAN_TOO_LARGE' : 'FILE_TOO_LARGE');
  const res = await fetch('/api/uploads', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind, size: file.size, type: file.type || undefined }),
    signal: options.signal,
  });
  const json = (await res.json().catch(() => null)) as { data: Granted | null; error: string | null } | null;
  if (!res.ok || !json?.data) throw new DirectUploadError(json?.error ?? 'UNKNOWN');
  await put(json.data, file, options);
  return json.data.id;
}

function put(target: Granted, file: Blob, { onProgress, signal }: SendOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(target.method, target.url);
    for (const [name, value] of Object.entries(target.headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new DirectUploadError(xhr.status === 413 ? 'FILE_TOO_LARGE' : 'UPLOAD_MISSING')));
    xhr.onerror = () => reject(new DirectUploadError('UPLOAD_MISSING'));
    xhr.onabort = () => reject(new DirectUploadError('UPLOAD_MISSING'));
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

/** POSTs JSON to a route that claims an upload and answers `{ data, error }`. */
export async function claimWith<T>(route: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => null)) as { data: T | null; error: string | null } | null;
  if (!res.ok || !json?.data) throw new DirectUploadError(json?.error ?? 'UNKNOWN');
  return json.data;
}
