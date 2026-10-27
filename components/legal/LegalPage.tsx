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
      <section className="relative overflow-hidden bg-radial-warm">
        <div className="grain relative">
          {/* Two arches either side of the title, like the brand board's windows. */}
          <span className="arch pointer-events-none absolute -bottom-6 left-[6%] hidden h-44 w-28 bg-stone/70 md:block" aria-hidden />
          <span className="arch pointer-events-none absolute -bottom-6 right-[7%] hidden h-32 w-20 bg-olive-soft md:block" aria-hidden />
          <div className="container relative py-16 md:py-24">
            <div className="mx-auto max-w-3xl text-center">
              <LogoMark tone="sand" className="mx-auto mb-7 h-12 w-12 shadow-card" />
              <h1 className="display text-[clamp(2.1rem,4.4vw,3.6rem)] text-ink">
                {title}
              </h1>
              {subtitle && (
                <p className="mx-auto mt-5 max-w-xl font-serif text-xl text-ink-soft md:text-2xl">{subtitle}</p>
              )}
              <div className="mt-7 inline-flex items-center gap-2 rounded-full border border-line bg-bg-surface px-4 py-1.5 text-xs text-ink-muted shadow-card">
                <Calendar className="h-3.5 w-3.5 text-wood" />
                {lastUpdatedLabel}: {lastUpdatedValue}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="container pb-20">
        <article className="mx-auto -mt-2 max-w-3xl overflow-hidden rounded-3xl border border-line bg-bg-surface shadow-card">
          {/* The brand board's six swatches as the sheet's top edge. */}
          <div className="grid h-1.5 grid-cols-6" aria-hidden>
            <span className="bg-sand" />
            <span className="bg-stone" />
            <span className="bg-wood" />
            <span className="bg-brand" />
            <span className="bg-olive-light" />
            <span className="bg-charcoal" />
          </div>
          <div className="divide-y divide-line px-6 md:px-12">
            {sections.map((s) => (
              <section key={s.title} className="py-7 first:pt-9 last:pb-10 md:py-8 md:first:pt-12 md:last:pb-12">
                <h2 className="font-serif text-xl font-semibold text-ink md:text-2xl">
                  {s.title}
                </h2>
                <p className="mt-3 leading-relaxed text-ink-muted">{s.body}</p>
              </section>
            ))}
          </div>
        </article>
      </section>
    </>
  );
}
