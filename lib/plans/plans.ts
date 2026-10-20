/**
 * The plans and what each lets a person do (docs/subscriptions.md) — pure, no DB, shared by the
 * routes that enforce them and the pages that show them.
 *
 * What each plan includes is admin's (`platform_settings.plan_config`, `/admin/settings`): which
 * features it has, how many projects it makes, how many renders a month it includes. The
 * defaults: Free makes two projects at most, sees its flat in 3D and the budget, and draws its
 * plans; Premium adds uploading a plan, the full catalogue (swapping furniture, laying floors and
 * walls) and moving the furniture, with five new projects a month; Professional adds the
 * walk-through, renders (three free a month, then a price each) and adding pieces of one's own
 * (a GLB or a photo, a price each), with ten new projects a month. Every function takes the
 * configuration, the defaults when none is given.
 */

export type PlanId = 'free' | 'premium' | 'professional';
export type PaidPlanId = Exclude<PlanId, 'free'>;
export type BillingPeriod = 'month' | 'year';

export const PLAN_IDS: readonly PlanId[] = ['free', 'premium', 'professional'];
export const PAID_PLANS: readonly PaidPlanId[] = ['premium', 'professional'];
export const BILLING_PERIODS: readonly BillingPeriod[] = ['month', 'year'];

export function isPaidPlan(value: unknown): value is PaidPlanId {
  return value === 'premium' || value === 'professional';
}

/**
 * What a plan can unlock beyond seeing the flat, its budget and drawing its plan (which every
 * plan has).
 *
 * - `planUpload` — reading an uploaded drawing (PDF or picture) into a plan.
 * - `catalog` — changing what the flat is furnished and finished with: adding, swapping and
 *   removing furniture, floors and walls, wall decor, doors' and windows' products.
 * - `moveFurniture` — moving, turning and mirroring the furniture that stands.
 * - `walk` — the walk-through inside the flat.
 * - `renders` — realistic renders of a studio photo (some free a month, then a price each).
 * - `ownItems` — a piece of one's own furniture from a GLB or a photo (a price each).
 */
export type PlanFeature = 'planUpload' | 'catalog' | 'moveFurniture' | 'walk' | 'renders' | 'ownItems';

export const PLAN_FEATURES: readonly PlanFeature[] = ['planUpload', 'catalog', 'moveFurniture', 'walk', 'renders', 'ownItems'];

export function isPlanFeature(value: unknown): value is PlanFeature {
  return typeof value === 'string' && (PLAN_FEATURES as readonly string[]).includes(value);
}

/**
 * What admin decides of each plan. `projects`: how many a plan may make — Free counts the
 * projects the person has now (deleting one makes room), a paid plan the projects made in the
 * current month of its subscription, kept or deleted since (`plan_usage`); null is no limit.
 * `freeRenders`: the renders a month a plan with `renders` includes before each is paid for.
 */
export interface PlanConfig {
  features: Record<PlanId, PlanFeature[]>;
  projects: Record<PlanId, number | null>;
  freeRenders: Record<PlanId, number>;
}

export const DEFAULT_PLAN_CONFIG: PlanConfig = {
  features: {
    free: [],
    premium: ['planUpload', 'catalog', 'moveFurniture'],
    professional: [...PLAN_FEATURES],
  },
  projects: { free: 2, premium: 5, professional: 10 },
  freeRenders: { free: 0, premium: 0, professional: 3 },
};

const MAX_COUNT = 10_000;

/**
 * A stored configuration made whole: what is missing or not understood is the default, features
 * are deduplicated and in their own order, counts whole and not negative. So a column written by
 * an older form, or by hand, never breaks the plans.
 */
export function normalizePlanConfig(raw: unknown): PlanConfig {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof PlanConfig, Partial<Record<PlanId, unknown>>>>;
  const out: PlanConfig = { features: { ...DEFAULT_PLAN_CONFIG.features }, projects: { ...DEFAULT_PLAN_CONFIG.projects }, freeRenders: { ...DEFAULT_PLAN_CONFIG.freeRenders } };
  for (const plan of PLAN_IDS) {
    const features = value.features?.[plan];
    if (Array.isArray(features)) out.features[plan] = PLAN_FEATURES.filter((f) => features.includes(f));
    const projects = value.projects?.[plan];
    if (projects === null) out.projects[plan] = null;
    else if (typeof projects === 'number' && Number.isFinite(projects)) out.projects[plan] = Math.min(MAX_COUNT, Math.max(0, Math.round(projects)));
    const renders = value.freeRenders?.[plan];
    if (typeof renders === 'number' && Number.isFinite(renders)) out.freeRenders[plan] = Math.min(MAX_COUNT, Math.max(0, Math.round(renders)));
  }
  return out;
}

