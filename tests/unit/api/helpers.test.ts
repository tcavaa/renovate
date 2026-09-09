import { describe, expect, it, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/auth';
import { API_ERRORS, fail, handle, ok, parseId, requireAdmin } from '@/lib/api/route';
import { RATE_RULES, clientIp, rateLimit, rateLimited } from '@/lib/api/rateLimit';
import { safeCallbackUrl } from '@/lib/auth/safeCallbackUrl';
import { repriceFinishSnapshot, repriceSnapshot, type KnownPrice } from '@/lib/api/productPrices';

const request = (ip: string, url = 'http://localhost/api/x') => new Request(url, { headers: { 'x-forwarded-for': ip } });

describe('response envelope', () => {
  it('wraps data and errors the same way', async () => {
    expect(await ok({ a: 1 }).json()).toEqual({ data: { a: 1 }, error: null });
    const res = fail('NOPE', 418);
    expect(res.status).toBe(418);
    expect(await res.json()).toEqual({ data: null, error: 'NOPE' });
  });
});

describe('parseId', () => {
  it('accepts positive integers only', () => {
    expect(parseId('42').id).toBe(42);
    for (const bad of ['0', '-1', '1.5', 'abc', '', 'NaN']) {
      const { id, response } = parseId(bad);
      expect(id).toBeNull();
      expect(response?.status).toBe(400);
    }
  });
});

describe('requireAdmin', () => {
  it('rejects anonymous and non-admin sessions with 401', async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    expect((await requireAdmin()).response?.status).toBe(401);
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: '1', role: 'user' } } as never);
    expect((await requireAdmin()).response?.status).toBe(401);
  });

  it('returns the session for an admin', async () => {
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: '7', role: 'admin' } } as never);
    const result = await requireAdmin();
    expect(result.response).toBeNull();
    expect(result.session?.user.id).toBe('7');
  });
});

describe('handle', () => {
  it('passes a successful response through', async () => {
    const route = handle('GET /x', 'failed', async () => ok('fine'));
    const res = await route(request('1.1.1.1'), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
  });

  it('turns an exception into a generic 500 that leaks nothing', async () => {
    const route = handle('GET /x', 'Something failed', async () => {
      throw new Error('secret database detail');
    });
    const res = await route(request('1.1.1.1'), { params: Promise.resolve({}) });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Something failed');
    expect(JSON.stringify(body)).not.toContain('secret');
  });
});

describe('rateLimit', () => {
  it('allows `limit` hits per window per IP and then blocks with a retry hint', () => {
    const rule = { key: `t-${Math.random()}`, limit: 3, windowMs: 60_000 };
    const results = [1, 2, 3, 4].map(() => rateLimit(request('10.0.0.1'), rule));
    expect(results.map((r) => r.ok)).toEqual([true, true, true, false]);
    expect(results[3].retryAfterSec).toBeGreaterThan(0);
    expect(rateLimit(request('10.0.0.2'), rule).ok).toBe(true);
  });

  it('produces a 429 envelope with Retry-After', async () => {
    const rule = { key: `t-${Math.random()}`, limit: 1, windowMs: 60_000 };
    expect(rateLimited(request('10.0.0.3'), rule)).toBeNull();
    const res = rateLimited(request('10.0.0.3'), rule)!;
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toMatch(/^\d+$/);
  });

  it('reads the client IP from the proxy headers', () => {
    expect(clientIp(new Request('http://x', { headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.1' } }))).toBe('203.0.113.1');
    expect(clientIp(new Request('http://x', { headers: { 'x-real-ip': '203.0.113.2' } }))).toBe('203.0.113.2');
    expect(clientIp(new Request('http://x'))).toBe('unknown');
  });

  it('ships sane rules for every guarded endpoint', () => {
    for (const rule of Object.values(RATE_RULES)) {
      expect(rule.limit).toBeGreaterThan(0);
      expect(rule.windowMs).toBeGreaterThanOrEqual(60_000);
    }
  });
});

describe('safeCallbackUrl', () => {
  it('keeps same-origin paths and rejects everything else', () => {
    expect(safeCallbackUrl('/profile')).toBe('/profile');
    expect(safeCallbackUrl('/admin/products?page=2#x')).toBe('/admin/products?page=2#x');
    for (const bad of [null, '', 'https://evil.example/', '//evil.example', '/\\evil.example', 'javascript:alert(1)', 'profile']) {
      expect(safeCallbackUrl(bad)).toBe('/');
    }
    expect(safeCallbackUrl(undefined, '/home')).toBe('/home');
  });
});

describe('repriceSnapshot', () => {
  const known = new Map<number, KnownPrice>([
    [1, { pricePerUnit: 100, nameKa: 'sofa', unit: 'piece', coveragePerUnit: null }],
    [2, { pricePerUnit: 50, nameKa: 'paint', unit: 'liter', coveragePerUnit: 10 }],
    [3, { pricePerUnit: 30, nameKa: 'tile', unit: 'm2', coveragePerUnit: null }],
  ]);
  const snapshot = { productId: 1, qty: 2, pricePerUnit: 1, totalPrice: 2, unit: 'piece' };

  it('overwrites the client price and quantity', () => {
    expect(repriceSnapshot(snapshot, known, 3)).toMatchObject({ pricePerUnit: 100, qty: 3, totalPrice: 300 });
    expect(repriceSnapshot(snapshot, known)).toMatchObject({ qty: 2, totalPrice: 200 });
  });

  it('refuses unknown products and negative quantities', () => {
    expect(repriceSnapshot({ ...snapshot, productId: 99 }, known)).toBeNull();
    expect(repriceSnapshot(snapshot, known, -5)?.totalPrice).toBe(0);
  });

  it('prices a finish per square metre, dividing paint by its coverage', () => {
    expect(repriceFinishSnapshot({ ...snapshot, productId: 2 }, known, 20)).toMatchObject({ pricePerUnit: 5, qty: 20, totalPrice: 100, unit: 'm2' });
    expect(repriceFinishSnapshot({ ...snapshot, productId: 3 }, known, 4)).toMatchObject({ pricePerUnit: 30, totalPrice: 120 });
    expect(repriceFinishSnapshot({ ...snapshot, productId: 99 }, known, 4)).toBeNull();
  });
});

describe('API_ERRORS', () => {
  it('uses the code as its own value so the client can translate it', () => {
    for (const [key, value] of Object.entries(API_ERRORS)) expect(key).toBe(value);
  });
});
