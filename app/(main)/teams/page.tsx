import type { Metadata } from 'next';
import Link from 'next/link';
import { UsersRound } from 'lucide-react';
import { TeamCard } from '@/components/teams/TeamCard';
import { listTeams, teamCities } from '@/lib/teams/queries';
import { getLocale, getT } from '@/lib/i18n/server';
import { hrefWith } from '@/lib/admin/list';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'ბრიგადები' };

/**
 * The brigade directory. A renovation is hired as a team, not as a row of separate trades,
 * so this is where a customer comes with a finished project: search, a city, and — when the
 * link carried `?covers=` from the design's last step — the teams that cover the job first.
 */
export default async function TeamsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const t = await getT();
  const locale = await getLocale();
  const one = (key: string) => (Array.isArray(params[key]) ? params[key][0] : params[key]) ?? null;
  /** The query as flat strings, so every filter link keeps the others. */
  const raw = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v[0] : (v ?? '')]));
  const city = one('city');
  const search = one('q');
  const verified = one('verified') === 'yes';
  const covers = (one('covers') ?? '').split(',').filter(Boolean);

  const [teams, cities] = await Promise.all([listTeams({ city, search, covers, verifiedOnly: verified }), teamCities()]);

  return (
    <div className="container py-10 md:py-14">
      <header className="relative overflow-hidden rounded-3xl bg-sand-light px-6 py-8 md:px-10 md:py-10">
        <div className="relative z-10 max-w-2xl">
          <p className="eyebrow flex items-center gap-1.5">
            <UsersRound className="h-3.5 w-3.5 text-wood" />
            {t.teams.eyebrow}
          </p>
          <h1 className="display mt-3 text-display-md text-ink">{t.teams.title}</h1>
          <p className="mt-3 text-ink-muted">{t.teams.subtitle}</p>
        </div>
        {/* A quiet brand corner: an olive arch over a wood plinth. */}
        <span className="pointer-events-none absolute bottom-0 right-12 hidden h-[78%] w-28 lg:block" aria-hidden>
          <span className="arch absolute inset-0 bg-olive" />
          <span className="absolute left-1/2 top-[22%] h-9 w-9 -translate-x-1/2 rounded-full bg-sand" />
          <span className="absolute -left-10 bottom-0 h-[30%] w-14 rounded-t-xl bg-wood" />
          <span className="absolute -right-6 bottom-0 h-[20%] w-10 rounded-t-xl bg-brand" />
        </span>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <form action="/teams" className="flex overflow-hidden rounded-full border border-line bg-bg-surface focus-within:border-ink/40">
            <input type="search" name="q" defaultValue={search ?? ''} placeholder={t.teams.searchPlaceholder} className="h-10 min-w-0 flex-1 bg-transparent pl-4 pr-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none" />
            {city && <input type="hidden" name="city" value={city} />}
            {covers.length > 0 && <input type="hidden" name="covers" value={covers.join(',')} />}
            <button type="submit" className="m-1 h-8 shrink-0 rounded-full bg-ink px-4 text-xs font-semibold text-white transition-colors hover:bg-brand">
              {t.common.search}
            </button>
          </form>

          <nav className="space-y-0.5">
            <p className="eyebrow mb-2 px-3">{t.workers.city}</p>
            <Link href={hrefWith('/teams', raw, { city: undefined })} aria-current={!city ? 'page' : undefined} className={cn('flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors', !city ? 'bg-sand font-medium text-ink' : 'text-ink-soft hover:bg-sand/50 hover:text-ink')}>
              {!city && <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />}
              {t.common.all}
            </Link>
            {cities.map((name) => (
              <Link key={name} href={hrefWith('/teams', raw, { city: name })} aria-current={city === name ? 'page' : undefined} className={cn('flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors', city === name ? 'bg-sand font-medium text-ink' : 'text-ink-soft hover:bg-sand/50 hover:text-ink')}>
                {city === name && <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />}
                {name}
              </Link>
            ))}
          </nav>

          <Link href={hrefWith('/teams', raw, { verified: verified ? undefined : 'yes' })} className={cn('flex h-10 items-center rounded-full border px-4 text-sm transition-colors', verified ? 'border-olive bg-olive text-sand-light' : 'border-ink/15 text-ink-soft hover:border-ink/40 hover:bg-bg-surface')}>
            {t.workers.verifiedOnly}
          </Link>
        </aside>

        <div>
          <p className="mb-4 text-sm text-ink-muted">{teams.length} {t.teams.found}</p>
          {teams.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-stone bg-sand-light/60 p-10 text-center text-sm text-ink-muted">{t.teams.empty}</p>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2">
              {teams.map((row) => (
                <TeamCard key={row.team.id} row={row} t={t} locale={locale} needed={covers} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
