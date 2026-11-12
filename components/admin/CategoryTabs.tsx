'use client';

import Link from 'next/link';
import { FolderTree, LayoutGrid } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { listHref, useListMemory } from '@/lib/admin/listMemory';
import { cn } from '@/lib/utils';

/**
 * The two halves of the categories section: the tree, and the studio's rooms that show it.
 * The tree's tab goes back to it as it was left — its search and filter (`lib/admin/listMemory`;
 * its folds keep themselves).
 */
export function CategoryTabs({ active }: { active: 'tree' | 'rooms' }) {
  const t = useT();
  const memory = useListMemory();
  const tabs = [
    { id: 'tree' as const, href: listHref(memory, '/admin/categories'), label: t.admin.catTree.tabTree, icon: FolderTree },
    { id: 'rooms' as const, href: '/admin/categories/rooms', label: t.admin.shelfRooms.tab, icon: LayoutGrid },
  ];
  return (
    <nav className="inline-flex gap-1 rounded-full bg-mist-light p-1" aria-label={t.admin.categories}>
      {tabs.map((tab) => (
        <Link key={tab.id} href={tab.href} aria-current={active === tab.id ? 'page' : undefined} className={cn('inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors', active === tab.id ? 'bg-lime text-ink' : 'text-ink-muted hover:text-ink')}>
          <tab.icon className="h-4 w-4" />
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
