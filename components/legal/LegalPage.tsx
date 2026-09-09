import { Calendar } from 'lucide-react';

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
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-bg-base via-brand/5 to-accent/10" />
        <div className="container py-16 md:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-3 text-lg text-ink-muted">{subtitle}</p>
            )}
            <div className="mt-6 inline-flex items-center gap-2 border border-line bg-bg-surface px-3 py-1 text-xs text-ink-muted">
              <Calendar className="h-3.5 w-3.5" />
              {lastUpdatedLabel}: {lastUpdatedValue}
            </div>
          </div>
        </div>
      </section>

      <section className="container pb-20">
        <article className="mx-auto max-w-3xl space-y-8 rounded-2xl border border-line bg-bg-surface p-6 shadow-card md:p-10">
          {sections.map((s) => (
            <section key={s.title}>
              <h2 className="font-serif text-xl font-semibold md:text-2xl">
                {s.title}
              </h2>
              <p className="mt-3 leading-relaxed text-ink-muted">{s.body}</p>
            </section>
          ))}
        </article>
      </section>
    </>
  );
}
