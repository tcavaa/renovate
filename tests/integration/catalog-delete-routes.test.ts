import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Deleting in the catalogue, with the database and the session mocked: a category, a store and
 * products in bulk are deleted by admin only — the catalogue agent edits, hides and shows them
 * but is refused a delete (`canDeleteIn`), before anything is read or removed. A store deletes
 * its own products in bulk.
 */

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
  /** What the "still in use?" count answers. */
  linked: 0,
  products: [] as Row[],
  reads: 0,
  deletes: 0,
  updates: 0,
}));

vi.mock('@/lib/db', () => {
  const rows = (fields: Row | undefined) => {
    state.reads += 1;
    if (fields && 'c' in fields) return [{ c: state.linked }];
    if (fields && 'count' in fields) return [{ count: state.linked }];
    if (fields && 'logoUrl' in fields) return [{ logoUrl: null }];
    return state.products;
  };
  const query = (fields: Row | undefined) => {
    const q: Row = {
      from: () => q,
      leftJoin: () => q,
      where: () => q,
      limit: async () => rows(fields),
      then: (done: (v: unknown) => unknown, fail: (e: unknown) => unknown) => Promise.resolve().then(() => rows(fields)).then(done, fail),
    };
    return q;
  };
  return {
    db: {
      select: (fields?: Row) => query(fields),
      update: () => ({ set: () => ({ where: async () => void (state.updates += 1) }) }),
      delete: () => ({ where: async () => void (state.deletes += 1) }),
    },
  };
});

const authMock = vi.fn<() => Promise<unknown>>(async () => null);
vi.mock('@/auth', () => ({ auth: () => authMock() }));
vi.mock('@/lib/api/designCatalog', () => ({ invalidateDesignCatalog: () => {} }));
vi.mock('@/lib/storage/cleanup', () => ({ removeUnusedUploads: async () => {}, productFileUrls: () => [] }));

const as = (user: Row) => authMock.mockResolvedValue({ user: { storeId: null, workerId: null, teamId: null, ...user } });
const admin = () => as({ id: '1', role: 'admin' });
const catalogAgent = () => as({ id: '2', role: 'agent_catalog' });
const ordersAgent = () => as({ id: '3', role: 'agent_orders' });
const ownStore = () => as({ id: '20', role: 'store', storeId: 7 });

const ctx = { params: Promise.resolve({ id: '4' }) };
const del = (path: string) => new Request(`http://localhost${path}`, { method: 'DELETE' });
const bulk = (action: string, ids = [31, 32]) =>
  new Request('http://localhost/api/products/bulk', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids, action }) });

beforeEach(() => {
  state.linked = 0;
  state.products = [
    { id: 31, storeId: 7, imageUrl: null, model3dUrl: null, textureUrl: null, ownerUserId: null },
    { id: 32, storeId: 8, imageUrl: null, model3dUrl: null, textureUrl: null, ownerUserId: null },
  ];
  state.reads = 0;
  state.deletes = 0;
  state.updates = 0;
  authMock.mockReset();
  authMock.mockResolvedValue(null);
});

describe('DELETE /api/categories/[id]', () => {
  const remove = async () => (await import('@/app/api/categories/[id]/route')).DELETE(del('/api/categories/4'), ctx);

  it('is admin\'s', async () => {
    admin();
    expect((await remove()).status).toBe(200);
    expect(state.deletes).toBe(1);
  });

  it('refuses the catalogue agent before reading anything', async () => {
    catalogAgent();
    expect((await remove()).status).toBe(403);
    expect(state.reads).toBe(0);
    expect(state.deletes).toBe(0);
  });

  it('refuses whoever has no categories section, and a visitor', async () => {
    ordersAgent();
    expect((await remove()).status).toBe(403);
    authMock.mockResolvedValue(null);
    expect((await remove()).status).toBe(401);
    expect(state.deletes).toBe(0);
  });

  it('keeps a category that still has products', async () => {
    admin();
    state.linked = 3;
    expect((await remove()).status).toBe(409);
    expect(state.deletes).toBe(0);
  });
});

describe('DELETE /api/stores/[id]', () => {
  const remove = async () => (await import('@/app/api/stores/[id]/route')).DELETE(del('/api/stores/4'), ctx);

  it('is admin\'s', async () => {
    admin();
    expect((await remove()).status).toBe(200);
    expect(state.deletes).toBe(1);
  });

  it('refuses the catalogue agent, who switches a store off instead', async () => {
    catalogAgent();
    expect((await remove()).status).toBe(403);
    expect(state.reads).toBe(0);
    expect(state.deletes).toBe(0);
  });
});

describe('POST /api/products/bulk', () => {
  const post = async (action: string) => (await import('@/app/api/products/bulk/route')).POST(bulk(action), { params: Promise.resolve({}) });

  it('refuses the catalogue agent a delete, before reading anything', async () => {
    catalogAgent();
    expect((await post('delete')).status).toBe(403);
    expect(state.reads).toBe(0);
    expect(state.deletes).toBe(0);
  });

  it('lets the catalogue agent hide and show any product', async () => {
    catalogAgent();
    const res = await post('hide');
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ done: 2, skipped: 0 });
    expect(state.updates).toBe(1);
  });

  it('lets admin delete any product', async () => {
    admin();
    const res = await post('delete');
    expect((await res.json()).data).toEqual({ done: 2, skipped: 0 });
    expect(state.deletes).toBe(1);
  });

  it('lets a store delete its own products and skip the rest', async () => {
    ownStore();
    const res = await post('delete');
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ done: 1, skipped: 1 });
    expect(state.deletes).toBe(1);
  });
});
