import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `lib/payments/service.ts` against an in-memory database: what a signed Flitt answer does to a
 * payment and to what it paid for (docs/payments.md#settling). The drizzle operators the service
 * uses are turned into predicates over plain rows, so the real queries — their conditions
 * included — decide what changes.
 */

type Row = Record<string, unknown>;
type Pred = (row: Row) => boolean;

const store = vi.hoisted(() => ({
  tables: new Map<unknown, Row[]>(),
  ids: new Map<unknown, number>(),
  /** Makes the next insert into this table throw (a database that failed mid-approval). */
  failInsert: null as unknown,
}));

vi.mock('drizzle-orm', async (importActual) => {
  const actual = await importActual<typeof import('drizzle-orm')>();
  // A column object → the property it is on its table (`payments.orderId` → 'orderId').
  const keyOf = (col: unknown): string => {
    for (const table of store.tables.keys()) {
      for (const [key, value] of Object.entries(actual.getTableColumns(table as never))) if (value === col) return key;
    }
    throw new Error('unknown column');
  };
  return {
    ...actual,
    eq: (col: unknown, v: unknown): Pred => (r) => r[keyOf(col)] === v,
    ne: (col: unknown, v: unknown): Pred => (r) => r[keyOf(col)] !== v,
    and: (...ps: Array<Pred | undefined>): Pred => (r) => ps.every((p) => !p || p(r)),
    isNull: (col: unknown): Pred => (r) => r[keyOf(col)] == null,
    inArray: (col: unknown, vs: unknown[]): Pred => (r) => vs.includes(r[keyOf(col)]),
    notInArray: (col: unknown, vs: unknown[]): Pred => (r) => !vs.includes(r[keyOf(col)]),
    gte: (col: unknown, v: Date): Pred => (r) => (r[keyOf(col)] as Date) >= v,
    asc: () => null,
    desc: () => null,
  };
});

vi.mock('@/lib/db', () => {
  const rows = (t: unknown) => store.tables.get(t)!;
  const query = (t: unknown, pred: Pred) => rows(t).filter(pred);
  const db = {
    select: () => ({
      from: (t: unknown) => ({
        where: (pred: Pred) => {
          const found = () => query(t, pred).map((r) => ({ ...r }));
          const chain = { orderBy: () => chain, limit: async (n: number) => found().slice(0, n) };
          return chain;
        },
      }),
    }),
    update: (t: unknown) => ({
      set: (values: Row) => ({
        where: async (pred: Pred) => {
          const hit = query(t, pred);
          for (const r of hit) Object.assign(r, Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined)));
          return [{ affectedRows: hit.length }];
        },
      }),
    }),
    insert: (t: unknown) => ({
      values: async (values: Row) => {
        if (store.failInsert === t) {
          store.failInsert = null;
          throw new Error('connection lost');
        }
        const id = (store.ids.get(t) ?? 0) + 1;
        store.ids.set(t, id);
        rows(t).push({ id, createdAt: new Date(), ...values });
        return [{ insertId: id }];
      },
    }),
    delete: (t: unknown) => ({
      where: async (pred: Pred) => {
        const keep = rows(t).filter((r) => !pred(r));
        const removed = rows(t).length - keep.length;
        store.tables.set(t, keep);
        return [{ affectedRows: removed }];
      },
    }),
    // All or nothing: a throw puts every table back as it was.
    transaction: async <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const saved = new Map([...store.tables].map(([t, rs]) => [t, rs.map((r) => ({ ...r }))]));
      try {
        return await fn(db);
      } catch (e) {
        store.tables = saved;
        throw e;
      }
    },
  };
  return { db };
});

