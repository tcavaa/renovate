import Image from '@/components/ui/image';
import Link from 'next/link';
import { ArrowDown, ArrowRight, Box, PieChart, Upload } from 'lucide-react';
import { RotatingBadge } from '@/components/motion/RotatingBadge';
import type { Dictionary } from '@/lib/i18n';

const POINT_ICONS = [Upload, Box, PieChart];

/**
 * Landing hero. On the left the brand line as the headline — "Play. Before we ROOMIT." — heavy
 * and tight, its last word on a lime block; the promise under it, the two ways in, and the three
 * things that make it true as numbered cards (the first on lime). On the right a collage in the
 * brand's colours: a lilac slab, a tangerine half circle, a coral square with a sun square in it,
 * a cobalt disc and a checker — with real catalogue pieces standing on them (their photos are on
 * white, so they are multiplied onto the blocks) and a lime selection frame around the chair, as
 * the studio draws one. Lines rise in on load (CSS); nothing needs JavaScript.
 */
export function Hero({ t }: { t: Dictionary }) {
  const lines = t.landing.heroLines;
  return (
    <section className="relative -mt-[72px] overflow-hidden pt-[72px]">
      <div className="container relative grid gap-12 pb-14 pt-10 md:pt-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-center lg:gap-10">
        <div className="relative z-10">
          <p className="reveal inline-flex items-center gap-2 rounded-full bg-mist-light py-1.5 pl-2.5 pr-3.5 text-xs font-semibold text-ink">
            <span className="h-2 w-2 bg-lime ring-1 ring-ink/10" aria-hidden />
            {t.landing.eyebrow}
          </p>

          <h1 className="display mt-6 text-[clamp(3.4rem,8.2vw,7.5rem)] text-ink">
            {lines.map((line, i) => (
              <span key={line} className="block">
                <span className="hero-clip">
                  <span className="hero-word" style={{ '--i': i } as React.CSSProperties}>
                    {i === lines.length - 1 ? <span className="mark">{line}</span> : line}
                  </span>
                </span>
              </span>
            ))}
          </h1>

          <div className="mt-8 max-w-xl animate-rise-in" style={{ animationDelay: '500ms' }}>
            <p className="text-pretty text-xl font-semibold leading-snug tracking-tight text-ink md:text-2xl">{t.landing.slogan}</p>
            <p className="text-pretty text-xl font-semibold leading-snug tracking-tight text-ink-muted md:text-2xl">{t.landing.sloganSecond}</p>
          </div>

          <div className="mt-8 flex flex-col items-start gap-3 whitespace-nowrap sm:flex-row sm:flex-wrap sm:items-center animate-rise-in" style={{ animationDelay: '650ms' }}>
            <Link
              href="/design"
              className="group inline-flex h-14 items-center gap-3 rounded-full bg-ink px-8 text-base font-bold text-white transition-colors hover:bg-lime hover:text-ink"
            >
              {t.landing.heroCta}
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/calculator"
              className="inline-flex h-14 items-center rounded-full bg-mist-light px-7 text-base font-bold text-ink transition-colors hover:bg-mist"
            >
              {t.landing.heroSecondary}
            </Link>
          </div>

          {/* The three things that make the promise true. */}
          <ol className="mt-10 grid gap-3 sm:grid-cols-3 animate-rise-in" style={{ animationDelay: '800ms' }}>
            {t.landing.heroPoints.map((point, i) => {
              const Icon = POINT_ICONS[i % POINT_ICONS.length];
              return (
                <li key={point} className={i === 0 ? 'rounded-2xl bg-lime-soft p-5 ring-1 ring-inset ring-lime' : 'rounded-2xl bg-mist-light p-5'}>
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-bg-surface text-ink shadow-card">
                    <Icon className="h-5 w-5" />
                  </span>
                  <p className="mt-4 text-[15px] font-bold leading-snug tracking-tight text-ink">
                    <span className="tabular-nums">{i + 1}. </span>
                    {point}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>

        {/* The collage. */}
        <div className="relative mx-auto aspect-square w-full max-w-[600px] animate-rise-in" style={{ animationDelay: '250ms' }} aria-hidden>
          {/* Lilac slab. */}
          <span className="absolute left-[30%] top-0 h-[62%] w-[30%] bg-lilac" />
          {/* Tangerine half circle, leaning on the slab. */}
          <span className="absolute right-0 top-[12%] h-[62%] w-[46%] rounded-l-full bg-tangerine" />
          {/* Checker. */}
          <span
            className="absolute right-[2%] top-[58%] h-[17%] w-[17%]"
            style={{ backgroundImage: 'conic-gradient(#2457FF 25%, #E3EAFF 0 50%, #2457FF 0 75%, #E3EAFF 0)', backgroundSize: '33.4% 33.4%' }}
          />
          {/* Coral square with the sun square in it. */}
          <span className="absolute bottom-[4%] left-[14%] grid h-[36%] w-[36%] place-items-center bg-coral">
            <span className="h-[38%] w-[38%] bg-sun" />
          </span>
          {/* Cobalt disc. */}
          <span className="absolute bottom-0 right-[8%] h-[30%] w-[30%] rounded-full bg-cobalt" />

          {/* The plant, over the half circle. */}
          <span className="absolute right-[6%] top-[14%] h-[52%] w-[40%]">
            <Image src="/uploads/furniture/stock-ph-potted_plant_02.webp" alt="" fill sizes="240px" className="object-contain object-bottom mix-blend-multiply" />
          </span>
          {/* The chair on the slab, in the studio's selection frame. */}
          <span className="absolute left-[4%] top-[20%] h-[56%] w-[38%]">
            <Image src="/uploads/furniture/stock-ph-GreenChair_01.webp" alt="" fill priority sizes="230px" className="object-contain object-bottom mix-blend-multiply" />
            <span className="absolute inset-[-3%] border-2 border-lime">
              {['-left-1.5 -top-1.5', '-right-1.5 -top-1.5', '-bottom-1.5 -left-1.5', '-bottom-1.5 -right-1.5'].map((pos) => (
                <span key={pos} className={`absolute h-3 w-3 border-2 border-ink bg-lime ${pos}`} />
              ))}
            </span>
          </span>
          {/* The side table on the disc. */}
          <span className="absolute bottom-[3%] right-[10%] h-[30%] w-[26%]">
            <Image src="/uploads/furniture/cupola-side-table.webp" alt="" fill sizes="160px" className="object-contain object-bottom mix-blend-multiply" />
          </span>

          {/* The verb, as the studio's button. */}
          <span className="absolute left-[2%] top-[4%] inline-flex h-11 -rotate-3 items-center gap-2 rounded-full bg-ink pl-5 pr-4 text-sm font-extrabold text-white shadow-float">
            {t.app.verb}
            <span className="h-2.5 w-2.5 bg-lime" />
          </span>
          <RotatingBadge text={t.app.motto} className="absolute -left-[6%] bottom-[2%] hidden h-32 w-32 xl:block" />
        </div>
      </div>

      <div className="container flex items-center justify-between pb-10 text-xs font-medium text-ink-muted">
        <span>{t.landing.heroNote}</span>
        <span className="hidden items-center gap-2 sm:flex">
          {t.landing.scrollHint}
          <ArrowDown className="h-3.5 w-3.5 animate-bounce" />
        </span>
      </div>
    </section>
  );
}
