import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `/api/products/[id]` with the database and the session mocked.
 *
 * What these prove: a hidden product — inactive, of a store not approved yet, or a person's own
 * furniture — answers 404 to anybody not entitled to it, and is read by its owner, by staff
 * and by its own store; a catalogue agent may change any product while a store may change only
 * its own.
 */

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
  product: null as Row | null,
  /** The joined store's `isActive`; null when the product has no store. */
  storeActive: null as boolean | null,
  updates: [] as Row[],
  deletes: 0,
}));

vi.mock('@/lib/db', () => {
  /** What a select resolves to: the joined read (`product` + `storeActive`) or `editable`'s. */
  const result = (fields: Row | undefined) => {
    if (!state.product) return [];
    if (fields && 'product' in fields) return [{ product: state.product, storeActive: state.storeActive }];
    return [{ id: state.product.id, storeId: state.product.storeId }];
  };
  const query = (fields: Row | undefined) => {
    const q = { from: () => q, leftJoin: () => q, where: () => q, limit: async () => result(fields) };
    return q;
  };
  return {
    db: {
      select: (fields?: Row) => query(fields),
      update: () => ({ set: (values: Row) => ({ where: async () => void state.updates.push(values) }) }),
      delete: () => ({ where: async () => void (state.deletes += 1) }),
    },
  };
});

const authMock = vi.fn<() => Promise<unknown>>(async () => null);
vi.mock('@/auth', () => ({ auth: () => authMock() }));
vi.mock('@/lib/api/designCatalog', () => ({ invalidateDesignCatalog: () => {} }));

const load = () => import('@/app/api/products/[id]/route');
const ctx = { params: Promise.resolve({ id: '31' }) };
const url = 'http://localhost/api/products/31';
const get = () => new Request(url);
const put = (body: Row) => new Request(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const del = () => new Request(url, { method: 'DELETE' });

const as = (user: Row) => authMock.mockResolvedValue({ user: { storeId: null, workerId: null, teamId: null, ...user } });
const visitor = () => authMock.mockResolvedValue(null);
const customer = () => as({ id: '5', role: 'user' });
const owner = () => as({ id: '9', role: 'user' });
const admin = () => as({ id: '1', role: 'admin' });
const catalogAgent = () => as({ id: '2', role: 'agent_catalog' });
const ordersAgent = () => as({ id: '3', role: 'agent_orders' });
const ownStore = () => as({ id: '20', role: 'store', storeId: 7 });
const otherStore = () => as({ id: '21', role: 'store', storeId: 8 });

/** A store's product; `storeActive` is that store's switch. */
const storeProduct = (patch: Row = {}, storeActive = true) => {
  state.product = { id: 31, slug: 'oak-floor', nameKa: 'მუხა', isActive: true, storeId: 7, ownerUserId: null, ...patch };
  state.storeActive = storeActive;
};
const ownFurniture = () => {
  state.product = { id: 31, slug: 'my-wardrobe', nameKa: 'ჩემი კარადა', isActive: true, storeId: null, ownerUserId: 9 };
  state.storeActive = null;
};

beforeEach(() => {
  storeProduct();
  state.updates.length = 0;
  state.deletes = 0;
  authMock.mockReset();
  authMock.mockResolvedValue(null);
});

describe('GET /api/products/[id]', () => {
  const status = async () => (await (await load()).GET(get(), ctx)).status;

  it('answers a public product to anybody, without asking who they are', async () => {
    const res = await (await load()).GET(get(), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ id: 31, slug: 'oak-floor' });
    expect(authMock).not.toHaveBeenCalled();
  });

  it('is a 404 for a product that does not exist', async () => {
    state.product = null;
    expect(await status()).toBe(404);
  });

  it('hides an inactive product from the public, and shows it to staff and its own store', async () => {
    storeProduct({ isActive: false });
    for (const who of [visitor, customer, ordersAgent, otherStore]) {
      who();
      expect(await status()).toBe(404);
    }
    for (const who of [admin, catalogAgent, ownStore]) {
      who();
      expect(await status()).toBe(200);
    }
  });

  it('hides the products of a store not approved yet, whatever their own flag says', async () => {
    storeProduct({ isActive: true }, false);
    for (const who of [visitor, customer, otherStore]) {
      who();
      expect(await status()).toBe(404);
    }
    for (const who of [admin, catalogAgent, ownStore]) {
      who();
      expect(await status()).toBe(200);
    }
  });

  it('shows a person\'s own furniture to them and to staff only', async () => {
    ownFurniture();
    for (const who of [visitor, customer, otherStore]) {
      who();
      expect(await status()).toBe(404);
    }
    for (const who of [owner, admin]) {
      who();
      expect(await status()).toBe(200);
    }
  });
});

describe('PUT and DELETE /api/products/[id]', () => {
  const update = async () => (await load()).PUT(put({ nameKa: 'ახალი სახელი' }), ctx);
  const remove = async () => (await load()).DELETE(del(), ctx);

  it('lets a catalogue agent change and delete a store\'s product', async () => {
    catalogAgent();
    expect((await update()).status).toBe(200);
    expect(state.updates).toHaveLength(1);
    expect((await remove()).status).toBe(200);
    expect(state.deletes).toBe(1);
  });

  it('lets admin change any product', async () => {
    admin();
    expect((await update()).status).toBe(200);
  });

  it('lets a store change its own product, never another store\'s', async () => {
    ownStore();
    expect((await update()).status).toBe(200);
    otherStore();
    expect((await update()).status).toBe(403);
    expect((await remove()).status).toBe(403);
    expect(state.updates).toHaveLength(1);
    expect(state.deletes).toBe(0);
  });

  it('keeps a store from moving its product to another store or featuring it', async () => {
    ownStore();
    await (await load()).PUT(put({ nameKa: 'x', storeId: 8, isFeatured: true }), ctx);
    expect(state.updates[0]).toMatchObject({ storeId: undefined, isFeatured: undefined });
  });

  it('turns away everybody who may not write products', async () => {
    visitor();
    expect((await update()).status).toBe(401);
    for (const who of [customer, ordersAgent]) {
      who();
      expect((await update()).status).toBe(403);
      expect((await remove()).status).toBe(403);
    }
    expect(state.updates).toHaveLength(0);
    expect(state.deletes).toBe(0);
  });

  it('is a 404 for a product that does not exist', async () => {
    catalogAgent();
    state.product = null;
    expect((await update()).status).toBe(404);
  });
});
