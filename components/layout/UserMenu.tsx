'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { ChevronDown, FolderKanban, LayoutDashboard, LogOut, User } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

/**
 * Account entry in the header. Signed out: two quiet text links. Signed in: a square initials
 * mark and the name, opening a flat hairline panel — same language as the rest of the header.
 */
export function UserMenu({ variant = 'desktop' }: { variant?: 'desktop' | 'mobile' }) {
  const { data: session, status } = useSession();
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (status === 'loading') {
    return <div className={cn('h-8 animate-pulse bg-line/50', variant === 'desktop' ? 'w-24' : 'w-full')} />;
  }

  const link = 'text-[13px] font-medium text-ink-soft transition-colors hover:text-ink';

  if (!session?.user) {
    if (variant === 'mobile') {
      return (
        <div className="grid grid-cols-2 gap-2">
          <Link href="/login" className="flex h-11 items-center justify-center border border-line text-sm font-medium hover:border-ink">
            {t.nav.login}
          </Link>
          <Link href="/register" className="flex h-11 items-center justify-center border border-ink bg-ink text-sm font-medium text-white">
            {t.nav.register}
          </Link>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-4">
        <Link href="/login" className={link}>
          {t.nav.login}
        </Link>
        <Link href="/register" className={cn(link, 'border border-line px-3 py-1.5 hover:border-ink')}>
          {t.nav.register}
        </Link>
      </div>
    );
  }

  const user = session.user;
  const name = user.name ?? user.email ?? t.nav.user;
  const initials = name
    .split(/\s+/)
    .map((s) => s.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const isAdmin = user.role === 'admin';

  const items = [
    { href: '/profile', icon: User, label: t.nav.profile },
    { href: '/profile', icon: FolderKanban, label: t.nav.projects },
    ...(isAdmin ? [{ href: '/admin', icon: LayoutDashboard, label: t.nav.admin }] : []),
  ];

  if (variant === 'mobile') {
    return (
      <div className="border border-line">
        <div className="flex items-center gap-3 border-b border-line px-3 py-3">
          <Mark initials={initials} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="truncate text-xs text-ink-muted">{user.email}</p>
          </div>
          {isAdmin && <AdminTag />}
        </div>
        {items.map((item) => (
          <MenuLink key={item.label} {...item} onClick={() => undefined} />
        ))}
        <SignOut label={t.nav.logout} onClick={() => void signOut({ callbackUrl: '/' })} />
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group flex items-center gap-2 py-1 text-[13px] font-medium text-ink"
      >
        <Mark initials={initials} />
        <span className="hidden max-w-[9rem] truncate lg:inline">{name}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-ink-faint transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-3 w-60 border border-line bg-bg-surface shadow-cardHover animate-fade-in" role="menu">
          <div className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{name}</p>
              <p className="truncate text-xs text-ink-muted">{user.email}</p>
            </div>
            {isAdmin && <AdminTag />}
          </div>
          {items.map((item) => (
            <MenuLink key={item.label} {...item} onClick={() => setOpen(false)} />
          ))}
          <SignOut
            label={t.nav.logout}
            onClick={() => {
              setOpen(false);
              void signOut({ callbackUrl: '/' });
            }}
          />
        </div>
      )}
    </div>
  );
}

function Mark({ initials }: { initials: string }) {
  return <span className="grid h-7 w-7 shrink-0 place-items-center bg-ink text-[11px] font-semibold text-white">{initials}</span>;
}

function AdminTag() {
  return <span className="shrink-0 border border-line px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">admin</span>;
}

function MenuLink({ href, icon: Icon, label, onClick }: { href: string; icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void }) {
  return (
    <Link href={href} onClick={onClick} className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-sm text-ink-soft transition-colors hover:bg-bg-base hover:text-ink">
      <Icon className="h-4 w-4 text-ink-faint" />
      {label}
    </Link>
  );
}

function SignOut({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-ink-soft transition-colors hover:bg-bg-base hover:text-danger">
      <LogOut className="h-4 w-4 text-ink-faint" />
      {label}
    </button>
  );
}
