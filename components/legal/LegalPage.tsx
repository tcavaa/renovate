import { Calendar } from 'lucide-react';
import { LogoMark } from '@/components/layout/Logo';

export interface LegalSection {
  title: string;
  body: string;
}

interface Props {
  title: string;
  subtitle?: string;
  lastUpdatedLabel: string;
  lastUpdatedValue: string;
  sections: LegalSection[];
}

export function LegalPage({
  title,
  subtitle,
  lastUpdatedLabel,
  lastUpdatedValue,
  sections,
}: Props) {
  return (
    <>
      <section className="relative overflow-hidden">
        {/* A colour block either side of the title. */}
        <span className="pointer-events-none absolute -bottom-8 left-[6%] hidden h-40 w-24 bg-lilac md:block" aria-hidden />
        <span className="pointer-events-none absolute -bottom-10 left-[11%] hidden h-20 w-20 bg-sun lg:block" aria-hidden />
        <span className="pointer-events-none absolute -bottom-12 right-[7%] hidden h-36 w-36 rounded-full bg-tangerine md:block" aria-hidden />
        <div className="container relative py-16 md:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <LogoMark tone="ink" className="mx-auto mb-7 h-14 w-14" />
            <h1 className="display text-[clamp(2.4rem,5vw,4.2rem)] text-ink">
              {title}
            </h1>
            {subtitle && (
              <p className="mx-auto mt-5 max-w-xl text-xl font-semibold leading-snug tracking-tight text-ink-soft md:text-2xl">{subtitle}</p>
            )}
            <div className="mt-7 inline-flex items-center gap-2 rounded-full bg-mist-light px-4 py-1.5 text-xs font-semibold text-ink">
              <Calendar className="h-3.5 w-3.5" />
              {lastUpdatedLabel}: {lastUpdatedValue}
            </div>
          </div>
        </div>
      </section>

      <section className="container pb-20">
        <article className="relative mx-auto -mt-2 max-w-3xl overflow-hidden rounded-3xl border border-line bg-bg-surface">
          <div className="divide-y divide-line px-6 md:px-12">
            {sections.map((s) => (
              <section key={s.title} className="py-7 first:pt-9 last:pb-10 md:py-8 md:first:pt-12 md:last:pb-12">
                <h2 className="font-display text-xl text-ink md:text-2xl">
                  {s.title}
                </h2>
                <p className="mt-3 leading-relaxed text-ink-soft">{s.body}</p>
              </section>
            ))}
          </div>
        </article>
      </section>
    </>
  );
}
