import Link from 'next/link';
import { ArrowUpRight, ShieldCheck } from 'lucide-react';
import { getT } from '@/lib/i18n/server';
import { WORKERS_DIRECTORY } from '@/lib/features';
import { PaymentMarks } from '@/components/layout/PaymentMarks';
import { Logo, Wordmark } from '@/components/layout/Logo';

/**
 * The olive footer, edged with the brand's six swatches and closing on an oversized PLAYCE
 * wordmark — the brand is the last thing on every page.
 */
export async function Footer() {
  const t = await getT();
  const columns = [
    {
      title: t.footer.product,
      links: [
        { href: '/design', label: t.design.nav },
        { href: '/calculator', label: t.nav.calculator },
        { href: '/catalog', label: t.nav.catalog },
        // A renovation is hired as a brigade; the workers' own directory is switched off.
        WORKERS_DIRECTORY ? { href: '/workers', label: t.nav.workers } : { href: '/teams', label: t.nav.teams },
      ],
    },
    {
      title: t.footer.company,
      links: [
        { href: '/about', label: t.footer.about },
        { href: '/contact', label: t.footer.contact },
        { href: '/privacy', label: t.footer.privacy },
        { href: '/terms', label: t.footer.terms },
        { href: '/refund', label: t.footer.refund },
      ],
    },
  ];

  return (
    <footer data-site-nav className="relative mt-32 overflow-hidden bg-bg-deep text-sand-light">
      {/* The brand board's swatches — sand, stone, wood, terracotta, olive, charcoal — as the footer's edge. */}
      <div className="grid h-1.5 grid-cols-6" aria-hidden>
        <span className="bg-sand" />
        <span className="bg-stone" />
        <span className="bg-wood" />
        <span className="bg-brand" />
        <span className="bg-olive-light" />
        <span className="bg-charcoal" />
      </div>
      <div className="container pb-10 pt-16">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="space-y-6">
            <Logo tagline={t.app.tagline} tone="sand" inverted />
            <p className="max-w-xs text-sm leading-relaxed text-sand-light/65">{t.app.description}</p>
            <Link
              href="/design"
              className="group inline-flex h-11 items-center gap-2 rounded-full bg-brand px-5 text-sm font-medium text-white transition-colors hover:bg-brand-dark"
            >
              {t.landing.heroCta}
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </Link>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="eyebrow mb-4 text-sand-light/45">{col.title}</h4>
              <ul className="space-y-2.5 text-sm">
                {col.links.map((l) => (
                  <li key={l.href}>
                    {/* Not prefetched: every page is rendered per request, so each footer link in
                        view cost a function call on every page, for pages rarely opened from here
                        (the header prefetches the main four). */}
                    <Link href={l.href} prefetch={false} className="text-sand-light/80 transition-colors hover:text-white">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <h4 className="eyebrow mb-4 text-sand-light/45">{t.footer.contact}</h4>
            <ul className="space-y-2.5 text-sm text-sand-light/80">
              <li>{t.footer.address}</li>
              <li>{t.footer.email}</li>
              <li>{t.footer.phone}</li>
            </ul>
          </div>
        </div>

        {/* How the site takes cards — what the card schemes and Flitt ask a merchant to show. */}
        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-white/10 pt-6 sm:flex-row sm:items-center">
          <p className="flex items-center gap-2 text-xs text-sand-light/60">
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
            {t.footer.securePayments}
          </p>
          <PaymentMarks />
        </div>

        <div className="mt-16 select-none overflow-hidden" aria-hidden>
          <Wordmark className="text-[clamp(3rem,14vw,14rem)] text-sand-light/[0.07]" />
        </div>

        <div className="mt-6 flex flex-col items-start justify-between gap-3 border-t border-white/10 pt-6 text-xs text-sand-light/55 sm:flex-row sm:items-center">
          <p>
            © {new Date().getFullYear()} {t.app.name}. {t.footer.rights}.
            <span className="block sm:inline sm:before:mx-2 sm:before:content-['·']">
              {t.footer.company_name} · {t.footer.companyIdLabel} {t.footer.company_id} · {t.footer.legal_address}
            </span>
          </p>
          <p className="uppercase tracking-[0.24em]">{t.app.motto}</p>
        </div>
      </div>
    </footer>
  );
}
