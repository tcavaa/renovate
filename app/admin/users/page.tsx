import Link from 'next/link';
import { UserPlus } from 'lucide-react';
import { and, asc, count, desc, eq, inArray, like, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { PARTNER_ROLES, STAFF_ROLES, USER_ROLES, isUserRole, type UserRole } from '@/lib/auth/roles';
import { roleLabel } from '@/lib/i18n/labels';
import { projects, users } from '@/lib/db/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/ui/stat-card';
import { FilterBar } from '@/components/admin/FilterBar';
import { AdminPageHeader, AdminTable, EmptyRow, Pager, THead, Th, Tr } from '@/components/admin/AdminList';
import { getT, getLocale } from '@/lib/i18n/server';
import { parseListParams, type SearchParams } from '@/lib/admin/list';
import { dateLocaleFor } from '@/components/projects/ProjectDetail';
import { formatGEL, TIME_ZONE } from '@/lib/utils';
import { requireAdminPage } from '@/lib/admin/guard';
import { sectionCrumb } from '@/lib/admin/crumbs';

export const dynamic = 'force-dynamic';

const SORTS = ['newest', 'name', 'projects', 'total', 'login'] as const;
const PATH = '/admin/users';

export default async function AdminUsersPage(props: { searchParams: Promise<SearchParams> }) {
  await requireAdminPage('users');
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
  if (p.get('status') === 'active') where.push(eq(users.isActive, true));
  if (p.get('status') === 'inactive') where.push(eq(users.isActive, false));
  // The three kinds of account at a glance: the platform's own people, partners, customers.
  if (p.get('group') === 'staff') where.push(inArray(users.role, [...STAFF_ROLES]));
  if (p.get('group') === 'partners') where.push(inArray(users.role, [...PARTNER_ROLES]));
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
          : p.sort === 'login'
            ? [p.dir === 'asc' ? asc(users.lastLoginAt) : desc(users.lastLoginAt)]
            : [p.dir === 'asc' ? asc(users.createdAt) : desc(users.createdAt)];

  const base = () =>
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        emailVerifiedAt: users.emailVerifiedAt,
        isActive: users.isActive,
        lastLoginAt: users.lastLoginAt,
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

  const [rows, allMatching, [groups]] = await Promise.all([
    base().orderBy(...orderBy).limit(p.pageSize).offset((p.page - 1) * p.pageSize),
    base(),
    db
      .select({
        staff: sql<number>`SUM(${users.role} IN ('admin','agent_orders','agent_catalog'))`,
        partners: sql<number>`SUM(${users.role} IN ('store','worker','team'))`,
        customers: sql<number>`SUM(${users.role} = 'user')`,
        deactivated: sql<number>`SUM(${users.isActive} = 0)`,
      })
      .from(users),
  ]);
  const total = allMatching.length;
  const withProjects = allMatching.filter((r) => Number(r.projectCount) > 0).length;

  const f = ka.admin.filters;
  const dateLocale = dateLocaleFor(locale);

  return (
    <div className="space-y-5">
      <AdminPageHeader
        crumbs={[sectionCrumb(ka, 'users', true)]}
        title={ka.admin.users}
        subtitle={`${ka.admin.usersPage.headerCount} — ${total} · ${ka.admin.stats.usersActive}: ${withProjects}`}
        actions={
          <Button asChild variant="ink">
            <Link href="/admin/users/new">
              <UserPlus className="h-4 w-4" /> {ka.accounts.newUser}
            </Link>
          </Button>
        }
      />

      {/* The groups are links: a click is the filtered list. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/admin/users?group=staff"><StatCard label={ka.accounts.groupStaff} value={`${Number(groups?.staff ?? 0)}`} className="transition-colors hover:border-ink" /></Link>
        <Link href="/admin/users?group=partners"><StatCard label={ka.accounts.groupPartners} value={`${Number(groups?.partners ?? 0)}`} className="transition-colors hover:border-ink" /></Link>
        <Link href="/admin/users?role=user"><StatCard label={ka.accounts.groupCustomers} value={`${Number(groups?.customers ?? 0)}`} className="transition-colors hover:border-ink" /></Link>
        <Link href="/admin/users?status=inactive"><StatCard label={ka.accounts.groupDeactivated} value={`${Number(groups?.deactivated ?? 0)}`} className="transition-colors hover:border-ink" /></Link>
      </div>

      <FilterBar
        fields={[
          { name: 'q', type: 'search', placeholder: ka.admin.usersPage.searchPlaceholder },
          { name: 'role', type: 'select', label: f.role, options: USER_ROLES.map((r) => ({ value: r, label: roleLabel(ka, r) })) },
          { name: 'group', type: 'select', label: ka.admin.table.role, options: [{ value: 'staff', label: ka.accounts.groupStaff }, { value: 'partners', label: ka.accounts.groupPartners }] },
          { name: 'status', type: 'select', label: ka.accounts.statusTitle, options: [{ value: 'active', label: ka.accounts.active }, { value: 'inactive', label: ka.accounts.deactivated }] },
          { name: 'projects', type: 'select', label: ka.admin.table.projects, options: [{ value: 'yes', label: f.hasProjects }, { value: 'no', label: f.noProjects }] },
          { name: 'verified', type: 'select', label: ka.admin.cols.verified, options: [{ value: 'yes', label: f.verified }, { value: 'no', label: f.unverified }] },
        ]}
        sorts={[
          { value: 'newest', label: f.sortNewest },
          { value: 'name:asc', label: f.sortName },
          { value: 'projects', label: f.sortProducts.replace(/.*/, ka.admin.table.projects) },
          { value: 'total', label: f.sortCost },
          { value: 'login', label: ka.accounts.lastLogin },
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
          <Th>{ka.accounts.lastLogin}</Th>
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
                {!u.isActive && (
                  <Badge variant="danger" className="ml-1">
                    {ka.accounts.deactivated}
                  </Badge>
                )}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                <Link href={`/admin/projects?q=${encodeURIComponent(u.email)}`} className="hover:text-brand hover:underline">
                  {Number(u.projectCount)}
                </Link>
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">{Number(u.totalCost) > 0 ? formatGEL(Number(u.totalCost)) : '—'}</td>
              <td className="px-4 py-2.5 text-ink-muted">{u.lastProjectAt ? new Date(u.lastProjectAt).toLocaleDateString(dateLocale, { timeZone: TIME_ZONE }) : '—'}</td>
              <td className="px-4 py-2.5 text-ink-muted">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString(dateLocale, { timeZone: TIME_ZONE }) : ka.accounts.never}</td>
              <td className="px-4 py-2.5 text-ink-muted">{new Date(u.createdAt).toLocaleDateString(dateLocale, { timeZone: TIME_ZONE })}</td>
            </Tr>
          ))}
          {rows.length === 0 && <EmptyRow colSpan={9} text={ka.admin.usersEmpty} />}
        </tbody>
      </AdminTable>

      <Pager t={ka} pathname={PATH} raw={p.raw} page={p.page} pageSize={p.pageSize} total={total} />
    </div>
  );
}
