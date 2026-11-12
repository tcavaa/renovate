'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import { UserMenu } from '@/components/layout/UserMenu';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { WORKERS_DIRECTORY } from '@/lib/features';
import { Logo } from '@/components/layout/Logo';

export const HEADER_HEIGHT_CLASS = 'h-[72px]';

/**
 * Site header.
 *
 * A white bar: the ROOMIT wordmark on the left, the navigation centred as plain heavy words (the
 * open page on a lime pill), the account on the right. It sits clear over the landing hero and
 * turns into a frosted white bar with a hairline as soon as the page scrolls; on every other
 * page it starts frosted.
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
    { href: '/teams', label: t.nav.teams },
    { href: '/pricing', label: t.plans.navPricing },
    ...(WORKERS_DIRECTORY ? [{ href: '/workers', label: t.nav.workers }] : []),
  ];

  const frosted = scrolled || !onLanding || open;

  return (
    <header
      data-site-nav
      className={cn(
        'sticky top-0 z-50 w-full transition-[background-color,border-color,box-shadow] duration-500',
        frosted ? 'border-b border-line bg-bg-surface/90 backdrop-blur-xl' : 'border-b border-transparent bg-transparent'
      )}
    >
      {/* Three columns, the navigation in the middle one: centred by the grid rather than by the
          space around it, it stays put when the account menu's placeholder gives way to the menu
          (a different width) — that shift was most of the site's layout shift. */}
      <div className={cn('container grid grid-cols-[1fr_auto_1fr] items-center gap-4', HEADER_HEIGHT_CLASS)}>
        <Link href="/" className="col-start-1 flex items-center justify-self-start" aria-label={t.app.name}>
          <Logo />
        </Link>

        <nav className="col-start-2 hidden items-center gap-1 lg:flex" aria-label="Primary">
          {links.map((link) => {
            const active = pathname?.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'relative flex items-center rounded-full px-4 py-2 text-sm font-semibold text-ink transition-colors',
                  active ? 'bg-lime' : 'hover:bg-mist'
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="col-start-3 hidden items-center gap-5 justify-self-end lg:flex">
          <UserMenu variant="desktop" />
          <LanguageSwitcher variant="desktop" />
        </div>

        <div className="col-start-3 flex items-center gap-4 justify-self-end lg:hidden">
          <LanguageSwitcher variant="desktop" />
          <button
            type="button"
            aria-label="menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="grid h-10 w-10 place-items-center rounded-full bg-ink text-white"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-line bg-bg-surface lg:hidden">
          <nav className="container flex flex-col gap-1 py-4">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn('rounded-2xl px-4 py-3 font-display text-2xl hover:bg-mist-light', pathname?.startsWith(link.href) && 'bg-lime hover:bg-lime')}
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-3 space-y-3 border-t border-line pt-4">
              <Link href="/design" className="flex h-12 items-center justify-center gap-2 rounded-full bg-ink text-sm font-semibold text-white hover:bg-lime hover:text-ink">
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
