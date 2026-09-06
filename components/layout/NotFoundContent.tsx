import Link from 'next/link';
import { ArrowRight, Calculator, Home, LayoutGrid, Hammer, MapPinOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';

/**
 * The 404 body, shared by the root and the `(main)` not-found pages — the root one has to
 * draw its own header and footer because it renders outside the main layout.
 */
export async function NotFoundContent() {
  const ka = await getT();
  const suggestions = [
    { href: '/calculator', icon: Calculator, label: ka.notFound.calculator },
    { href: '/catalog', icon: LayoutGrid, label: ka.notFound.catalogSuggest },
    { href: '/workers', icon: Hammer, label: ka.notFound.workersSuggest },
  ];
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-bg-base via-brand/5 to-accent/10" />
      <div className="absolute -right-20 -top-20 h-96 w-96 rounded-full bg-brand/10 blur-3xl -z-10" />
      <div className="absolute -left-20 bottom-0 h-96 w-96 rounded-full bg-accent/10 blur-3xl -z-10" />

      <div className="container py-20 md:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-2xl bg-brand/10 text-brand">
            <MapPinOff className="h-10 w-10" />
          </div>
          <h1 className="font-serif text-7xl font-bold tracking-tight text-brand md:text-8xl">
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
          <p className="mb-4 text-center text-sm font-semibold text-ink-muted">
            {ka.notFound.suggestions}
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {suggestions.map((s) => (
              <Card key={s.href} className="hover:shadow-cardHover transition-shadow">
                <Link href={s.href} className="block">
                  <CardContent className="flex items-center gap-3 p-5">
                    <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand/10 text-brand">
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
