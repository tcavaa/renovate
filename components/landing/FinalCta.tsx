import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import type { Dictionary } from '@/lib/i18n';

/**
 * The last call before the footer: a lime slab with the brand line, the title set heavy, two
 * ways in, and the palette's blocks standing in its corners.
 */
export function FinalCta({ t }: { t: Dictionary }) {
  return (
    <section className="container pt-24 md:pt-32">
      <div className="reveal-scale relative overflow-hidden rounded-3xl bg-lime px-6 py-20 text-center text-ink md:px-16 md:py-28">
        <span className="pointer-events-none absolute -left-10 bottom-0 hidden h-[58%] w-[16%] bg-lilac md:block" aria-hidden />
        <span className="pointer-events-none absolute bottom-0 left-[10%] hidden h-[26%] w-[10%] bg-ink md:block" aria-hidden />
        <span className="pointer-events-none absolute -right-16 -top-16 hidden aspect-square w-[24%] rounded-full bg-tangerine md:block" aria-hidden />
        <span className="pointer-events-none absolute bottom-[12%] right-[7%] hidden h-14 w-14 bg-cobalt lg:block" aria-hidden />
        <p className="relative inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-bold text-white">
          {t.app.tagline}
          <span className="h-2 w-2 bg-lime" aria-hidden />
        </p>
        <h2 className="display relative mt-8 text-display-lg text-ink">{t.landing.ctaTitle}</h2>
        <p className="relative mx-auto mt-6 max-w-xl text-lg font-medium text-ink/75">{t.landing.ctaBody}</p>
        <div className="relative mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/design"
            className="group inline-flex h-14 items-center gap-2 rounded-full bg-ink px-8 text-base font-bold text-white transition-colors hover:bg-white hover:text-ink"
          >
            {t.landing.ctaPrimary}
            <ArrowUpRight className="h-5 w-5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/calculator"
            className="inline-flex h-14 items-center rounded-full border-2 border-ink px-7 text-base font-bold text-ink transition-colors hover:bg-ink hover:text-white"
          >
            {t.landing.ctaSecondary}
          </Link>
        </div>
      </div>
    </section>
  );
}
