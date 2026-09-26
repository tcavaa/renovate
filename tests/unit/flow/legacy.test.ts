import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Work kept in the browser from before every project had its own stores (`lib/flow/legacy`),
 * and whose it is (`lib/flow/owner`): a journey that belongs to a project moves into that
 * project's keys — a copy of the server's, except a calculator's drawing, which the server
 * never had and is marked to be written; a journey with no project is kept for the hub to
 * offer; another account's work is forgotten, a guest's is not, and signing out forgets nothing.
 */

const memory = new Map<string, string>();
const session = new Map<string, string>();
let legacy: typeof import('@/lib/flow/legacy');
let owner: typeof import('@/lib/flow/owner');
let sync: typeof import('@/lib/flow/projectSync');

const storageOf = (map: Map<string, string>) => ({
  getItem: (key: string) => map.get(key) ?? null,
  setItem: (key: string, value: string) => void map.set(key, value),
  removeItem: (key: string) => void map.delete(key),
  key: (i: number) => [...map.keys()][i] ?? null,
  get length() {
    return map.size;
  },
});

beforeAll(async () => {
  vi.stubGlobal('localStorage', storageOf(memory));
  vi.stubGlobal('sessionStorage', storageOf(session));
  legacy = await import('@/lib/flow/legacy');
  owner = await import('@/lib/flow/owner');
  sync = await import('@/lib/flow/projectSync');
});

beforeEach(() => {
  memory.clear();
  session.clear();
  vi.unstubAllGlobals();
  vi.stubGlobal('localStorage', storageOf(memory));
  vi.stubGlobal('sessionStorage', storageOf(session));
});

const persisted = (state: Record<string, unknown>, version = 3) => JSON.stringify({ state, version });
const drawnBoard = persisted({ projectId: null, plan: { rooms: [{ id: 'a' }], walls: [{ id: 'w' }] } }, 2);

