import { describe, expect, it, vi } from 'vitest';

/**
 * A Draco decoder that failed to arrive is let go and replaced (`lib/design3d/modelLoader.ts`).
 * DRACOLoader keeps its decoder promise for good, a rejected one too: every Draco model was a
 * ghost box until the page was reloaded.
 */

const made = vi.hoisted(() => ({ loaders: [] as Array<{ decoderPending: Promise<unknown> | null; disposed: boolean; fail: boolean }>, set: [] as unknown[], failNext: true }));

vi.mock('three/examples/jsm/loaders/DRACOLoader.js', () => ({
  DRACOLoader: class {
    decoderPending: Promise<unknown> | null = null;
    disposed = false;
    fail = made.failNext;
    constructor() {
      made.failNext = false;
      made.loaders.push(this);
    }
    setDecoderPath() {
      return this;
    }
    setDecoderConfig() {
      return this;
    }
    _initDecoder() {
      if (!this.decoderPending) this.decoderPending = this.fail ? Promise.reject(new Error('decoder 404')) : Promise.resolve({});
      return this.decoderPending;
    }
    preload() {
      void this._initDecoder().catch(() => undefined);
      return this;
    }
    dispose() {
      this.disposed = true;
      return this;
    }
  },
}));
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    setMeshoptDecoder() {
      return this;
    }
    setDRACOLoader(loader: unknown) {
      made.set.push(loader);
      return this;
    }
  },
}));

describe('a Draco decoder that did not arrive', () => {
  it('is replaced, and the replacement fetches the decoder again when a model asks', async () => {
    vi.stubGlobal('window', {});
    await import('@/lib/design3d/modelLoader');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const [failed, replacement] = made.loaders;
    expect(failed.disposed).toBe(true);
    expect(made.set.at(-1)).toBe(replacement);
    // Not fetched until a Draco model asks for it.
    expect(replacement.decoderPending).toBeNull();
    await (replacement as unknown as { _initDecoder: () => Promise<unknown> })._initDecoder();
    expect(made.loaders).toHaveLength(2);
    vi.unstubAllGlobals();
  });
});