const RANK: Record<PlanId, number> = { free: 0, premium: 1, professional: 2 };

export function planRank(plan: PlanId): number {
  return RANK[plan];
}

export function hasFeature(plan: PlanId, feature: PlanFeature, config: PlanConfig = DEFAULT_PLAN_CONFIG): boolean {
  return config.features[plan].includes(feature);
}

/** The paid plans that have a feature, lowest first — what an upgrade dialogue offers for it. */
export function plansWith(feature: PlanFeature, config: PlanConfig = DEFAULT_PLAN_CONFIG): PaidPlanId[] {
  return PAID_PLANS.filter((plan) => hasFeature(plan, feature, config));
}

/** The lowest paid plan that has this feature; null when admin gave it to none. */
export function requiredPlan(feature: PlanFeature, config: PlanConfig = DEFAULT_PLAN_CONFIG): PaidPlanId | null {
  return plansWith(feature, config)[0] ?? null;
}

/** Every feature, true or false, for a plan — what the browser is handed. */
export function featuresOf(plan: PlanId, config: PlanConfig = DEFAULT_PLAN_CONFIG): Record<PlanFeature, boolean> {
  return Object.fromEntries(PLAN_FEATURES.map((f) => [f, hasFeature(plan, f, config)])) as Record<PlanFeature, boolean>;
}

/** How a plan's projects are counted: Free those it has, a paid plan those made this month of it. */
export interface ProjectAllowance {
  limit: number | null;
  per: 'total' | 'month';
}

export function projectAllowance(plan: PlanId, config: PlanConfig = DEFAULT_PLAN_CONFIG): ProjectAllowance {
  return { limit: config.projects[plan], per: plan === 'free' ? 'total' : 'month' };
}

/** Renders a month a plan includes before each is paid for (none without the feature). */
export function freeRendersOf(plan: PlanId, config: PlanConfig = DEFAULT_PLAN_CONFIG): number {
  return hasFeature(plan, 'renders', config) ? config.freeRenders[plan] : 0;
}

/** The prices admin sets (`platform_settings`), GEL before the bank's commission. */
export interface PlanPrices {
  premium: Record<BillingPeriod, number>;
  professional: Record<BillingPeriod, number>;
}

export const DEFAULT_PLAN_PRICES: PlanPrices = {
  premium: { month: 15, year: 120 },
  professional: { month: 39, year: 320 },
};

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `months` calendar months after `from`, on the same day of the month and at the same time —
 * or the month's last day when it is shorter (31 January + 1 month = 28 or 29 February).
 * Always counted from the anchor, so a year of monthly windows does not drift to the 28th.
 */