vi.mock('@/lib/log', () => ({ log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const flitt = vi.hoisted(() => ({ token: vi.fn(), status: vi.fn() }));
vi.mock('@/lib/payments/flittApi', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/payments/flittApi')>()),
  createCheckoutToken: flitt.token,
  fetchOrderStatus: flitt.status,
}));

import { paymentEvents, payments, projectPayments } from '@/lib/db/schema';
import { log } from '@/lib/log';
import { claimOwnItemCredit, ownItemCredit, refreshCardPayment, releaseOwnItemCredit, settleCardPayment, settleRecentPayments, spendOwnItemCredit, startCardPayment } from '@/lib/payments/service';
import { FlittError } from '@/lib/payments/flittApi';
import { settlementFor } from '@/lib/payments/flitt';

const ORDER = 'remonti-des-abc-123';
const payment = (patch: Row = {}): Row => ({
  id: 1,
  orderId: ORDER,
  userId: 35,
  purpose: 'design',
  projectId: 9,
  productId: null,
  totalM2: '50.00',
  feePerM2: '12.00',
  amount: '600.00',
  bankFeePct: '2.20',
  bankFee: '13.20',
  total: '613.20',
  currency: 'GEL',
  status: 'created',
  testMode: true,
  maskedCard: null,
  reversalAmount: '0.00',
  paidAt: null,
  consumedAt: null,
  createdAt: new Date(),
  ...patch,
});
/** A signed answer as the service receives it (the signature is the caller's to check). */
const answer = (patch: Row = {}): Row => ({ order_id: ORDER, merchant_id: 1549901, order_status: 'approved', amount: '61320', currency: 'GEL', masked_card: '444455XXXXXX1111', ...patch });

const paymentRow = () => store.tables.get(payments)!.find((r) => r.orderId === ORDER)!;
const halves = () => store.tables.get(projectPayments)!;

beforeEach(() => {
  store.tables = new Map<unknown, Row[]>([
    [payments, [payment()]],
    [projectPayments, []],
    [paymentEvents, []],
  ]);
  store.ids = new Map<unknown, number>([[payments, 1]]);
  store.failInsert = null;
  vi.clearAllMocks();
});

describe('settlementFor', () => {
  it('approves only what is not settled, and never brings a reversed payment back', () => {
    expect(settlementFor('created', 'approved')).toBe('approve');
    expect(settlementFor('processing', 'approved')).toBe('approve');
    expect(settlementFor('approved', 'approved')).toBe('facts');
    expect(settlementFor('reversed', 'approved')).toBe('facts');
    expect(settlementFor('approved', 'processing')).toBe('facts');
    expect(settlementFor('approved', 'reversed')).toBe('reverse');
    expect(settlementFor('reversed', 'reversed')).toBe('facts');
    expect(settlementFor('created', 'declined')).toBe('status');
  });
});

describe('settleCardPayment', () => {
  it('approves a payment and records its half once, however many answers say so', async () => {
    expect((await settleCardPayment(answer(), 'status')).ok).toBe(true);
    expect(paymentRow().status).toBe('approved');
    expect(halves()).toEqual([expect.objectContaining({ projectId: 9, kind: 'design', amount: '600.00', reference: ORDER, cardLast4: '1111' })]);
    await settleCardPayment(answer(), 'callback');
    expect(halves()).toHaveLength(1);
    // Every answer is kept whole for the admin.
    expect(store.tables.get(paymentEvents)).toHaveLength(2);
  });

  it('approves nothing for another amount', async () => {
    expect(await settleCardPayment(answer({ amount: '100' }), 'callback')).toEqual({ ok: false, reason: 'amount' });
    expect(paymentRow().status).toBe('created');
    expect(halves()).toHaveLength(0);
  });

  it('never lets a late "processing" overwrite an approval', async () => {
    await settleCardPayment(answer(), 'callback');
    await settleCardPayment(answer({ order_status: 'processing' }), 'status');
    expect(paymentRow().status).toBe('approved');
  });

  it('takes back what a reversed payment paid for, and a replayed approval does not give it back', async () => {
    await settleCardPayment(answer(), 'callback');
    await settleCardPayment(answer({ order_status: 'reversed', reversal_amount: '61320' }), 'callback');
    expect(paymentRow()).toMatchObject({ status: 'reversed', reversalAmount: '613.2' });
    expect(halves()).toHaveLength(0);
    await settleCardPayment(answer(), 'callback');
    expect(paymentRow().status).toBe('reversed');
    expect(halves()).toHaveLength(0);
  });

  it('keeps the first payment of a half paid twice and logs the second for a refund', async () => {
    halves().push({ id: 1, projectId: 9, kind: 'design', amount: '600.00', reference: 'remonti-des-first' });
    await settleCardPayment(answer(), 'callback');
    expect(paymentRow().status).toBe('approved');
    expect(halves()).toEqual([expect.objectContaining({ reference: 'remonti-des-first' })]);
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('refund'), expect.objectContaining({ orderId: ORDER }));
  });

  it('does not approve a payment whose half could not be recorded — the next answer settles it', async () => {
    store.failInsert = projectPayments;
    await expect(settleCardPayment(answer(), 'callback')).rejects.toThrow('connection lost');
    expect(paymentRow().status).toBe('created');
    expect(halves()).toHaveLength(0);
    await settleCardPayment(answer(), 'callback');
    expect(paymentRow().status).toBe('approved');
    expect(halves()).toHaveLength(1);
  });
});

