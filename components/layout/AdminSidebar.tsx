'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { Calculator, ClipboardList, FolderTree, Hammer, Home, LayoutDashboard, LogOut, Package, Receipt, Settings, Store, TrendingUp, Users as UsersIcon } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';

export function AdminSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const ka = useT();
  const items = [
    { href: '/admin', label: ka.admin.dashboard, icon: LayoutDashboard, exact: true },
    { href: '/admin/products', label: ka.admin.products, icon: Package },
    { href: '/admin/categories', label: ka.admin.categories, icon: FolderTree },
    { href: '/admin/stores', label: ka.admin.stores, icon: Store },
    { href: '/admin/rates', label: ka.admin.rates, icon: Calculator },
    { href: '/admin/workers', label: ka.admin.workers, icon: Hammer },
    { href: '/admin/projects', label: ka.admin.projects, icon: ClipboardList },
    { href: '/admin/orders', label: ka.admin.orders, icon: Receipt },
    { href: '/admin/revenue', label: ka.admin.revenue.title, icon: TrendingUp },
    { href: '/admin/users', label: ka.admin.users, icon: UsersIcon },
    { href: '/admin/settings', label: ka.admin.settings.title, icon: Settings },
  ];
  const user = session?.user;
  const initials = (user?.name ?? user?.email ?? 'A')
    .split(/\s+/)
    .map((s) => s.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col self-start border-r border-line bg-bg-surface">
      <div className="flex-1 overflow-y-auto p-5">
        <Link
          href="/"
          className="mb-6 flex items-center gap-2 text-sm text-ink-muted hover:text-brand"
        >
          <Home className="h-4 w-4" />
          {ka.admin.sidebarBack}
        </Link>
        <nav className="space-y-1">
          {items.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname?.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active ? 'bg-brand/10 text-brand-dark' : 'text-ink hover:bg-bg-base'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="space-y-3 border-t border-line p-4">
        <LanguageSwitcher variant="mobile" />
        {user && (
          <div className="flex items-center gap-2 border-t border-line pt-3">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-brand text-xs font-bold text-white">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">
                {user.name ?? ka.admin.defaultName}
              </p>
              <p className="truncate text-[11px] text-ink-muted">{user.email}</p>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: '/' })}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/5"
        >
          <LogOut className="h-4 w-4" />
          {ka.nav.logout}
        </button>
      </div>
    </aside>
  );
}
