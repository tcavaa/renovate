import Link from 'next/link';
import Image from '@/components/ui/image';
import { BadgeCheck, MapPin, Star, UsersRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { localizedName, workerSpecialtyLabel, type Locale } from '@/lib/i18n/labels';
import type { Dictionary } from '@/lib/i18n';
import type { TeamListRow } from '@/lib/teams/queries';

/**
 * One brigade in the directory: who they are, the trades they bring, and — when a job was
 * asked about — how much of it they cover. A team that covers only part of a job is still
 * shown, with the gap named, because half a brigade plus one trade is a real way to hire.
 */
export function TeamCard({ row, t, locale, needed = [] }: { row: TeamListRow; t: Dictionary; locale: Locale; needed?: string[] }) {
  const { team, members, trades } = row;
  const missing = needed.filter((slug) => !trades.includes(slug));
  return (
    <article className="flex flex-col rounded-2xl border border-line bg-bg-surface p-5 transition-[border-color,box-shadow] hover:border-ink hover:shadow-cardHover">
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-mist-light">
          {team.logoUrl ? <Image src={team.logoUrl} alt="" width={48} height={48} className="h-full w-full object-cover" /> : <UsersRound className="h-6 w-6 text-ink" />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-1.5 font-display text-lg leading-tight text-ink">
            <Link href={`/teams/${team.slug}`} className="underline-offset-4 hover:underline">
              {localizedName(locale, team)}
            </Link>
            {team.isVerified && <BadgeCheck className="h-4 w-4 shrink-0 text-success" aria-label={t.workers.verified} />}
          </h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-muted">
            {team.city && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {team.city}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-sun text-sun" />
              {Number(team.rating ?? 5).toFixed(1)}
            </span>
            <span>{members.length} {t.teams.membersCount}</span>
          </p>
        </div>
      </div>

      <ul className="mt-3 flex flex-wrap gap-1.5">
        {trades.map((slug) => (
          <li key={slug} className={cn('rounded-full px-2.5 py-1 text-[11px] font-medium', needed.includes(slug) ? 'bg-lime font-semibold text-ink' : 'bg-mist-light text-ink-soft')}>
            {workerSpecialtyLabel(t, slug)}
          </li>
        ))}
        {trades.length === 0 && <li className="text-[11px] text-ink-muted">{t.teams.noMembers}</li>}
      </ul>

      {needed.length > 0 && (
        <p className={cn('mt-3 text-xs font-medium', missing.length === 0 ? 'text-success' : 'text-warning')}>
          {missing.length === 0
            ? t.teams.coversAll
            : `${t.teams.missingTrades}: ${missing.map((slug) => workerSpecialtyLabel(t, slug)).join(', ')}`}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-3 pt-4">
        <span className="text-xs text-ink-muted">{team.completedJobs ? `${team.completedJobs} ${t.teams.jobsDone}` : (team.leadName ?? '')}</span>
        <Link href={`/teams/${team.slug}`} className="inline-flex h-9 items-center rounded-full bg-ink px-4 text-sm font-semibold text-white transition-colors hover:bg-lime hover:text-ink">
          {t.teams.open} →
        </Link>
      </div>
    </article>
  );
}
