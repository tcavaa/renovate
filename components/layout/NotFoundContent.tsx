import Link from 'next/link';
import { ArrowRight, Calculator, Home, LayoutGrid, Hammer, MapPinOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { WORKERS_DIRECTORY } from '@/lib/features';
import { LogoMark } from '@/components/layout/Logo';

/**
 * The 404 body, shared by the root and the `(main)` not-found pages — the root one has to
 * draw its own header and footer because it renders outside the main layout.
 */
export async function NotFoundContent() {
  const ka = await getT();
  const suggestions = [
    { href: '/calculator', icon: Calculator, label: ka.notFound.calculator },
    { href: '/catalog', icon: LayoutGrid, label: ka.notFound.catalogSuggest },
    WORKERS_DIRECTORY ? { href: '/workers', icon: Hammer, label: ka.notFound.workersSuggest } : { href: '/teams', icon: Hammer, label: ka.nav.teams },
  ];
  return (
    <section className="relative overflow-hidden">
      {/* Colour blocks standing on the floor line, either side of the number. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden items-end justify-center gap-4 lg:flex" aria-hidden>
        <span className="h-40 w-24 bg-lilac" />
        <span className="h-28 w-28 rounded-full bg-coral" />
        <span className="w-[44rem]" />
        <span className="h-52 w-32 rounded-t-full bg-tangerine" />
        <span className="h-24 w-24 bg-cobalt" />
      </div>

      <div className="container relative py-20 md:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <div className="relative mx-auto mb-8 h-20 w-20">
            <LogoMark tone="ink" className="h-20 w-20" />
            <span className="absolute -bottom-2 -right-2 grid h-9 w-9 place-items-center rounded-full bg-lime text-ink ring-4 ring-bg-base">
              <MapPinOff className="h-4 w-4" />
            </span>
          </div>
          <h1 className="display text-[clamp(6rem,17vw,11rem)] leading-none text-ink">
            <span className="mark">{ka.notFound.title}</span>
          </h1>
          <h2 className="mt-6 font-display text-2xl md:text-3xl">
            {ka.notFound.heading}
          </h2>
          <p className="mx-auto mt-4 max-w-md text-ink-muted">{ka.notFound.message}</p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/">
                <Home className="h-4 w-4" />
                {ka.notFound.home}
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/calculator">
                {ka.notFound.calculator}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="mx-auto mt-16 max-w-3xl">
          <p className="eyebrow mb-5 text-center">
            {ka.notFound.suggestions}
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {suggestions.map((s) => (
              <Card key={s.href} className="rounded-2xl transition-all hover:-translate-y-0.5 hover:border-ink hover:shadow-cardHover">
                <Link href={s.href} className="block">
                  <CardContent className="flex items-center gap-3 p-5">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-mist-light text-ink">
                      <s.icon className="h-5 w-5" />
                    </div>
                    <span className="font-semibold">{s.label}</span>
                    <ArrowRight className="ml-auto h-4 w-4 text-ink-muted" />
                  </CardContent>
                </Link>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
