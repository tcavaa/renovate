'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, HardHat, UsersRound } from 'lucide-react';
import { DesignSteps } from '@/components/design/DesignSteps';
import { StepHeader } from '@/components/flow/StepHeader';
import { StepNav } from '@/components/flow/StepNav';
import { StageBrief } from '@/components/flow/StageBrief';
import { EmptyStep } from '@/components/flow/EmptyStep';
import { BookingDialog } from '@/components/checkout/BookingDialog';
import { useDesignStore } from '@/store/designStore';
import { useRateBook } from '@/hooks/useRateBook';
import { useLocale, useT } from '@/lib/i18n/client';
import { localizedName, workerSpecialtyLabel, workTypeLabel } from '@/lib/i18n/labels';
import { priceScene } from '@/lib/design/pricing';
import { designStepPosition } from '@/lib/design/steps';
import { tradesNeeded, TRADE_SLUGS, type TradeSlug } from '@/lib/design/trades';
import { fill } from '@/lib/admin/list';
import { cn, formatGEL } from '@/lib/utils';

interface TeamRow {
  id: number;
  slug: string;
  nameKa: string;
  nameEn: string | null;
  nameRu: string | null;
  city: string | null;
  rating: string | null;
  completedJobs: number | null;
  isVerified: boolean;
  leadName: string | null;
  trades: string[];
  memberCount: number;
  covered: number;
}

/**
 * Step 8: the brigade.
 *
 * A renovation is hired as a team, not as a row of separate trades — so this asks the
 * budget which trades the job needs and then shows the brigades that cover them, the ones
 * that cover all of it first. The trades themselves are listed underneath with what each is
 * worth in this project, because that is what the customer is being quoted for; a gap in a
 * team's cover is named rather than hidden.
 */
export default function TeamsStepPage() {
  const t = useT();
  const locale = useLocale();
  const { plan, styleId, mode, budgetGel, items, finishes, electrical, styleProfile, homeState, excluded } = useDesignStore();
  const { book } = useRateBook();
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);

  const scene = useMemo(() => ({ styleId, mode, budgetGel, items, finishes, electrical, styleProfile, excluded }), [styleId, mode, budgetGel, items, finishes, electrical, styleProfile, excluded]);
  const cost = useMemo(() => (plan ? priceScene(plan, scene, { homeState: homeState ?? undefined, book, locale }) : null), [plan, scene, homeState, book, locale]);
  const trades = useMemo(() => (cost ? tradesNeeded(cost) : []), [cost]);
  const slugs: TradeSlug[] = trades.length > 0 ? trades.map((n) => n.slug) : TRADE_SLUGS;
  const covers = slugs.join(',');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/teams?covers=${encodeURIComponent(covers)}&limit=9`)
      .then((r) => r.json())
      .then((json: { data: TeamRow[] | null }) => {
        if (cancelled) return;
        setTeams(json.data ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [covers]);

  if (!plan || !cost) {
    return (
      <>
        <DesignSteps current={8} />
        <EmptyStep message={t.design.needPlanDesc} back={t.design.startOver} href="/design" />
      </>
    );
  }

  const labourTotal = trades.reduce((s, n) => s + n.total, 0);

  return (
    <>
      <DesignSteps current={8} />
      <div className="container py-10 md:py-14">
        <StepHeader step={designStepPosition(8, homeState, mode)} total={8} title={t.teams.title} subtitle={t.teams.subtitle} />
        <StageBrief step={8} className="mt-6" />

        {/* The trades the estimate calls for: what the brigade is being asked to do. */}
        <section className="mt-8 border border-line bg-bg-surface p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow flex items-center gap-1.5">
                <HardHat className="h-3.5 w-3.5" />
                {t.build.tradeNeeded}
              </p>
              <h2 className="mt-1 font-serif text-xl font-semibold text-ink">{fill(t.teams.membersSubtitle, { n: slugs.length })}</h2>
            </div>
            {labourTotal > 0 && (
              <p className="text-sm text-ink-muted">
                {t.build.estimateFor}: <span className="font-serif text-lg font-semibold text-ink">{formatGEL(labourTotal)}</span>
              </p>
            )}
          </div>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {slugs.map((slug) => {
              const need = trades.find((n) => n.slug === slug);
              return (
                <li key={slug} className="border border-line bg-white p-3">
                  <p className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium text-ink">{workerSpecialtyLabel(t, slug)}</span>
                    {need && <span className="shrink-0 font-serif text-sm font-semibold tabular-nums text-ink">{formatGEL(need.total)}</span>}
                  </p>
                  {need && <p className="mt-0.5 truncate text-[11px] text-ink-muted">{need.lines.map((l) => workTypeLabel(t, l.key)).join(' · ')}</p>}
                </li>
              );
            })}
          </ul>
          {trades.length === 0 && <p className="mt-4 text-sm text-ink-muted">{t.build.noTrades}</p>}
        </section>

        {/* The brigades that can take it on. */}
        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
            <div>
              <p className="eyebrow flex items-center gap-1.5">
                <UsersRound className="h-3.5 w-3.5" />
                {t.teams.forProject}
              </p>
              <h2 className="mt-1 font-serif text-2xl font-semibold text-ink">{t.teams.title}</h2>
              <p className="mt-1 text-sm text-ink-muted">{t.teams.forProjectHint}</p>
            </div>
            <Link href={`/teams?covers=${encodeURIComponent(covers)}`} className="bracket-link text-sm font-medium text-ink hover:text-brand">
              {t.teams.seeAll}
            </Link>
          </div>

          {loading ? (
            <p className="py-10 text-center text-sm text-ink-muted">{t.common.loading}</p>
          ) : teams.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-muted">{t.teams.empty}</p>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {teams.map((team) => {
                const missing = slugs.filter((s) => !team.trades.includes(s));
                return (
                  <article key={team.id} className="flex flex-col border border-line bg-bg-surface p-5">
                    <h3 className="font-serif text-lg font-semibold leading-tight text-ink">
                      <Link href={`/teams/${team.slug}`} className="hover:text-brand">
                        {localizedName(locale, team)}
                      </Link>
                    </h3>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {[team.city, team.leadName, `${team.memberCount} ${t.teams.membersCount}`].filter(Boolean).join(' · ')}
                    </p>
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {team.trades.map((slug) => (
                        <li key={slug} className={cn('border px-2 py-0.5 text-[11px]', slugs.includes(slug as TradeSlug) ? 'border-success/50 bg-success/10 text-success' : 'border-line text-ink-soft')}>
                          {workerSpecialtyLabel(t, slug)}
                        </li>
                      ))}
                    </ul>
                    <p className={cn('mt-3 text-xs font-medium', missing.length === 0 ? 'text-success' : 'text-warning')}>
                      {missing.length === 0 ? t.teams.coversAll : `${t.teams.missingTrades}: ${missing.map((s) => workerSpecialtyLabel(t, s)).join(', ')}`}
                    </p>
                    <div className="mt-auto pt-4">
                      <BookingDialog teamId={team.id} workerName={localizedName(locale, team)} label={t.teams.hire} />
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <StepNav back={{ href: '/design/summary', label: t.calculator.backButton }} next={{ label: t.teams.seeAll, href: `/teams?covers=${encodeURIComponent(covers)}`, icon: <ArrowUpRight className="h-4 w-4" /> }} />
    </>
  );
}
