import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FloorPlan } from '@/lib/design/types';

/**
 * What a save names (`lib/calculator/saveProject`, `lib/design/saveDesign`): the revision its
 * own copy was made from — kept with the content, never borrowed from another tab — and the
 * previous save when its answer never came back.
 */

const memory = new Map<string, string>();
let saveCalculatorProject: typeof import('@/lib/calculator/saveProject').saveCalculatorProject;
let saveDesign: typeof import('@/lib/design/saveDesign').saveDesign;
let calcStores: typeof import('@/store/calculatorStore');
let designStores: typeof import('@/store/designStore');
let sync: typeof import('@/lib/flow/projectSync');

beforeAll(async () => {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => void memory.set(key, value),
    removeItem: (key: string) => void memory.delete(key),
    key: (i: number) => [...memory.keys()][i] ?? null,
    get length() {
      return memory.size;
    },
  });
  ({ saveCalculatorProject } = await import('@/lib/calculator/saveProject'));
  ({ saveDesign } = await import('@/lib/design/saveDesign'));
  calcStores = await import('@/store/calculatorStore');
  designStores = await import('@/store/designStore');
  sync = await import('@/lib/flow/projectSync');
});

let nextId = 500;
beforeEach(() => {
  memory.clear();
  nextId += 1;
});

/** A fetch that answers each call with the next of `answers` and records what was sent. */
function server(answers: Array<{ status: number; body: unknown } | 'drop'>) {
  const sent: Array<Record<string, unknown>> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { body: string }) => {
      sent.push(JSON.parse(init.body));
      const answer = answers.shift();
      if (!answer || answer === 'drop') throw new TypeError('network');
      return new Response(JSON.stringify(answer.body), { status: answer.status });
    })
  );
  return sent;
}

const calc = (id: number) => calcStores.useCalculatorStore.for(id);

describe('the calculation’s save', () => {
  it('names the revision its own copy was made from, and takes the new one back', async () => {
    const id = nextId;
    calc(id).setState({ projectId: id, baseRev: 3 });
    const sent = server([{ status: 200, body: { data: { id, rev: 4 }, error: null } }]);
    await saveCalculatorProject({ draft: true, projectId: id });
    expect(sent[0]).toMatchObject({ projectId: id, baseRev: 3 });
    expect(calc(id).getState()).toMatchObject({ baseRev: 4, pendingSaveId: null });
  });

  it('never borrows another tab’s revision: a copy made from an older one is still refused', async () => {
    const id = nextId;
    calc(id).setState({ projectId: id, baseRev: 3 });
    // Another tab saved and moved the row (and whatever lines it writes) to 4; this copy was made from 3.
    sync.markClean('calculator', id);
    const sent = server([{ status: 409, body: { data: null, error: 'PROJECT_CHANGED' } }]);
    await expect(saveCalculatorProject({ draft: true, projectId: id })).rejects.toMatchObject({ name: 'ProjectChangedError' });
    expect(sent[0].baseRev).toBe(3);
  });

  it('names the save whose answer never came back, so the server can tell it was its own', async () => {
    const id = nextId;
    calc(id).setState({ projectId: id, baseRev: 2 });
    const sent = server(['drop', { status: 200, body: { data: { id, rev: 4 }, error: null } }]);
    await expect(saveCalculatorProject({ draft: true, projectId: id })).rejects.toThrow();
    await saveCalculatorProject({ draft: true, projectId: id });
    expect(sent[1].prevSaveId).toBe(sent[0].saveId);
    expect(sent[1].baseRev).toBe(2);
  });

  it('marks the calculation saved only when nothing changed while the write was on its way', async () => {
    const id = nextId;
    calc(id).setState({ projectId: id, baseRev: 1 });
    sync.markDirty('calculator', id);
    server([{ status: 200, body: { data: { id, rev: 2 }, error: null } }]);
    await saveCalculatorProject({ draft: true, projectId: id });
    expect(sync.isDirty('calculator', id)).toBe(false);

    sync.markDirty('calculator', id);
    vi.stubGlobal('fetch', vi.fn(async () => {
      calc(id).getState().setChoices({ floor: 'parquet' });
      return new Response(JSON.stringify({ data: { id, rev: 3 }, error: null }), { status: 200 });
    }));
    await saveCalculatorProject({ draft: true, projectId: id });
    expect(sync.isDirty('calculator', id)).toBe(true);
  });
});

describe('the design’s save', () => {
  const plan = (): FloorPlan => ({ rooms: [], metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', wallThicknessM: 0.12, walls: [] });

  it('names the revision its own copy was made from', async () => {
    const id = nextId;
    designStores.useDesignStore.for(id).setState({ projectId: id, baseRev: 7, plan: plan() });
    const sent = server([{ status: 200, body: { data: { id, rev: 8 }, error: null } }]);
    await saveDesign({ draft: true, projectId: id });
    expect(sent[0]).toMatchObject({ baseRev: 7, homeState: null });
    expect(designStores.useDesignStore.for(id).getState().baseRev).toBe(8);
  });
});

describe('the design’s kept versions', () => {
  it('are never sent before they arrived, not sent back as they arrived, and sent when a person changed them', async () => {
    const id = nextId;
    const store = designStores.useDesignStore.for(id);
    const plan = { rooms: [], walls: [], metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', wallThicknessM: 0.12, wallHeightM: 2.8 } as unknown as FloorPlan;
    store.setState({ projectId: id, baseRev: 0, plan, versions: [], versionsLoaded: false });
    const kept = { id: 'v1', name: '01', kind: 'existing', createdAt: '2026-10-06T00:00:00Z', plan, scene: { styleId: 'modern', mode: 'full', budgetGel: null, items: [], finishes: [] } };
    const ok = (rev: number) => ({ status: 200, body: { data: { id, rev }, error: null } });
    const sent: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: { body: string }) => {
        if (String(url).endsWith('/versions')) return new Response(JSON.stringify({ data: { versions: [kept] }, error: null }), { status: 200 });
        sent.push(JSON.parse(init!.body));
        return new Response(JSON.stringify(ok(sent.length).body), { status: 200 });
      })
    );
    // Not here yet: the placeholder is not written over the saved versions, and nothing can be kept.
    await saveDesign({ draft: true, projectId: id });
    expect(store.getState().saveVersion('too early')).toBe('');
    const { loadDesignVersions } = await import('@/lib/design/saveDesign');
    await loadDesignVersions(id);
    expect(store.getState().versions.map((v) => v.id)).toEqual(['v1']);
    await saveDesign({ draft: true, projectId: id });
    store.getState().saveVersion('kept');
    await saveDesign({ draft: true, projectId: id });
    expect(sent.map((b) => 'versions' in b)).toEqual([false, false, true]);
    expect((sent[2].versions as unknown[]).length).toBe(2);
  });
});
