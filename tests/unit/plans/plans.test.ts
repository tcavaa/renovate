import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLAN_PRICES,
  activeSubscription,
  addMonths,
  currentPlan,
  featuresOf,
  freeRendersLeft,
  hasFeature,
  planPaidUntil,
  planPurchase,
  projectsLeft,
  requiredPlan,
  subscriptionMonth,
  unusedCredit,
  type SubscriptionSpan,
} from '@/lib/plans/plans';

const d = (iso: string) => new Date(iso);
const sub = (patch: Partial<SubscriptionSpan>): SubscriptionSpan => ({ id: 1, plan: 'premium', period: 'month', startsAt: d('2026-10-01T10:00:00Z'), endsAt: d('2026-11-01T10:00:00Z'), amount: 15, ...patch });

describe('what each plan has', () => {
  it('gives Free none of the paid features, Premium the catalogue, upload and moving, Professional all', () => {
    expect(Object.values(featuresOf('free')).some(Boolean)).toBe(false);
    expect(featuresOf('premium')).toEqual({ planUpload: true, catalog: true, moveFurniture: true, walk: false, renders: false, ownItems: false });
    expect(Object.values(featuresOf('professional')).every(Boolean)).toBe(true);
  });

  it('names the lowest plan a feature comes with', () => {
    expect(requiredPlan('catalog')).toBe('premium');
    expect(requiredPlan('walk')).toBe('professional');
    expect(hasFeature('professional', 'planUpload')).toBe(true);
  });

  it('counts the projects and the free renders left', () => {
    expect(projectsLeft('free', 1)).toBe(1);
    expect(projectsLeft('free', 2)).toBe(0);
    expect(projectsLeft('premium', 5)).toBe(0);
    expect(projectsLeft('professional', 4)).toBe(6);
    expect(freeRendersLeft('professional', 1)).toBe(2);
    expect(freeRendersLeft('professional', 7)).toBe(0);
    expect(freeRendersLeft('premium', 0)).toBe(0);
  });
});

describe('months', () => {
  it('keeps the day of the month, or the month\'s last day when it is shorter', () => {
    expect(addMonths(d('2026-01-31T09:00:00Z'), 1).toISOString()).toBe('2026-02-28T09:00:00.000Z');
    expect(addMonths(d('2028-01-31T09:00:00Z'), 1).toISOString()).toBe('2028-02-29T09:00:00.000Z');
    expect(addMonths(d('2026-10-20T12:00:00Z'), 12).toISOString()).toBe('2027-10-20T12:00:00.000Z');
  });

  it('finds the month of a subscription that holds now, counted from its start without drifting', () => {
    const start = d('2026-01-31T09:00:00Z');
    expect(subscriptionMonth(start, d('2026-02-10T00:00:00Z'))).toEqual({ from: start, to: d('2026-02-28T09:00:00Z') });
    // March's month starts on the 31st again, not the 28th.
    expect(subscriptionMonth(start, d('2026-03-31T09:00:00Z')).from.toISOString()).toBe('2026-03-31T09:00:00.000Z');
    expect(subscriptionMonth(start, d('2026-12-31T08:59:59Z')).from.toISOString()).toBe('2026-11-30T09:00:00.000Z');
    expect(subscriptionMonth(start, start).from).toEqual(start);
  });
});

describe('which plan holds', () => {
  const now = d('2026-10-20T00:00:00Z');

  it('is Free with nothing in force, and the highest plan when two overlap', () => {
    expect(currentPlan([], now)).toBe('free');
    expect(currentPlan([sub({ endsAt: d('2026-10-19T00:00:00Z') })], now)).toBe('free');
    expect(currentPlan([sub({ startsAt: d('2026-10-25T00:00:00Z'), endsAt: d('2026-11-25T00:00:00Z') })], now)).toBe('free');
    const both = [sub({}), sub({ id: 2, plan: 'professional', amount: 0 })];
    expect(activeSubscription(both, now)?.id).toBe(2);
  });

  it('is paid for until the end of a run of renewals', () => {
    const rows = [sub({}), sub({ id: 2, startsAt: d('2026-11-01T10:00:00Z'), endsAt: d('2026-12-01T10:00:00Z') })];
    expect(planPaidUntil(rows, 'premium', now)?.toISOString()).toBe('2026-12-01T10:00:00.000Z');
    // A gap ends the run.
    const gap = [sub({}), sub({ id: 2, startsAt: d('2026-11-05T10:00:00Z'), endsAt: d('2026-12-05T10:00:00Z') })];
    expect(planPaidUntil(gap, 'premium', now)?.toISOString()).toBe('2026-11-01T10:00:00.000Z');
  });
});

describe('buying a plan', () => {
  const now = d('2026-10-16T10:00:00Z');

  it('starts a new plan now, for a month or a year, at its price', () => {
    const p = planPurchase([], 'premium', 'year', DEFAULT_PLAN_PRICES, now);
    expect(p).toMatchObject({ ok: true, kind: 'new', price: 120, credit: 0, amount: 120 });
    if (p.ok) expect(p.endsAt.toISOString()).toBe('2027-10-16T10:00:00.000Z');
  });

  it('renews the plan in force from the end of what is paid for', () => {
    const p = planPurchase([sub({})], 'premium', 'month', DEFAULT_PLAN_PRICES, now);
    expect(p).toMatchObject({ ok: true, kind: 'renew', amount: 15 });
    if (p.ok) {
      expect(p.startsAt.toISOString()).toBe('2026-11-01T10:00:00.000Z');
      expect(p.endsAt.toISOString()).toBe('2026-12-01T10:00:00.000Z');
    }
  });

  it('upgrades at once, the unused part of the lower plan off the price', () => {
    // 16 days of a 31-day 15 ₾ month are left (about 7.74 ₾), and a renewal bought ahead counts whole.
    const rows = [sub({}), sub({ id: 2, startsAt: d('2026-11-01T10:00:00Z'), endsAt: d('2026-12-01T10:00:00Z') })];
    const p = planPurchase(rows, 'professional', 'month', DEFAULT_PLAN_PRICES, now);
    expect(p.ok && p.kind).toBe('upgrade');
    if (p.ok) {
      expect(p.startsAt).toEqual(now);
      expect(p.credit).toBeCloseTo(15 * (16 / 31) + 15, 1);
      expect(p.amount).toBeCloseTo(39 - p.credit, 2);
      expect(p.supersedes).toEqual([1, 2]);
    }
  });

  it('never makes an upgrade cost less than nothing', () => {
    const rows = [sub({ period: 'year', endsAt: d('2027-10-01T10:00:00Z'), amount: 120 })];
    const p = planPurchase(rows, 'professional', 'month', DEFAULT_PLAN_PRICES, now);
    expect(p).toMatchObject({ ok: true, kind: 'upgrade', credit: 39, amount: 0 });
  });

  it('refuses a lower plan while a higher one runs, saying until when', () => {
    const p = planPurchase([sub({ plan: 'professional', amount: 39 })], 'premium', 'month', DEFAULT_PLAN_PRICES, now);
    expect(p).toEqual({ ok: false, reason: 'lower', until: d('2026-11-01T10:00:00Z') });
  });

  it('counts a granted plan as no credit', () => {
    expect(unusedCredit([sub({ amount: 0 })], now)).toBe(0);
  });
});
