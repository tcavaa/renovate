'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ArrowUpRight, CheckCircle2, Clock, HardHat, UsersRound, XCircle } from 'lucide-react';
import { DesignSteps } from '@/components/design/DesignSteps';
import { StepHeader } from '@/components/flow/StepHeader';
import { StepNav } from '@/components/flow/StepNav';
import { StageBrief } from '@/components/flow/StageBrief';
import { EmptyStep } from '@/components/flow/EmptyStep';
import { BookingDialog } from '@/components/checkout/BookingDialog';
import { useDesignStore } from '@/store/designStore';
import { useProjectId } from '@/components/projects/ProjectGate';
import { useRateBook } from '@/hooks/useRateBook';
import { useLocale, useT } from '@/lib/i18n/client';
import { localizedName, orderStatusLabel, workerSpecialtyLabel, workTypeLabel } from '@/lib/i18n/labels';
import { saveDesign } from '@/lib/design/saveDesign';
import type { OrderStatus } from '@/lib/finance/money';
import { priceScene } from '@/lib/design/pricing';
import { designStepHref, designStepPosition } from '@/lib/design/steps';
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
  available: boolean;
  openJobs: number;
}

/** A job already sent to a brigade for this project, and what the brigade answered. */
interface SentBooking {
  id: number;
  teamId: number | null;
  status: OrderStatus;
  partnerMessage: string | null;
}

/**
 * Step 8: the brigade.
 *
 * A renovation is hired as a team, not as a row of separate trades — so this asks the
 * budget which trades the job needs and then shows the brigades that cover them: the ones
 * free to start first, and among those the ones that cover all of it. The trades themselves
 * are listed above with what each is worth in this project, because that is what the
 * customer is being quoted for; a gap in a team's cover is named rather than hidden.
 *
 * Choosing a brigade sends it *this* project — saved on the spot if it has to be — with the
 * labour exactly as it was left on the budget: a phase ticked off there is not asked for
 * here, a quantity changed there is the quantity sent. The order lands in the brigade's own
 * account (`/partner`), where it is accepted or turned down, and the card says which the
 * next time this page is opened.
 */
export default function TeamsStepPage() {
  const t = useT();
  const locale = useLocale();
  const { plan, styleId, mode, budgetGel, items, finishes, electrical, styleProfile, homeState, excluded, quantities } = useDesignStore();
  const projectId = useProjectId();
  const { book } = useRateBook();
  const { status } = useSession();
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sent, setSent] = useState<SentBooking[]>([]);

  const scene = useMemo(() => ({ styleId, mode, budgetGel, items, finishes, electrical, styleProfile, excluded, quantities }), [styleId, mode, budgetGel, items, finishes, electrical, styleProfile, excluded, quantities]);
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

  // What this project has already been sent to, and what each brigade answered.
  const loadSent = useCallback(() => {
    if (status !== 'authenticated') return;
    fetch(`/api/bookings?projectId=${projectId}`)
      .then((r) => r.json())
      .then((json: { data: SentBooking[] | null }) => setSent(json.data ?? []))
      .catch(() => undefined);
  }, [status, projectId]);
  useEffect(loadSent, [loadSent]);

  /** The design written into the project's row first, so the booking carries the labour as it stands. */
  const ensureProject = useCallback(async () => (await saveDesign({ draft: true })).id, []);

  if (!plan || !cost) {
    return (
      <>
        <DesignSteps current={8} />
        <EmptyStep message={t.design.needPlanDesc} back={t.design.addPlan} href={designStepHref(projectId, 1)} />
      </>
    );
  }

  const labourTotal = trades.reduce((s, n) => s + n.total, 0);
  const labourLines = cost.lines.filter((l) => l.section === 'labour' && !l.excluded && l.total > 0);
  const labourSum = Math.round(labourLines.reduce((s, l) => s + l.total, 0) * 100) / 100;
  /** The latest booking sent to a brigade — a turned-down one can be sent again, or elsewhere. */
  const bookingOf = (teamId: number) => sent.find((b) => b.teamId === teamId) ?? null;
  const isLive = (teamId: number) => {
    const booking = bookingOf(teamId);
    return !!booking && booking.status !== 'cancelled';
  };
  const taken = sent.some((b) => b.teamId != null && b.status !== 'cancelled');

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
              <p className="mt-1 max-w-2xl text-sm text-ink-muted">{t.teams.chooseHint}</p>
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
              {/* The brigade this project went to stands first — it is "busy" with this very job. */}
              {[...teams].sort((a, b) => Number(isLive(b.id)) - Number(isLive(a.id))).map((team) => {
                const missing = slugs.filter((s) => !team.trades.includes(s));
                const booking = bookingOf(team.id);
                const live = booking && booking.status !== 'cancelled';
                return (
                  <article key={team.id} className={cn('flex flex-col border bg-bg-surface p-5', live ? 'border-ink' : 'border-line')}>
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-serif text-lg font-semibold leading-tight text-ink">
                        <Link href={`/teams/${team.slug}`} className="hover:text-brand">
                          {localizedName(locale, team)}
                        </Link>
                      </h3>
                      <span
                        title={team.available ? undefined : fill(t.teams.busyHint, { n: team.openJobs })}
                        className={cn('shrink-0 border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]', team.available ? 'border-success/50 text-success' : 'border-line text-ink-muted')}
                      >
                        {team.available ? t.teams.available : t.teams.busy}
                      </span>
                    </div>
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
                      {booking && (
                        <div className={cn('mb-3 border-l-2 pl-3 text-xs', booking.status === 'cancelled' ? 'border-danger text-danger' : booking.status === 'new' ? 'border-warning text-ink' : 'border-success text-ink')}>
                          <p className="flex items-center gap-1.5 font-medium">
                            {booking.status === 'cancelled' ? <XCircle className="h-3.5 w-3.5" /> : booking.status === 'new' ? <Clock className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5 text-success" />}
                            {fill(t.teams.sentTo, { id: booking.id })} · {orderStatusLabel(t, booking.status)}
                          </p>
                          <p className="mt-0.5 text-ink-muted">{booking.status === 'cancelled' ? t.teams.declined : booking.partnerMessage || t.teams.sentHint}</p>
                        </div>
                      )}
                      {!live && (
                        <BookingDialog
                          teamId={team.id}
                          workerName={localizedName(locale, team)}
                          label={t.teams.choose}
                          variant={team.available && !taken ? 'ink' : 'outline'}
                          disabled={!team.available}
                          project={{ ensure: ensureProject, lines: labourLines.length, total: labourSum }}
                          onBooked={(orderId) => {
                            setSent((list) => [{ id: orderId, teamId: team.id, status: 'new', partnerMessage: null }, ...list]);
                            loadSent();
                          }}
                        />
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <StepNav back={{ href: designStepHref(projectId, 7), label: t.calculator.backButton }} next={{ label: t.teams.seeAll, href: `/teams?covers=${encodeURIComponent(covers)}`, icon: <ArrowUpRight className="h-4 w-4" /> }} />
    </>
  );
}
