import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { AdminCrumbs } from '@/components/admin/AdminCrumbs';
import type { Dictionary } from '@/lib/i18n';
import type { Crumb } from '@/lib/admin/crumbs';
import { fill, hrefWith, pageWindow } from '@/lib/admin/list';
import { cn } from '@/lib/utils';

/**
 * Server-side building blocks every admin page shares: the page header (with its breadcrumbs
 * and back button), the table shell, the empty row, the pager and the segmented links a list
 * is split by. Filters are the client `FilterBar`; sorting is a menu in it.
 */

export function AdminPageHeader({
  title,
  subtitle,
  actions,
  crumbs,
  eyebrow,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /** Where the page sits under the dashboard (`sectionCrumb`); the last is the page itself. */
  crumbs?: Crumb[];
  /** A line over the title — a category's place in the tree, a kind of account. */
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      {crumbs && <AdminCrumbs trail={crumbs} />}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
          <h1 className="font-serif text-3xl font-bold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/**
 * A list's views as one segmented control — the order queue and every order, the revenue
 * report's periods: links, so each view is a URL. `attention` marks a view with something
 * waiting in it while another is showing.
 */
export function SegmentedLinks({ items, label, className }: { items: Array<{ href: string; label: React.ReactNode; active: boolean; attention?: boolean }>; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={cn('inline-flex flex-wrap border border-line bg-bg-surface p-0.5', className)}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? 'page' : undefined}
          className={cn(
            'inline-flex h-7 items-center gap-1.5 px-3 text-xs font-medium transition-colors',
            item.active ? 'bg-ink text-white' : item.attention ? 'text-warning hover:bg-warning/10' : 'text-ink-soft hover:bg-bg-base hover:text-ink'
          )}
        >
          {item.attention && !item.active && <span className="h-1.5 w-1.5 bg-warning" aria-hidden />}
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function AdminTable({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full text-sm">{children}</table>
      </CardContent>
    </Card>
  );
}

export function Th({ children, className, right }: { children?: React.ReactNode; className?: string; right?: boolean }) {
  return <th className={cn('px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-ink-muted', right && 'text-right', className)}>{children}</th>;
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-line">{children}</tr>
    </thead>
  );
}

export function Tr({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tr className={cn('group border-b border-line/40 transition-colors last:border-0 hover:bg-bg-base/60', className)}>{children}</tr>;
}

export function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-14 text-center text-sm text-ink-muted">
        {text}
      </td>
    </tr>
  );
}

/** `1–25 of 312` plus previous/next and a window of page links, all as URLs. */
export function Pager({
  t,
  pathname,
  raw,
  page,
  pageSize,
  total,
}: {
  t: Dictionary;
  pathname: string;
  raw: Record<string, string>;
  page: number;
  pageSize: number;
  total: number;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-muted">
      <span>{fill(t.admin.filters.showing, { from, to, total })}</span>
      {pageCount > 1 && (
        <nav className="flex items-center gap-1" aria-label={t.admin.filters.sort}>
          <PageLink href={hrefWith(pathname, raw, { page: page - 1 })} disabled={page <= 1} label={t.admin.filters.prev}>
            <ChevronLeft className="h-4 w-4" />
          </PageLink>
          {pageWindow(page, pageCount).map((p) => (
            <PageLink key={p} href={hrefWith(pathname, raw, { page: p === 1 ? undefined : p })} active={p === page} label={String(p)}>
              {p}
            </PageLink>
          ))}
          <PageLink href={hrefWith(pathname, raw, { page: page + 1 })} disabled={page >= pageCount} label={t.admin.filters.next}>
            <ChevronRight className="h-4 w-4" />
          </PageLink>
        </nav>
      )}
    </div>
  );
}

function PageLink({
  href,
  children,
  active,
  disabled,
  label,
}: {
  href: string;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  label: string;
}) {
  const base = 'inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm transition-colors';
  if (disabled) return <span className={cn(base, 'opacity-40')}>{children}</span>;
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={cn(base, active ? 'bg-brand text-white' : 'hover:bg-bg-base text-ink')}
    >
      {children}
    </Link>
  );
}
