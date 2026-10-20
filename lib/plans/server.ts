import { and, count, eq, gt, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import { asc, desc } from '@/lib/db/order';
import { db } from '@/lib/db';
import { planUsage, projects, subscriptions, type Payment, type Subscription } from '@/lib/db/schema';
import { auth } from '@/auth';
import { API_ERRORS, fail } from '@/lib/api/route';
import { STAFF_ROLES, type UserRole } from '@/lib/auth/roles';
import { loadPlatformSettings, type PlatformSettingsWithMeta } from '@/lib/finance/settings';
import { log } from '@/lib/log';
import {
  BILLING_PERIODS,
  PAID_PLANS,
  PLAN_FEATURES,
  activeSubscription,
  addMonths,
  featuresOf,
  freeRendersLeft,
  freeRendersOf,
  hasFeature,
  isPaidPlan,
  planPaidUntil,
  planPurchase,
  projectAllowance,
  projectsLeft,
  requiredPlan,
  subscriptionMonth,
  type BillingPeriod,
  type PaidPlanId,
  type PlanConfig,
  type PlanFeature,
  type PlanId,
  type PlanPrices,
  type SubscriptionSpan,
} from './plans';

/**
 * A person's plan as the database has it (docs/subscriptions.md): the subscription in force,
 * what its month has used, what each purchase would cost now — by what admin set each plan to
 * include (`platform_settings.plan_config`). Staff (admin and the agents) count as Professional
 * with every feature and no allowance, so they can open any part of the studio for a customer;
 * partners are customers like anyone else.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Db = typeof db | Tx;

export interface PlanAccount {
  id: number;
  role?: UserRole | null;
}

/** A subscription as the browser is handed it. */
export interface SubscriptionView {
  id: number;
  plan: PaidPlanId;
  period: BillingPeriod;
  startsAt: string;
  endsAt: string;
  amount: number;
  granted: boolean;
}

/** What one purchase would be now (`planPurchase`), for the pricing page and the upgrade dialogue. */
export type OfferView =
  | { ok: true; kind: 'new' | 'renew' | 'upgrade'; price: number; credit: number; amount: number; startsAt: string; endsAt: string }
  | { ok: false; reason: 'lower'; until: string };

export interface PlanState {
  plan: PlanId;
  /** What admin set each plan to include — the pricing page and the upgrade dialogue list it. */
  config: PlanConfig;
  /** Staff: Professional, with no project allowance. */
  staff: boolean;
  features: Record<PlanFeature, boolean>;
  /** The subscription in force, and how long its plan is paid for (renewals included). */
  subscription: (SubscriptionView & { paidUntil: string }) | null;
  /** Bought and not started yet: a renewal. */
  queued: SubscriptionView[];
  projects: { used: number; limit: number | null; left: number | null; per: 'total' | 'month'; resetsAt: string | null };
  /** A Professional month's free renders; null on another plan. */
  renders: { freeLeft: number; freeTotal: number; resetsAt: string } | null;
  prices: PlanPrices;
  renderPrice: number;
  ownItemPrice: number;
  bankFeePct: number;
  offers: Record<PaidPlanId, Record<BillingPeriod, OfferView>>;
}

export function isStaff(role: UserRole | null | undefined): boolean {
  return !!role && STAFF_ROLES.includes(role);
}

export function planPricesOf(settings: Pick<PlatformSettingsWithMeta, 'premiumMonthPrice' | 'premiumYearPrice' | 'professionalMonthPrice' | 'professionalYearPrice'>): PlanPrices {
  return {
    premium: { month: settings.premiumMonthPrice, year: settings.premiumYearPrice },
    professional: { month: settings.professionalMonthPrice, year: settings.professionalYearPrice },
  };
}

function spanOf(row: Subscription): SubscriptionSpan {
  return { id: row.id, plan: row.plan, period: row.period, startsAt: row.startsAt, endsAt: row.endsAt, amount: Number(row.amount) };
}

function viewOf(row: Subscription): SubscriptionView {
  return { id: row.id, plan: row.plan, period: row.period, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(), amount: Number(row.amount), granted: !row.paymentId };
}

/** The subscriptions still to run (in force or bought ahead), oldest first. */
export async function liveSubscriptions(userId: number, now = new Date(), tx: Db = db): Promise<Subscription[]> {
  return tx.select().from(subscriptions).where(and(eq(subscriptions.userId, userId), gt(subscriptions.endsAt, now))).orderBy(asc(subscriptions.startsAt), asc(subscriptions.id));
}

/** Every subscription a person had, newest first — the profile's history. */
export async function subscriptionHistory(userId: number): Promise<SubscriptionView[]> {
  const rows = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).orderBy(desc(subscriptions.startsAt), desc(subscriptions.id)).limit(50);
  // An upgrade's cut leaves a lower plan bought ahead with no time at all: not a period anyone had.
  return rows.filter((r) => r.endsAt.getTime() > r.startsAt.getTime()).map(viewOf);
}

