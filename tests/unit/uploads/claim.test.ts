import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The server's half of a direct upload (`lib/uploads/claim.ts`, docs/uploads.md) against an
 * in-memory `uploads` table and staging area: an upload is granted only within its kind's
 * limit, under a key the server makes, and claimed once — by its maker, before it expires, for
 * the route it was meant for — with the size that actually arrived checked, and the staged copy
 * gone afterwards whatever happened.
 */

type Row = Record<string, unknown> & { id: string; stagingKey: string; status: string; kind: string; userId: number | null; maxBytes: number; expiresAt: Date };

const state = vi.hoisted(() => ({
  rows: [] as Row[],
  staged: new Map<string, Buffer>(),
  failTarget: false,
}));

vi.mock('drizzle-orm', async (importActual) => {
  const actual = await importActual<typeof import('drizzle-orm')>();
  type Pred = (row: Row) => boolean;
  // A column → its property on the row (`staging_key` → `stagingKey`).
  const keyOf = (col: unknown): string => (col as { name: string }).name.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  return {
    ...actual,
    eq: (col: unknown, v: unknown): Pred => (r) => r[keyOf(col)] === v,
    gt: (col: unknown, v: Date): Pred => (r) => (r[keyOf(col)] as Date) > v,
    inArray: (col: unknown, vs: unknown[]): Pred => (r) => vs.includes(r[keyOf(col)]),
    isNull: (col: unknown): Pred => (r) => r[keyOf(col)] == null,
    and: (...ps: Pred[]): Pred => (r) => ps.every((p) => p(r)),
    or: (...ps: Pred[]): Pred => (r) => ps.some((p) => p(r)),
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    insert: () => ({ values: async (values: Omit<Row, 'status'>) => void state.rows.push({ ...values, status: 'pending' } as Row) }),
    update: () => ({
      set: (values: Partial<Row>) => ({
        where: (pred: (r: Row) => boolean) => ({
          returning: async () => {
            const hit = state.rows.filter(pred);
            for (const r of hit) Object.assign(r, values);
            return hit.map((r) => ({ ...r }));
          },
        }),
      }),
    }),
    delete: () => ({ where: async () => void (state.rows = state.rows.filter((r) => r.status === 'consumed')) }),
  },
}));

vi.mock('@/lib/storage', () => ({
  storage: {
    name: 'local',
    createUploadTarget: async (key: string, type: string) => {
      if (state.failTarget) throw new Error('storage down');
      return { url: `/api/uploads/staging?key=${key}`, method: 'PUT', headers: { 'content-type': type } };
    },
    stagedSize: async (key: string) => state.staged.get(key)?.byteLength ?? null,
    getStaged: async (key: string) => state.staged.get(key) ?? null,
    deleteStaged: async (key: string) => void state.staged.delete(key),
  },
}));

vi.mock('@/lib/log', () => ({ log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { UploadError, claimUpload, grantUpload } from '@/lib/uploads/claim';
import { UPLOAD_KINDS } from '@/lib/uploads/kinds';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof UploadError ? `${e.code} ${e.status}` : String(e);
  }
};

beforeEach(() => {
  state.rows = [];
  state.staged.clear();
  state.failTarget = false;
});

describe('granting an upload', () => {
  it('makes the staging key itself — the kind, the day and the upload’s id, nothing the browser named', async () => {
    const granted = await grantUpload({ kind: 'image', userId: 5, declaredSize: 1000, declaredType: 'image/png', now: new Date('2026-10-14T10:00:00Z') });
    expect(state.rows[0].stagingKey).toBe(`image/2026-10-14/${granted.id}`);
    expect(granted.target.headers['content-type']).toBe('image/png');
    expect(granted.maxBytes).toBe(UPLOAD_KINDS.image.maxBytes);
  });

  it('stores a type the kind does not take as opaque bytes', async () => {
    const granted = await grantUpload({ kind: 'model', userId: 5, declaredSize: 1000, declaredType: 'text/html' });
    expect(granted.target.headers['content-type']).toBe('application/octet-stream');
  });

  it('refuses a file over its kind’s limit before anything is granted', async () => {
    expect(await code(grantUpload({ kind: 'image', userId: 5, declaredSize: UPLOAD_KINDS.image.maxBytes + 1 }))).toBe('FILE_TOO_LARGE 413');
    expect(await code(grantUpload({ kind: 'plan', userId: null, declaredSize: UPLOAD_KINDS.plan.maxBytes + 1 }))).toBe('PLAN_TOO_LARGE 413');
    expect(state.rows).toHaveLength(0);
  });

  it('takes the row back when storage cannot give a place', async () => {
    state.failTarget = true;
    expect(await code(grantUpload({ kind: 'image', userId: 5, declaredSize: 10 }))).toContain('storage down');
    expect(state.rows).toHaveLength(0);
  });
});

describe('claiming an upload', () => {
  const grant = async (kind: 'image' | 'plan' = 'image', userId: number | null = 5, bytes = Buffer.alloc(100, 1)) => {
    const granted = await grantUpload({ kind, userId, declaredSize: bytes.byteLength });
    state.staged.set(state.rows[state.rows.length - 1].stagingKey, bytes);
    return granted.id;
  };

  it('hands the route the bytes once, and leaves nothing staged', async () => {
    const id = await grant();
    const claimed = await claimUpload(id, ['image'], 5);
    expect(claimed.bytes.byteLength).toBe(100);
    expect(state.staged.size).toBe(0);
    expect(await code(claimUpload(id, ['image'], 5))).toBe('UPLOAD_EXPIRED 410');
  });

  it('is its maker’s alone; a visitor’s plan anyone holding its id may finish', async () => {
    const mine = await grant('image', 5);
    expect(await code(claimUpload(mine, ['image'], 6))).toBe('UPLOAD_EXPIRED 410');
    expect(await code(claimUpload(mine, ['image'], null))).toBe('UPLOAD_EXPIRED 410');
    const visitors = await grant('plan', null);
    expect(await code(claimUpload(visitors, ['plan'], 9))).toBe('ok');
  });

  it('is for the route it was granted for', async () => {
    const id = await grant('image');
    expect(await code(claimUpload(id, ['model'], 5))).toBe('UPLOAD_EXPIRED 410');
  });

  it('is refused once it has expired', async () => {
    const id = await grant();
    expect(await code(claimUpload(id, ['image'], 5, new Date(Date.now() + 31 * 60_000)))).toBe('UPLOAD_EXPIRED 410');
  });

  it('refuses what is not an upload id at all', async () => {
    expect(await code(claimUpload('../../etc/passwd', ['image'], 5))).toBe('UPLOAD_EXPIRED 400');
    expect(await code(claimUpload(undefined, ['image'], 5))).toBe('UPLOAD_EXPIRED 400');
  });

  it('says so when the bytes never arrived', async () => {
    const granted = await grantUpload({ kind: 'image', userId: 5, declaredSize: 10 });
    expect(await code(claimUpload(granted.id, ['image'], 5))).toBe('UPLOAD_MISSING 400');
  });

  it('measures what arrived, not what the browser said, and throws the oversize copy away', async () => {
    const id = await grant('image', 5, Buffer.alloc(10));
    state.staged.set(state.rows[0].stagingKey, Buffer.alloc(UPLOAD_KINDS.image.maxBytes + 1));
    expect(await code(claimUpload(id, ['image'], 5))).toBe('FILE_TOO_LARGE 413');
    expect(state.staged.size).toBe(0);
  });
});