export function addMonths(from: Date, months: number): Date {
  const d = new Date(from.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

export function periodEnd(start: Date, period: BillingPeriod): Date {
  return addMonths(start, period === 'year' ? 12 : 1);
}

/**
 * The month of a subscription that holds `now`: months are counted from its start, so a
 * subscription bought on the 20th renews its allowance on every 20th. A yearly one has twelve.
 */
export function subscriptionMonth(startsAt: Date, now: Date): { from: Date; to: Date } {
  if (now.getTime() < startsAt.getTime()) return { from: startsAt, to: addMonths(startsAt, 1) };
  // An estimate, then corrected either way: months are not all the same length.
  let k = Math.max(0, Math.floor((now.getTime() - startsAt.getTime()) / (30.44 * DAY_MS)) - 1);
  while (addMonths(startsAt, k + 1).getTime() <= now.getTime()) k++;
  while (k > 0 && addMonths(startsAt, k).getTime() > now.getTime()) k--;
  return { from: addMonths(startsAt, k), to: addMonths(startsAt, k + 1) };
}

// ---------------------------------------------------------------------------
// Which plan holds now
// ---------------------------------------------------------------------------

/** A subscription as these rules need it. */
export interface SubscriptionSpan {
  id: number;
  plan: PaidPlanId;
  period: BillingPeriod;
  startsAt: Date;
  endsAt: Date;
  /** Paid for it, GEL, before the bank's commission (0 for one admin granted). */
  amount: number;
}

/** The subscription in force now — the highest plan when two overlap — or null for Free. */
export function activeSubscription<T extends SubscriptionSpan>(rows: readonly T[], now: Date): T | null {
  let best: T | null = null;
  for (const row of rows) {
    if (row.startsAt.getTime() > now.getTime() || row.endsAt.getTime() <= now.getTime()) continue;
    if (!best || RANK[row.plan] > RANK[best.plan] || (row.plan === best.plan && row.endsAt.getTime() > best.endsAt.getTime())) best = row;
  }
  return best;
}

export function currentPlan(rows: readonly SubscriptionSpan[], now: Date): PlanId {
  return activeSubscription(rows, now)?.plan ?? 'free';
}

/** When the plan in force stops being paid for: the last end of a run of the same plan, renewals included. */
export function planPaidUntil(rows: readonly SubscriptionSpan[], plan: PaidPlanId, now: Date): Date | null {
  let until: Date | null = null;
  const same = rows.filter((r) => r.plan === plan && r.endsAt.getTime() > now.getTime()).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  for (const row of same) {
    const from = until ?? now;
    // A gap means the run stopped before this row.
    if (row.startsAt.getTime() > from.getTime()) break;
    if (!until || row.endsAt.getTime() > until.getTime()) until = row.endsAt;
  }
  return until;
}

// ---------------------------------------------------------------------------
// Buying a plan
// ---------------------------------------------------------------------------

/** What a purchase of `plan` for `period` would do now. */
export type PlanPurchase =
  | {
      ok: true;
      /** Renewing the plan in force (it starts when that one ends), or a new or higher one (at once). */
      kind: 'new' | 'renew' | 'upgrade';
      startsAt: Date;
      endsAt: Date;
      /** The plan's price. */
      price: number;
      /** The unused part of a lower plan, taken off the price of an upgrade. */
      credit: number;
      /** What is charged before the bank's commission: price − credit, never below 0. */
      amount: number;
      /** The lower plan's subscriptions an upgrade cuts short at `startsAt`. */
      supersedes: number[];
    }
  /** A lower plan while a higher one is in force: it would be paid for and not used. */
  | { ok: false; reason: 'lower'; until: Date };

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The unused value of the subscriptions an upgrade replaces: each row's price × the share of its
 * time still to come (a renewal not started yet counts whole).
 */
export function unusedCredit(rows: readonly SubscriptionSpan[], now: Date): number {
  let credit = 0;
  for (const row of rows) {
    const span = row.endsAt.getTime() - row.startsAt.getTime();
    if (span <= 0 || row.endsAt.getTime() <= now.getTime()) continue;
    const left = row.endsAt.getTime() - Math.max(now.getTime(), row.startsAt.getTime());
    credit += row.amount * Math.min(1, left / span);
  }
  return round2(credit);
}

/**
 * The rules of a purchase: the same plan renews (from the end of what is paid for already); a
 * higher plan starts at once, with what is left of the lower one taken off its price; a lower
 * plan while a higher one runs is refused — it would start only when the higher one ends, and
 * nobody buys that on purpose.
 */
export function planPurchase(rows: readonly SubscriptionSpan[], plan: PaidPlanId, period: BillingPeriod, prices: PlanPrices, now: Date): PlanPurchase {
  const price = round2(prices[plan][period]);
  const active = activeSubscription(rows, now);
  if (!active) {
    return { ok: true, kind: 'new', startsAt: now, endsAt: periodEnd(now, period), price, credit: 0, amount: price, supersedes: [] };
  }
  if (RANK[active.plan] > RANK[plan]) {
    return { ok: false, reason: 'lower', until: planPaidUntil(rows, active.plan, now) ?? active.endsAt };
  }
  if (active.plan === plan) {
    const from = planPaidUntil(rows, plan, now) ?? active.endsAt;
    return { ok: true, kind: 'renew', startsAt: from, endsAt: periodEnd(from, period), price, credit: 0, amount: price, supersedes: [] };
  }
  // An upgrade: every lower subscription still to run is replaced by this one.
  const lower = rows.filter((r) => RANK[r.plan] < RANK[plan] && r.endsAt.getTime() > now.getTime());
  const credit = Math.min(price, unusedCredit(lower, now));
  return { ok: true, kind: 'upgrade', startsAt: now, endsAt: periodEnd(now, period), price, credit, amount: round2(price - credit), supersedes: lower.map((r) => r.id) };
}

// ---------------------------------------------------------------------------
// Allowances
// ---------------------------------------------------------------------------

/** How many more projects may be made, from what has been counted; null when there is no limit. */
export function projectsLeft(plan: PlanId, counted: number, config: PlanConfig = DEFAULT_PLAN_CONFIG): number | null {
  const limit = config.projects[plan];
  return limit == null ? null : Math.max(0, limit - counted);
}

/** The month's free renders still to use; none on a plan without renders. */
export function freeRendersLeft(plan: PlanId, usedThisMonth: number, config: PlanConfig = DEFAULT_PLAN_CONFIG): number {
  return Math.max(0, freeRendersOf(plan, config) - usedThisMonth);
}
