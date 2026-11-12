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
      <header className="relative overflow-hidden rounded-3xl bg-mist-light px-6 py-8 md:px-10 md:py-10">
        <div className="relative z-10 max-w-2xl">
          <p className="inline-flex items-center gap-2 rounded-full bg-bg-surface px-3 py-1.5 text-xs font-semibold text-ink">
            <UsersRound className="h-3.5 w-3.5" />
            {t.teams.eyebrow}
          </p>
          <h1 className="display mt-4 text-display-md text-ink">{t.teams.title}</h1>
          <p className="mt-3 text-base text-ink-muted">{t.teams.subtitle}</p>
        </div>
        {/* The brand corner: a cobalt slab, a lime half circle, a coral disc and a sun square. */}
        <span className="pointer-events-none absolute inset-y-0 right-0 hidden w-72 lg:block" aria-hidden>
          <span className="absolute bottom-0 left-4 h-[70%] w-20 bg-cobalt" />
          <span className="absolute bottom-0 right-8 h-[58%] w-32 rounded-t-full bg-lime" />
          <span className="absolute bottom-6 left-16 h-16 w-16 rounded-full bg-coral" />
          <span className="absolute right-6 top-6 h-9 w-9 bg-sun" />
        </span>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <form action="/teams" className="flex overflow-hidden rounded-full border border-transparent bg-mist-light transition-colors focus-within:border-ink focus-within:bg-bg-surface focus-within:ring-[3px] focus-within:ring-lime">
            <input type="search" name="q" defaultValue={search ?? ''} placeholder={t.teams.searchPlaceholder} className="h-10 min-w-0 flex-1 bg-transparent pl-4 pr-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none" />
            {city && <input type="hidden" name="city" value={city} />}
            {covers.length > 0 && <input type="hidden" name="covers" value={covers.join(',')} />}
            <button type="submit" className="m-1 h-8 shrink-0 rounded-full bg-ink px-4 text-xs font-semibold text-white transition-colors hover:bg-lime hover:text-ink">
              {t.common.search}
            </button>
          </form>

          <nav className="space-y-0.5">
            <p className="eyebrow mb-2 px-3">{t.workers.city}</p>
            <Link href={hrefWith('/teams', raw, { city: undefined })} aria-current={!city ? 'page' : undefined} className={cn('flex items-center gap-2 rounded-full px-3 py-2 text-sm transition-colors', !city ? 'bg-lime font-semibold text-ink' : 'text-ink-soft hover:bg-mist-light hover:text-ink')}>
              {t.common.all}
            </Link>
            {cities.map((name) => (
              <Link key={name} href={hrefWith('/teams', raw, { city: name })} aria-current={city === name ? 'page' : undefined} className={cn('flex items-center gap-2 rounded-full px-3 py-2 text-sm transition-colors', city === name ? 'bg-lime font-semibold text-ink' : 'text-ink-soft hover:bg-mist-light hover:text-ink')}>
                {name}
              </Link>
            ))}
          </nav>

          <Link href={hrefWith('/teams', raw, { verified: verified ? undefined : 'yes' })} className={cn('flex h-10 items-center rounded-full px-4 text-sm font-semibold transition-colors', verified ? 'bg-ink text-white' : 'bg-mist-light text-ink hover:bg-mist')}>
            {t.workers.verifiedOnly}
          </Link>
        </aside>

        <div>
          <p className="mb-4 text-sm font-medium text-ink-muted">{teams.length} {t.teams.found}</p>
          {teams.length === 0 ? (
            <p className="dots rounded-2xl bg-mist-light p-10 text-center text-sm font-medium text-ink-muted">{t.teams.empty}</p>
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
