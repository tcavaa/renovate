'use client';

import { Crown, Lock } from 'lucide-react';
import { fill } from '@/lib/admin/list';
import { useT } from '@/lib/i18n/client';
import type { PaidPlanId } from '@/lib/plans/plans';
import { cn } from '@/lib/utils';

/**
 * The mark on something the person's plan does not include: a lock and the plan that has it.
 * Clicking what it marks opens the upgrade dialogue (`usePlanGate().gate`), so the badge itself
 * is only a label. `tone="dark"` for the studio's dark chrome.
 */
export function PlanBadge({ plan, className, tone = 'light', iconOnly = false }: { plan: PaidPlanId; className?: string; tone?: 'light' | 'dark'; iconOnly?: boolean }) {
  const t = useT();
  const name = plan === 'premium' ? t.plans.premium : t.plans.professional;
  return (
    <span
      title={fill(t.plans.lockedBadgeTitle, { plan: name })}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none',
        plan === 'professional' ? 'bg-ink text-white' : 'bg-accent/15 text-accent-dark',
        tone === 'dark' && plan === 'professional' && 'bg-white/20',
        tone === 'dark' && plan === 'premium' && 'bg-accent text-ink',
        className
      )}
    >
      <Lock className="h-2.5 w-2.5" aria-hidden />
      {!iconOnly && name}
    </span>
  );
}

/** The plan's own mark beside its name: a crown for Professional. */
export function PlanName({ plan, className }: { plan: 'free' | PaidPlanId; className?: string }) {
  const t = useT();
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      {plan === 'professional' && <Crown className="h-4 w-4 text-accent" aria-hidden />}
      {plan === 'free' ? t.plans.free : plan === 'premium' ? t.plans.premium : t.plans.professional}
    </span>
  );
}
