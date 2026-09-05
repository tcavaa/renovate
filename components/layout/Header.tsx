'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Box, Calculator, Hammer, LayoutGrid, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { UserMenu } from '@/components/layout/UserMenu';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

export function Header() {
  const pathname = usePathname();
  const ka = useT();
  const [open, setOpen] = useState(false);

  const navLinks = [
    { href: '/', label: ka.nav.home },
    { href: '/calculator', label: ka.nav.calculator, icon: Calculator },
    { href: '/design', label: ka.design.nav, icon: Box, badge: ka.design.badge },
    { href: '/catalog', label: ka.nav.catalog, icon: LayoutGrid },
    { href: '/workers', label: ka.nav.workers, icon: Hammer },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-line bg-bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-bg-surface/75">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-white shadow-sm">
            <Hammer className="h-5 w-5" />
          </span>
          <div className="flex flex-col leading-none">
            <span className="font-serif text-lg font-bold tracking-tight">
              {ka.app.name}
            </span>
            <span className="text-[11px] text-ink-muted">RenovateGE</span>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => {
            const active =
              link.href === '/' ? pathname === '/' : pathname?.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-brand/10 text-brand-dark'
                    : 'text-ink hover:bg-bg-base hover:text-brand'
                )}
              >
                {link.label}
                {'badge' in link && link.badge && (
                  <span className="ml-1.5 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent-dark">
                    {link.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Button size="sm" asChild>
            <Link href="/calculator">{ka.hero.ctaPrimary}</Link>
          </Button>
          <UserMenu variant="desktop" />
          <LanguageSwitcher variant="desktop" />
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <LanguageSwitcher variant="desktop" />
          <button
            aria-label="menu"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden border-t border-line bg-bg-surface">
          <nav className="container flex flex-col gap-1 py-3">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-3 text-sm font-medium hover:bg-bg-base"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-2 space-y-2 border-t border-line pt-2">
              <Button asChild className="w-full">
                <Link href="/calculator" onClick={() => setOpen(false)}>
                  {ka.hero.ctaPrimary}
                </Link>
              </Button>
              <UserMenu variant="mobile" />
              <LanguageSwitcher variant="mobile" />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
