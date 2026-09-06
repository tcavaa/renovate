import Image from 'next/image';
import Link from 'next/link';
import { ArrowDown, ArrowUpRight } from 'lucide-react';
import { RotatingBadge } from '@/components/motion/RotatingBadge';
import type { Dictionary } from '@/lib/i18n';

/**
 * Landing hero: the tagline set as three oversized words with product renders overlapping
 * the type — the furniture is the hero, not an illustration of it. Words rise in on load
 * (CSS), the imagery drifts on scroll (CSS scroll timeline), nothing needs JavaScript.
 */
export function Hero({ t }: { t: Dictionary }) {
  const words = t.landing.heroWords;
  return (
    <section className="relative -mt-[72px] overflow-hidden bg-radial-warm pt-[72px]">
      <div className="grain relative">
        <div className="container relative pb-20 pt-14 md:pb-28 md:pt-20 lg:pt-24">
          <p className="eyebrow reveal text-center">{t.landing.eyebrow}</p>

          {/* The three words. The middle line carries the main image, like a magazine cover. */}
          <h1 className="display mt-6 text-center text-display-xl text-ink">
            <span className="hero-clip">
              <span className="hero-word" style={{ '--i': 0 } as React.CSSProperties}>
                {words[0]}
              </span>
            </span>
            <br />
            <span className="relative inline-block">
              <span className="hero-clip">
                <span className="hero-word" style={{ '--i': 1 } as React.CSSProperties}>
                  {words[1]}
                </span>
              </span>
              <span className="absolute left-[84%] top-0 z-10 hidden w-[clamp(130px,13vw,190px)] -translate-y-[58%] animate-scale-in md:block" style={{ animationDelay: '500ms' }}>
                <span className="relative block aspect-[4/5] overflow-hidden rounded-2xl shadow-float ring-1 ring-black/5">
                  <Image src="/uploads/furniture/cloud-sofa.jpg" alt="" fill priority sizes="330px" className="parallax scale-110 object-cover" />
                </span>
              </span>
            </span>
            <br />
            <span className="hero-clip">
              <span className="hero-word text-brand" style={{ '--i': 2 } as React.CSSProperties}>
                {words[2]}
              </span>
            </span>
          </h1>

          {/* Side imagery, sitting in the margins like pinned photographs. */}
          <div className="pointer-events-none absolute left-[3%] top-[40%] hidden w-[clamp(120px,13vw,200px)] -rotate-3 animate-rise-in lg:block" style={{ animationDelay: '800ms' }}>
            <span className="relative block aspect-[3/4] overflow-hidden rounded-xl shadow-cardHover ring-1 ring-black/5">
              <Image src="/uploads/furniture/sca-pendant.jpg" alt="" fill sizes="200px" className="parallax scale-110 object-cover" />
            </span>
          </div>
          <div className="pointer-events-none absolute right-[4%] top-[22%] hidden w-[clamp(120px,13vw,200px)] rotate-2 animate-rise-in lg:block" style={{ animationDelay: '950ms' }}>
            <span className="relative block aspect-[4/5] overflow-hidden rounded-xl shadow-cardHover ring-1 ring-black/5">
              <Image src="/uploads/furniture/meccanica-chair.jpg" alt="" fill sizes="200px" className="parallax scale-110 object-cover" />
            </span>
          </div>
          <RotatingBadge
            text={t.app.tagline}
            className="absolute bottom-24 left-[6%] hidden h-36 w-36 animate-rise-in lg:block"
          />

          <div className="mx-auto mt-14 grid max-w-5xl gap-8 md:mt-20 md:grid-cols-[1fr_auto] md:items-end">
            <p className="max-w-xl text-pretty text-base leading-relaxed text-ink-soft md:text-lg animate-rise-in" style={{ animationDelay: '700ms' }}>
              {t.landing.heroBody}
            </p>
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center animate-rise-in" style={{ animationDelay: '850ms' }}>
              <Link
                href="/design"
                className="group inline-flex h-14 items-center gap-2 rounded-full bg-ink px-7 text-base font-medium text-white transition-all hover:bg-brand hover:shadow-cardHover"
              >
                {t.landing.heroCta}
                <ArrowUpRight className="h-5 w-5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
              <Link href="/calculator" className="bracket-link px-2 py-3 text-base font-medium text-ink hover:text-brand">
                {t.landing.heroSecondary}
              </Link>
            </div>
          </div>

          <div className="mt-10 flex items-center justify-between text-xs text-ink-muted">
            <span>{t.landing.heroNote}</span>
            <span className="hidden items-center gap-2 sm:flex">
              {t.landing.scrollHint}
              <ArrowDown className="h-3.5 w-3.5 animate-bounce" />
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
