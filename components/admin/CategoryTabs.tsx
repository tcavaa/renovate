import Link from 'next/link';
import { FolderTree, LayoutGrid } from 'lucide-react';
import type { Dictionary } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** The two halves of the categories section: the tree, and the studio's rooms that show it. */
export function CategoryTabs({ t, active }: { t: Dictionary; active: 'tree' | 'rooms' }) {
  const tabs = [
    { id: 'tree' as const, href: '/admin/categories', label: t.admin.catTree.tabTree, icon: FolderTree },
    { id: 'rooms' as const, href: '/admin/categories/rooms', label: t.admin.shelfRooms.tab, icon: LayoutGrid },
  ];
  return (
    <nav className="flex gap-1 border-b border-line" aria-label={t.admin.categories}>
      {tabs.map((tab) => (
        <Link key={tab.id} href={tab.href} aria-current={active === tab.id ? 'page' : undefined} className={cn('-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors', active === tab.id ? 'border-ink text-ink' : 'border-transparent text-ink-muted hover:text-ink')}>
          <tab.icon className="h-4 w-4" />
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
