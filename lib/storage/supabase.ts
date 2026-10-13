import { createClient } from '@supabase/supabase-js';
import type { Env } from '@/lib/env';
import type { StorageDriver, StoredObject } from './index';

/** Uploads have random names and never change, so the CDN and browsers may keep them a year. */
const CACHE_SECONDS = '31536000';
/** How many objects one listing call returns at most (Supabase's own cap is 1000). */
const PAGE = 1000;

/**
 * Supabase Storage (docs/uploads.md): two buckets of the project.
 *
 *  - `SUPABASE_PUBLIC_BUCKET` (`uploads`, public): what the site shows, served straight from
 *    Supabase's CDN at `<SUPABASE_URL>/storage/v1/object/public/uploads/<key>` — the app never
 *    proxies a file through a function.
 *  - `SUPABASE_STAGING_BUCKET` (`uploads-staging`, private): where browsers put files through
 *    signed upload URLs (valid two hours, one object each, no overwriting), read back and
 *    checked by the server before anything is published. Never served.
 *
 * Server-only: the client carries `SUPABASE_SECRET_KEY`, which passes every storage policy.
 */
export function createSupabaseStorage(env: Env): StorageDriver {
  const projectUrl = env.SUPABASE_URL!.replace(/\/$/, '');
  const client = createClient(projectUrl, env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'x-client-info': 'renovate-ge-server' } },
  });
  const publicBucket = env.SUPABASE_PUBLIC_BUCKET;
  const stagingBucket = env.SUPABASE_STAGING_BUCKET;
  const files = () => client.storage.from(publicBucket);
  const staged = () => client.storage.from(stagingBucket);
  const publicBase = `${projectUrl}/storage/v1/object/public/${publicBucket}`;

  const download = async (bucket: ReturnType<typeof files>, key: string): Promise<Buffer | null> => {
    const { data, error } = await bucket.download(key);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  };

  /** Every object under a folder, its subfolders included (the API lists one level at a time). */
  const listAll = async (bucket: ReturnType<typeof files>, prefix: string): Promise<StoredObject[]> => {
    const out: StoredObject[] = [];
    const walk = async (folder: string) => {
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await bucket.list(folder, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } });
        if (error) throw new Error(`storage list ${folder}: ${error.message}`);
        for (const entry of data ?? []) {
          const key = folder ? `${folder}/${entry.name}` : entry.name;
          // A folder is listed without an id or metadata.
          if (!entry.id) await walk(key);
          else out.push({ key, size: Number(entry.metadata?.size ?? 0), lastModified: new Date(entry.updated_at ?? entry.created_at ?? 0) });
        }
        if (!data || data.length < PAGE) break;
      }
    };
    await walk(prefix.replace(/\/$/, ''));
    return out;
  };

  return {
    name: 'supabase',

    async put(key, body, contentType) {
      const { error } = await files().upload(key, body, { contentType, cacheControl: CACHE_SECONDS, upsert: true });
      if (error) throw new Error(`storage put ${key}: ${error.message}`);
      return { key, url: `${publicBase}/${key}`, size: body.byteLength };
    },

    get: (key) => download(files(), key),

    async delete(key) {
      const { error } = await files().remove([key]);
      if (error) throw new Error(`storage delete ${key}: ${error.message}`);
    },

    list: (prefix) => listAll(files(), prefix),

    urlFor: (key) => `${publicBase}/${key}`,

    keyFor(url) {
      if (!url.startsWith(publicBase + '/')) return null;
      return decodeURIComponent(url.slice(publicBase.length + 1).split(/[?#]/)[0]);
    },

    async createUploadTarget(stagingKey, contentType) {
      const { data, error } = await staged().createSignedUploadUrl(stagingKey);
      if (error || !data) throw new Error(`storage upload url ${stagingKey}: ${error?.message ?? 'no data'}`);
      return {
        url: data.signedUrl,
        method: 'PUT',
        headers: { 'content-type': contentType, 'cache-control': `max-age=${CACHE_SECONDS}`, 'x-upsert': 'false' },
      };
    },

    getStaged: (stagingKey) => download(staged(), stagingKey),

    async stagedSize(stagingKey) {
      const { data, error } = await staged().info(stagingKey);
      if (error || !data) return null;
      return typeof data.size === 'number' ? data.size : null;
    },

    async deleteStaged(stagingKey) {
      const { error } = await staged().remove([stagingKey]);
      if (error) throw new Error(`storage delete staged ${stagingKey}: ${error.message}`);
    },

    listStaged: (prefix) => listAll(staged(), prefix),
  };
}
