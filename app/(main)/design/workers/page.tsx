'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, HardHat } from 'lucide-react';
import { DesignSteps } from '@/components/design/DesignSteps';
import { StepHeader } from '@/components/flow/StepHeader';
import { StepNav } from '@/components/flow/StepNav';
import { StageBrief } from '@/components/flow/StageBrief';
import { EmptyStep } from '@/components/flow/EmptyStep';
import { WorkerCard } from '@/components/workers/WorkerCard';
import { useDesignStore } from '@/store/designStore';
import { useRateBook } from '@/hooks/useRateBook';
import { useLocale, useT } from '@/lib/i18n/client';
import { workerSpecialtyLabel, workTypeLabel } from '@/lib/i18n/labels';
import { priceScene } from '@/lib/design/pricing';
import { tradesNeeded, TRADE_SLUGS, type TradeSlug } from '@/lib/design/trades';
import { formatGEL } from '@/lib/utils';
import type { Worker } from '@/lib/db/schema';

/**
 * Step 8: the team. The trades the budget's labour lines call for, each with what it is
 * worth in this project and the workers who do it — the profile opens in the directory,
 * where the booking dialog carries the project along.
 */
export default function WorkersStepPage() {
  const t = useT();
  const locale = useLocale();
  const { plan, styleId, mode, budgetGel, items, finishes, electrical, styleProfile, homeState } = useDesignStore();
  const { book } = useRateBook();
  const [workers, setWorkers] = useState<Record<string, Worker[]>>({});
  const [loading, setLoading] = useState(true);

  const scene = useMemo(() => ({ styleId, mode, budgetGel, items, finishes, electrical, styleProfile }), [styleId, mode, budgetGel, items, finishes, electrical, styleProfile]);
  const cost = useMemo(() => (plan ? priceScene(plan, scene, { homeState: homeState ?? undefined, book, locale }) : null), [plan, scene, homeState, book, locale]);
  const trades = useMemo(() => (cost ? tradesNeeded(cost) : []), [cost]);
  const slugs: TradeSlug[] = trades.length > 0 ? trades.map((n) => n.slug) : TRADE_SLUGS;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all(
      slugs.map((slug) =>
        fetch(`/api/workers?specialty=${slug}`)
          .then((r) => r.json())
          .then((json: { data: Worker[] | null }) => [slug, (json.data ?? []).slice(0, 3)] as const)
          .catch(() => [slug, []] as const)
      )
    ).then((entries) => {
      if (cancelled) return;
      setWorkers(Object.fromEntries(entries));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // Only the set of trades matters, not the array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slugs.join(',')]);

  if (!plan || !cost) {
    return (
      <>
        <DesignSteps current={8} />
        <EmptyStep message={t.design.needPlanDesc} back={t.design.startOver} href="/design" />
      </>
    );
  }

  return (
    <>
      <DesignSteps current={8} />
      <div className="container py-10 md:py-14">
        <StepHeader step={8} total={8} title={t.build.workersTitle} subtitle={t.build.workersSubtitle} />
        <StageBrief step={8} className="mt-6" />

        {trades.length === 0 && <p className="mt-8 rounded-[12px] border border-dashed border-line p-6 text-center text-sm text-ink-muted">{t.build.noTrades}</p>}

        <div className="mt-8 space-y-10">
          {slugs.map((slug) => {
            const need = trades.find((n) => n.slug === slug);
            const list = workers[slug] ?? [];
            return (
              <section key={slug}>
                <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
                  <div>
                    <p className="eyebrow flex items-center gap-1.5">
                      <HardHat className="h-3.5 w-3.5" />
                      {t.build.tradeNeeded}
                    </p>
                    <h2 className="mt-1 font-serif text-2xl font-semibold text-ink">{workerSpecialtyLabel(t, slug)}</h2>
                    {need && (
                      <p className="mt-1 text-xs text-ink-muted">
                        {need.lines.map((l) => workTypeLabel(t, l.key)).join(' · ')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    {need && (
                      <p className="text-sm text-ink-muted">
                        {t.build.estimateFor}: <span className="font-serif text-lg font-semibold text-ink">{formatGEL(need.total)}</span>
                      </p>
                    )}
                    <Link href={`/workers?specialty=${slug}`} className="bracket-link text-sm font-medium text-ink hover:text-brand">
                      {t.build.viewAll}
                    </Link>
                  </div>
                </div>
                {loading ? (
                  <p className="py-8 text-center text-sm text-ink-muted">{t.common.loading}</p>
                ) : list.length === 0 ? (
                  <p className="py-8 text-center text-sm text-ink-muted">{t.build.noWorkersYet}</p>
                ) : (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {list.map((w) => (
                      <WorkerCard key={w.id} worker={w} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>

      <StepNav back={{ href: '/design/summary', label: t.calculator.backButton }} next={{ label: t.workers.title, href: '/workers', icon: <ArrowUpRight className="h-4 w-4" /> }} />
    </>
  );
}
