import { describe, expect, it, vi } from 'vitest';
import { optimizeStoredModels, type ModelOptimizer, type StoredModelFile } from '@/lib/uploads/optimizeStored';

/**
 * Models stored before uploads were optimized get the recipe in place; what it keeps as it is
 * (already optimized, unreadable, not smaller) is never written.
 */

function file(key: string, bytes: Buffer | null) {
  const write = vi.fn(async (_body: Buffer) => {});
  const stored: StoredModelFile = { key, read: async () => bytes, write };
  return { stored, write };
}

const optimizer: ModelOptimizer = async (bytes) => {
  const text = bytes.toString();
  if (text === 'raw') {
    const body = Buffer.from('small');
    return { body, result: { status: 'optimized', bytes: new Uint8Array(body), stats: { bytesIn: bytes.length, bytesOut: body.length, trianglesIn: 1, trianglesOut: 1, texturesEncoded: 1, ms: 1 } } };
  }
  const reason = text === 'done' ? 'already-optimized' : text === 'broken' ? 'failed' : 'not-smaller';
  return { body: bytes, result: { status: 'kept', bytes: new Uint8Array(bytes), reason, error: reason === 'failed' ? 'bad glb' : undefined } };
};

describe('optimizeStoredModels', () => {
  it('rewrites only what the recipe made smaller, under the same key', async () => {
    const raw = file('models/old.glb', Buffer.from('raw'));
    const done = file('models/new.glb', Buffer.from('done'));
    const broken = file('models/broken.glb', Buffer.from('broken'));
    const gone = file('models/gone.glb', null);
    const reports = await optimizeStoredModels([raw.stored, done.stored, broken.stored, gone.stored], optimizer);

    expect(raw.write).toHaveBeenCalledWith(Buffer.from('small'));
    expect(done.write).not.toHaveBeenCalled();
    expect(broken.write).not.toHaveBeenCalled();
    expect(reports.map((r) => [r.key, r.status])).toEqual([
      ['models/old.glb', 'optimized'],
      ['models/new.glb', 'already-optimized'],
      ['models/broken.glb', 'failed'],
      ['models/gone.glb', 'missing'],
    ]);
    expect(reports[0]).toMatchObject({ bytesBefore: 3, bytesAfter: 5 });
    expect(reports[2].error).toBe('bad glb');
  });

  it('writes nothing on a dry run', async () => {
    const raw = file('models/old.glb', Buffer.from('raw'));
    const [report] = await optimizeStoredModels([raw.stored], optimizer, { dryRun: true });
    expect(report.status).toBe('optimized');
    expect(raw.write).not.toHaveBeenCalled();
  });
});
