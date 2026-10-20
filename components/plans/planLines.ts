import { fill } from '@/lib/admin/list';
import type { Dictionary } from '@/lib/i18n';
import { FREE_RENDERS_PER_MONTH, PROJECT_ALLOWANCE, type PlanId } from '@/lib/plans/plans';
import { formatGEL } from '@/lib/utils';

/**
 * The lines of each plan as the pricing page lists them (each paid plan "everything before,
 * plus") — the profile's plan too, on the server, so this is not a client module.
 */
export function planLines(t: Dictionary, plan: PlanId, extras: { ownItemPrice: number; renderPrice: number }): string[] {
  const p = t.plans;
  if (plan === 'free') return [fill(p.fProjectsTotal, { n: PROJECT_ALLOWANCE.free.limit }), p.fView3d, p.fBudget, p.fDraw];
  if (plan === 'premium') return [p.fUpload, p.fCatalog, p.fMove, fill(p.fProjectsMonth, { n: PROJECT_ALLOWANCE.premium.limit })];
  return [
    fill(p.fOwn, { price: formatGEL(extras.ownItemPrice) }),
    fill(p.fRenders, { n: FREE_RENDERS_PER_MONTH, price: formatGEL(extras.renderPrice) }),
    p.fWalk,
    fill(p.fProjectsMonth, { n: PROJECT_ALLOWANCE.professional.limit }),
  ];
}
