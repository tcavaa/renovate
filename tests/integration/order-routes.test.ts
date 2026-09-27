import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `/api/orders/[id]`, `…/confirm` and `…/comments` with the session and the order mocked.
 *
 * What these prove: a store's order is not the store's until the platform has confirmed it;
 * a partner moves its order only along its own steps and never touches lines, prices or the
 * delivery; the orders agent changes anything but sends a store's order on only through
 * "confirm"; the catalogue agent has no business with orders at all; the staff note never
 * reaches a partner or a customer.
 */

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
  view: null as null | { order: Row; items: Row[]; store: null; worker: null; team: null; project: null; checkout: null },
  edits: [] as Array<{ id: number; edit: Row; actor: Row }>,
  confirms: [] as Array<{ id: number; actor: Row }>,
  confirmResult: { ok: true } as Row,
  comments: [] as Array<{ id: number; body: string; fromStaff: boolean; actor: Row }>,
}));

vi.mock('@/lib/db', () => ({ db: {} }));
const authMock = vi.fn<() => Promise<unknown>>(async () => null);
vi.mock('@/auth', () => ({ auth: () => authMock() }));
vi.mock('@/lib/finance/orders', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/finance/orders')>();
  return {
    ...real,
    loadOrderView: async () => state.view,
    applyOrderEdit: async (id: number, edit: Row, actor: Row) => {
      state.edits.push({ id, edit, actor });
      return state.view;
    },
    confirmOrder: async (id: number, actor: Row) => {
      state.confirms.push({ id, actor });
      return state.confirmResult.ok ? { ok: true, view: { ...state.view, order: { ...state.view!.order, status: 'confirmed', sentAt: new Date() } } } : state.confirmResult;
    },
    addOrderComment: async (id: number, actor: Row, body: string, fromStaff: boolean) => {
      state.comments.push({ id, actor, body, fromStaff });
    },
  };
});

const orderRoute = () => import('@/app/api/orders/[id]/route');
const confirmRoute = () => import('@/app/api/orders/[id]/confirm/route');
const commentRoute = () => import('@/app/api/orders/[id]/comments/route');
const ctx = { params: Promise.resolve({ id: '13' }) };
const url = 'http://localhost/api/orders/13';
const json = (method: string, body?: Row) => new Request(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });

const as = (user: Row) => authMock.mockResolvedValue({ user: { storeId: null, workerId: null, teamId: null, name: 'Someone', ...user } });
const ordersAgent = () => as({ id: '36', role: 'agent_orders', name: 'Test Orders Agent' });
const catalogAgent = () => as({ id: '37', role: 'agent_catalog' });
const ownStore = () => as({ id: '38', role: 'store', storeId: 6 });
const otherStore = () => as({ id: '21', role: 'store', storeId: 8 });
const brigade = () => as({ id: '40', role: 'team', teamId: 1 });
const customer = () => as({ id: '1', role: 'user' });

/** Store #6's order #13, still with the platform unless `sentAt` says otherwise. */
const storeOrder = (patch: Row = {}) => {
  state.view = { order: { id: 13, userId: 1, partnerType: 'store', storeId: 6, workerId: null, teamId: null, status: 'new', sentAt: null, staffNote: 'rang the customer', ...patch }, items: [{ id: 1 }, { id: 2 }], store: null, worker: null, team: null, project: null, checkout: null };
};
const sentStoreOrder = (patch: Row = {}) => storeOrder({ status: 'confirmed', sentAt: new Date('2026-09-27T10:00:00Z'), ...patch });
const booking = (patch: Row = {}) => {
  state.view = { order: { id: 13, userId: 1, partnerType: 'team', storeId: null, workerId: null, teamId: 1, status: 'new', sentAt: new Date('2026-09-27T10:00:00Z'), staffNote: null, ...patch }, items: [], store: null, worker: null, team: null, project: null, checkout: null };
};

beforeEach(() => {
  storeOrder();
  state.edits.length = 0;
  state.confirms.length = 0;
  state.comments.length = 0;
  state.confirmResult = { ok: true };
  authMock.mockReset();
  authMock.mockResolvedValue(null);
});

