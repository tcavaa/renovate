import { env } from '@/lib/env';
import { createLocalStorage } from './local';
import { createSupabaseStorage } from './supabase';

/**
 * Where uploaded files live (docs/uploads.md).
 *
 * Two areas. The **public** one holds what the site shows — keys like `products/17….webp`,
 * `plans/u3-….png`, served from `urlFor(key)`. The **staging** one is private: the browser sends
 * a file there directly (`createUploadTarget`, never through a function — Vercel refuses request
 * bodies over 4.5 MB), and the route the file is for reads it back (`getStaged`), checks it,
 * optimizes it and publishes the result (`put`). Nothing in staging is ever served.
 *
 * Drivers: `supabase` (production — Supabase Storage, a public bucket and a private one) and
 * `local` (development — `public/uploads` served by Next, staging in `.uploads-staging/`).
 * Routes only ever talk to `storage`, so switching is one env var.
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

/** Where and how the browser sends a staged file's bytes. */
export interface UploadTarget {
  url: string;
  method: 'PUT';
  /** Headers the request must carry. */
  headers: Record<string, string>;
}

export interface StorageDriver {
  readonly name: 'local' | 'supabase';
  /** Publishes (or replaces) a file in the public area. */
  put(key: string, body: Buffer, contentType: string): Promise<StoredFile>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<StoredObject[]>;
  urlFor(key: string): string;
  /** The key a URL this driver produced refers to, or `null` for a URL it did not produce. */
  keyFor(url: string): string | null;

  /** A one-time place for the browser to send a file to, under a key the server chose. */
  createUploadTarget(stagingKey: string, contentType: string): Promise<UploadTarget>;
  /** A staged file's bytes, or null when nothing arrived. */
  getStaged(stagingKey: string): Promise<Buffer | null>;
  /** A staged file's size without reading it, or null when nothing arrived. */
  stagedSize(stagingKey: string): Promise<number | null>;
  deleteStaged(stagingKey: string): Promise<void>;
  listStaged(prefix: string): Promise<StoredObject[]>;
}

export const storage: StorageDriver = env.STORAGE_DRIVER === 'supabase' ? createSupabaseStorage(env) : createLocalStorage();

/** A key that cannot escape its folder: one path segment, safe characters only. */
export function safeKey(folder: string, filename: string): string {
  const clean = filename.replace(/[^\w.-]/g, '').replace(/^\.+/, '');
  if (!clean) throw new Error('empty filename');
  return `${folder}/${clean}`;
}
