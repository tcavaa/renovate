import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The category tree's routes with the database and the session mocked: a category is made
 * last among its siblings, never four levels deep, never under itself, never with a slug that
 * is taken; one with subcategories is not deleted; a reorder must name exactly the parent's
 * children; the calculator reads only its tabs and the catalogue nothing hidden. The studio's
 * rooms are staff's to change and admin's to delete.
 */

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
  categories: [] as Row[],
  rooms: [] as Row[],
  childCount: 0,
  productCount: 0,
  inserted: [] as Row[],
  updates: [] as Row[],
  deletes: 0,
}));

vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema');
  const rowsFor = (table: unknown, fields: Row | undefined): Row[] => {
    if (table === schema.categories) return fields && 'c' in fields ? [{ c: state.childCount }] : state.categories;
    if (table === schema.products) return [{ c: state.productCount }];
    if (table === schema.shelfRooms) return fields && 'last' in fields ? [{ last: 30 }] : state.rooms;
    return [];
  };
  const query = (fields: Row | undefined) => {
    let table: unknown;
    const q: Row = {
      from: (t: unknown) => ((table = t), q),
      where: () => q,
      orderBy: () => q,
      limit: async () => rowsFor(table, fields),
      then: (done: (v: unknown) => unknown, fail: (e: unknown) => unknown) => Promise.resolve().then(() => rowsFor(table, fields)).then(done, fail),
    };
    return q;
  };
  return {
    db: {
      select: (fields?: Row) => query(fields),
      insert: () => ({ values: async (values: Row) => (state.inserted.push(values), [{ insertId: 50 }]) }),
      update: () => ({ set: (values: Row) => ({ where: async () => void state.updates.push(values) }) }),
      delete: () => ({ where: async () => void (state.deletes += 1) }),
    },
  };
});

const authMock = vi.fn<() => Promise<unknown>>(async () => null);
vi.mock('@/auth', () => ({ auth: () => authMock() }));
vi.mock('@/lib/api/designCatalog', () => ({ invalidateDesignCatalog: () => {} }));

const as = (user: Row) => authMock.mockResolvedValue({ user: { storeId: null, workerId: null, teamId: null, ...user } });
const admin = () => as({ id: '1', role: 'admin' });
const catalogAgent = () => as({ id: '2', role: 'agent_catalog' });

const category = (id: number, parentId: number | null, slug: string, extra: Row = {}): Row => ({ id, parentId, slug, nameKa: slug, nameEn: slug, nameRu: null, sortOrder: id * 10, isVisible: true, isFurniture: false, inCalculator: false, model3dKind: null, calculationType: 'per_unit', icon: null, ...extra });
//  furniture(1) ─ sofas(2) ─ corner(3)
//               └ beds(4)
//  hidden(5) ─ inside(6)
const TREE = [category(1, null, 'furniture'), category(2, 1, 'sofas', { inCalculator: true }), category(3, 2, 'corner'), category(4, 1, 'beds', { inCalculator: true, sortOrder: 70 }), category(5, null, 'hidden', { isVisible: false }), category(6, 5, 'inside', { inCalculator: true })];