describe('a store order waiting for the platform', () => {
  it('is not the store’s yet — to read, to change or to comment on', async () => {
    ownStore();
    expect((await (await orderRoute()).GET(json('GET'), ctx)).status).toBe(403);
    expect((await (await orderRoute()).PUT(json('PUT', { status: 'confirmed' }), ctx)).status).toBe(403);
    expect((await (await commentRoute()).POST(json('POST', { body: 'hello' }), ctx)).status).toBe(403);
    expect(state.edits).toHaveLength(0);
  });

  it('is changed by the orders agent — lines, delivery, note — with the agent as the actor', async () => {
    ordersAgent();
    const res = await (await orderRoute()).PUT(json('PUT', { items: [{ id: 1, removed: true }], deliveryFee: 20, staffNote: 'agreed by phone' }), ctx);
    expect(res.status).toBe(200);
    expect(state.edits[0].edit).toMatchObject({ items: [{ id: 1, removed: true }], deliveryFee: 20, staffNote: 'agreed by phone' });
    expect(state.edits[0].actor).toEqual({ userId: 36, role: 'agent_orders', name: 'Test Orders Agent' });
  });

  it('is sent on only through confirm, never by picking a status', async () => {
    ordersAgent();
    const res = await (await orderRoute()).PUT(json('PUT', { status: 'confirmed' }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('ORDER_STATUS_NOT_ALLOWED');
    // Cancelling one is fine: the store never sees it.
    expect((await (await orderRoute()).PUT(json('PUT', { status: 'cancelled' }), ctx)).status).toBe(200);
  });

  it('is confirmed by the orders agent, and the catalogue agent cannot even try', async () => {
    catalogAgent();
    expect((await (await confirmRoute()).POST(json('POST'), ctx)).status).toBe(403);
    expect(state.confirms).toHaveLength(0);
    ordersAgent();
    const res = await (await confirmRoute()).POST(json('POST'), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ id: 13, status: 'confirmed' });
    expect(state.confirms[0].actor).toMatchObject({ userId: 36, role: 'agent_orders' });
  });

  it('answers a second confirmation with the reason', async () => {
    ordersAgent();
    state.confirmResult = { ok: false, error: 'ORDER_ALREADY_SENT' };
    const res = await (await confirmRoute()).POST(json('POST'), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('ORDER_ALREADY_SENT');
  });
});

describe('a partner with its order', () => {
  it('reads it without the staff note', async () => {
    sentStoreOrder();
    ownStore();
    const res = await (await orderRoute()).GET(json('GET'), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).data.order.staffNote).toBeNull();
  });

  it('never touches lines, prices or the delivery', async () => {
    sentStoreOrder();
    ownStore();
    for (const body of [{ items: [{ id: 1, unitPrice: 1 }] }, { addItems: [{ nameKa: 'x', qty: 1, unitPrice: 1 }] }, { deliveryFee: 0 }]) {
      const res = await (await orderRoute()).PUT(json('PUT', body), ctx);
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe('ORDER_LINES_LOCKED');
    }
    expect(state.edits).toHaveLength(0);
  });

  it('moves it along its own steps, and writes to the customer — never the staff note', async () => {
    sentStoreOrder();
    ownStore();
    expect((await (await orderRoute()).PUT(json('PUT', { status: 'new' }), ctx)).status).toBe(409);
    const res = await (await orderRoute()).PUT(json('PUT', { status: 'in_progress', partnerMessage: 'delivery tomorrow', staffNote: 'sneaky' }), ctx);
    expect(res.status).toBe(200);
    expect(state.edits[0].edit).toMatchObject({ status: 'in_progress', partnerMessage: 'delivery tomorrow' });
    expect(state.edits[0].edit.staffNote).toBeUndefined();
  });

  it('cannot reopen a closed order', async () => {
    sentStoreOrder({ status: 'done' });
    ownStore();
    const res = await (await orderRoute()).PUT(json('PUT', { status: 'in_progress' }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('ORDER_CLOSED');
  });

  it('is somebody else’s order to another store', async () => {
    sentStoreOrder();
    otherStore();
    expect((await (await orderRoute()).PUT(json('PUT', { status: 'done' }), ctx)).status).toBe(403);
    expect((await (await commentRoute()).POST(json('POST', { body: 'x' }), ctx)).status).toBe(403);
  });

  it('comments on its own order; the platform’s comment is flagged as the staff’s', async () => {
    sentStoreOrder();
    ownStore();
    expect((await (await commentRoute()).POST(json('POST', { body: 'the tiles come in a week' }), ctx)).status).toBe(200);
    ordersAgent();
    expect((await (await commentRoute()).POST(json('POST', { body: 'noted' }), ctx)).status).toBe(200);
    expect(state.comments.map((c) => c.fromStaff)).toEqual([false, true]);
    // An empty comment is no comment.
    expect((await (await commentRoute()).POST(json('POST', { body: '   ' }), ctx)).status).toBe(400);
  });
});

describe('a brigade with its booking', () => {
  it('accepts or turns it down, and cannot skip to done', async () => {
    booking();
    brigade();
    expect((await (await orderRoute()).PUT(json('PUT', { status: 'done' }), ctx)).status).toBe(409);
    expect((await (await orderRoute()).PUT(json('PUT', { status: 'confirmed' }), ctx)).status).toBe(200);
  });
});

describe('everybody else', () => {
  it('turns the catalogue agent away from changing an order', async () => {
    sentStoreOrder();
    catalogAgent();
    expect((await (await orderRoute()).PUT(json('PUT', { status: 'done' }), ctx)).status).toBe(403);
    expect((await (await orderRoute()).GET(json('GET'), ctx)).status).toBe(403);
  });

  it('shows the customer their own order, without the staff note', async () => {
    customer();
    const res = await (await orderRoute()).GET(json('GET'), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).data.order.staffNote).toBeNull();
  });
});
