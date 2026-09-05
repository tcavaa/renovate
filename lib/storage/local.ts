import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { StorageDriver, StoredObject } from './index';

const ROOT = path.join(process.cwd(), 'public', 'uploads');
const URL_PREFIX = '/uploads/';

/** Files on the server's own disk under `public/uploads`, served by Next (or Nginx). */
export function createLocalStorage(): StorageDriver {
  const resolve = (key: string) => {
    const full = path.resolve(ROOT, key);
    // Belt and braces on top of `safeKey`: never write outside the uploads directory.
    if (!full.startsWith(ROOT + path.sep)) throw new Error(`refusing path outside uploads: ${key}`);
    return full;
  };

  return {
    name: 'local',

    async put(key, body, _contentType) {
      const full = resolve(key);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, body);
      return { key, url: URL_PREFIX + key, size: body.byteLength };
    },

    async get(key) {
      try {
        return await readFile(resolve(key));
      } catch {
        return null;
      }
    },

    async delete(key) {
      try {
        await unlink(resolve(key));
      } catch {
        // already gone
      }
    },

    async list(prefix) {
      const dir = resolve(prefix.replace(/\/$/, ''));
      let names: string[];
      try {
        names = await readdir(dir);
      } catch {
        return [];
      }
      const objects: StoredObject[] = [];
      for (const name of names) {
        if (name.startsWith('.')) continue;
        const info = await stat(path.join(dir, name));
        if (!info.isFile()) continue;
        objects.push({ key: `${prefix.replace(/\/$/, '')}/${name}`, size: info.size, lastModified: info.mtime });
      }
      return objects;
    },

    urlFor: (key) => URL_PREFIX + key,

    keyFor(url) {
      const pathname = url.startsWith('/') ? url : safePathname(url);
      if (!pathname?.startsWith(URL_PREFIX)) return null;
      return pathname.slice(URL_PREFIX.length);
    },
  };
}

function safePathname(url: string): string | null {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}
