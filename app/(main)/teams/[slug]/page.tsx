import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { WORKERS_DIRECTORY } from '@/lib/features';
import { BadgeCheck, Briefcase, MapPin, Phone, Star, UsersRound } from 'lucide-react';
import { BookingDialog } from '@/components/checkout/BookingDialog';
import { loadTeam } from '@/lib/teams/queries';
import { getLocale, getT } from '@/lib/i18n/server';
import { localizedName, localizedText, workerSpecialtyLabel } from '@/lib/i18n/labels';
import { fill } from '@/lib/admin/list';

export const dynamic = 'force-dynamic';

/**
 * One brigade: who is in it, what they cover, and the one button that matters — send them
 * the job. The order carries the project's whole labour estimate, so the foreman opens it
 * already knowing what the flat needs.
 */
export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await getT();
  const locale = await getLocale();
  const found = await loadTeam(slug);
  if (!found) notFound();
  const { team, members, trades } = found;
  const name = localizedName(locale, team);
  const description = localizedText(locale, team.descriptionKa, team.descriptionEn, team.descriptionRu);

  return (
    <div className="container py-10 md:py-14">
      <Link href="/teams" className="bracket-link text-sm">
        ( {t.teams.backToAll} )
      </Link>

      <header className="mt-4 flex flex-wrap items-start gap-6 border-b border-line pb-8">
        <span className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden border border-line bg-white">
          {team.logoUrl ? <Image src={team.logoUrl} alt="" width={80} height={80} className="h-full w-full object-cover" /> : <UsersRound className="h-9 w-9 text-ink-muted" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{t.teams.eyebrow}</p>
          <h1 className="mt-1 flex items-center gap-2 font-serif text-3xl font-bold text-ink">
            {name}
            {team.isVerified && <BadgeCheck className="h-6 w-6 text-success" aria-label={t.workers.verified} />}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
            {team.city && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {team.city}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Star className="h-3.5 w-3.5 fill-warning text-warning" />
              {Number(team.rating ?? 5).toFixed(1)} · {team.reviewCount ?? 0}
            </span>
            {team.completedJobs ? (
              <span className="flex items-center gap-1">
                <Briefcase className="h-3.5 w-3.5" />
                {team.completedJobs} {t.teams.jobsDone}
              </span>
            ) : null}
            {team.phone && (
              <a href={`tel:${team.phone}`} className="flex items-center gap-1 hover:text-ink">
                <Phone className="h-3.5 w-3.5" />
                {team.phone}
              </a>
            )}
          </p>
        </div>
        <BookingDialog teamId={team.id} workerName={name} label={t.teams.hire} />
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-8">
          {description && <p className="max-w-2xl leading-relaxed text-ink-soft">{description}</p>}

          <section>
            <h2 className="font-serif text-xl font-semibold text-ink">{t.teams.membersTitle}</h2>
            <p className="mt-1 text-sm text-ink-muted">{fill(t.teams.membersSubtitle, { n: members.length })}</p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {members.map((m) => (
                <li key={m.workerId} className="flex items-center gap-3 border border-line bg-bg-surface p-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-white text-xs font-semibold text-ink">
                    {m.avatarUrl ? <Image src={m.avatarUrl} alt="" width={40} height={40} className="h-full w-full object-cover" /> : m.nameKa.slice(0, 1)}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 truncate text-sm font-medium text-ink">
                      {/* A member's own page exists only while the workers' directory does. */}
                      {WORKERS_DIRECTORY ? (
                        <Link href={`/workers/${m.workerId}`} className="truncate hover:text-brand">
                          {localizedName(locale, m)}
                        </Link>
                      ) : (
                        <span className="truncate">{localizedName(locale, m)}</span>
                      )}
                      {m.isLead && <span className="shrink-0 border border-ink px-1 text-[10px] uppercase tracking-wide">{t.teams.lead}</span>}
                    </span>
                    <span className="block truncate text-xs text-ink-muted">{workerSpecialtyLabel(t, m.specialtySlug)}</span>
                  </span>
                </li>
              ))}
              {members.length === 0 && <li className="text-sm text-ink-muted">{t.teams.noMembers}</li>}
            </ul>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="border border-line bg-bg-surface p-5">
            <p className="eyebrow">{t.teams.coversTitle}</p>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {trades.map((s) => (
                <li key={s} className="border border-line px-2 py-1 text-xs text-ink-soft">
                  {workerSpecialtyLabel(t, s)}
                </li>
              ))}
            </ul>
            {team.markupPct && Number(team.markupPct) > 0 && <p className="mt-4 text-xs text-ink-muted">{fill(t.teams.markupHint, { pct: Number(team.markupPct) })}</p>}
            {team.experienceYears ? <p className="mt-2 text-xs text-ink-muted">{t.workers.experienceLabel}: {team.experienceYears}</p> : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
