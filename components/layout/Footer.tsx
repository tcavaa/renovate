import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { getT } from '@/lib/i18n/server';

/** Quiet footer with an oversized wordmark — the brand is the last thing on every page. */
export async function Footer() {
  const t = await getT();
  const columns = [
    {
      title: t.footer.product,
      links: [
        { href: '/design', label: t.design.nav },
        { href: '/calculator', label: t.nav.calculator },
        { href: '/catalog', label: t.nav.catalog },
        { href: '/workers', label: t.nav.workers },
      ],
    },
    {
      title: t.footer.company,
      links: [
        { href: '/about', label: t.footer.about },
        { href: '/contact', label: t.footer.contact },
        { href: '/privacy', label: t.footer.privacy },
        { href: '/terms', label: t.footer.terms },
      ],
    },
  ];

  return (
    <footer className="relative mt-32 overflow-hidden border-t border-line bg-bg-base">
      <div className="container pb-10 pt-16">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="space-y-5">
            <p className="max-w-xs text-sm leading-relaxed text-ink-muted">{t.app.description}</p>
            <Link
              href="/design"
              className="group inline-flex items-center gap-2 text-sm font-medium text-ink hover:text-brand"
            >
              {t.landing.heroCta}
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="eyebrow mb-4">{col.title}</h4>
              <ul className="space-y-2.5 text-sm">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-ink-soft transition-colors hover:text-brand">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <h4 className="eyebrow mb-4">{t.footer.contact}</h4>
            <ul className="space-y-2.5 text-sm text-ink-soft">
              <li>{t.footer.address}</li>
              <li>{t.footer.email}</li>
              <li>{t.footer.phone}</li>
            </ul>
          </div>
        </div>

        <div className="mt-16 select-none overflow-hidden" aria-hidden>
          <p className="display text-[clamp(3rem,13vw,13rem)] leading-[0.85] text-ink/[0.06]">{t.app.name}</p>
        </div>

        <div className="mt-6 flex flex-col items-start justify-between gap-3 border-t border-line pt-6 text-xs text-ink-muted sm:flex-row sm:items-center">
          <p>
            © {new Date().getFullYear()} {t.app.name}. {t.footer.rights}.
          </p>
          <p>{t.app.tagline}</p>
        </div>
      </div>
    </footer>
  );
}
