import Image from '@/components/ui/image';
import Link from 'next/link';
import { ArrowDown, ArrowUpRight, Check } from 'lucide-react';
import { RotatingBadge } from '@/components/motion/RotatingBadge';
import { LogoMark } from '@/components/layout/Logo';
import type { Dictionary } from '@/lib/i18n';

/**
 * Landing hero, laid out like the PLAYCE brand board: the three words on the left in the
 * wordmark's airy capitals, and on the right a moodboard — an arch of stone with a real
 * catalogue chair in it, a terracotta block, a travertine side table, a plant in a terracotta
 * pot, and the tagline torn into paper labels. The product photos are on white, so they are
 * multiplied onto the colour blocks. Words rise in on load (CSS); nothing needs JavaScript.
 */
export function Hero({ t }: { t: Dictionary }) {
  const words = t.landing.heroWords;
  const labels = t.app.tagline.split(' ');
  return (
    <section className="relative -mt-[72px] overflow-hidden bg-radial-warm pt-[72px]">
      <div className="grain relative">
        <div className="container relative grid gap-14 pb-20 pt-12 md:pb-24 md:pt-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-center lg:gap-10 lg:pt-20">
          <div className="relative z-10">
            <p className="eyebrow reveal flex items-center gap-3">
              <span className="h-px w-8 bg-brand" aria-hidden />
              {t.landing.eyebrow}
            </p>

            <h1 className="display mt-7 text-[clamp(2.6rem,5.6vw,5.4rem)] text-ink">
              {words.map((word, i) => (
                <span key={word} className="block">
                  <span className="hero-clip">
                    <span className={i === words.length - 1 ? 'hero-word text-brand' : 'hero-word'} style={{ '--i': i } as React.CSSProperties}>
                      {word}
                    </span>
                  </span>
                </span>
              ))}
            </h1>

            {/*
              The promise in two lines, then the three things that make it true. Nini asked
              for the slogan to be *said* on the first page rather than implied by an eyebrow
              over the animated words.
            */}
            <div className="mt-9 max-w-xl animate-rise-in" style={{ animationDelay: '600ms' }}>
              <p className="text-pretty font-serif text-2xl font-semibold leading-snug text-ink md:text-[1.7rem]">{t.landing.slogan}</p>
              <p className="mt-1 text-pretty font-serif text-2xl font-semibold leading-snug text-brand md:text-[1.7rem]">{t.landing.sloganSecond}</p>
              <ul className="mt-6 space-y-2.5">
                {t.landing.heroPoints.map((point) => (
                  <li key={point} className="flex items-start gap-3 text-base leading-relaxed text-ink-soft">
                    <span className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-olive text-sand-light">
                      <Check className="h-3 w-3" strokeWidth={2.5} />
                    </span>
                    {point}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-10 flex flex-col items-start gap-3 whitespace-nowrap sm:flex-row sm:flex-wrap sm:items-center animate-rise-in" style={{ animationDelay: '750ms' }}>
              <Link
                href="/design"
                className="group inline-flex h-14 items-center gap-2 rounded-full bg-brand px-8 text-base font-medium text-white shadow-cardHover transition-colors hover:bg-brand-dark"
              >
                {t.landing.heroCta}
                <ArrowUpRight className="h-5 w-5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/calculator"
                className="inline-flex h-14 items-center rounded-full border border-ink/15 px-7 text-base font-medium text-ink transition-colors hover:border-ink/40 hover:bg-bg-surface"
              >
                {t.landing.heroSecondary}
              </Link>
            </div>
          </div>

          {/* The moodboard. */}
          <div className="relative mx-auto aspect-[5/5.2] w-full max-w-[560px] animate-rise-in" style={{ animationDelay: '300ms' }} aria-hidden>
            {/* Terracotta block behind the arch. */}
            <span className="absolute left-[4%] top-[14%] h-[44%] w-[30%] rounded-[6px] bg-brand" />
            {/* The arch, with the chair in it. */}
            <span className="arch absolute left-[18%] top-0 h-[80%] w-[58%] overflow-hidden bg-stone shadow-float">
              <span className="absolute inset-x-0 bottom-0 h-[22%] bg-stone-dark/40" />
              <Image src="/uploads/furniture/stock-ph-GreenChair_01.webp" alt="" fill priority sizes="330px" className="object-contain object-bottom p-[10%] pb-[6%] mix-blend-multiply" />
            </span>
            {/* Olive block and the pendant over it. */}
            <span className="absolute right-0 top-[6%] h-[34%] w-[30%] overflow-hidden rounded-[6px] bg-olive">
              <Image src="/uploads/furniture/sca-pendant.webp" alt="" fill sizes="170px" className="object-cover opacity-90 mix-blend-screen grayscale invert" />
            </span>
            {/* Travertine side table on a sand plinth. */}
            <span className="absolute bottom-[3%] left-0 h-[34%] w-[34%] overflow-hidden rounded-[18px] bg-sand shadow-card">
              <Image src="/uploads/furniture/cupola-side-table.webp" alt="" fill sizes="190px" className="object-contain p-[12%] mix-blend-multiply" />
            </span>
            {/* The plant in its terracotta pot. */}
            <span className="absolute bottom-0 right-[2%] h-[46%] w-[36%] overflow-hidden rounded-[18px] bg-bg-surface shadow-card">
              <Image src="/uploads/furniture/stock-ph-potted_plant_02.webp" alt="" fill sizes="200px" className="object-contain p-[8%] mix-blend-multiply" />
            </span>
            {/* The tagline, torn into paper labels. */}
            <span className="absolute right-[24%] top-[38%] flex flex-col items-start gap-1.5">
              {labels.map((word, i) => (
                <span key={word} className="paper-label" style={{ transform: `rotate(${[-2, 1.5, -1, 2][i % 4]}deg) translateX(${i * 6}px)` }}>
                  {word}
                </span>
              ))}
            </span>
            {/* The app icon, pinned on. */}
            <LogoMark tone="sand" className="absolute left-[2%] top-[2%] h-14 w-14 shadow-card" />
            <RotatingBadge text={t.app.motto} className="absolute -left-[8%] bottom-[38%] hidden h-32 w-32 xl:block" />
          </div>
        </div>

        <div className="container flex items-center justify-between pb-10 text-xs text-ink-muted">
          <span>{t.landing.heroNote}</span>
          <span className="hidden items-center gap-2 sm:flex">
            {t.landing.scrollHint}
            <ArrowDown className="h-3.5 w-3.5 animate-bounce" />
          </span>
        </div>
      </div>
    </section>
  );
}
