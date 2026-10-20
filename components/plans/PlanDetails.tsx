import Link from 'next/link';
import { CalendarClock, Camera, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fill } from '@/lib/admin/list';
import type { Dictionary } from '@/lib/i18n';
import type { UserRole } from '@/lib/auth/roles';
import { featureLine, projectsLine } from '@/components/plans/planLines';
import { planState, subscriptionHistory } from '@/lib/plans/server';
import { cn, formatDateTime, formatGEL } from '@/lib/utils';

/**
 * The profile's "my plan" (`/profile?view=plan`, docs/subscriptions.md): the plan in force and
 * until when, what its month has used (projects, free renders), a renewal bought ahead, what it
 * includes, and every period had before. Buying, renewing and upgrading are the pricing page's.
 */
export async function PlanDetails({ userId, role, t }: { userId: number; role: UserRole | null | undefined; t: Dictionary }) {
  const p = t.plans;
  const [state, history] = await Promise.all([planState({ id: userId, role }), subscriptionHistory(userId)]);
  const planName = (plan: string) => (plan === 'premium' ? p.premium : plan === 'professional' ? p.professional : p.free);
  const sub = state.subscription;
  const projects = state.projects;

  return (
    <div className="mt-8 space-y-6">
      <section className="rounded-[20px] border border-line bg-bg-surface p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">{p.planCurrent}</p>
            <h2 className="mt-1 font-serif text-3xl font-semibold">{planName(state.plan)}</h2>
            <p className="mt-2 text-sm text-ink-muted">
              {state.staff ? p.staffNote : sub ? fill(p.activeUntil, { date: formatDateTime(sub.paidUntil, false) }) : p.planFreeDesc}
            </p>
          </div>
          {!state.staff && (
            <Button asChild variant="ink">
              <Link href="/pricing">{sub ? p.changePlan : p.seePlans}</Link>
            </Button>
          )}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-[14px] border border-line bg-bg-base p-4">
            <FolderOpen className="mt-0.5 h-5 w-5 shrink-0 text-ink-muted" />
            <div className="text-sm">
              <p className="font-semibold text-ink">{p.usageProjects}</p>
              <p className="mt-0.5 text-ink-muted">
                {projects.limit == null
                  ? p.unlimited
                  : projects.per === 'total'
                    ? fill(p.projectsUsedTotal, { used: projects.used, limit: projects.limit })
                    : fill(p.projectsUsedMonth, { used: projects.used, limit: projects.limit, date: projects.resetsAt ? formatDateTime(projects.resetsAt, false) : '—' })}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-[14px] border border-line bg-bg-base p-4">
            <Camera className="mt-0.5 h-5 w-5 shrink-0 text-ink-muted" />
            <div className="text-sm">
              <p className="font-semibold text-ink">{p.usageRenders}</p>
              <p className="mt-0.5 text-ink-muted">
                {state.renders ? fill(p.rendersLeft, { left: state.renders.freeLeft, total: state.renders.freeTotal, date: formatDateTime(state.renders.resetsAt, false), price: formatGEL(state.renderPrice) }) : p.rendersNotIncluded}
              </p>
            </div>
          </div>
        </div>

        {state.queued.length > 0 && (
          <p className="mt-4 flex items-center gap-2 text-sm text-ink">
            <CalendarClock className="h-4 w-4 text-success" />
            {state.queued.map((q) => fill(p.queuedLine, { plan: planName(q.plan), from: formatDateTime(q.startsAt, false), to: formatDateTime(q.endsAt, false) })).join(' · ')}
          </p>
        )}

        <ul className="mt-6 grid gap-x-6 gap-y-2 border-t border-line pt-6 text-sm text-ink-soft sm:grid-cols-2">
          {/* Everything the plan has, by what admin set it to include. */}
          {[projectsLine(t, state.plan, state.config), t.plans.fView3d, t.plans.fBudget, t.plans.fDraw, ...state.config.features[state.plan].map((f) => featureLine(t, f, state.plan, state))].map((line) => (
            <li key={line}>· {line}</li>
          ))}
        </ul>
      </section>

      {history.length > 0 && (
        <section className="rounded-[20px] border border-line bg-bg-surface p-6">
          <h3 className="font-serif text-lg font-semibold">{p.historyTitle}</h3>
          <ul className="mt-3 divide-y divide-line text-sm">
            {history.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="font-medium text-ink">
                  {planName(row.plan)} · {row.period === 'year' ? p.periodYear : p.periodMonth}
                </span>
                <span className="text-ink-muted">
                  {formatDateTime(row.startsAt, false)} — {formatDateTime(row.endsAt, false)}
                </span>
                <span className={cn('tabular-nums', row.granted ? 'text-ink-muted' : 'text-ink')}>{row.granted ? p.granted : formatGEL(row.amount, true)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
