'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { ClipboardList, Hammer, Home, LayoutDashboard, LogOut, Package, Store, UserCircle } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { cn } from '@/lib/utils';

/**
 * The partner portal's navigation: the same shape as the admin sidebar, with the partner's
 * own name at the top so a store owner with two accounts always knows which one is open.
 */
export function PartnerSidebar({ partnerName, partnerType, unread }: { partnerName: string | null; partnerType: 'store' | 'worker' | null; unread: number }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const t = useT();
  const items = [
    { href: '/partner', label: t.partner.dashboard, icon: LayoutDashboard, exact: true },
    { href: '/partner/orders', label: t.partner.orders, icon: ClipboardList, badge: unread },
    ...(partnerType === 'store' ? [{ href: '/partner/products', label: t.partner.products, icon: Package }] : []),
    ...(partnerType === 'worker' ? [{ href: '/partner/profile', label: t.partner.profile, icon: UserCircle }] : []),
  ];
  const user = session?.user;
  const Mark = partnerType === 'worker' ? Hammer : Store;

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col self-start border-r border-line bg-bg-surface">
      <div className="flex-1 overflow-y-auto p-5">
        <Link href="/" className="mb-6 flex items-center gap-2 text-sm text-ink-muted hover:text-brand">
          <Home className="h-4 w-4" />
          {t.partner.backToSite}
        </Link>
        <div className="mb-6 flex items-start gap-3 border border-line p-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center bg-ink text-white">
            <Mark className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="eyebrow">{partnerType === 'worker' ? t.partner.workerAccount : t.partner.storeAccount}</p>
            <p className="mt-0.5 truncate font-serif text-base font-semibold text-ink">{partnerName ?? t.partner.adminPreview}</p>
          </div>
        </div>
        <nav className="space-y-1">
          {items.map((item) => {
            const active = item.exact ? pathname === item.href : pathname?.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={cn('flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors', active ? 'bg-ink text-white' : 'text-ink hover:bg-bg-base')}>
                <Icon className="h-4 w-4" />
                <span className="flex-1">{item.label}</span>
                {'badge' in item && item.badge ? <span className={cn('min-w-5 px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums', active ? 'bg-white text-ink' : 'bg-brand text-white')}>{item.badge}</span> : null}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="space-y-3 border-t border-line p-4">
        <LanguageSwitcher variant="mobile" />
        {user && (
          <div className="min-w-0 border-t border-line pt-3">
            <p className="truncate text-xs font-medium">{user.name}</p>
            <p className="truncate text-[11px] text-ink-muted">{user.email}</p>
          </div>
        )}
        <button type="button" onClick={() => signOut({ callbackUrl: '/' })} className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/5">
          <LogOut className="h-4 w-4" />
          {t.nav.logout}
        </button>
      </div>
    </aside>
  );
}
