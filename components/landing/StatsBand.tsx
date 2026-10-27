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
    <section className="relative overflow-clip bg-bg-deep text-sand-light">
      {/* The brand board's six swatches as the band's edge, as on the footer. */}
      <div className="grid h-1.5 grid-cols-6" aria-hidden>
        <span className="bg-sand" />
        <span className="bg-stone" />
        <span className="bg-wood" />
        <span className="bg-brand" />
        <span className="bg-olive-light" />
        <span className="bg-charcoal" />
      </div>
      <div className="grain relative">
        {/* An arch of olive light behind the figures. */}
        <span className="arch pointer-events-none absolute -bottom-24 right-[6%] hidden h-[85%] w-[34%] bg-olive-light/15 lg:block" aria-hidden />
        <div className="container relative py-24 md:py-32">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
            <div>
              <p className="eyebrow reveal flex items-center gap-3 text-sand-light/55">
                <span className="h-px w-8 bg-wood-light" aria-hidden />
                {t.nav.calculator}
              </p>
              <h2 className="display reveal mt-5 text-display-md tracking-[0.04em] text-sand-light">{t.landing.statsTitle}</h2>
              <p className="reveal mt-5 max-w-lg text-lg leading-relaxed text-sand-light/70">{t.landing.statsBody}</p>
              <Link
                href="/calculator"
                className="group reveal mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-sand-light px-6 text-sm font-medium text-ink transition-colors hover:bg-brand hover:text-white"
              >
                {t.landing.statsCta}
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
            </div>
            <dl className="reveal-stagger grid grid-cols-2 gap-3 md:gap-4">
              {stats.map((s) => (
                <div key={s.label} className="rounded-3xl border border-sand-light/10 bg-olive/60 p-7 md:p-9">
                  <dt className="text-xs uppercase tracking-[0.16em] text-sand-light/55">{s.label}</dt>
                  <dd className="mt-3 font-serif text-5xl font-semibold text-wood-light md:text-6xl">
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