describe('migrating old work', () => {
  it('moves only a calculation’s drawing into its project — the row is the copy that opens', () => {
    memory.set('renovate-calculator', persisted({ projectId: 12, rooms: [{ id: 'a' }], homeState: 'black_frame' }));
    memory.set('renovate-calculator-plan', drawnBoard);
    legacy.migrateLegacyCaches();
    // The board carries the calculation's project (its own id was unreliable: the old reconcile cleared it).
    expect(JSON.parse(memory.get('renovate-calculator-plan:12')!).state.projectId).toBe(12);
    // The old calculation itself is not taken over: nothing says it is newer than the row.
    expect(memory.has('renovate-calculator:12')).toBe(false);
    expect(sync.syncInfo('calculator', 12)).toBeNull();
    expect(memory.has('renovate-calculator')).toBe(false);
    expect(memory.has('renovate-calculator-plan')).toBe(false);
  });

  it('prefers the person’s own drawing to an opened copy’s, and never writes over a project’s own board', () => {
    memory.set('renovate-calculator', persisted({ projectId: 14, rooms: [{ id: 'a' }] }));
    memory.set('renovate-calculator-plan', persisted({ projectId: null, plan: { rooms: [{ id: 'mine' }], walls: [] } }, 2));
    memory.set('renovate-project-calculator', persisted({ projectId: 14, rooms: [{ id: 'a' }] }));
    memory.set('renovate-project-calculator-plan', persisted({ projectId: 14, plan: { rooms: [{ id: 'opened' }], walls: [] } }, 2));
    legacy.migrateLegacyCaches();
    expect(JSON.parse(memory.get('renovate-calculator-plan:14')!).state.plan.rooms[0].id).toBe('mine');
    expect(memory.has('renovate-project-calculator-plan')).toBe(false);
    memory.set('renovate-calculator', persisted({ projectId: 14, rooms: [{ id: 'a' }] }));
    memory.set('renovate-calculator-plan', persisted({ projectId: null, plan: { rooms: [{ id: 'later' }], walls: [] } }, 2));
    legacy.migrateLegacyCaches();
    expect(JSON.parse(memory.get('renovate-calculator-plan:14')!).state.plan.rooms[0].id).toBe('mine');
  });

  it('lets a design of a project go: its row has it', () => {
    memory.set('renovate-design', persisted({ projectId: 13, plan: { rooms: [{ id: 'a' }] }, items: [] }, 2));
    memory.set('renovate-project-design', persisted({ projectId: 22, plan: { rooms: [{ id: 'b' }] } }, 2));
    legacy.migrateLegacyCaches();
    expect(memory.has('renovate-design')).toBe(false);
    expect(memory.has('renovate-project-design')).toBe(false);
    expect(memory.has('renovate-design:13')).toBe(false);
  });

  it('keeps work that belongs to no project for the hub to offer, and lets it go when asked', () => {
    memory.set('renovate-calculator', persisted({ projectId: null, rooms: [{ id: 'a' }] }));
    legacy.migrateLegacyCaches();
    expect(legacy.legacyUnsavedWork()).toEqual({ calculator: true, design: false });
    legacy.discardLegacyWork('calculator');
    expect(legacy.legacyUnsavedWork()).toEqual({ calculator: false, design: false });
  });

  it('drops an empty journey and the old per-tab switch', () => {
    memory.set('renovate-design', persisted({ projectId: null, plan: null, items: [] }, 2));
    session.set('renovate-workspace', '{}');
    legacy.migrateLegacyCaches();
    expect(memory.has('renovate-design')).toBe(false);
    expect(session.has('renovate-workspace')).toBe(false);
  });

  it('keeps old work as a new project: made on the server, moved in at its first revision, marked to be written', async () => {
    memory.set('renovate-design', persisted({ projectId: null, plan: { rooms: [{ id: 'a' }] }, items: [] }, 2));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: { id: 77 }, error: null }), { status: 201 })));
    expect(await legacy.adoptLegacyWork('design', 'Work from before')).toBe(77);
    expect(JSON.parse(memory.get('renovate-design:77')!).state).toMatchObject({ projectId: 77, baseRev: 0 });
    expect(sync.isDirty('design', 77)).toBe(true);
    expect(memory.has('renovate-design')).toBe(false);
  });

  it('keeps the old work where it is when it cannot be copied', async () => {
    memory.set('renovate-design', persisted({ projectId: null, plan: { rooms: [{ id: 'a' }] }, items: [] }, 2));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: { id: 78 }, error: null }), { status: 201 })));
    const full = { ...storageOf(memory), setItem: () => { throw new DOMException('full', 'QuotaExceededError'); } };
    vi.stubGlobal('localStorage', full);
    await expect(legacy.adoptLegacyWork('design', 'Work from before')).rejects.toThrow();
    expect(memory.has('renovate-design')).toBe(true);
  });
});

describe('whose work the browser holds', () => {
  it('forgets another account’s projects when somebody else signs in', () => {
    memory.set('renovate-owner', 'user:1');
    memory.set('renovate-design:5', '{}');
    memory.set('renovate-sync:design:5', JSON.stringify({ dirty: true }));
    owner.claimBrowser(2);
    expect(memory.has('renovate-design:5')).toBe(false);
    expect(memory.get('renovate-owner')).toBe('user:2');
  });

  it('keeps a guest’s old work for the account that signs in, and the account’s own work', () => {
    memory.set('renovate-owner', 'guest');
    memory.set('renovate-calculator', persisted({ projectId: null, rooms: [{ id: 'a' }] }));
    owner.claimBrowser(3);
    expect(legacy.legacyUnsavedWork().calculator).toBe(true);
    memory.set('renovate-design:9', '{}');
    owner.claimBrowser(3);
    expect(memory.has('renovate-design:9')).toBe(true);
  });

  it('forgets nothing when nobody is signed in — not even for a moment', () => {
    memory.set('renovate-owner', 'user:4');
    memory.set('renovate-design:6', '{}');
    memory.set('renovate-sync:design:6', JSON.stringify({ dirty: true }));
    owner.releaseBrowser();
    expect(memory.has('renovate-design:6')).toBe(true);
    // …and the owner is still the account, so another one signing in forgets it.
    owner.claimBrowser(8);
    expect(memory.has('renovate-design:6')).toBe(false);
  });
});
