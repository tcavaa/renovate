import Link from 'next/link';
import { desc, eq, sql } from 'drizzle-orm';
import { ChevronRight, Search } from 'lucide-react';
import { db } from '@/lib/db';
import { projects, users } from '@/lib/db/schema';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { getT, getLocale } from '@/lib/i18n/server';
import { formatGEL } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const ka = getT();
  const locale = getLocale();
  const dateLocale = locale === 'ka' ? 'ka-GE' : locale === 'ru' ? 'ru-RU' : 'en-US';
  const q = (searchParams.q ?? '').trim();

  const baseQuery = db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
      projectCount: sql<number>`COUNT(${projects.id})`,
      totalCost: sql<number>`COALESCE(SUM(${projects.totalCost}), 0)`,
    })
    .from(users)
    .leftJoin(projects, eq(projects.userId, users.id))
    .groupBy(users.id)
    .orderBy(desc(users.createdAt));

  const rows = q
    ? await baseQuery.where(
        sql`${users.name} LIKE ${'%' + q + '%'} OR ${users.email} LIKE ${'%' + q + '%'}`
      )
    : await baseQuery;

  const stats = {
    total: rows.length,
    admins: rows.filter((r) => r.role === 'admin').length,
    withProjects: rows.filter((r) => Number(r.projectCount) > 0).length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold">{ka.admin.users}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {ka.admin.usersPage.headerCount} — {rows.length}
          </p>
        </div>
        <form action="/admin/users" className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={ka.admin.usersPage.searchPlaceholder}
            className="h-10 w-64 rounded-md border border-line bg-bg-surface pl-9 pr-3 text-sm outline-none focus:border-brand"
          />
        </form>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={ka.admin.stats.usersTotal} value={`${stats.total}`} />
        <StatCard label={ka.admin.stats.usersAdmins} value={`${stats.admins}`} />
        <StatCard label={ka.admin.stats.usersActive} value={`${stats.withProjects}`} />
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3">{ka.admin.table.id}</th>
                <th className="px-4 py-3">{ka.admin.table.name}</th>
                <th className="px-4 py-3">{ka.admin.table.email}</th>
                <th className="px-4 py-3">{ka.admin.table.role}</th>
                <th className="px-4 py-3 text-right">{ka.admin.table.projects}</th>
                <th className="px-4 py-3 text-right">{ka.admin.table.total}</th>
                <th className="px-4 py-3">{ka.admin.table.registered}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr
                  key={u.id}
                  className="group border-b border-line/40 transition-colors last:border-0 hover:bg-bg-base"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="font-medium text-brand hover:underline"
                    >
                      #{u.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="hover:text-brand"
                    >
                      {u.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{u.email}</td>
                  <td className="px-4 py-3">
                    {u.role === 'admin' ? (
                      <Badge variant="success">{ka.nav.admin}</Badge>
                    ) : (
                      <Badge variant="outline">{ka.nav.user}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {Number(u.projectCount)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {Number(u.totalCost) > 0
                      ? formatGEL(Number(u.totalCost))
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {new Date(u.createdAt).toLocaleDateString(dateLocale)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand opacity-0 transition-opacity group-hover:opacity-100 hover:underline"
                    >
                      {ka.admin.table.details}
                      <ChevronRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-ink-muted">
                    {ka.admin.usersEmpty}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

