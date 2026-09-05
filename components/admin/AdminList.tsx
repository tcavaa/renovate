import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { Dictionary } from '@/lib/i18n';
import { fill, hrefWith, pageWindow } from '@/lib/admin/list';
import { cn } from '@/lib/utils';

/**
 * Server-side building blocks every admin list shares: the page header, the table shell,
 * the empty row and the pager. Filters are the client `FilterBar`; sorting is a select in it.
 */

export function AdminPageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-serif text-3xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
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
