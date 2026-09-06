import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { CountUp } from '@/components/motion/CountUp';
import type { Dictionary } from '@/lib/i18n';

/**
 * The calculator, in one dark band with live figures from the database. The numbers are
 * real counts, so a partner who adds products sees the landing page change.
 */
export function StatsBand({ t, products, stores }: { t: Dictionary; products: number; stores: number }) {
  const stats = [
    { value: products, suffix: '+', label: t.landing.statsProducts },
    { value: stores, suffix: '', label: t.landing.statsStores },
    { value: 18, suffix: '', label: t.landing.statsPhases },
    { value: 4, suffix: '', label: t.landing.statsStyles },
  ];
  return (
    <section className="relative overflow-hidden bg-bg-deep text-white">
      <div className="grain relative">
        <div className="container py-24 md:py-32">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
            <div>
              <p className="eyebrow reveal text-white/50">{t.nav.calculator}</p>
              <h2 className="reveal mt-4 text-display-md font-bold">{t.landing.statsTitle}</h2>
              <p className="reveal mt-5 max-w-lg text-lg leading-relaxed text-white/70">{t.landing.statsBody}</p>
              <Link
                href="/calculator"
                className="group reveal mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-sm font-medium text-ink transition-colors hover:bg-brand hover:text-white"
              >
                {t.landing.statsCta}
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
            </div>
            <dl className="reveal-stagger grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10">
              {stats.map((s) => (
                <div key={s.label} className="bg-bg-deep p-7 md:p-9">
                  <dt className="text-xs uppercase tracking-[0.16em] text-white/50">{s.label}</dt>
                  <dd className="mt-3 font-serif text-5xl font-bold md:text-6xl">
                    <CountUp value={s.value} suffix={s.suffix} />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}
