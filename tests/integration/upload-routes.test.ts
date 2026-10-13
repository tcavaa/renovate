import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gzipSync } from 'node:zlib';

/**
 * Direct uploads at the routes (docs/uploads.md): who may ask for a place to send each kind of
 * file — the same people who may finish it, as the multipart routes had it — and what a
 * finishing route answers when the claim or the bytes are wrong. The grant and the claim
 * themselves are `tests/unit/uploads/claim.test.ts`.
 */

const authMock = vi.fn<() => Promise<unknown>>(async () => null);
vi.mock('@/auth', () => ({ auth: () => authMock() }));
vi.mock('@/lib/api/counterStore', async () => (await import('../helpers/counterStore')).memoryCounterStore());

const uploads = vi.hoisted(() => ({ grants: [] as Array<Record<string, unknown>>, claim: null as null | (() => Promise<{ bytes: Buffer }>) }));
vi.mock('@/lib/uploads/claim', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/uploads/claim')>();
  return {
    ...actual,
    grantUpload: async (args: Record<string, unknown>) => {
      uploads.grants.push(args);
      return { id: '0b6f3b4e-2c1a-4a8e-9a1f-0c6d2b3a4e5f', target: { url: 'https://storage.example/sign', method: 'PUT', headers: {} }, maxBytes: 1, expiresAt: new Date().toISOString() };
    },
    claimUpload: () => uploads.claim!(),
  };
});
vi.mock('@/lib/storage', () => ({ storage: { put: async (key: string, body: Buffer) => ({ key, url: `https://storage.example/${key}`, size: body.byteLength }) }, safeKey: (folder: string, name: string) => `${folder}/${name}` }));

import { POST as sign } from '@/app/api/uploads/route';
import { POST as publishImage } from '@/app/api/upload/route';
import { UploadError } from '@/lib/uploads/claim';
import { readJson, okLarge } from '@/lib/api/body';

let ip = 0;
const post = (url: string, body: unknown, address = `203.0.113.${++ip % 250}`) =>
  new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': address }, body: JSON.stringify(body) });
const ctx = { params: Promise.resolve({}) };
const as = (user: Record<string, unknown> | null) => authMock.mockResolvedValue(user ? { user: { storeId: null, workerId: null, teamId: null, ...user } } : null);
const askFor = async (kind: string, address?: string) => {
  const res = await sign(post('http://localhost/api/uploads', { kind, size: 1000, type: 'image/png' }, address), ctx);
  return { status: res.status, body: (await res.json()) as { data: { id: string; url: string } | null; error: string | null } };
};

beforeEach(() => {
  uploads.grants = [];
  uploads.claim = null;
  authMock.mockReset();
  authMock.mockResolvedValue(null);
});

describe('POST /api/uploads — who may send which file', () => {
  it('gives a picture to admin and linked partners only', async () => {
    as(null);
    expect((await askFor('image')).status).toBe(401);
    as({ id: '35', role: 'user' });
    expect((await askFor('image')).status).toBe(403);
    as({ id: '9', role: 'store', storeId: 6 });
    const granted = await askFor('image');
    expect(granted.status).toBe(200);
    expect(granted.body.data?.url).toBe('https://storage.example/sign');
    expect(uploads.grants.at(-1)).toMatchObject({ kind: 'image', userId: 9, declaredSize: 1000 });
  });

  it('gives a catalogue model to catalogue editors, not to a brigade', async () => {
    as({ id: '40', role: 'team', teamId: 1 });
    expect((await askFor('model')).status).toBe(403);
    as({ id: '1', role: 'admin' });
    expect((await askFor('model')).status).toBe(200);
  });

  it('gives a floor plan to a visitor too, a few an hour from one address', async () => {
    as(null);
    const address = '198.51.100.77';
    for (let i = 0; i < 10; i++) expect((await askFor('plan', address)).status).toBe(200);
    expect(uploads.grants.at(-1)).toMatchObject({ kind: 'plan', userId: null });
    expect((await askFor('plan', address)).status).toBe(429);
  });

  it('gives a studio photo and one’s own furniture to a signed-in person only', async () => {
    as(null);
    expect((await askFor('render')).status).toBe(401);
    expect((await askFor('own_model')).status).toBe(401);
    as({ id: '35', role: 'user' });
    expect((await askFor('render')).status).toBe(200);
    expect((await askFor('own_photo')).status).toBe(200);
  });

  it('refuses a kind it does not know, and a size that is not one', async () => {
    as({ id: '1', role: 'admin' });
    expect((await askFor('anything')).status).toBe(400);
    expect((await sign(post('http://localhost/api/uploads', { kind: 'image', size: -5 }), ctx)).status).toBe(400);
  });
});

describe('a finishing route', () => {
  it('answers a claim that failed with its code and status', async () => {
    as({ id: '1', role: 'admin' });
    uploads.claim = async () => {
      throw new UploadError('UPLOAD_EXPIRED', 410);
    };
    const res = await publishImage(post('http://localhost/api/upload', { upload: '0b6f3b4e-2c1a-4a8e-9a1f-0c6d2b3a4e5f' }), ctx);
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ data: null, error: 'UPLOAD_EXPIRED' });
  });

  it('judges the file by its bytes: a script called a PNG is refused', async () => {
    as({ id: '1', role: 'admin' });
    uploads.claim = async () => ({ bytes: Buffer.from('<script>alert(1)</script>') });
    const res = await publishImage(post('http://localhost/api/upload', { upload: '0b6f3b4e-2c1a-4a8e-9a1f-0c6d2b3a4e5f', folder: 'products' }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('IMAGE_INVALID');
  });

  it('wants an upload id, not a file or a URL', async () => {
    as({ id: '1', role: 'admin' });
    const res = await publishImage(post('http://localhost/api/upload', { url: 'https://evil.example/x.png' }), ctx);
    expect(res.status).toBe(400);
  });
});

describe('large JSON bodies', () => {
  it('reads a gzipped body as the plain one', async () => {
    const value = { projectId: 3, versions: Array.from({ length: 50 }, (_, i) => ({ id: `v${i}`, plan: { rooms: [] } })) };
    const req = new Request('http://localhost/api/design/projects', { method: 'POST', headers: { 'content-encoding': 'gzip' }, body: gzipSync(JSON.stringify(value)) });
    expect(await readJson(req)).toEqual(value);
    expect(await readJson(post('http://localhost/x', value))).toEqual(value);
    expect(await readJson(new Request('http://localhost/x', { method: 'POST', body: 'not json' }))).toBeNull();
  });

  it('gzips a large answer for a browser that takes it, and leaves a small one alone', async () => {
    const big = { versions: 'x'.repeat(600_000) };
    const zipped = await okLarge(new Request('http://localhost/x', { headers: { 'accept-encoding': 'gzip, br' } }), big);
    expect(zipped.headers.get('content-encoding')).toBe('gzip');
    expect(Number((await zipped.arrayBuffer()).byteLength)).toBeLessThan(10_000);
    const plain = await okLarge(new Request('http://localhost/x', { headers: { 'accept-encoding': 'gzip' } }), { a: 1 });
    expect(plain.headers.get('content-encoding')).toBeNull();
    expect(await plain.json()).toEqual({ data: { a: 1 }, error: null });
  });
});
