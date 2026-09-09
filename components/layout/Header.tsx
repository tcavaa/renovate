'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import { UserMenu } from '@/components/layout/UserMenu';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

export const HEADER_HEIGHT_CLASS = 'h-[72px]';

/**
 * Site header.
 *
 * Sits over the landing hero as pure typography and turns into a frosted bar as soon as the
 * page scrolls; on every other page it starts frosted. The navigation is centred, the
 * primary action is a single dark pill — the chrome stays quiet so the imagery can speak.
 */
export function Header() {
  const pathname = usePathname();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const onLanding = pathname === '/';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  const links = [
    { href: '/design', label: t.design.nav, badge: t.design.badge },
    { href: '/calculator', label: t.nav.calculator },
    { href: '/catalog', label: t.nav.catalog },
    { href: '/workers', label: t.nav.workers },
  ];

  const frosted = scrolled || !onLanding || open;

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full transition-[background-color,border-color,box-shadow] duration-500',
        frosted ? 'border-b border-line/70 bg-bg-base/80 shadow-[0_1px_0_rgba(255,255,255,0.5)_inset] backdrop-blur-xl' : 'border-b border-transparent bg-transparent'
      )}
    >
      <div className={cn('container flex items-center justify-between gap-4', HEADER_HEIGHT_CLASS)}>
        <Link href="/" className="flex items-center gap-2.5" aria-label={t.app.name}>
          <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-[11px] font-bold text-white">რ</span>
          <span className="font-serif text-lg font-bold tracking-tight">{t.app.name}</span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          {links.map((link) => {
            const active = pathname?.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'relative px-4 py-2 text-sm font-medium transition-colors',
                  active ? 'text-ink' : 'text-ink-muted hover:text-ink'
                )}
              >
                {link.label}
                {link.badge && (
                  <span className="ml-1.5 bg-brand/12 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-dark">{link.badge}</span>
                )}
                {active && <span className="absolute inset-x-4 -bottom-0.5 h-px bg-ink" />}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-5 lg:flex">
          <UserMenu variant="desktop" />
          <Link
            href="/design"
            className="group inline-flex h-10 items-center gap-2 bg-ink pl-4 pr-3 text-sm font-medium text-white transition-colors hover:bg-brand"
          >
            {t.landing.heroCta}
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
          <LanguageSwitcher variant="desktop" />
        </div>

        <div className="flex items-center gap-4 lg:hidden">
          <LanguageSwitcher variant="desktop" />
          <button
            type="button"
            aria-label="menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="grid h-10 w-10 place-items-center border border-line bg-bg-surface/70"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-line/70 bg-bg-base/95 backdrop-blur-xl lg:hidden">
          <nav className="container flex flex-col gap-1 py-4">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="px-3 py-3 font-serif text-2xl font-semibold hover:bg-bg-surface">
                {link.label}
              </Link>
            ))}
            <div className="mt-3 space-y-3 border-t border-line pt-4">
              <Link href="/design" className="flex h-12 items-center justify-center gap-2 bg-ink text-sm font-medium text-white">
                {t.landing.heroCta} <ArrowUpRight className="h-4 w-4" />
              </Link>
              <UserMenu variant="mobile" />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
