import { beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * The autosave watches what the save sends (`lib/flow/autosaveSignature`). Each save is run
 * against a fetch that records its body, and every field in it must be one the signature
 * watches — or be the save's own bookkeeping, or derived from watched fields. The calculator's
 * board sockets (`board.electrical`) were sent and not watched: a socket placed on the board was
 * saved only if something else changed after it.
 */

const memory = new Map<string, string>();
let saveCalculatorProject: typeof import('@/lib/calculator/saveProject').saveCalculatorProject;
let saveDesign: typeof import('@/lib/design/saveDesign').saveDesign;
let calcStores: typeof import('@/store/calculatorStore');
let designStores: typeof import('@/store/designStore');
let sig: typeof import('@/lib/flow/autosaveSignature');

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
  sig = await import('@/lib/flow/autosaveSignature');
});

/** What a save sent, captured. */
async function sentBy(save: () => Promise<unknown>, id: number): Promise<Record<string, unknown>> {
  let body: Record<string, unknown> = {};
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { body: string }) => {
      body = JSON.parse(init.body);
      return new Response(JSON.stringify({ data: { id, rev: 1 }, error: null }), { status: 200 });
    })
  );
  await save();
  return body;
}

/** The save's own bookkeeping, not content. */
const ENVELOPE = new Set(['projectId', 'baseRev', 'saveId', 'prevSaveId', 'force', 'draft']);

/** Every content field of a body, by its own name; the objects that only group fields are opened. */
function leaves(body: Record<string, unknown>, open: string[]): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(body)) {
    if (ENVELOPE.has(key)) continue;
    if (open.includes(key) && value && typeof value === 'object' && !Array.isArray(value)) out.push(...leaves(value as Record<string, unknown>, open));
    else out.push(key);
  }
  return out;
}

const plan = { rooms: [], walls: [], metresPerPixel: null, bounds: { width: 0, depth: 0 }, source: 'manual', wallThicknessM: 0.12, wallHeightM: 2.8 };

describe('the autosave watches what the save sends', () => {
  it('the calculation — the board’s fittings included', async () => {
    const id = 801;
    calcStores.useCalculatorStore.for(id).setState({ projectId: id });
    designStores.useCalculatorPlanStore.for(id).setState({ plan: plan as never });
    const body = await sentBy(() => saveCalculatorProject({ draft: true, projectId: id }), id);
    const watched = new Set<string>([...sig.CALCULATOR_SAVED, ...sig.BOARD_SAVED]);
    // `steps` is a constant; the board's finishes are worked out from the plan and the picks.
    const derived = new Set(['steps', 'finishes']);
    const missing = leaves(body, ['edits', 'progress', 'board']).filter((key) => !watched.has(key) && !derived.has(key));
    expect(missing).toEqual([]);
    expect(leaves(body, ['board'])).toContain('electrical');
  });

  it('the design — its scene and progress included', async () => {
    const id = 802;
    designStores.useDesignStore.for(id).setState({ projectId: id, plan: plan as never });
    const body = await sentBy(() => saveDesign({ draft: true, projectId: id }), id);
    const watched = new Set<string>(sig.DESIGN_SAVED);
    expect(leaves(body, ['scene', 'progress']).filter((key) => !watched.has(key))).toEqual([]);
  });

  it('changes with any watched field, and counts versions by id and name only', () => {
    const base = { plan: null, versions: [{ id: 'v1', name: '01', scene: { items: [1] } }] };
    expect(sig.autosaveSignature(base)).not.toBe(sig.autosaveSignature({ ...base, plan: {} }));
    expect(sig.autosaveSignature(base)).toBe(sig.autosaveSignature({ ...base, versions: [{ id: 'v1', name: '01', scene: { items: [2] } }] }));
    expect(sig.autosaveSignature(base)).not.toBe(sig.autosaveSignature({ ...base, versions: [{ id: 'v1', name: 'renamed' }] }));
  });

  it('counts the design’s versions by the serial a person’s change bumps, not by their arrival', () => {
    const before = { plan: null, versions: [], versionsSerial: 0 };
    expect(sig.autosaveSignature(before)).toBe(sig.autosaveSignature({ ...before, versions: [{ id: 'v1', name: '01' }] }));
    expect(sig.autosaveSignature(before)).not.toBe(sig.autosaveSignature({ ...before, versionsSerial: 1 }));
  });
});
