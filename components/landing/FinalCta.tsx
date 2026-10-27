import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { LogoMark } from '@/components/layout/Logo';
import type { Dictionary } from '@/lib/i18n';

/**
 * The landing's last word: a terracotta brand block with the app icon pinned on, the tagline
 * as paper labels and two arches of the brand's darker clay behind the call to action.
 */
export function FinalCta({ t }: { t: Dictionary }) {
  const labels = t.app.tagline.split(' ');
  return (
    <section className="container pt-24 md:pt-36">
      <div className="reveal-scale relative overflow-hidden rounded-3xl bg-brand px-6 py-20 text-center text-white shadow-cardHover md:px-16 md:py-28">
        <div className="grain absolute inset-0" />
        {/* Arches of darker clay and wood, like the brand board's colour blocks. */}
        <span className="arch pointer-events-none absolute -bottom-10 -left-10 h-[70%] w-[28%] bg-brand-dark/50 md:left-[4%]" aria-hidden />
        <span className="arch pointer-events-none absolute -bottom-16 -right-12 h-[55%] w-[22%] bg-wood/40 md:right-[6%]" aria-hidden />
        <LogoMark tone="sand" className="relative mx-auto h-14 w-14 shadow-card" />
        <p className="relative mt-7">
          <span className="sr-only">{t.app.tagline}</span>
          <span className="flex flex-wrap items-center justify-center gap-1.5" aria-hidden>
            {labels.map((word, i) => (
              <span key={`${word}-${i}`} className="paper-label" style={{ transform: `rotate(${[-2, 1.5, -1, 2][i % 4]}deg)` }}>
                {word}
              </span>
            ))}
          </span>
        </p>
        <h2 className="display relative mt-8 text-display-lg tracking-[0.04em] text-white">{t.landing.ctaTitle}</h2>
        <p className="relative mx-auto mt-6 max-w-xl text-lg text-white/80">{t.landing.ctaBody}</p>
        <div className="relative mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/design"
            className="group inline-flex h-14 items-center gap-2 rounded-full bg-bg-surface px-8 text-base font-medium text-ink shadow-card transition-all hover:bg-ink hover:text-white hover:shadow-cardHover"
          >
            {t.landing.ctaPrimary}
            <ArrowUpRight className="h-5 w-5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/calculator"
            className="inline-flex h-14 items-center rounded-full border border-white/40 px-7 text-base font-medium text-white transition-colors hover:border-white hover:bg-white/10"
          >
            {t.landing.ctaSecondary}
          </Link>
        </div>
      </div>
    </section>
  );
}