describe('an own item paid for', () => {
  beforeEach(() => {
    store.tables.set(payments, [payment({ purpose: 'own_item', projectId: null, totalM2: null, feePerM2: null, amount: '10.00', bankFee: '0.22', total: '10.22' })]);
  });
  const ownAnswer = (patch: Row = {}) => answer({ amount: '1022', ...patch });

  it('is a credit one upload takes, given back if the upload fails', async () => {
    expect(await ownItemCredit(35)).toBeNull();
    await settleCardPayment(ownAnswer(), 'callback');
    expect(halves()).toHaveLength(0);
    const claimed = await claimOwnItemCredit(35);
    expect(claimed).toBe(1);
    expect(await claimOwnItemCredit(35)).toBeNull();
    await releaseOwnItemCredit(claimed!);
    expect(await claimOwnItemCredit(35)).toBe(1);
  });

  it('is no credit any more once reversed', async () => {
    await settleCardPayment(ownAnswer(), 'callback');
    await settleCardPayment(ownAnswer({ order_status: 'reversed' }), 'callback');
    expect(await claimOwnItemCredit(35)).toBeNull();
  });
});

describe('starting a payment', () => {
  const input = { userId: 35, email: 'a@b.ge', purpose: 'design' as const, projectId: 9, amount: 600, bankFeePct: 2.2, totalM2: 50, feePerM2: 12, description: 'დიზაინი', lang: 'ka' };

  it('makes the row at the server\'s figures and asks Flitt for exactly that, in tetri', async () => {
    flitt.token.mockResolvedValue('tok');
    const started = await startCardPayment(input);
    expect(started.token).toBe('tok');
    expect(started.charge).toEqual({ amount: 600, bankFeePct: 2.2, bankFee: 13.2, total: 613.2 });
    expect(flitt.token).toHaveBeenCalledWith(expect.objectContaining({ amount: 61320, orderId: started.payment.orderId, lifetime: 3600 }));
    expect(started.payment.orderId).toMatch(/^remonti-des-[a-z0-9]+-[0-9a-f]{10}$/);
    // On a developer's machine Flitt cannot call back.
    expect(flitt.token.mock.calls[0][0].callbackUrl).toBeUndefined();
    expect(store.tables.get(payments)!.at(-1)).toMatchObject({ status: 'created', total: '613.2', testMode: true });
  });

  it('closes the row with Flitt\'s reason when Flitt refuses', async () => {
    flitt.token.mockRejectedValue(new FlittError('bad signature', 1014));
    await expect(startCardPayment(input)).rejects.toThrow('bad signature');
    expect(store.tables.get(payments)!.at(-1)).toMatchObject({ status: 'declined', responseCode: '1014' });
  });
});

describe('asking Flitt', () => {
  it('settles an unsettled payment by its status, and leaves a settled one alone', async () => {
    flitt.status.mockResolvedValue(answer());
    expect((await refreshCardPayment(payment() as never)).status).toBe('approved');
    expect(halves()).toHaveLength(1);
    flitt.status.mockClear();
    await refreshCardPayment(paymentRow() as never);
    expect(flitt.status).not.toHaveBeenCalled();
  });

  it('keeps a payment as it was when Flitt cannot be reached', async () => {
    flitt.status.mockRejectedValue(new Error('timeout'));
    expect((await refreshCardPayment(payment() as never)).status).toBe('created');
  });

  it('asks about this person\'s unsettled payments of the same thing before a new one, days back too', async () => {
    const old = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    store.tables.set(payments, [payment({ createdAt: old }), payment({ id: 2, orderId: 'remonti-des-other-1', projectId: 10 })]);
    flitt.status.mockResolvedValue(answer());
    await settleRecentPayments({ userId: 35, purpose: 'design', projectId: 9 });
    expect(flitt.status).toHaveBeenCalledTimes(1);
    expect(flitt.status).toHaveBeenCalledWith(ORDER);
    expect(paymentRow().status).toBe('approved');
  });

  it('records the product an own item\'s credit was spent on', async () => {
    await spendOwnItemCredit(1, 77);
    expect(paymentRow().productId).toBe(77);
  });
});