interface Resolved {
  plan: PlanId;
  staff: boolean;
  config: PlanConfig;
  rows: Subscription[];
  active: Subscription | null;
  /**
   * The month the allowances are counted in: the current month of the subscription in force, or
   * — on Free, which has none — the calendar month.
   */
  month: { from: Date; to: Date };
}

function calendarMonth(now: Date): { from: Date; to: Date } {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { from, to: addMonths(from, 1) };
}

async function resolve(account: PlanAccount, now: Date, tx: Db = db): Promise<Resolved> {
  const [rows, settings] = await Promise.all([liveSubscriptions(account.id, now, tx), loadPlatformSettings()]);
  const activeId = activeSubscription(rows.map(spanOf), now)?.id;
  const active = rows.find((r) => r.id === activeId) ?? null;
  const month = active ? subscriptionMonth(active.startsAt, now) : calendarMonth(now);
  const staff = isStaff(account.role);
  return { plan: staff ? 'professional' : (active?.plan ?? 'free'), staff, config: settings.planConfig, rows, active, month };
}

/** Whether the resolved account has a feature: staff every one, anyone else by their plan. */
function can(r: Pick<Resolved, 'plan' | 'staff' | 'config'>, feature: PlanFeature): boolean {
  return r.staff || hasFeature(r.plan, feature, r.config);
}

/** The plan a person is on now. */
export async function planOf(account: PlanAccount, now = new Date()): Promise<PlanId> {
  return (await resolve(account, now)).plan;
}

/**
 * What a person may do now: their plan, and `has(feature)` by what admin set that plan to
 * include (staff have everything). `needs(feature)` is the lowest plan that has it, for a 402.
 */
export async function featureAccess(account: PlanAccount, now = new Date()): Promise<{ plan: PlanId; has: (feature: PlanFeature) => boolean; needs: (feature: PlanFeature) => PaidPlanId | null }> {
  const r = await resolve(account, now);
  return { plan: r.plan, has: (feature) => can(r, feature), needs: (feature) => requiredPlan(feature, r.config) };
}

async function countProjects(r: Resolved, userId: number, tx: Db = db): Promise<number> {
  if (projectAllowance(r.plan, r.config).per === 'total') {
    const [row] = await tx.select({ n: count() }).from(projects).where(eq(projects.userId, userId));
    return Number(row?.n ?? 0);
  }
  const [row] = await tx
    .select({ n: count() })
    .from(planUsage)
    .where(and(eq(planUsage.userId, userId), eq(planUsage.kind, 'project'), gte(planUsage.createdAt, r.month.from), lt(planUsage.createdAt, r.month.to)));
  return Number(row?.n ?? 0);
}

async function countFreeRenders(r: Resolved, userId: number, tx: Db = db): Promise<number> {
  const [row] = await tx
    .select({ n: count() })
    .from(planUsage)
    .where(and(eq(planUsage.userId, userId), eq(planUsage.kind, 'render'), isNull(planUsage.paymentId), gte(planUsage.createdAt, r.month.from), lt(planUsage.createdAt, r.month.to)));
  return Number(row?.n ?? 0);
}

