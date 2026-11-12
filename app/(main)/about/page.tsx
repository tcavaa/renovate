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
  // The three "what we do" tiles take three of the brand's colours in turn.
  const tiles = ['bg-lime text-ink', 'bg-lilac text-ink', 'bg-tangerine text-ink'];
  const motto = ka.app.motto.split(' ');
  const stickers = ['bg-lime text-ink', 'bg-white text-ink', 'bg-lilac text-ink'];

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Colour blocks in the corners. */}
        <span className="pointer-events-none absolute -bottom-10 left-[4%] hidden h-48 w-28 bg-lilac md:block" aria-hidden />
        <span className="pointer-events-none absolute -bottom-12 left-[11%] hidden h-28 w-28 rounded-full bg-coral lg:block" aria-hidden />
        <span className="pointer-events-none absolute -bottom-16 right-[5%] hidden h-56 w-40 rounded-t-full bg-tangerine md:block" aria-hidden />
        <span className="pointer-events-none absolute right-[15%] top-10 hidden h-12 w-12 bg-sun lg:block" aria-hidden />
        <div className="container relative py-16 md:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <p className="mb-8 inline-flex items-center gap-2 rounded-full bg-mist-light px-3.5 py-1.5 text-xs font-semibold text-ink">
              <Sparkles className="h-3.5 w-3.5" />
              {ka.app.tagline}
            </p>
            <h1 className="display text-[clamp(2.6rem,6vw,5.2rem)] text-ink">
              {ka.pages.about.title}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-xl font-semibold leading-snug tracking-tight text-ink-soft md:text-2xl">
              {ka.pages.about.subtitle}
            </p>
            <p className="mt-8 inline-block text-sm font-bold text-ink"><span className="mark">{ka.app.motto}</span></p>
          </div>
        </div>
      </section>

      {/* Mission */}
      <section className="container py-16">
        <div className="mx-auto grid max-w-4xl overflow-hidden rounded-3xl bg-mist-light md:grid-cols-[minmax(0,2fr)_minmax(0,5fr)]">
          <div className="relative hidden min-h-[16rem] overflow-hidden bg-ink md:block" aria-hidden>
            <span className="absolute -left-6 bottom-0 h-[55%] w-[60%] rounded-tr-full bg-brand" />
            <span className="absolute right-4 top-6 h-10 w-10 bg-lime" />
            <LogoMark tone="lime" className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 shadow-float" />
          </div>
          <div className="p-8 md:p-12">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-bg-surface px-3 py-1.5 text-xs font-semibold text-ink">
              <Target className="h-3.5 w-3.5" />
              {ka.pages.about.missionTitle}
            </div>
            <p className="text-xl font-semibold leading-snug tracking-tight text-ink md:text-2xl">
              {ka.pages.about.missionBody}
            </p>
          </div>
        </div>
      </section>

      {/* What we do */}
      <section className="container py-16">
        <h2 className="display mb-12 text-center text-[clamp(2rem,3.8vw,3.25rem)] text-ink">
          {ka.pages.about.whatTitle}
        </h2>
        <div className="grid gap-5 md:grid-cols-3">
          {what.map((w, i) => (
            <Card key={w.title} className="rounded-3xl transition-all hover:-translate-y-1 hover:border-ink hover:shadow-cardHover">
              <CardContent className="p-7 md:p-8">
                <div className={`mb-6 grid h-14 w-14 place-items-center rounded-2xl ${tiles[i % tiles.length]}`}>
                  <w.icon className="h-6 w-6" />
                </div>
                <h3 className="mb-2 font-display text-2xl">
                  <span className="tabular-nums">{i + 1}. </span>
                  {w.title}
                </h3>
                <p className="text-sm leading-relaxed text-ink-muted">{w.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Values */}
      <section className="bg-mist-light py-20">
        <div className="container">
          <div className="mx-auto max-w-2xl">
            <h2 className="display mb-10 text-center text-[clamp(2rem,3.8vw,3.25rem)] text-ink">
              {ka.pages.about.valuesTitle}
            </h2>
            <ul className="space-y-3">
              {values.map((v) => (
                <li
                  key={v}
                  className="flex items-start gap-4 rounded-2xl bg-bg-surface px-5 py-4"
                >
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-lime text-ink">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                  <span className="text-sm font-medium leading-relaxed md:text-base">{v}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container py-16">
        <div className="relative overflow-hidden rounded-3xl bg-bg-deep p-10 text-center text-white md:p-16">
          <span className="pointer-events-none absolute -bottom-10 -left-8 hidden h-[60%] w-[18%] bg-brand md:left-[4%] md:block" aria-hidden />
          <span className="pointer-events-none absolute -bottom-16 -right-10 hidden h-[70%] w-[22%] rounded-t-full bg-coral md:right-[5%] md:block" aria-hidden />
          <span className="pointer-events-none absolute right-[10%] top-8 hidden h-10 w-10 bg-sun md:block" aria-hidden />
          <div className="relative flex flex-wrap justify-center gap-2" aria-hidden>
            {motto.map((word, i) => (
              <span key={`${word}-${i}`} className={`rounded-lg px-3 py-1.5 text-sm font-extrabold tracking-tight ${stickers[i % stickers.length]}`}>
                {word}
              </span>
            ))}
          </div>
          <h2 className="display relative mt-8 text-[clamp(2.2rem,4.4vw,3.8rem)] text-white">
            {ka.pages.about.ctaTitle}
          </h2>
          <p className="relative mx-auto mt-5 max-w-xl text-white/70">
            {ka.pages.about.ctaSubtitle}
          </p>
          <Button size="xl" variant="accent" className="relative mt-9 hover:bg-white hover:text-ink" asChild>
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
