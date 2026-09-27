import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, Crown, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TeamSelfForm } from '@/components/partner/TeamSelfForm';
import { loadTeam, openJobsOf } from '@/lib/teams/queries';
import { loadPlatformSettings } from '@/lib/finance/settings';
import { effectiveCommissionPct } from '@/lib/finance/money';
import { localizedName, workerSpecialtyLabel } from '@/lib/i18n/labels';
import type { Dictionary, Locale } from '@/lib/i18n';
import { fill } from '@/lib/admin/list';
import { cn, formatNumber } from '@/lib/utils';

/**
 * A brigade's own page in the portal: its company details in its own hands (`TeamSelfForm`),
 * its standing as the platform keeps it (rating, jobs done, commission, verified), how loaded it
 * is right now against what it said it can run — which is what customers see as "busy" — and
 * its crew, the workers whose trades customers choose it by.
 */
export async function TeamProfile({ teamId, t, locale, isAdmin }: { teamId: number; t: Dictionary; locale: Locale; isAdmin: boolean }) {
  const [loaded, open, settings] = await Promise.all([loadTeam(teamId, { includeInactive: true }), openJobsOf([teamId]), loadPlatformSettings()]);
  if (!loaded) return null;
  const { team, members, trades } = loaded;
  const p = t.teamPortal;
  const openJobs = open.get(teamId) ?? 0;
  const capacity = team.capacityJobs ?? 1;
  const busy = openJobs >= capacity;
  const pct = effectiveCommissionPct(team.commissionRate, settings.workerCommissionPct);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-4">
          {team.logoUrl && (
            <span className="relative h-14 w-14 shrink-0 overflow-hidden border border-line bg-bg-base">
              <Image src={team.logoUrl} alt="" fill sizes="56px" className="object-cover" />
            </span>
          )}
          <div>
            <p className="eyebrow">{p.title}</p>
            <h1 className="mt-2 font-serif text-3xl font-bold">{localizedName(locale, team)}</h1>
            <p className="mt-1 max-w-2xl text-sm text-ink-muted">{p.subtitle}</p>
          </div>
        </div>
        {team.isActive && team.approvalStatus === 'approved' && (
          <Button asChild variant="outline">
            <Link href={`/teams/${team.slug}`}>
              {p.publicPage}
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </Button>
        )}
      </div>

      <dl className="grid border-l border-t border-line sm:grid-cols-2 lg:grid-cols-4">
        <Fact label={t.workers.rating} value={`${formatNumber(Number(team.rating ?? 0))} / 5`} hint={`${team.reviewCount ?? 0} ${t.workers.reviews.toLowerCase()}`} />
        <Fact label={p.load} value={fill(p.loadValue, { open: openJobs, capacity })} hint={busy ? p.busy : p.available} warn={busy} />
        <Fact label={t.partner.commissionRateLabel} value={`${formatNumber(pct)}%`} hint={p.standingHint} />
        <Fact label={p.standing} value={team.isVerified ? p.verified : p.notVerified} hint={`${team.completedJobs ?? 0} · ${t.partner.doneOrders}`} />
      </dl>

      {/* Admin previewing a brigade edits it in admin; the brigade edits itself here. */}
      {isAdmin ? (
        <Button asChild variant="outline">
          <Link href={`/admin/teams/${team.id}`}>{t.admin.actions.edit}</Link>
        </Button>
      ) : (
        <TeamSelfForm
          team={{
            id: team.id,
            nameKa: team.nameKa,
            nameEn: team.nameEn,
            nameRu: team.nameRu,
            descriptionKa: team.descriptionKa,
            descriptionEn: team.descriptionEn,
            descriptionRu: team.descriptionRu,
            leadName: team.leadName,
            phone: team.phone,
            email: team.email,
            logoUrl: team.logoUrl,
            city: team.city,
            experienceYears: team.experienceYears,
            capacityJobs: team.capacityJobs,
          }}
        />
      )}

      <section className="border border-line bg-bg-surface">
        <header className="border-b border-line px-5 py-3">
          <p className="eyebrow">
            {p.crewTitle} · {members.length}
          </p>
          <p className="mt-1 text-xs text-ink-muted">{p.crewHint}</p>
          {trades.length > 0 && (
            <p className="mt-2 flex flex-wrap gap-1.5">
              {trades.map((slug) => (
                <Badge key={slug} variant="outline">
                  {workerSpecialtyLabel(t, slug)}
                </Badge>
              ))}
            </p>
          )}
        </header>
        {members.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-muted">{p.crewEmpty}</p>
        ) : (
          <ul className="grid divide-y divide-line/70 sm:grid-cols-2 sm:divide-y-0">
            {members.map((m) => (
              <li key={m.workerId} className="flex items-center gap-3 border-line/70 px-5 py-3 sm:border-b">
                <span className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-bg-base">
                  {m.avatarUrl ? <Image src={m.avatarUrl} alt="" fill sizes="40px" className="object-cover" /> : <UserRound className="h-4 w-4 text-ink-muted" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-medium text-ink">
                    {localizedName(locale, m)}
                    {m.isLead && (
                      <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand')}>
                        <Crown className="h-3 w-3" />
                        {p.lead}
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-ink-muted">
                    {workerSpecialtyLabel(t, m.specialtySlug)}
                    {m.experienceYears ? ` · ${fill(p.yearsExp, { n: m.experienceYears })}` : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Fact({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <div className="border-b border-r border-line px-4 py-4">
      <dt className="eyebrow">{label}</dt>
      <dd className={cn('mt-1 font-serif text-xl font-semibold', warn ? 'text-warning' : 'text-ink')}>{value}</dd>
      {hint && <dd className="mt-1 text-xs text-ink-muted">{hint}</dd>}
    </div>
  );
}
