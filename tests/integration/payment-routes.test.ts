import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flittSignature } from '@/lib/payments/flitt';

/**
 * `/api/payments/flitt` (start), `…/[orderId]` (status) and `…/callback` with the session, the
 * database and the payment service mocked (docs/payments.md).
 *
 * What these prove: Flitt's callback changes nothing without our signature and settles with
 * it, however it is posted; a payment starts only for its owner, at the server's figures — the
 * saved row's quote or admin's price, the bank's commission on top — and not at all when there
 * is nothing to pay; Flitt being down is a 502 the dialogue can put into words; a payment's
 * status is its payer's to read.
 */

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
  project: null as Row | null,
  paid: null as Row | null,
  quote: { kind: 'design', feePerM2: 12, totalM2: 50, amount: 600 } as Row,
  settings: { ownItemPrice: 10, bankFeePct: 2.2 } as Row,
  credit: null as Row | null,
  payment: null as Row | null,
  started: [] as Row[],
  settled: [] as Array<{ params: Row; source: string }>,
  events: [] as Row[],
  startError: null as Error | null,
}));

vi.mock('@/lib/db', () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => (state.project ? [state.project] : []) }) }) }) },
}));
const authMock = vi.fn<() => Promise<unknown>>(async () => null);
vi.mock('@/auth', () => ({ auth: () => authMock() }));
vi.mock('@/lib/api/rateLimit', () => ({ RATE_RULES: { payment: {}, paymentStatus: {}, paymentCallback: {} }, rateLimited: () => null }));
vi.mock('@/lib/i18n/server', async () => {
  const { ka } = await import('@/lib/i18n/ka');
  return { getT: async () => ka, getLocale: async () => 'ka' };
});
vi.mock('@/lib/finance/settings', () => ({ loadPlatformSettings: async () => state.settings }));
vi.mock('@/lib/finance/payments', () => ({
  halfPayment: async () => state.paid,
  paymentQuote: async () => state.quote,
}));
vi.mock('@/lib/payments/service', () => ({
  ownItemCredit: async () => state.credit,
  settleRecentPayments: async () => undefined,
  startCardPayment: async (input: Row) => {
    if (state.startError) throw state.startError;
    state.started.push(input);
    return { payment: { orderId: 'remonti-des-abc-123', status: 'created' }, token: 't'.repeat(40), charge: { amount: input.amount, bankFeePct: input.bankFeePct, bankFee: 0, total: input.amount } };
  },
  settleCardPayment: async (params: Row, source: string) => {
    state.settled.push({ params, source });
    return { ok: true, payment: {} };
  },
  paymentByOrderId: async () => state.payment,
  recordFlittEvent: async (event: Row) => {
    state.events.push(event);
  },
  refreshCardPayment: async (row: Row) => ({ ...row, status: 'approved' }),
  cardPaymentView: (row: Row) => ({ orderId: row.orderId, status: row.status }),
}));

const startRoute = () => import('@/app/api/payments/flitt/route');
const callbackRoute = () => import('@/app/api/payments/flitt/callback/route');
const statusRoute = () => import('@/app/api/payments/flitt/[orderId]/route');
const ctx = { params: Promise.resolve({}) };
const post = (url: string, body: unknown) => new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const start = async (body: unknown) => (await startRoute()).POST(post('http://localhost/api/payments/flitt', body), ctx);
const as = (id: string, role = 'user') => authMock.mockResolvedValue({ user: { id, role, email: 'someone@remonti.ge' } });

/** A callback as the sandbox merchant would sign it. */
const callback = (patch: Row = {}) => {
  const params: Row = { order_id: 'remonti-des-abc-123', merchant_id: 1549901, order_status: 'approved', amount: '61320', currency: 'GEL', masked_card: '444455XXXXXX1111', ...patch };
  return { ...params, signature: flittSignature('test', params) };
};

beforeEach(() => {
  authMock.mockReset();
  authMock.mockResolvedValue(null);
  Object.assign(state, {
    project: { id: 9, userId: 35, nameKa: 'ბინა', rooms: [], plan: null },
    paid: null,
    quote: { kind: 'design', feePerM2: 12, totalM2: 50, amount: 600 },
    settings: { ownItemPrice: 10, bankFeePct: 2.2 },
    credit: null,
    payment: { id: 1, orderId: 'remonti-des-abc-123', userId: 35, status: 'created', purpose: 'design', projectId: 9 },
    started: [],
    settled: [],
    events: [],
    startError: null,
  });
});

