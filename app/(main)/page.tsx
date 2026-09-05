import Link from 'next/link';
import {
  ArrowRight,
  Calculator,
  CheckCircle2,
  Hammer,
  LayoutGrid,
  Sparkles,
  Wrench,
  Building2,
  PaintBucket,
  Sofa,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';

export default function HomePage() {
  const ka = getT();
  const features = [
    { icon: Calculator, title: ka.hero.feature1Title, desc: ka.hero.feature1Desc },
    { icon: LayoutGrid, title: ka.hero.feature2Title, desc: ka.hero.feature2Desc },
    { icon: Hammer, title: ka.hero.feature3Title, desc: ka.hero.feature3Desc },
  ];
  const steps = [
    { icon: Building2, title: ka.howItWorks.step1Title, desc: ka.howItWorks.step1Desc },
    { icon: Calculator, title: ka.howItWorks.step2Title, desc: ka.howItWorks.step2Desc },
    { icon: PaintBucket, title: ka.howItWorks.step3Title, desc: ka.howItWorks.step3Desc },
    { icon: Sofa, title: ka.howItWorks.step4Title, desc: ka.howItWorks.step4Desc },
    { icon: Wrench, title: ka.howItWorks.step5Title, desc: ka.howItWorks.step5Desc },
  ];
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-bg-base via-brand/5 to-accent/10" />
        <div className="absolute -right-20 -top-20 h-96 w-96 rounded-full bg-brand/10 blur-3xl -z-10" />
        <div className="absolute -left-20 bottom-0 h-96 w-96 rounded-full bg-accent/10 blur-3xl -z-10" />

        <div className="container py-16 md:py-24 lg:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/5 px-4 py-1.5 text-sm text-brand-dark">
              <Sparkles className="h-4 w-4" />
              {ka.app.tagline}
            </div>

            <h1 className="mb-6 font-serif text-4xl font-bold leading-tight tracking-tight md:text-6xl">
              {ka.hero.headline}
            </h1>

            <p className="mx-auto mb-10 max-w-2xl text-lg text-ink-muted md:text-xl">
              {ka.hero.subheadline}
            </p>

            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="xl" asChild>
                <Link href="/calculator">
                  {ka.hero.ctaPrimary}
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </Button>
              <Button size="xl" variant="outline" asChild>
                <Link href="/catalog">{ka.hero.ctaSecondary}</Link>
              </Button>
            </div>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-sm text-ink-muted">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-success" />
                {ka.hero.benefit1}
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-success" />
                {ka.hero.benefit2}
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-success" />
                {ka.hero.benefit3}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container py-16">
        <div className="grid gap-6 md:grid-cols-3">
          {features.map((f) => (
            <Card key={f.title} className="hover:shadow-cardHover transition-shadow">
              <CardContent className="pt-6">
                <div className="mb-4 grid h-12 w-12 place-items-center rounded-lg bg-brand/10 text-brand">
                  <f.icon className="h-6 w-6" />
                </div>
                <h3 className="mb-2 font-serif text-xl font-semibold">{f.title}</h3>
                <p className="text-sm text-ink-muted">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="container py-16">
        <div className="mb-12 text-center">
          <h2 className="font-serif text-3xl font-bold md:text-4xl">{ka.howItWorks.title}</h2>
          <p className="mt-3 text-ink-muted">{ka.howItWorks.subtitle}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-5">
          {steps.map((step, i) => (
            <div
              key={step.title}
              className="relative rounded-lg border border-line bg-bg-surface p-6 shadow-card hover:shadow-cardHover transition-all"
            >
              <div className="absolute -top-3 -right-3 grid h-8 w-8 place-items-center rounded-full bg-brand text-sm font-bold text-white shadow-md">
                {i + 1}
              </div>
              <step.icon className="mb-3 h-8 w-8 text-brand" />
              <h3 className="mb-1.5 font-serif text-base font-semibold">{step.title}</h3>
              <p className="text-xs text-ink-muted">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="container py-16">
        <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand to-brand-dark p-10 text-center text-white shadow-cardHover md:p-16">
          <h2 className="font-serif text-3xl font-bold md:text-4xl">
            {ka.finalCta.title}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-white/90">
            {ka.finalCta.subtitle}
          </p>
          <Button size="xl" variant="secondary" className="mt-8 bg-white text-brand hover:bg-white/90" asChild>
            <Link href="/calculator">
              {ka.finalCta.button}
              <ArrowRight className="h-5 w-5" />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
