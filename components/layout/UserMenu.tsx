'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { ChevronDown, FolderKanban, LayoutDashboard, LogOut, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

export function UserMenu({ variant = 'desktop' }: { variant?: 'desktop' | 'mobile' }) {
  const { data: session, status } = useSession();
  const ka = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (status === 'loading') {
    return (
      <div
        className={cn(
          'h-9 animate-pulse rounded-md bg-bg-base',
          variant === 'desktop' ? 'w-24' : 'w-full'
        )}
      />
    );
  }

  if (!session?.user) {
    if (variant === 'mobile') {
      return (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" asChild>
            <Link href="/login">{ka.nav.login}</Link>
          </Button>
          <Button asChild>
            <Link href="/register">{ka.nav.register}</Link>
          </Button>
        </div>
      );
    }
    return (
      <>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/login">{ka.nav.login}</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/register">{ka.nav.register}</Link>
        </Button>
      </>
    );
  }

  const user = session.user;
  const initials = (user.name ?? user.email ?? 'U')
    .split(/\s+/)
    .map((s) => s.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const isAdmin = user.role === 'admin';

  if (variant === 'mobile') {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3 rounded-md border border-line bg-bg-base px-3 py-2">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-brand text-sm font-bold text-white">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.name ?? user.email}</p>
            <p className="truncate text-xs text-ink-muted">{user.email}</p>
          </div>
        </div>
        <div className="grid gap-2">
          <Button variant="outline" asChild>
            <Link href="/profile">
              <FolderKanban className="h-4 w-4" />
              {ka.nav.projects}
            </Link>
          </Button>
          {isAdmin && (
            <Button variant="outline" asChild>
              <Link href="/admin">
                <LayoutDashboard className="h-4 w-4" />
                {ka.nav.admin}
              </Link>
            </Button>
          )}
          <Button variant="ghost" onClick={() => signOut({ callbackUrl: '/' })}>
            <LogOut className="h-4 w-4" />
            {ka.nav.logout}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md border border-line bg-bg-surface px-2 py-1.5 text-sm font-medium transition-colors hover:bg-bg-base"
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-brand text-xs font-bold text-white">
          {initials}
        </span>
        <span className="hidden max-w-[10rem] truncate lg:inline">
          {user.name ?? user.email}
        </span>
        <ChevronDown className="h-4 w-4 text-ink-muted" />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-lg border border-line bg-bg-surface shadow-lg"
          role="menu"
        >
          <div className="border-b border-line p-3">
            <p className="truncate text-sm font-semibold">
              {user.name ?? ka.nav.user}
            </p>
            <p className="truncate text-xs text-ink-muted">{user.email}</p>
            {isAdmin && (
              <span className="mt-1 inline-block rounded-md bg-brand/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand-dark">
                Admin
              </span>
            )}
          </div>
          <div className="p-1">
            <MenuLink
              href="/profile"
              icon={User}
              label={ka.nav.profile}
              onClick={() => setOpen(false)}
            />
            <MenuLink
              href="/profile"
              icon={FolderKanban}
              label={ka.nav.projects}
              onClick={() => setOpen(false)}
            />
            {isAdmin && (
              <MenuLink
                href="/admin"
                icon={LayoutDashboard}
                label={ka.nav.admin}
                onClick={() => setOpen(false)}
              />
            )}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                void signOut({ callbackUrl: '/' });
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-danger transition-colors hover:bg-danger/5"
            >
              <LogOut className="h-4 w-4" />
              {ka.nav.logout}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  icon: Icon,
  label,
  onClick,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-bg-base"
    >
      <Icon className="h-4 w-4 text-ink-muted" />
      {label}
    </Link>
  );
}
