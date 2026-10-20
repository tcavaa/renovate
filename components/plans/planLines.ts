import { fill } from '@/lib/admin/list';
import type { Dictionary } from '@/lib/i18n';
import { freeRendersOf, projectAllowance, type PlanConfig, type PlanFeature, type PlanId } from '@/lib/plans/plans';
import { formatGEL } from '@/lib/utils';

interface LineContext {
  config: PlanConfig;
  ownItemPrice: number;
  renderPrice: number;
}

/** One feature as the pricing page words it. */
export function featureLine(t: Dictionary, feature: PlanFeature, plan: PlanId, ctx: LineContext): string {
  const p = t.plans;
  switch (feature) {
    case 'planUpload':
      return p.fUpload;
    case 'catalog':
      return p.fCatalog;
    case 'moveFurniture':
      return p.fMove;
    case 'walk':
      return p.fWalk;
    case 'renders': {
      const n = freeRendersOf(plan, ctx.config);
      return n > 0 ? fill(p.fRenders, { n, price: formatGEL(ctx.renderPrice) }) : fill(p.fRendersPaid, { price: formatGEL(ctx.renderPrice) });
    }
    case 'ownItems':
      return fill(p.fOwn, { price: formatGEL(ctx.ownItemPrice) });
  }
}

/** A plan's projects as the pricing page words them. */
export function projectsLine(t: Dictionary, plan: PlanId, config: PlanConfig): string {
  const { limit, per } = projectAllowance(plan, config);
  if (limit == null) return t.plans.fProjectsUnlimited;
  return fill(per === 'total' ? t.plans.fProjectsTotal : t.plans.fProjectsMonth, { n: limit });
}

const BELOW: Record<PlanId, PlanId | null> = { free: null, premium: 'free', professional: 'premium' };

/**
 * What a plan includes, as the pricing page lists it (docs/subscriptions.md) — by what admin set
 * (`PlanConfig`). A plan that has everything the one below has reads "everything in X, plus" and
 * names only what it adds; one that does not (admin took something away) lists all it has. The
 * profile's plan uses it too, on the server, so this is not a client module.
 */
export function planLines(t: Dictionary, plan: PlanId, ctx: LineContext): { heading: string; lines: string[] } {
  const p = t.plans;
  const own = ctx.config.features[plan];
  const below = BELOW[plan];
  const superset = below !== null && ctx.config.features[below].every((f) => own.includes(f));
  const features = superset && below ? own.filter((f) => !ctx.config.features[below].includes(f)) : own;
  const lines = [projectsLine(t, plan, ctx.config), ...(superset ? [] : [p.fView3d, p.fBudget, p.fDraw]), ...features.map((f) => featureLine(t, f, plan, ctx))];
  const heading = !superset ? p.whatsIncluded : below === 'free' ? p.allFreePlus : p.allPremiumPlus;
  return { heading, lines };
}
