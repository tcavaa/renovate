import Link from 'next/link';
import {
  ArrowRight,
  Calculator,
  CheckCircle2,
  Hammer,
  LayoutGrid,
  Sparkles,
  Target,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';

export const metadata = { title: 'About — RenovateGE' };

export default async function AboutPage() {
  const ka = await getT();
  const what = [
    { icon: Calculator, title: ka.pages.about.what1Title, desc: ka.pages.about.what1Desc },
    { icon: LayoutGrid, title: ka.pages.about.what2Title, desc: ka.pages.about.what2Desc },
    { icon: Hammer, title: ka.pages.about.what3Title, desc: ka.pages.about.what3Desc },
  ];
  const values = [
    ka.pages.about.value1,
    ka.pages.about.value2,
    ka.pages.about.value3,
    ka.pages.about.value4,
  ];

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-bg-base via-brand/5 to-accent/10" />
        <div className="container py-16 md:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 border border-brand/20 bg-brand/5 px-4 py-1.5 text-sm text-brand-dark">
              <Sparkles className="h-4 w-4" />
              {ka.app.tagline}
            </div>
            <h1 className="font-serif text-4xl font-bold leading-tight tracking-tight md:text-5xl">
              {ka.pages.about.title}
            </h1>
            <p className="mt-4 text-lg text-ink-muted md:text-xl">
              {ka.pages.about.subtitle}
            </p>
          </div>
        </div>
      </section>

      {/* Mission */}
      <section className="container py-16">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl border border-line bg-bg-surface p-8 shadow-card md:p-12">
            <div className="mb-4 inline-flex items-center gap-2 text-brand">
              <Target className="h-5 w-5" />
              <span className="text-sm font-semibold uppercase tracking-wide">
                {ka.pages.about.missionTitle}
              </span>
            </div>
            <p className="text-lg leading-relaxed text-ink">
              {ka.pages.about.missionBody}
            </p>
          </div>
        </div>
      </section>

      {/* What we do */}
      <section className="container py-16">
        <h2 className="mb-10 text-center font-serif text-3xl font-bold md:text-4xl">
          {ka.pages.about.whatTitle}
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          {what.map((w) => (
            <Card key={w.title} className="hover:shadow-cardHover transition-shadow">
              <CardContent className="pt-6">
                <div className="mb-4 grid h-12 w-12 place-items-center rounded-lg bg-brand/10 text-brand">
                  <w.icon className="h-6 w-6" />
                </div>
                <h3 className="mb-2 font-serif text-xl font-semibold">{w.title}</h3>
                <p className="text-sm text-ink-muted">{w.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Values */}
      <section className="container py-16">
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-8 text-center font-serif text-3xl font-bold">
            {ka.pages.about.valuesTitle}
          </h2>
          <ul className="space-y-3">
            {values.map((v) => (
              <li
                key={v}
                className="flex items-start gap-3 rounded-lg border border-line bg-bg-surface px-5 py-4 shadow-sm"
              >
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                <span className="text-sm md:text-base">{v}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA */}
      <section className="container py-16">
        <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand to-brand-dark p-10 text-center text-white shadow-cardHover md:p-16">
          <h2 className="font-serif text-3xl font-bold md:text-4xl">
            {ka.pages.about.ctaTitle}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-white/90">
            {ka.pages.about.ctaSubtitle}
          </p>
          <Button
            size="xl"
            variant="secondary"
            className="mt-8 bg-white text-brand hover:bg-white/90"
            asChild
          >
            <Link href="/calculator">
              {ka.pages.about.ctaButton}
              <ArrowRight className="h-5 w-5" />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
