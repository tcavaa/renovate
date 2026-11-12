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
  const tiles = ['bg-lime', 'bg-lilac', 'bg-white', 'bg-tangerine'];
  return (
    <section className="relative overflow-clip bg-bg-deep text-white">
      <div className="container relative py-24 md:py-28">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
          <div>
            <p className="reveal inline-flex items-center gap-2 rounded-full bg-white/10 py-1.5 pl-2.5 pr-3.5 text-xs font-semibold text-white">
              <span className="h-2 w-2 bg-lime" aria-hidden />
              {t.nav.calculator}
            </p>
            <h2 className="display reveal mt-5 text-display-md text-white">{t.landing.statsTitle}</h2>
            <p className="reveal mt-5 max-w-lg text-lg leading-relaxed text-white/65">{t.landing.statsBody}</p>
            <Link
              href="/calculator"
              className="group reveal mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-lime px-6 text-sm font-bold text-ink transition-colors hover:bg-white"
            >
              {t.landing.statsCta}
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
          </div>
          {/* The four figures, each on a block of its own colour. */}
          <dl className="reveal-stagger grid grid-cols-2 gap-3 md:gap-4">
            {stats.map((s, i) => (
              <div key={s.label} className={`rounded-3xl p-6 text-ink md:p-8 ${tiles[i % tiles.length]}`}>
                <dt className="text-xs font-bold uppercase tracking-[0.06em] text-ink/70">{s.label}</dt>
                <dd className="display mt-3 text-5xl tabular-nums md:text-7xl">
                  <CountUp value={s.value} suffix={s.suffix} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