/** Everything the pricing page, the profile and the studio's locks need about one person. */
export async function planState(account: PlanAccount, now = new Date()): Promise<PlanState> {
  const [r, settings] = await Promise.all([resolve(account, now), loadPlatformSettings()]);
  const prices = planPricesOf(settings);
  const [usedProjects, usedRenders] = await Promise.all([countProjects(r, account.id), countFreeRenders(r, account.id)]);
  const allowance = projectAllowance(r.plan, r.config);
  const spans = r.rows.map(spanOf);
  const freeRenders = freeRendersOf(r.plan, r.config);

  const offers = {} as PlanState['offers'];
  for (const plan of PAID_PLANS) {
    offers[plan] = {} as Record<BillingPeriod, OfferView>;
    for (const period of BILLING_PERIODS) {
      const p = planPurchase(spans, plan, period, prices, now);
      offers[plan][period] = p.ok
        ? { ok: true, kind: p.kind, price: p.price, credit: p.credit, amount: p.amount, startsAt: p.startsAt.toISOString(), endsAt: p.endsAt.toISOString() }
        : { ok: false, reason: p.reason, until: p.until.toISOString() };
    }
  }

  const active = r.active;
  const paidUntil = active ? planPaidUntil(spans, active.plan, now) : null;
  return {
    plan: r.plan,
    config: r.config,
    staff: r.staff,
    features: r.staff ? (Object.fromEntries(PLAN_FEATURES.map((f) => [f, true])) as Record<PlanFeature, boolean>) : featuresOf(r.plan, r.config),
    subscription: active ? { ...viewOf(active), paidUntil: (paidUntil ?? active.endsAt).toISOString() } : null,
    queued: r.rows.filter((row) => row.startsAt.getTime() > now.getTime() && row.endsAt.getTime() > row.startsAt.getTime()).map(viewOf),
    projects: r.staff
      ? { used: usedProjects, limit: null, left: null, per: allowance.per, resetsAt: null }
      : { used: usedProjects, limit: allowance.limit, left: projectsLeft(r.plan, usedProjects, r.config), per: allowance.per, resetsAt: allowance.per === 'month' && allowance.limit != null ? r.month.to.toISOString() : null },
    renders: can(r, 'renders') ? { freeLeft: r.staff ? Math.max(freeRenders, 1) : freeRendersLeft(r.plan, usedRenders, r.config), freeTotal: r.staff ? Math.max(freeRenders, 1) : freeRenders, resetsAt: r.month.to.toISOString() } : null,
    prices,
    renderPrice: settings.renderPrice,
    ownItemPrice: settings.ownItemPrice,
    bankFeePct: settings.bankFeePct,
    offers,
  };
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/**
 * The session's account when its plan has the feature; otherwise a ready 402 `PLAN_REQUIRED`
 * (or the session's 401). The answer names the lowest plan that has it, for the upgrade dialogue.
 */
export async function requirePlanFeature(feature: PlanFeature) {
  const session = await auth();
  if (!session?.user?.id) return { session: null, plan: null, response: fail(API_ERRORS.UNAUTHORIZED, 401) };
  const access = await featureAccess({ id: Number(session.user.id), role: session.user.role });
  if (!access.has(feature)) {
    log.info('plan feature refused', { userId: session.user.id, feature, plan: access.plan });
    return { session: null, plan: access.plan, response: fail(API_ERRORS.PLAN_REQUIRED, 402, { headers: { 'X-Plan-Required': access.needs(feature) ?? 'none' } }) };
  }
  return { session, plan: access.plan, response: null };
}

/** One lock per person for the length of a transaction: two tabs counting an allowance at once count once. */
async function lockAccount(tx: Tx, userId: number): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(${7_301}, ${userId})`);
}

export type ProjectSlot = { ok: true } | { ok: false; plan: PlanId; limit: number | null; per: 'total' | 'month' };

/**
 * Makes a project if the plan has room for one, in one transaction with the count and its
 * `plan_usage` row: `make` inserts the project and returns its id.
 */
export async function withProjectSlot(account: PlanAccount, make: (tx: Tx) => Promise<number>, now = new Date()): Promise<{ ok: true; id: number } | Extract<ProjectSlot, { ok: false }>> {
  return db.transaction(async (tx) => {
    await lockAccount(tx, account.id);
    const r = await resolve(account, now, tx);
    if (!r.staff) {
      const used = await countProjects(r, account.id, tx);
      const allowance = projectAllowance(r.plan, r.config);
      const left = projectsLeft(r.plan, used, r.config);
      if (left != null && left <= 0) return { ok: false as const, plan: r.plan, limit: allowance.limit, per: allowance.per };
    }
    const id = await make(tx);
    await tx.insert(planUsage).values({ userId: account.id, kind: 'project', projectId: id, createdAt: now });
    return { ok: true as const, id };
  });
}

/**
 * Takes one of the month's free renders, when the plan has one left: the `plan_usage` row is
 * written at once (`release` deletes it if the render is not queued after all). Null when none
 * is left — the render is paid for (a `render` credit) instead.
 */
export async function takeFreeRender(account: PlanAccount, projectId: number, now = new Date()): Promise<{ usageId: number } | null> {
  return db.transaction(async (tx) => {
    await lockAccount(tx, account.id);
    const r = await resolve(account, now, tx);
    if (!can(r, 'renders')) return null;
    if (!r.staff && freeRendersLeft(r.plan, await countFreeRenders(r, account.id, tx), r.config) <= 0) return null;
    const [row] = await tx.insert(planUsage).values({ userId: account.id, kind: 'render', projectId, createdAt: now }).returning({ id: planUsage.id });
    return { usageId: row.id };
  });
}

/** A paid render, counted (not against the free ones). */
export async function recordPaidRender(userId: number, projectId: number, paymentId: number): Promise<number> {
  const [row] = await db.insert(planUsage).values({ userId, kind: 'render', projectId, paymentId }).returning({ id: planUsage.id });
  return row.id;
}

export async function releaseUsage(usageId: number): Promise<void> {
  await db.delete(planUsage).where(eq(planUsage.id, usageId));
}

// ---------------------------------------------------------------------------
// Payments and grants
// ---------------------------------------------------------------------------

/**
 * An approved subscription payment, inside its approval's transaction: the plan is bought by
 * the rules of `planPurchase` as they stand now (a renewal after what is paid for, an upgrade
 * at once — the lower plan cut short). A lower plan than the one in force, which the start
 * refuses and only a race could bring here, is queued after the higher one and logged.
 */
export async function activateSubscription(tx: Tx, payment: Payment, now = new Date()): Promise<void> {
  if (!payment.userId || !isPaidPlan(payment.plan) || !payment.billingPeriod) {
    log.error('subscription payment without its plan', { orderId: payment.orderId });
    throw new Error('subscription payment without its plan');
  }
  await lockAccount(tx, payment.userId);
  const rows = await liveSubscriptions(payment.userId, now, tx);
  const spans = rows.map(spanOf);
  // The prices do not matter here — what was quoted is what was paid (`payment.amount`).
  const p = planPurchase(spans, payment.plan, payment.billingPeriod, { premium: { month: 0, year: 0 }, professional: { month: 0, year: 0 } }, now);
  let startsAt: Date;
  if (p.ok) {
    startsAt = p.startsAt;
    if (p.supersedes.length > 0) {
      // Cut short at once; one bought ahead and not started yet is left with no time at all.
      await tx.update(subscriptions).set({ endsAt: now }).where(and(inArray(subscriptions.id, p.supersedes), lt(subscriptions.startsAt, now)));
      await tx.update(subscriptions).set({ endsAt: sql`${subscriptions.startsAt}` }).where(and(inArray(subscriptions.id, p.supersedes), gte(subscriptions.startsAt, now)));
    }
  } else {
    log.error('a lower plan paid for while a higher one runs — queued after it', { orderId: payment.orderId, until: p.until });
    startsAt = p.until;
  }
  const endsAt = addMonths(startsAt, payment.billingPeriod === 'year' ? 12 : 1);
  await tx.insert(subscriptions).values({ userId: payment.userId, plan: payment.plan, period: payment.billingPeriod, startsAt, endsAt, amount: payment.amount, paymentId: payment.id });
  log.info('subscription bought', { userId: payment.userId, plan: payment.plan, period: payment.billingPeriod, startsAt, endsAt, orderId: payment.orderId });
}

/** A reversed subscription payment: what it bought is taken back (a plan it cut short stays cut). */
export async function revokeSubscription(tx: Tx, payment: Payment): Promise<void> {
  await tx.delete(subscriptions).where(eq(subscriptions.paymentId, payment.id));
}

/**
 * A purchase whose price the unused part of a lower plan covers whole: no card, the plan is
 * bought at once (a subscription with no payment and the price 0).
 */
export async function activateFreeUpgrade(userId: number, plan: PaidPlanId, period: BillingPeriod, now = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    await lockAccount(tx, userId);
    const spans = (await liveSubscriptions(userId, now, tx)).map(spanOf);
    const p = planPurchase(spans, plan, period, { premium: { month: 0, year: 0 }, professional: { month: 0, year: 0 } }, now);
    if (!p.ok) return;
    if (p.supersedes.length > 0) {
      await tx.update(subscriptions).set({ endsAt: now }).where(and(inArray(subscriptions.id, p.supersedes), lt(subscriptions.startsAt, now)));
      await tx.update(subscriptions).set({ endsAt: sql`${subscriptions.startsAt}` }).where(and(inArray(subscriptions.id, p.supersedes), gte(subscriptions.startsAt, now)));
    }
    await tx.insert(subscriptions).values({ userId, plan, period, startsAt: p.startsAt, endsAt: p.endsAt, amount: '0' });
  });
}

/**
 * Admin's grant: a plan from now for so many months, at no charge (support, a partner, a test).
 * It runs beside whatever was bought — the higher plan holds while both do.
 */
export async function grantSubscription(userId: number, plan: PaidPlanId, months: number, grantedBy: number, now = new Date()): Promise<SubscriptionView> {
  const [row] = await db
    .insert(subscriptions)
    .values({ userId, plan, period: months >= 12 && months % 12 === 0 ? 'year' : 'month', startsAt: now, endsAt: addMonths(now, months), amount: '0', grantedBy })
    .returning();
  log.info('subscription granted', { userId, plan, months, grantedBy });
  return viewOf(row);
}

/** Admin ends a person's subscriptions now (a grant taken back, a refund made in Flitt's portal). */
export async function endSubscriptions(userId: number, now = new Date()): Promise<void> {
  await db.update(subscriptions).set({ endsAt: now }).where(and(eq(subscriptions.userId, userId), gt(subscriptions.endsAt, now), lt(subscriptions.startsAt, now)));
  await db.update(subscriptions).set({ endsAt: sql`${subscriptions.startsAt}` }).where(and(eq(subscriptions.userId, userId), gte(subscriptions.startsAt, now)));
}
