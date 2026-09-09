import { env } from '@/lib/env';
import { createLocalStorage } from './local';
import { createS3Storage } from './s3';

/**
 * Where uploaded files live.
 *
 * Keys are relative paths like `plans/guest-…png` or `products/17….jpg`. The `local` driver
 * writes them under `public/uploads` and serves them from `/uploads/<key>`; the `s3` driver
 * puts them in a bucket (AWS S3, Cloudflare R2, MinIO — anything S3-compatible) and serves
 * them from `S3_PUBLIC_URL`. Routes only ever talk to `storage`, so switching is one env var.
 */
export interface StoredFile {
  key: string;
  /** Public URL the browser can load the file from. */
  url: string;
  size: number;
}

export interface StoredObject {
  key: string;
  size: number;
  lastModified: Date;
}

export interface StorageDriver {
  readonly name: 'local' | 's3';
  put(key: string, body: Buffer, contentType: string): Promise<StoredFile>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<StoredObject[]>;
  urlFor(key: string): string;
  /** The key a URL this driver produced refers to, or `null` for a URL it did not produce. */
  keyFor(url: string): string | null;
}

export const storage: StorageDriver = env.STORAGE_DRIVER === 's3' ? createS3Storage(env) : createLocalStorage();

/** A key that cannot escape its folder: one path segment, safe characters only. */
export function safeKey(folder: string, filename: string): string {
  const clean = filename.replace(/[^\w.-]/g, '').replace(/^\.+/, '');
  if (!clean) throw new Error('empty filename');
  return `${folder}/${clean}`;
}
