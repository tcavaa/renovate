import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import type { Dictionary } from '@/lib/i18n';

export function FinalCta({ t }: { t: Dictionary }) {
  return (
    <section className="container pt-24 md:pt-36">
      <div className="reveal-scale relative overflow-hidden rounded-3xl bg-radial-warm border border-line px-6 py-20 text-center shadow-card md:px-16 md:py-28">
        <div className="grain absolute inset-0" />
        <p className="eyebrow relative">{t.app.tagline}</p>
        <h2 className="display relative mt-6 text-display-lg text-ink">{t.landing.ctaTitle}</h2>
        <p className="relative mx-auto mt-6 max-w-xl text-lg text-ink-soft">{t.landing.ctaBody}</p>
        <div className="relative mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/design"
            className="group inline-flex h-14 items-center gap-2 bg-ink px-8 text-base font-medium text-white transition-all hover:bg-brand hover:shadow-cardHover"
          >
            {t.landing.ctaPrimary}
            <ArrowUpRight className="h-5 w-5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
          <Link href="/calculator" className="bracket-link px-2 py-3 text-base font-medium text-ink hover:text-brand">
            {t.landing.ctaSecondary}
          </Link>
        </div>
      </div>
    </section>
  );
}
