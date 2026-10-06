import Link from 'next/link';
import { ArrowUpRight, Phone } from 'lucide-react';
import { getLocale, getT } from '@/lib/i18n/server';
import { loadPartnerContext, partnerHref } from '@/lib/partner/context';
import { teamProjectBookings } from '@/lib/partner/projects';
import { orderStage } from '@/lib/finance/orderFlow';
import { homeStateShortLabel, formatM2L } from '@/lib/i18n/labels';
import { OrderStageBadge } from '@/components/orders/OrderStatusBadge';
import { dateLocaleFor } from '@/components/projects/ProjectDetail';
import { TIME_ZONE } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * The flats a brigade is hired for — one row per booking it holds (sent to it, not turned
 * down) — each opening the project to look at: plan, 3D, budget, customer.
 */
export default async function PartnerProjectsPage(props: { searchParams: Promise<{ store?: string; worker?: string; team?: string }> }) {
  const search = await props.searchParams;
  const t = await getT();
  const locale = await getLocale();
  const ctx = await loadPartnerContext(search);
  if (!ctx || ctx.type !== 'team' || !ctx.ref.teamId) return null;
  const rows = await teamProjectBookings(ctx.ref.teamId);
  const p = t.projectView;
  const dateLocale = dateLocaleFor(locale);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">{ctx.name}</p>
        <h1 className="mt-2 font-serif text-3xl font-bold">{p.projectsTitle}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">{p.projectsSubtitle}</p>
      </div>
      {rows.length === 0 ? (
        <p className="border border-dashed border-line p-12 text-center text-sm text-ink-muted">{p.projectsEmpty}</p>
      ) : (
        <div className="overflow-x-auto border border-line bg-bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                <th className="px-4 py-3">{t.partner.project}</th>
                <th className="px-4 py-3">{p.customer}</th>
                <th className="px-4 py-3 text-right">{p.area}</th>
                <th className="px-4 py-3">{t.partner.statusLabel}</th>
                <th className="px-4 py-3">{t.partner.placedOn}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.orderId} className="border-b border-line/70 last:border-b-0 hover:bg-bg-base/60">
                  <td className="px-4 py-3">
                    <Link href={partnerHref(`/partner/projects/${r.projectId}`, ctx)} className="font-medium text-ink hover:text-brand">
                      {r.projectName ?? `#${r.projectId}`}
                    </Link>
                    <span className="block text-xs text-ink-muted">{r.homeState ? homeStateShortLabel(t, r.homeState) : '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{r.customerName}</p>
                    <a href={`tel:${r.customerPhone}`} className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink">
                      <Phone className="h-3 w-3" />
                      {r.customerPhone}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.totalM2 ? formatM2L(t, Number(r.totalM2)) : '—'}</td>
                  <td className="px-4 py-3">
                    <OrderStageBadge stage={orderStage(r)} t={t} />
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{r.sentAt ? new Date(r.sentAt).toLocaleDateString(dateLocale, { timeZone: TIME_ZONE }) : '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={partnerHref(`/partner/projects/${r.projectId}`, ctx)} className="inline-flex items-center gap-1 text-sm font-medium text-ink hover:text-brand">
                      {p.openProject}
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
