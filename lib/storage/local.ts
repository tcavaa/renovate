import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { StorageDriver, StoredObject } from './index';

const ROOT = path.join(process.cwd(), 'public', 'uploads');
const STAGING = path.join(process.cwd(), '.uploads-staging');
const URL_PREFIX = '/uploads/';

/**
 * Files on this machine's disk — development, and the e2e flows. Published files under
 * `public/uploads`, served by Next from `/uploads/<key>`; staged ones under `.uploads-staging/`
 * (git-ignored, never served), sent by the browser to `PUT /api/uploads/staging`, the stand-in
 * for a storage service's signed upload URL. Not for a serverless host: its disk is read-only.
 */
export function createLocalStorage(): StorageDriver {
  const inside = (root: string, key: string) => {
    const full = path.resolve(root, key);
    // Belt and braces on top of `safeKey`: never touch anything outside the root.
    if (!full.startsWith(root + path.sep)) throw new Error(`refusing path outside ${path.basename(root)}: ${key}`);
    return full;
  };

  const listUnder = async (root: string, prefix: string): Promise<StoredObject[]> => {
    const dir = inside(root, prefix.replace(/\/$/, ''));
    const objects: StoredObject[] = [];
    const walk = async (folder: string, keyPrefix: string) => {
      let names: string[];
      try {
        names = await readdir(folder);
      } catch {
        return;
      }
      for (const name of names) {
        if (name.startsWith('.')) continue;
        const full = path.join(folder, name);
        const info = await stat(full);
        if (info.isDirectory()) await walk(full, `${keyPrefix}/${name}`);
        else if (info.isFile()) objects.push({ key: `${keyPrefix}/${name}`, size: info.size, lastModified: info.mtime });
      }
    };
    await walk(dir, prefix.replace(/\/$/, ''));
    return objects;
  };

  const readOrNull = async (full: string) => {
    try {
      return await readFile(full);
    } catch {
      return null;
    }
  };

  const unlinkQuietly = async (full: string) => {
    try {
      await unlink(full);
    } catch {
      // already gone
    }
  };

  return {
    name: 'local',

    async put(key, body, _contentType) {
      const full = inside(ROOT, key);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, body);
      return { key, url: URL_PREFIX + key, size: body.byteLength };
    },

    get: (key) => readOrNull(inside(ROOT, key)),

    delete: (key) => unlinkQuietly(inside(ROOT, key)),

    list: (prefix) => listUnder(ROOT, prefix),

    urlFor: (key) => URL_PREFIX + key,

    keyFor(url) {
      const pathname = url.startsWith('/') ? url : safePathname(url);
      if (!pathname?.startsWith(URL_PREFIX)) return null;
      return pathname.slice(URL_PREFIX.length);
    },

    async createUploadTarget(stagingKey, contentType) {
      return { url: `/api/uploads/staging?key=${encodeURIComponent(stagingKey)}`, method: 'PUT', headers: { 'content-type': contentType } };
    },

    getStaged: (stagingKey) => readOrNull(inside(STAGING, stagingKey)),

    async stagedSize(stagingKey) {
      try {
        return (await stat(inside(STAGING, stagingKey))).size;
      } catch {
        return null;
      }
    },

    deleteStaged: (stagingKey) => unlinkQuietly(inside(STAGING, stagingKey)),

    listStaged: (prefix) => listUnder(STAGING, prefix),
  };
}

/** Where `PUT /api/uploads/staging` writes a file the browser sent (local driver only). */
export async function writeLocalStaged(stagingKey: string, body: Buffer): Promise<void> {
  const full = path.resolve(STAGING, stagingKey);
  if (!full.startsWith(STAGING + path.sep)) throw new Error(`refusing path outside staging: ${stagingKey}`);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, body);
}

function safePathname(url: string): string | null {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}
