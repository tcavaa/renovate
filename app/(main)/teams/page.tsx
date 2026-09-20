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
      <header className="max-w-2xl">
        <p className="eyebrow flex items-center gap-1.5">
          <UsersRound className="h-3.5 w-3.5" />
          {t.teams.eyebrow}
        </p>
        <h1 className="display mt-2 text-display-md">{t.teams.title}</h1>
        <p className="mt-3 text-ink-muted">{t.teams.subtitle}</p>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <form action="/teams" className="flex gap-2">
            <input type="search" name="q" defaultValue={search ?? ''} placeholder={t.teams.searchPlaceholder} className="h-10 min-w-0 flex-1 border border-line bg-white px-3 text-sm" />
            {city && <input type="hidden" name="city" value={city} />}
            {covers.length > 0 && <input type="hidden" name="covers" value={covers.join(',')} />}
            <button type="submit" className="h-10 shrink-0 bg-ink px-3 text-xs font-semibold text-white hover:bg-brand">
              {t.common.search}
            </button>
          </form>

          <nav className="space-y-1">
            <p className="eyebrow">{t.workers.city}</p>
            <Link href={hrefWith('/teams', raw, { city: undefined })} aria-current={!city ? 'page' : undefined} className={cn('block px-2 py-1 text-sm', !city ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink')}>
              {t.common.all}
            </Link>
            {cities.map((name) => (
              <Link key={name} href={hrefWith('/teams', raw, { city: name })} aria-current={city === name ? 'page' : undefined} className={cn('block px-2 py-1 text-sm', city === name ? 'bg-ink text-white' : 'text-ink-soft hover:text-ink')}>
                {name}
              </Link>
            ))}
          </nav>

          <Link href={hrefWith('/teams', raw, { verified: verified ? undefined : 'yes' })} className={cn('block border px-3 py-2 text-sm', verified ? 'border-ink bg-ink text-white' : 'border-line text-ink-soft hover:border-ink')}>
            {t.workers.verifiedOnly}
          </Link>
        </aside>

        <div>
          <p className="mb-4 text-sm text-ink-muted">{teams.length} {t.teams.found}</p>
          {teams.length === 0 ? (
            <p className="border border-dashed border-line p-8 text-center text-sm text-ink-muted">{t.teams.empty}</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
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
