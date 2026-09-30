/**
 * The upload recipe (`glbOptimize.ts`) run again over models already stored — the ones uploaded
 * before the recipe existed (admin products, a person's own furniture): a Meshy export with
 * three 2048-pixel JPEGs and nothing compressed is still served as it came, 5–20 MB where the
 * recipe makes it well under 1.
 *
 * Each file is rewritten in place, under the same key, so every product row and every saved
 * design that names its URL keeps working; a browser that already cached the old bytes simply
 * keeps them. A file the recipe finds already optimized, cannot read, or cannot make smaller is
 * left exactly as it is, so running this again changes nothing. Server-only (sharp, through the
 * optimizer handed in).
 */

import type { GlbOptimizeResult } from './glbOptimize';

/** One stored model: where it is, and how to read and replace its bytes. */
export interface StoredModelFile {
  key: string;
  read(): Promise<Buffer | null>;
  write(body: Buffer): Promise<void>;
}

export interface StoredModelReport {
  key: string;
  bytesBefore: number;
  bytesAfter: number;
  status: 'optimized' | 'already-optimized' | 'not-smaller' | 'failed' | 'missing';
  error?: string;
}

export type ModelOptimizer = (bytes: Buffer) => Promise<{ body: Buffer; result: GlbOptimizeResult }>;

/** Runs the recipe over `files` one at a time (a large file takes a few hundred MB while it is worked on). */
export async function optimizeStoredModels(files: StoredModelFile[], optimize: ModelOptimizer, options: { dryRun?: boolean } = {}): Promise<StoredModelReport[]> {
  const reports: StoredModelReport[] = [];
  for (const file of files) {
    const bytes = await file.read();
    if (!bytes) {
      reports.push({ key: file.key, bytesBefore: 0, bytesAfter: 0, status: 'missing' });
      continue;
    }
    const { body, result } = await optimize(bytes);
    if (result.status === 'optimized') {
      if (!options.dryRun) await file.write(body);
      reports.push({ key: file.key, bytesBefore: bytes.byteLength, bytesAfter: body.byteLength, status: 'optimized' });
    } else {
      reports.push({ key: file.key, bytesBefore: bytes.byteLength, bytesAfter: bytes.byteLength, status: result.reason, error: result.error });
    }
  }
  return reports;
}
