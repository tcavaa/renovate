import Link from 'next/link';
import { Hammer, Heart } from 'lucide-react';
import { getT } from '@/lib/i18n/server';

export function Footer() {
  const ka = getT();
  return (
    <footer className="mt-24 border-t border-line bg-bg-surface">
      <div className="container py-12">
        <div className="grid gap-8 md:grid-cols-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-white">
                <Hammer className="h-5 w-5" />
              </span>
              <span className="font-serif text-lg font-bold">{ka.app.name}</span>
            </div>
            <p className="text-sm text-ink-muted">{ka.app.description}</p>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold">{ka.footer.product}</h4>
            <ul className="space-y-2 text-sm text-ink-muted">
              <li>
                <Link href="/calculator" className="hover:text-brand">
                  {ka.nav.calculator}
                </Link>
              </li>
              <li>
                <Link href="/catalog" className="hover:text-brand">
                  {ka.nav.catalog}
                </Link>
              </li>
              <li>
                <Link href="/workers" className="hover:text-brand">
                  {ka.nav.workers}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold">{ka.footer.company}</h4>
            <ul className="space-y-2 text-sm text-ink-muted">
              <li>
                <Link href="/about" className="hover:text-brand">
                  {ka.footer.about}
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-brand">
                  {ka.footer.contact}
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-brand">
                  {ka.footer.privacy}
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-brand">
                  {ka.footer.terms}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold">{ka.footer.contact}</h4>
            <ul className="space-y-2 text-sm text-ink-muted">
              <li>{ka.footer.address}</li>
              <li>{ka.footer.email}</li>
              <li>{ka.footer.phone}</li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-line pt-6 sm:flex-row">
          <p className="text-xs text-ink-muted">
            © {new Date().getFullYear()} {ka.app.name}. {ka.footer.rights}.
          </p>
          <p className="flex items-center gap-1.5 text-xs text-ink-muted">
            {ka.footer.poweredBy} <Heart className="h-3.5 w-3.5 text-brand" />
          </p>
        </div>
      </div>
    </footer>
  );
}
