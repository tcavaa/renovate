import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { loadHubOrderProjects } from '@/lib/projects/hub';
import { ordersForProject } from '@/lib/finance/orders';
import { OrderCards } from '@/components/orders/ProjectOrders';
import { fill } from '@/lib/admin/list';
import type { Dictionary, Locale } from '@/lib/i18n';

/**
 * The hubs' "orders": every order of the person's projects, grouped by project — the one
 * ordered from most recently first — each order the card its project page shows (`OrderCards`):
 * where it stands in plain words, what it comes to, what the partner wrote, what changed.
 */
export async function HubOrders({ userId, t, locale }: { userId: number; t: Dictionary; locale: Locale }) {
  const projects = await loadHubOrderProjects(userId);
  const groups = await Promise.all(projects.map(async (project) => ({ ...project, orders: await ordersForProject(project.id) })));

  return (
    <section className="mt-8">
      <p className="max-w-2xl text-sm leading-relaxed text-ink-muted">{t.hub.ordersHint}</p>
      {groups.length === 0 ? (
        <p className="mt-10 dots rounded-2xl bg-mist-light p-12 text-center text-sm text-ink-muted">{t.hub.ordersEmpty}</p>
      ) : (
        <div className="mt-10 space-y-12">
          {groups.map((group) => (
            <section key={group.id} aria-labelledby={`hub-orders-${group.id}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-ink pb-3">
                <h2 id={`hub-orders-${group.id}`} className="min-w-0 font-display text-2xl text-ink">
                  <Link href={`/profile/projects/${group.id}`} className="decoration-lime decoration-4 underline-offset-4 hover:underline">
                    {group.name || t.profile.fallbackName}
                  </Link>
                  <span className="ml-3 text-sm font-medium tracking-normal tabular-nums text-ink-muted">{fill(t.hub.ordersCount, { n: group.orders.length })}</span>
                </h2>
                <Link href={`/profile/projects/${group.id}`} className="inline-flex items-center gap-1 rounded-full bg-mist-light px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-lime">
                  {t.hub.projectPage}
                  <ArrowUpRight className="h-4 w-4" aria-hidden />
                </Link>
              </div>
              <div className="mt-5">
                <OrderCards orders={group.orders} t={t} locale={locale} />
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
