'use client';

import Link from 'next/link';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { fill } from '@/lib/admin/list';
import { listHref, useListMemory } from '@/lib/admin/listMemory';
import type { Crumb } from '@/lib/admin/crumbs';
import { cn } from '@/lib/utils';

/**
 * Where an admin page sits — the dashboard, the section, the thing open — with a back button
 * to the crumb above. A crumb that is a list goes back to it as it was left (its filters, sort
 * and page, `lib/admin/listMemory`), so "back" from a product is the filtered list it was
 * opened from, not page one of everything. The dashboard is the first crumb of every page; on
 * the dashboard itself the site is.
 */
export function AdminCrumbs({ trail, className }: { trail: Crumb[]; className?: string }) {
  const t = useT();
  const memory = useListMemory();
  const crumbs: Crumb[] = trail.length === 0 ? [{ label: t.app.name, href: '/' }, { label: t.admin.dashboard }] : [{ label: t.admin.dashboard, href: '/admin' }, ...trail];
  const hrefOf = (crumb: Crumb) => (crumb.href && crumb.list ? listHref(memory, crumb.href) : crumb.href);
  const parent = crumbs
    .slice(0, -1)
    .reverse()
    .find((c) => c.href);

  return (
    <nav aria-label={t.admin.breadcrumbs} className={cn('flex min-w-0 items-center gap-2.5', className)}>
      {parent && (
        <Link
          href={hrefOf(parent)!}
          title={fill(t.admin.backTo, { label: parent.label })}
          aria-label={fill(t.admin.backTo, { label: parent.label })}
          className="group inline-flex h-8 shrink-0 items-center gap-1.5 border border-line bg-bg-surface pl-2 pr-2.5 text-xs font-medium text-ink-soft transition-colors hover:border-ink hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
          {t.admin.actions.back}
        </Link>
      )}
      <ol className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-ink-muted">
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          const href = hrefOf(crumb);
          return (
            <li key={`${i}-${crumb.label}`} className="flex min-w-0 items-center gap-1">
              {last || !href ? (
                <span aria-current={last ? 'page' : undefined} className={cn('truncate', last ? 'max-w-[28rem] font-medium text-ink' : '')}>
                  {crumb.label}
                </span>
              ) : (
                <Link href={href} className="max-w-[16rem] truncate underline-offset-4 transition-colors hover:text-ink hover:underline">
                  {crumb.label}
                </Link>
              )}
              {!last && <ChevronRight className="h-3 w-3 shrink-0 text-ink-faint" aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
