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
    <section className="relative overflow-hidden bg-radial-warm">
      {/* A row of arches standing on the floor line — a doorway that leads nowhere. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden items-end justify-center gap-4 md:flex" aria-hidden>
        <span className="arch h-40 w-24 bg-stone/60" />
        <span className="arch h-56 w-32 bg-sand" />
        <span className="w-[34rem]" />
        <span className="arch h-56 w-32 bg-sand" />
        <span className="arch h-40 w-24 bg-olive-soft" />
      </div>

      <div className="container relative py-20 md:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <div className="relative mx-auto mb-8 h-20 w-20">
            <LogoMark tone="sand" className="h-20 w-20 shadow-card" />
            <span className="absolute -bottom-2 -right-2 grid h-9 w-9 place-items-center rounded-full bg-brand text-white shadow-card">
              <MapPinOff className="h-4 w-4" />
            </span>
          </div>
          <h1 className="display text-[clamp(5rem,14vw,9rem)] leading-none tracking-[0.12em] text-brand">
            {ka.notFound.title}
          </h1>
          <h2 className="mt-4 font-serif text-2xl font-semibold md:text-3xl">
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
              <Card key={s.href} className="rounded-3xl transition-all hover:-translate-y-0.5 hover:shadow-cardHover">
                <Link href={s.href} className="block">
                  <CardContent className="flex items-center gap-3 p-5">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-olive-soft text-olive">
                      <s.icon className="h-5 w-5" />
                    </div>
                    <span className="font-medium">{s.label}</span>
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
