import { describe, expect, it } from 'vitest';
import { formatDateTime, TIME_ZONE } from '@/lib/utils';

/** Dates are Tbilisi's on both sides: a UTC server and a Tbilisi browser once wrote them four hours apart. */
describe('formatDateTime', () => {
  it('writes the Tbilisi time whatever zone it runs in', () => {
    // 22:30 UTC is 02:30 the next morning in Tbilisi (UTC+4, no summer time).
    expect(formatDateTime('2026-10-06T22:30:00Z')).toBe('07.10.2026, 02:30');
    expect(formatDateTime(new Date('2026-01-15T08:05:00Z'), false)).toBe('15.01.2026');
    expect(formatDateTime('not a date')).toBe('—');
    expect(new Date('2026-10-06T22:30:00Z').toLocaleDateString('en-GB', { timeZone: TIME_ZONE })).toBe('07/10/2026');
  });
});

describe('an admin list’s date filter', async () => {
  const { dateRange } = await import('@/lib/admin/list');
  const params = (values: Record<string, string>) => ({ get: (name: string) => values[name] ?? '' });

  it('is the whole of each day in Tbilisi', () => {
    const { from, to } = dateRange(params({ dateFrom: '2026-10-01', dateTo: '2026-10-06' }));
    expect(from?.toISOString()).toBe('2026-09-30T20:00:00.000Z');
    expect(to?.toISOString()).toBe('2026-10-06T19:59:59.999Z');
  });

  it('is no bound for anything that is not a date (it crashed the page)', () => {
    expect(dateRange(params({ dateFrom: 'x', dateTo: '2026-13-45' }))).toEqual({ from: null, to: null });
    expect(dateRange(params({}))).toEqual({ from: null, to: null });
  });
});

describe('a picture’s host', async () => {
  const { optimisable } = await import('@/components/ui/image');
  it('is optimised for our files and the listed hosts, shown as it is otherwise', () => {
    expect(optimisable('/uploads/products/x.webp')).toBe(true);
    expect(optimisable('https://images.unsplash.com/photo-1')).toBe(true);
    expect(optimisable('https://partner-shop.ge/img/sofa.jpg')).toBe(false);
    expect(optimisable('//evil.example/x.png')).toBe(false);
    expect(optimisable('http://images.unsplash.com/photo-1')).toBe(false);
  });
});