const json = (method: string, body: unknown) => new Request('http://localhost/api/categories', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const newCategory = (patch: Row = {}) => ({ nameKa: 'ახალი', nameEn: 'New', slug: 'new-one', calculationType: 'per_unit', ...patch });

beforeEach(() => {
  state.categories = TREE.map((c) => ({ ...c }));
  state.rooms = [{ id: 7, slug: 'bedroom' }];
  state.childCount = 0;
  state.productCount = 0;
  state.inserted = [];
  state.updates = [];
  state.deletes = 0;
  authMock.mockReset();
  authMock.mockResolvedValue(null);
});

describe('GET /api/categories', () => {
  const get = async (qs = '') => (await (await import('@/app/api/categories/route')).GET(new Request(`http://localhost/api/categories${qs}`), ctx(''))).json();

  it('lists the tree in reading order with depths, a hidden category taking its subtree with it', async () => {
    const { data } = await get();
    expect(data.map((c: Row) => `${c.depth}:${c.slug}`)).toEqual(['1:furniture', '2:sofas', '3:corner', '2:beds']);
  });

  it('gives the calculator its tabs only — a group hidden from the catalogue above one does not hide it there', async () => {
    const { data } = await get('?calculator=true');
    expect(data.map((c: Row) => c.slug)).toEqual(['sofas', 'beds', 'inside']);
    state.categories = state.categories.map((c) => (c.slug === 'beds' ? { ...c, isVisible: false } : c));
    expect((await get('?calculator=true')).data.map((c: Row) => c.slug)).toEqual(['sofas', 'inside']);
  });
});

describe('POST /api/categories', () => {
  const post = async (body: unknown) => (await import('@/app/api/categories/route')).POST(json('POST', body), ctx(''));

  it('makes a category last among its siblings', async () => {
    catalogAgent();
    const res = await post(newCategory({ parentId: 1 }));
    expect(res.status).toBe(200);
    expect(state.inserted[0]).toMatchObject({ parentId: 1, sortOrder: 80, slug: 'new-one' });
  });

  it('refuses a fourth level, a parent that is not there and a slug that is taken', async () => {
    catalogAgent();
    expect((await (await post(newCategory({ parentId: 3 }))).json()).error).toBe('CATEGORY_TOO_DEEP');
    expect((await (await post(newCategory({ parentId: 99 }))).json()).error).toBe('UNKNOWN_PARENT');
    const taken = await post(newCategory({ slug: 'beds' }));
    expect(taken.status).toBe(409);
    expect(state.inserted).toHaveLength(0);
  });

  it('refuses a 3D kind the studio does not know', async () => {
    catalogAgent();
    expect((await post(newCategory({ model3dKind: 'spaceship' }))).status).toBe(400);
    expect((await post(newCategory({ model3dKind: 'sofa_corner' }))).status).toBe(200);
  });
});

describe('PUT /api/categories/[id]', () => {
  const put = async (id: number, body: unknown) => (await import('@/app/api/categories/[id]/route')).PUT(json('PUT', body), ctx(String(id)));

  it('moves a category under another parent, last among its new siblings', async () => {
    catalogAgent();
    const res = await put(4, { parentId: 5 });
    expect(res.status).toBe(200);
    expect(state.updates[0]).toMatchObject({ parentId: 5, sortOrder: 70 });
  });

  it('refuses a loop and a move that would pass the third level', async () => {
    catalogAgent();
    expect((await (await put(1, { parentId: 3 })).json()).error).toBe('CATEGORY_CYCLE');
    // sofas carries corner with it: under beds it would be four levels deep.
    expect((await (await put(2, { parentId: 4 })).json()).error).toBe('CATEGORY_TOO_DEEP');
    expect(state.updates).toHaveLength(0);
  });

  it('changes a category in place without touching its order', async () => {
    catalogAgent();
    await put(2, { nameKa: 'დივნები', parentId: 1 });
    expect(state.updates[0]).toEqual({ nameKa: 'დივნები' });
  });
});

describe('DELETE /api/categories/[id]', () => {
  const remove = async (id: number) => (await import('@/app/api/categories/[id]/route')).DELETE(new Request('http://localhost', { method: 'DELETE' }), ctx(String(id)));

  it('keeps a category that has subcategories', async () => {
    admin();
    state.childCount = 2;
    const res = await remove(2);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('CATEGORY_HAS_CHILDREN');
    expect(state.deletes).toBe(0);
  });

  it('deletes an empty one for admin', async () => {
    admin();
    expect((await remove(3)).status).toBe(200);
    expect(state.deletes).toBe(1);
  });
});

describe('POST /api/categories/reorder', () => {
  const reorder = async (body: unknown) => (await import('@/app/api/categories/reorder/route')).POST(new Request('http://localhost', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), ctx(''));

  it('orders a parent\'s children as sent', async () => {
    catalogAgent();
    expect((await reorder({ parentId: 1, ids: [4, 2] })).status).toBe(200);
    expect(state.updates).toEqual([{ sortOrder: 10 }, { sortOrder: 20 }]);
  });

  it('refuses a list that is not exactly the parent\'s children', async () => {
    catalogAgent();
    expect((await (await reorder({ parentId: 1, ids: [2] })).json()).error).toBe('STALE_ORDER');
    expect((await (await reorder({ parentId: 1, ids: [2, 3] })).json()).error).toBe('STALE_ORDER');
    expect(state.updates).toHaveLength(0);
  });
});

describe('the studio rooms', () => {
  const room = { slug: 'kids', nameKa: 'საბავშვო', nameEn: 'Kids', roomTypes: ['bedroom'], categoryIds: [4] };

  it('lets the catalogue agent make and change one', async () => {
    catalogAgent();
    const created = await (await import('@/app/api/shelf-rooms/route')).POST(new Request('http://localhost', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(room) }), ctx(''));
    expect(created.status).toBe(200);
    expect(state.inserted[0]).toMatchObject({ slug: 'kids', sortOrder: 40 });
    expect(state.inserted[1]).toEqual([{ shelfRoomId: 50, categoryId: 4, sortOrder: 10 }]);
  });

  it('refuses a slug another room has and a room type the plan has not', async () => {
    catalogAgent();
    const post = async (body: unknown) => (await import('@/app/api/shelf-rooms/route')).POST(new Request('http://localhost', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), ctx(''));
    expect((await post({ ...room, slug: 'bedroom' })).status).toBe(409);
    expect((await post({ ...room, roomTypes: ['garage'] })).status).toBe(400);
  });

  it('leaves deleting to admin', async () => {
    const remove = async () => (await import('@/app/api/shelf-rooms/[id]/route')).DELETE(new Request('http://localhost', { method: 'DELETE' }), ctx('7'));
    catalogAgent();
    expect((await remove()).status).toBe(403);
    admin();
    expect((await remove()).status).toBe(200);
    expect(state.deletes).toBe(1);
  });
});
