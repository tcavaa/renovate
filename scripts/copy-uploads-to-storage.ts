/* eslint-disable no-console */
/**
 * Moves the files people uploaded on the old host into Supabase Storage, and points every row at
 * them (docs/operations.md#moving-the-data). Run after `pnpm db:copy-from-mysql`.
 *
 *   pnpm uploads:copy-to-storage --from <folder> [--dry-run] [--all]
 *
 * `<folder>` is a copy of the old `uploads` folder (cPanel: the document root's `uploads/`, taken
 * with File Manager's Compress → Download; locally `public/uploads`). The target is the configured
 * storage (`STORAGE_DRIVER=supabase` with `SUPABASE_URL` / `SUPABASE_SECRET_KEY`) and database.
 *
 * Only run-time uploads move (`isRuntimeUploadKey`: `<ms>-<hex>.<ext>`, `own-<user>-…`, and every
 * plan and render): the seed pictures under `public/uploads` ship with the app and Vercel serves
 * them as they are. By default only the files some row refers to are copied (`--all`: every
 * run-time file found). Each one is uploaded under the same key (`products/…`, `plans/…`), then
 * every string in the database that is exactly its old URL (`/uploads/<key>`) — a column, or
 * anywhere inside a JSON document (a scene's product snapshots, a kept version's plan) — becomes
 * the new one, in one transaction. A row pointing at a file the folder does not have is reported
 * and left as it is. Running it twice is harmless: the second run finds nothing to rewrite.
 */
import './lib/loadEnv';

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  glb: 'model/gltf-binary',
  svg: 'image/svg+xml',
};

/** The columns that hold an upload's URL, as text or inside JSON. */
const COLUMNS: Record<string, string[]> = {
  products: ['image_url', 'model_3d_url', 'texture_url', 'images', 'specs'],
  stores: ['logo_url'],
  teams: ['logo_url'],
  workers: ['avatar_url'],
  worker_works: ['image_url'],
  projects: ['floor_plan_url', 'plan', 'scene', 'versions', 'calculator_board', 'rooms', 'selected_products', 'selected_furniture'],
  project_renders: ['source_url', 'render_url'],
};

async function walk(root: string, dir = ''): Promise<string[]> {
  const out: string[] = [];
  for (const name of await readdir(path.join(root, dir))) {
    if (name.startsWith('.')) continue;
    const rel = dir ? `${dir}/${name}` : name;
    const info = await stat(path.join(root, rel));
    if (info.isDirectory()) out.push(...(await walk(root, rel)));
    else if (info.isFile()) out.push(rel);
  }
  return out;
}

/** Every string in a JSON value, for finding the URLs it holds. */
function strings(value: unknown, into: Set<string>): void {
  if (typeof value === 'string') into.add(value);
  else if (Array.isArray(value)) for (const v of value) strings(v, into);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) strings(v, into);
}

/** The value with each string that is an old URL replaced; the same object when nothing changed. */
function replaced(value: unknown, map: Map<string, string>): unknown {
  if (typeof value === 'string') return map.get(value) ?? value;
  if (Array.isArray(value)) {
    const next = value.map((v) => replaced(v, map));
    return next.some((v, i) => v !== value[i]) ? next : value;
  }
  if (value && typeof value === 'object') {
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      next[k] = replaced(v, map);
      if (next[k] !== v) changed = true;
    }
    return changed ? next : value;
  }
  return value;
}

async function main() {
  const args = process.argv.slice(2);
  const fromIndex = args.indexOf('--from');
  const from = fromIndex >= 0 ? args[fromIndex + 1] : undefined;
  const dryRun = args.includes('--dry-run');
  const all = args.includes('--all');
  if (!from) throw new Error('usage: pnpm uploads:copy-to-storage --from <uploads folder> [--dry-run] [--all]');

  const { storage } = await import('../lib/storage');
  const { isRuntimeUploadKey } = await import('../lib/storage/uploadKeys');
  const { pool } = await import('../lib/db');
  if (storage.name === 'local') throw new Error('STORAGE_DRIVER is local: point it at Supabase (STORAGE_DRIVER=supabase) first');

  const root = path.resolve(from);
  const isRuntime = (key: string) => key.startsWith('plans/') || key.startsWith('renders/') || isRuntimeUploadKey(key);
  const files = new Set((await walk(root)).filter(isRuntime));

  // What the rows point at.
  const referenced = new Set<string>();
  for (const [table, columns] of Object.entries(COLUMNS)) {
    const { rows } = await pool.query(`SELECT ${columns.map((c) => `"${c}"`).join(', ')} FROM "${table}"`);
    const found = new Set<string>();
    for (const row of rows) for (const c of columns) strings(row[c], found);
    for (const s of found) if (s.startsWith('/uploads/') && isRuntime(s.slice('/uploads/'.length))) referenced.add(s.slice('/uploads/'.length));
  }

  const toCopy = all ? [...files] : [...referenced].filter((key) => files.has(key));
  const missing = [...referenced].filter((key) => !files.has(key));
  console.log(`${files.size} run-time files in ${root}; ${referenced.size} referenced by rows; ${toCopy.length} to copy; ${missing.length} referenced but not in the folder`);
  for (const key of missing) console.log(`  ✗ missing: ${key}`);
  if (dryRun) {
    for (const key of toCopy) console.log(`  would copy ${key} → ${storage.urlFor(key)}`);
    await pool.end();
    return;
  }

  const map = new Map<string, string>();
  for (const key of toCopy) {
    const body = await readFile(path.join(root, key));
    const ext = key.split('.').pop()?.toLowerCase() ?? '';
    const stored = await storage.put(key, body, MIME[ext] ?? 'application/octet-stream');
    map.set(`/uploads/${key}`, stored.url);
    console.log(`  ✓ ${key} (${Math.round(body.byteLength / 1024)} KB)`);
  }

  // Every row that holds an old URL, rewritten in one transaction.
  const client = await pool.connect();
  let rowsChanged = 0;
  try {
    await client.query('BEGIN');
    for (const [table, columns] of Object.entries(COLUMNS)) {
      const { rows } = await client.query(`SELECT "id", ${columns.map((c) => `"${c}"`).join(', ')} FROM "${table}"`);
      for (const row of rows) {
        const set: Record<string, unknown> = {};
        for (const c of columns) {
          const next = replaced(row[c], map);
          if (next !== row[c]) set[c] = typeof next === 'string' || next === null ? next : JSON.stringify(next);
        }
        const names = Object.keys(set);
        if (!names.length) continue;
        await client.query(`UPDATE "${table}" SET ${names.map((n, i) => `"${n}" = $${i + 1}`).join(', ')} WHERE "id" = $${names.length + 1}`, [...names.map((n) => set[n]), row.id]);
        rowsChanged++;
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  console.log(`✅ ${map.size} files copied, ${rowsChanged} rows now point at storage`);
  await pool.end();
}

main().catch((err) => {
  console.error('❌ copy failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