describe('Flitt\'s callback', () => {
  it('settles a signed answer and says so', async () => {
    const res = await (await callbackRoute()).POST(post('http://localhost/api/payments/flitt/callback', callback()), ctx);
    expect(res.status).toBe(200);
    expect(state.settled).toHaveLength(1);
    expect(state.settled[0]).toMatchObject({ source: 'callback', params: { order_status: 'approved', amount: '61320' } });
  });

  it('refuses a forged one, changes nothing, and keeps it when it names our order', async () => {
    const forged = { ...callback(), amount: '1' };
    const res = await (await callbackRoute()).POST(post('http://localhost/api/payments/flitt/callback', forged), ctx);
    expect(res.status).toBe(400);
    expect(state.settled).toHaveLength(0);
    expect(state.events).toEqual([expect.objectContaining({ paymentId: 1, signatureValid: false, source: 'callback' })]);
  });

  it('keeps nothing of a forged one about an order that is not ours', async () => {
    state.payment = null;
    const res = await (await callbackRoute()).POST(post('http://localhost/api/payments/flitt/callback', { ...callback(), signature: '0'.repeat(40) }), ctx);
    expect(res.status).toBe(400);
    expect(state.events).toHaveLength(0);
  });

  it('reads a form-encoded callback and a wrapped one', async () => {
    const signed = callback();
    const form = new Request('http://localhost/api/payments/flitt/callback', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(Object.entries(signed).map(([k, v]) => [k, String(v)])).toString(),
    });
    expect((await (await callbackRoute()).POST(form, ctx)).status).toBe(200);
    expect((await (await callbackRoute()).POST(post('http://localhost/api/payments/flitt/callback', { response: signed }), ctx)).status).toBe(200);
    expect(state.settled).toHaveLength(2);
  });

  it('refuses a body that is not an answer at all', async () => {
    const res = await (await callbackRoute()).POST(new Request('http://localhost/api/payments/flitt/callback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'nope' }), ctx);
    expect(res.status).toBe(400);
  });
});

describe('starting a payment', () => {
  it('needs a signed-in person and a payload it understands', async () => {
    expect((await start({ purpose: 'design', projectId: 9 })).status).toBe(401);
    as('35');
    expect((await start({ purpose: 'design' })).status).toBe(400);
    expect((await start({ purpose: 'gift' })).status).toBe(400);
  });

  it("charges a half at the saved row's quote, the bank's commission on top", async () => {
    as('35');
    const res = await start({ purpose: 'design', projectId: 9 });
    expect(res.status).toBe(200);
    expect(state.started).toEqual([expect.objectContaining({ purpose: 'design', projectId: 9, amount: 600, bankFeePct: 2.2, totalM2: 50, feePerM2: 12, lang: 'ka' })]);
    const json = (await res.json()) as { data: { token: string; quote: Row } };
    expect(json.data.token).toHaveLength(40);
    expect(json.data.quote).toMatchObject({ amount: 600 });
  });

  it('is only the owner\'s to start', async () => {
    as('21');
    expect((await start({ purpose: 'design', projectId: 9 })).status).toBe(403);
    state.project = null;
    expect((await start({ purpose: 'design', projectId: 9 })).status).toBe(404);
    expect(state.started).toHaveLength(0);
  });

  it('answers a half already paid instead of charging it again, and refuses a half with no floor', async () => {
    as('35');
    state.paid = { kind: 'design', amount: 600, reference: 'remonti-des-old' };
    expect(((await (await start({ purpose: 'design', projectId: 9 })).json()) as { data: Row }).data).toEqual({ paid: state.paid });
    state.paid = null;
    state.quote = { kind: 'design', feePerM2: 12, totalM2: 0, amount: 0 };
    const empty = await start({ purpose: 'design', projectId: 9 });
    expect(empty.status).toBe(400);
    expect(((await empty.json()) as { error: string }).error).toBe('NOTHING_TO_PAY');
    expect(state.started).toHaveLength(0);
  });

  it('lets a half through for free when admin set its rate to 0, with no order at Flitt', async () => {
    as('35');
    state.project = { id: 9, userId: 35, nameKa: 'ბინა' };
    state.quote = { kind: 'design', feePerM2: 0, totalM2: 50, amount: 0 };
    const res = await start({ purpose: 'design', projectId: 9 });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: Row }).data).toEqual({ free: true });
    expect(state.started).toHaveLength(0);
  });

  it('refuses an oversized callback body without reading it as a payment', async () => {
    const res = await (await callbackRoute()).POST(new Request('http://localhost/api/payments/flitt/callback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...callback(), junk: 'x'.repeat(40_000) }) }), ctx);
    expect(res.status).toBe(400);
    expect(state.settled).toHaveLength(0);
    expect(state.events).toHaveLength(0);
  });

  it("charges an own item at admin's price — unless it is free or already paid for", async () => {
    as('35');
    await start({ purpose: 'own_item' });
    expect(state.started).toEqual([expect.objectContaining({ purpose: 'own_item', amount: 10, bankFeePct: 2.2 })]);
    state.credit = { id: 4 };
    expect(((await (await start({ purpose: 'own_item' })).json()) as { data: Row }).data).toEqual({ credit: true });
    state.settings = { ownItemPrice: 0, bankFeePct: 2.2 };
    expect(((await (await start({ purpose: 'own_item' })).json()) as { data: Row }).data).toEqual({ free: true });
    expect(state.started).toHaveLength(1);
  });

  it('turns Flitt being down into a code the dialogue can word', async () => {
    as('35');
    const { FlittError } = await import('@/lib/payments/flittApi');
    state.startError = new FlittError('Invalid signature', 1014);
    const res = await start({ purpose: 'design', projectId: 9 });
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toBe('PAYMENT_UNAVAILABLE');
  });
});

describe("a payment's status", () => {
  const get = async (orderId: string) => (await statusRoute()).GET(new Request(`http://localhost/api/payments/flitt/${orderId}`), { params: Promise.resolve({ orderId }) });

  it("is its payer's to read, asked of Flitt while unsettled", async () => {
    as('35');
    const res = await get('remonti-des-abc-123');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { payment: Row } }).data.payment).toEqual({ orderId: 'remonti-des-abc-123', status: 'approved' });
  });

  it('is nobody else\'s, and takes only our order ids', async () => {
    as('21');
    expect((await get('remonti-des-abc-123')).status).toBe(403);
    expect((await get('../../etc')).status).toBe(400);
    state.payment = null;
    expect((await get('remonti-des-abc-999')).status).toBe(404);
  });
});
