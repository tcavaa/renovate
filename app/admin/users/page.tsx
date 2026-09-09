import Link from 'next/link';
import { and, asc, count, desc, eq, like, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { USER_ROLES, isUserRole, type UserRole } from '@/lib/auth/roles';
import { roleLabel } from '@/lib/i18n/labels';
import { projects, users } from '@/lib/db/schema';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { FilterBar } from '@/components/admin/FilterBar';
import { AdminPageHeader, AdminTable, EmptyRow, Pager, THead, Th, Tr } from '@/components/admin/AdminList';
import { getT, getLocale } from '@/lib/i18n/server';
import { parseListParams, type SearchParams } from '@/lib/admin/list';
import { dateLocaleFor } from '@/components/projects/ProjectDetail';
import { formatGEL } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const SORTS = ['newest', 'name', 'projects', 'total'] as const;
const PATH = '/admin/users';

export default async function AdminUsersPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const ka = await getT();
  const locale = await getLocale();
  const p = parseListParams(searchParams, { sorts: SORTS, defaultSort: 'newest' });

  const where: SQL[] = [];
  if (p.q) {
    const needle = `%${p.q}%`;
    where.push(or(like(users.name, needle), like(users.email, needle))!);
  }
  if (isUserRole(p.get('role'))) where.push(eq(users.role, p.get('role') as UserRole));
  if (p.get('verified') === 'yes') where.push(sql`${users.emailVerifiedAt} IS NOT NULL`);
  if (p.get('verified') === 'no') where.push(sql`${users.emailVerifiedAt} IS NULL`);
  const filter = where.length ? and(...where) : undefined;

  const projectCount = count(projects.id);
  const totalCost = sql<number>`COALESCE(SUM(${projects.totalCost}), 0)`;
  const having =
    p.get('projects') === 'yes' ? sql`COUNT(${projects.id}) > 0` : p.get('projects') === 'no' ? sql`COUNT(${projects.id}) = 0` : undefined;

  const orderBy =
    p.sort === 'name'
      ? [p.dir === 'desc' ? desc(users.name) : asc(users.name)]
      : p.sort === 'projects'
        ? [p.dir === 'asc' ? asc(projectCount) : desc(projectCount)]
        : p.sort === 'total'
          ? [p.dir === 'asc' ? asc(totalCost) : desc(totalCost)]
          : [p.dir === 'asc' ? asc(users.createdAt) : desc(users.createdAt)];

  const base = () =>
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        emailVerifiedAt: users.emailVerifiedAt,
        createdAt: users.createdAt,
        projectCount,
        totalCost,
        lastProjectAt: sql<Date | null>`MAX(${projects.createdAt})`,
      })
      .from(users)
      .leftJoin(projects, eq(projects.userId, users.id))
      .where(filter)
      .groupBy(users.id)
      .having(having);

  const [rows, allMatching, [{ usersTotal }], [{ admins }]] = await Promise.all([
    base().orderBy(...orderBy).limit(p.pageSize).offset((p.page - 1) * p.pageSize),
    base(),
    db.select({ usersTotal: count() }).from(users),
    db.select({ admins: count() }).from(users).where(eq(users.role, 'admin')),
  ]);
  const total = allMatching.length;
  const withProjects = allMatching.filter((r) => Number(r.projectCount) > 0).length;

  const f = ka.admin.filters;
  const dateLocale = dateLocaleFor(locale);

  return (
    <div className="space-y-5">
      <AdminPageHeader title={ka.admin.users} subtitle={`${ka.admin.usersPage.headerCount} — ${total}`} />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={ka.admin.stats.usersTotal} value={`${usersTotal}`} />
        <StatCard label={ka.admin.stats.usersAdmins} value={`${admins}`} />
        <StatCard label={ka.admin.stats.usersActive} value={`${withProjects}`} />
      </div>

      <FilterBar
        fields={[
          { name: 'q', type: 'search', placeholder: ka.admin.usersPage.searchPlaceholder, className: 'w-72' },
          { name: 'role', type: 'select', label: f.role, options: USER_ROLES.map((r) => ({ value: r, label: roleLabel(ka, r) })) },
          { name: 'projects', type: 'select', label: ka.admin.table.projects, options: [{ value: 'yes', label: f.hasProjects }, { value: 'no', label: f.noProjects }] },
          { name: 'verified', type: 'select', label: ka.admin.cols.verified, options: [{ value: 'yes', label: f.verified }, { value: 'no', label: f.unverified }] },
        ]}
        sorts={[
          { value: 'newest', label: f.sortNewest },
          { value: 'name:asc', label: f.sortName },
          { value: 'projects', label: f.sortProducts.replace(/.*/, ka.admin.table.projects) },
          { value: 'total', label: f.sortCost },
        ]}
        defaultSort="newest"
      />

      <AdminTable>
        <THead>
          <Th>{ka.admin.table.id}</Th>
          <Th>{ka.admin.table.name}</Th>
          <Th>{ka.admin.table.email}</Th>
          <Th>{ka.admin.table.role}</Th>
          <Th right>{ka.admin.table.projects}</Th>
          <Th right>{ka.admin.table.total}</Th>
          <Th>{ka.admin.cols.lastActive}</Th>
          <Th>{ka.admin.table.registered}</Th>
        </THead>
        <tbody>
          {rows.map((u) => (
            <Tr key={u.id}>
              <td className="px-4 py-2.5">
                <Link href={`/admin/users/${u.id}`} className="font-medium text-brand hover:underline">
                  #{u.id}
                </Link>
              </td>
              <td className="px-4 py-2.5 font-medium">
                <Link href={`/admin/users/${u.id}`} className="hover:text-brand">
                  {u.name}
                </Link>
              </td>
              <td className="px-4 py-2.5 text-ink-muted">
                {u.email}
                {!u.emailVerifiedAt && (
                  <Badge variant="outline" className="ml-2 text-[10px]">
                    {f.unverified}
                  </Badge>
                )}
              </td>
              <td className="px-4 py-2.5">
                <Badge variant={u.role === 'admin' ? 'success' : u.role === 'user' ? 'outline' : 'secondary'}>{roleLabel(ka, u.role)}</Badge>
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                <Link href={`/admin/projects?q=${encodeURIComponent(u.email)}`} className="hover:text-brand hover:underline">
                  {Number(u.projectCount)}
                </Link>
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">{Number(u.totalCost) > 0 ? formatGEL(Number(u.totalCost)) : '—'}</td>
              <td className="px-4 py-2.5 text-ink-muted">{u.lastProjectAt ? new Date(u.lastProjectAt).toLocaleDateString(dateLocale) : '—'}</td>
              <td className="px-4 py-2.5 text-ink-muted">{new Date(u.createdAt).toLocaleDateString(dateLocale)}</td>
            </Tr>
          ))}
          {rows.length === 0 && <EmptyRow colSpan={8} text={ka.admin.usersEmpty} />}
        </tbody>
      </AdminTable>

      <Pager t={ka} pathname={PATH} raw={p.raw} page={p.page} pageSize={p.pageSize} total={total} />
    </div>
  );
}
