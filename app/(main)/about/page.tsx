import Link from 'next/link';
import {
  ArrowRight,
  Calculator,
  Check,
  Hammer,
  LayoutGrid,
  Sparkles,
  Target,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { LogoMark } from '@/components/layout/Logo';

export const metadata = { title: 'About' };

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
  // The three "what we do" tiles take the brand's three solid colours in turn.
  const tiles = ['bg-brand text-white', 'bg-olive text-sand-light', 'bg-wood text-white'];
  const motto = ka.app.motto.split(' ');

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-radial-warm">
        <div className="grain relative">
          <span className="arch pointer-events-none absolute -bottom-8 left-[5%] hidden h-56 w-36 bg-stone/70 md:block" aria-hidden />
          <span className="arch pointer-events-none absolute -bottom-8 left-[14%] hidden h-32 w-20 bg-brand/80 lg:block" aria-hidden />
          <span className="arch pointer-events-none absolute -bottom-8 right-[6%] hidden h-44 w-28 bg-olive md:block" aria-hidden />
          <div className="container relative py-16 md:py-28">
            <div className="mx-auto max-w-3xl text-center">
              <div className="paper-label mb-8 inline-flex -rotate-1 items-center gap-2">
                <Sparkles className="h-4 w-4 text-brand" />
                {ka.app.tagline}
              </div>
              <h1 className="display text-[clamp(2.3rem,5vw,4.4rem)] text-ink">
                {ka.pages.about.title}
              </h1>
              <p className="mx-auto mt-6 max-w-2xl font-serif text-xl text-ink-soft md:text-2xl">
                {ka.pages.about.subtitle}
              </p>
              <p className="eyebrow mt-8 text-wood">{ka.app.motto}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Mission */}
      <section className="container py-16">
        <div className="mx-auto grid max-w-4xl overflow-hidden rounded-3xl border border-line bg-bg-surface shadow-card md:grid-cols-[minmax(0,2fr)_minmax(0,5fr)]">
          <div className="relative hidden min-h-[16rem] bg-olive md:block" aria-hidden>
            <span className="arch absolute inset-x-[18%] bottom-0 top-[18%] bg-stone/90" />
            <LogoMark tone="terracotta" className="absolute left-1/2 top-[52%] h-16 w-16 -translate-x-1/2 shadow-card" />
          </div>
          <div className="p-8 md:p-12">
            <div className="mb-5 inline-flex items-center gap-2 text-wood">
              <Target className="h-5 w-5" />
              <span className="eyebrow text-wood">
                {ka.pages.about.missionTitle}
              </span>
            </div>
            <p className="font-serif text-xl leading-relaxed text-ink md:text-2xl">
              {ka.pages.about.missionBody}
            </p>
          </div>
        </div>
      </section>

      {/* What we do */}
      <section className="container py-16">
        <h2 className="display mb-12 text-center text-[clamp(1.9rem,3.4vw,2.9rem)] text-ink">
          {ka.pages.about.whatTitle}
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          {what.map((w, i) => (
            <Card key={w.title} className="rounded-3xl transition-all hover:-translate-y-1 hover:shadow-cardHover">
              <CardContent className="p-7 md:p-8">
                <div className={`mb-6 grid h-14 w-14 place-items-center rounded-2xl ${tiles[i % tiles.length]}`}>
                  <w.icon className="h-6 w-6" />
                </div>
                <h3 className="mb-2 font-serif text-2xl font-semibold">{w.title}</h3>
                <p className="text-sm leading-relaxed text-ink-muted">{w.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Values */}
      <section className="bg-sand-light py-20">
        <div className="container">
          <div className="mx-auto max-w-2xl">
            <h2 className="display mb-10 text-center text-[clamp(1.9rem,3.4vw,2.9rem)] text-ink">
              {ka.pages.about.valuesTitle}
            </h2>
            <ul className="space-y-3">
              {values.map((v) => (
                <li
                  key={v}
                  className="flex items-start gap-4 rounded-2xl border border-line bg-bg-surface px-5 py-4 shadow-card"
                >
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-olive text-sand-light">
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </span>
                  <span className="text-sm leading-relaxed md:text-base">{v}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container py-16">
        <div className="relative overflow-hidden rounded-3xl bg-bg-deep p-10 text-center text-sand-light shadow-cardHover md:p-16">
          <div className="grain absolute inset-0" />
          <span className="arch pointer-events-none absolute -bottom-10 -left-8 h-[70%] w-[24%] bg-olive-light/25 md:left-[5%]" aria-hidden />
          <span className="arch pointer-events-none absolute -bottom-12 -right-10 h-[55%] w-[18%] bg-brand/70 md:right-[6%]" aria-hidden />
          <div className="relative flex flex-wrap justify-center gap-1.5" aria-hidden>
            {motto.map((word, i) => (
              <span key={`${word}-${i}`} className="paper-label" style={{ transform: `rotate(${[-2, 1.5, -1][i % 3]}deg)` }}>
                {word}
              </span>
            ))}
          </div>
          <h2 className="display relative mt-8 text-[clamp(2rem,4vw,3.4rem)] text-sand-light">
            {ka.pages.about.ctaTitle}
          </h2>
          <p className="relative mx-auto mt-5 max-w-xl text-sand-light/75">
            {ka.pages.about.ctaSubtitle}
          </p>
          <Button size="xl" className="relative mt-9" asChild>
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
