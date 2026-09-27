import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { ArrowUpRight, Mail, Phone, User } from 'lucide-react';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { getLocale, getT } from '@/lib/i18n/server';
import { loadPartnerContext, partnerHref } from '@/lib/partner/context';
import { teamMaySeeProject, teamProjectBookings } from '@/lib/partner/projects';
import { loadProjectSheets } from '@/lib/projects/sheets';
import { loadRateBook } from '@/lib/api/rateBook';
import { orderStage } from '@/lib/finance/orderFlow';
import { homeStateLabel, formatM2L } from '@/lib/i18n/labels';
import { fill } from '@/lib/admin/list';
import type { CalculatorBoard } from '@/lib/projects/saved';
import type { DesignScene, FloorPlan } from '@/lib/design/types';
import { ProjectDetail } from '@/components/projects/ProjectDetail';
import { ProjectRenders } from '@/components/projects/ProjectRenders';
import { ProjectViewer } from '@/components/projects/ProjectViewer';
import { FoldSection } from '@/components/projects/FoldSection';
import { OrderStageBadge } from '@/components/orders/OrderStatusBadge';
import { formatGEL } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * A project a brigade is hired for, to look at: everything about the flat — the plan with its
 * sizes, the 3D model and the walk-through, the calculator's sheet and the design's budget, the
 * photos — and the customer, in view mode only. Only a brigade holding a booking for it (sent to
 * it, not turned down) gets here (`teamMaySeeProject`); anybody else is told it does not exist.
 * Admin previewing the brigade (`?team=`) sees exactly the same.
 */
export default async function PartnerProjectPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ store?: string; worker?: string; team?: string }> }) {
  const [{ id }, search] = await Promise.all([props.params, props.searchParams]);
  const t = await getT();
  const locale = await getLocale();
  const ctx = await loadPartnerContext(search);
  if (!ctx) return null;
  const projectId = Number(id);
  const teamId = ctx.type === 'team' ? ctx.ref.teamId : null;
  if (!teamId || !Number.isInteger(projectId) || projectId <= 0 || !(await teamMaySeeProject(teamId, projectId))) notFound();

  const [[project], bookings, book] = await Promise.all([db.select().from(projects).where(eq(projects.id, projectId)).limit(1), teamProjectBookings(teamId, projectId), loadRateBook()]);
  if (!project || bookings.length === 0) notFound();
  const sheets = await loadProjectSheets(project, book, t, locale);

  // The design's plan and scene when there is a design; the calculator's own board otherwise.
  const board = project.calculatorBoard as CalculatorBoard | null;
  const scene = project.plan ? ((project.scene as DesignScene | null) ?? null) : null;
  const plan = (project.plan as FloorPlan | null) ?? board?.plan ?? null;
  const finishes = scene?.finishes ?? board?.finishes ?? [];
  const title = project.nameKa ?? t.profile.fallbackName;
  const first = bookings[0];
  const p = t.projectView;

  return (
    <ProjectDetail
      project={project}
      sheets={sheets}
      t={t}
      locale={locale}
      backHref={partnerHref(`/partner/orders/${first.orderId}`, ctx)}
      backLabel={fill(p.booking, { id: first.orderId })}
      extraMeta={[
        { icon: User, label: p.customer, value: first.customerName },
        { icon: Phone, label: p.phone, value: first.customerPhone },
      ]}
      viewer={
        <ProjectViewer
          plan={plan}
          scene={scene}
          finishes={finishes}
          title={title}
          subtitle={`${homeStateLabel(t, project.homeState)} · ${formatM2L(t, Number(project.totalM2))}`}
          floorPlanUrl={project.floorPlanUrl ?? board?.floorPlanUrl ?? null}
        />
      }
      renders={project.plan != null ? <ProjectRenders projectId={project.id} t={t} locale={locale} /> : undefined}
      orders={
        <FoldSection title={p.customerTitle} count={bookings.length}>
          <ul className="grid gap-4 md:grid-cols-2">
            {bookings.map((b) => (
              <li key={b.orderId} className="border border-line bg-bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-serif text-lg font-semibold text-ink">{b.customerName}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
                      <a href={`tel:${b.customerPhone}`} className="inline-flex items-center gap-1.5 hover:text-ink">
                        <Phone className="h-3.5 w-3.5" />
                        {b.customerPhone}
                      </a>
                      {b.customerEmail && (
                        <a href={`mailto:${b.customerEmail}`} className="inline-flex items-center gap-1.5 hover:text-ink">
                          <Mail className="h-3.5 w-3.5" />
                          {b.customerEmail}
                        </a>
                      )}
                    </p>
                  </div>
                  <OrderStageBadge stage={orderStage(b)} t={t} />
                </div>
                {b.customerNote && (
                  <div className="mt-3 border-l-2 border-ink pl-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{t.partner.customerNote}</p>
                    <p className="mt-1 text-sm text-ink">{b.customerNote}</p>
                  </div>
                )}
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3 text-sm">
                  <span className="tabular-nums text-ink">{formatGEL(Number(b.subtotal))}</span>
                  <Link href={partnerHref(`/partner/orders/${b.orderId}`, ctx)} className="inline-flex items-center gap-1 font-medium text-ink hover:text-brand">
                    {fill(p.booking, { id: b.orderId })}
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </FoldSection>
      }
    />
  );
}
