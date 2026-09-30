/* eslint-disable no-console */
/**
 * Runs the upload recipe again over the 3D models already stored — the admin products and own
 * furniture uploaded before uploads were optimized (`lib/uploads/optimizeStored.ts`). Every new
 * upload is optimized on its way in; this catches the ones that came before. Idempotent: an
 * optimized file is left as it is.
 *
 *   pnpm uploads:optimize-models              every model under the storage's `models/` (local or S3, from the env)
 *   pnpm uploads:optimize-models --dry-run    report what would change, write nothing
 *   node optimize-models.cjs --dir <folder>   a plain folder of .glb files, no env needed —
 *                                             what the cPanel deploy runs on its shared uploads
 */
import './lib/loadEnv';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { optimizeStoredModels, type StoredModelFile } from '../lib/uploads/optimizeStored';
import { optimizeUploadedModel } from '../lib/uploads/glbOptimizeServer';

const MODEL_MIME = 'model/gltf-binary';

async function filesIn(dir: string): Promise<StoredModelFile[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  return names
    .filter((name) => name.endsWith('.glb'))
    .sort()
    .map((name) => {
      const full = path.join(dir, name);
      return { key: name, read: () => readFile(full).catch(() => null), write: (body: Buffer) => writeFile(full, body) };
    });
}

async function filesInStorage(): Promise<StoredModelFile[]> {
  // Loaded only here: `lib/storage` validates the environment, which `--dir` does not need.
  const { storage } = await import('../lib/storage');
  const objects = await storage.list('models/');
  return objects
    .filter((object) => object.key.endsWith('.glb'))
    .map((object) => ({
      key: object.key,
      read: () => storage.get(object.key),
      write: async (body: Buffer) => {
        await storage.put(object.key, body, MODEL_MIME);
      },
    }));
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const dirAt = args.indexOf('--dir');
  const dir = dirAt >= 0 ? args[dirAt + 1] : null;
  if (dirAt >= 0 && !dir) throw new Error('--dir needs a folder');

  const files = dir ? await filesIn(path.resolve(dir)) : await filesInStorage();
  const reports = await optimizeStoredModels(files, optimizeUploadedModel, { dryRun });
  const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
  let before = 0;
  let after = 0;
  for (const report of reports) {
    if (report.status === 'optimized') {
      before += report.bytesBefore;
      after += report.bytesAfter;
      console.log(`  ${dryRun ? 'would optimize' : 'optimized'} ${report.key}: ${kb(report.bytesBefore)} → ${kb(report.bytesAfter)}`);
    } else if (report.status === 'failed' || report.status === 'missing') {
      console.log(`  ${report.status} ${report.key}${report.error ? `: ${report.error}` : ''}`);
    }
  }
  const optimized = reports.filter((r) => r.status === 'optimized').length;
  console.log(`${dryRun ? '[dry run] ' : ''}${optimized} of ${reports.length} stored models ${dryRun ? 'would be ' : ''}optimized${optimized ? `: ${(before / 1e6).toFixed(1)} MB → ${(after / 1e6).toFixed(1)} MB` : ''}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
