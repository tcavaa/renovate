'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { ClipboardList, FolderKanban, Hammer, Home, LayoutDashboard, LogOut, Package, Store, UserCircle, UsersRound } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/layout/Logo';

/**
 * The partner portal's navigation: the same shape as the admin sidebar, with the partner's
 * own name at the top so a store owner with two accounts always knows which one is open.
 */
export function PartnerSidebar({ partnerName, partnerType, unread }: { partnerName: string | null; partnerType: 'store' | 'worker' | 'team' | null; unread: number }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const t = useT();
  const items = [
    { href: '/partner', label: t.partner.dashboard, icon: LayoutDashboard, exact: true },
    { href: '/partner/orders', label: t.partner.orders, icon: ClipboardList, badge: unread },
    ...(partnerType === 'store' ? [{ href: '/partner/products', label: t.partner.products, icon: Package }] : []),
    // A brigade does the whole job: the flats it is hired for, to look at.
    ...(partnerType === 'team' ? [{ href: '/partner/projects', label: t.projectView.projectsTitle, icon: FolderKanban }] : []),
    ...(partnerType === 'worker' || partnerType === 'team' ? [{ href: '/partner/profile', label: t.partner.profile, icon: UserCircle }] : []),
  ];
  const user = session?.user;
  const Mark = partnerType === 'worker' ? Hammer : partnerType === 'team' ? UsersRound : Store;
  const accountLabel = partnerType === 'worker' ? t.partner.workerAccount : partnerType === 'team' ? t.partner.teamAccount : t.partner.storeAccount;

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col self-start border-r border-line bg-bg-surface">
      <div className="flex-1 overflow-y-auto px-4 pb-5 pt-6">
        <div className="mb-5 flex items-center px-2">
          <Logo />
        </div>
        <Link href="/" className="mb-5 inline-flex items-center gap-2 rounded-full bg-mist-light px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-mist">
          <Home className="h-3.5 w-3.5" />
          {t.partner.backToSite}
        </Link>
        <div className="mb-5 flex items-start gap-3 rounded-2xl bg-mist-light p-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink text-lime">
            <Mark className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="eyebrow">{accountLabel}</p>
            <p className="mt-0.5 truncate font-display text-base text-ink">{partnerName ?? t.partner.adminPreview}</p>
          </div>
        </div>
        <nav className="space-y-0.5">
          {items.map((item) => {
            const active = item.exact ? pathname === item.href : pathname?.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors', active ? 'bg-lime font-semibold text-ink' : 'font-medium text-ink-soft hover:bg-mist-light hover:text-ink')}>
                <Icon className={cn('h-[18px] w-[18px]', active ? 'text-ink' : 'text-ink-muted')} />
                <span className="flex-1">{item.label}</span>
                {'badge' in item && item.badge ? <span className={cn('min-w-5 rounded-full bg-ink px-1.5 py-0.5 text-center text-[11px] font-bold tabular-nums', active ? 'text-lime' : 'text-white')}>{item.badge}</span> : null}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="space-y-3 border-t border-line p-4">
        <LanguageSwitcher variant="mobile" />
        {user && (
          <div className="min-w-0 rounded-2xl bg-mist-light px-3 py-2">
            <p className="truncate text-xs font-semibold">{user.name}</p>
            <p className="truncate text-[11px] text-ink-muted">{user.email}</p>
          </div>
        )}
        <button type="button" onClick={() => signOut({ callbackUrl: '/' })} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-ink-soft transition-colors hover:bg-coral-soft hover:text-danger">
          <LogOut className="h-4 w-4" />
          {t.nav.logout}
        </button>
      </div>
    </aside>
  );
}
