import Link from 'next/link';
import { and, asc, count, desc, eq, gte, isNotNull, isNull, like, lte, or, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects, users } from '@/lib/db/schema';
import { Badge } from '@/components/ui/badge';
import { FilterBar } from '@/components/admin/FilterBar';
import { AdminPageHeader, AdminTable, EmptyRow, Pager, THead, Th, Tr } from '@/components/admin/AdminList';
import { getT, getLocale } from '@/lib/i18n/server';
import { formatM2L, homeStateShortLabel, statusLabel } from '@/lib/i18n/labels';
import { parseListParams, type SearchParams } from '@/lib/admin/list';
import { dateLocaleFor } from '@/components/projects/ProjectDetail';
import { formatGEL } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const SORTS = ['newest', 'cost', 'm2'] as const;
const PATH = '/admin/orders';

export default async function AdminProjectsPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const ka = await getT();
  const locale = await getLocale();
  const p = parseListParams(searchParams, { sorts: SORTS, defaultSort: 'newest' });

  const where: SQL[] = [];
  if (p.q) {
    const needle = `%${p.q}%`;
    where.push(or(like(projects.nameKa, needle), like(users.name, needle), like(users.email, needle))!);
  }
  if (p.get('status')) where.push(eq(projects.status, p.get('status') as 'draft' | 'saved' | 'submitted'));
  if (p.get('homeState')) where.push(eq(projects.homeState, p.get('homeState') as 'black_frame' | 'white_frame' | 'green_frame'));
  if (p.get('kind') === 'design') where.push(isNotNull(projects.plan));
  if (p.get('kind') === 'calculator') where.push(isNull(projects.plan));
  if (p.get('dateFrom')) where.push(gte(projects.createdAt, new Date(p.get('dateFrom'))));
  if (p.get('dateTo')) where.push(lte(projects.createdAt, new Date(`${p.get('dateTo')}T23:59:59`)));
  if (p.num('costMin') != null) where.push(gte(projects.totalCost, String(p.num('costMin'))));
  if (p.num('costMax') != null) where.push(lte(projects.totalCost, String(p.num('costMax'))));
  const filter = where.length ? and(...where) : undefined;

  const orderBy =
    p.sort === 'cost'
      ? [p.dir === 'asc' ? asc(projects.totalCost) : desc(projects.totalCost)]
      : p.sort === 'm2'
        ? [p.dir === 'asc' ? asc(projects.totalM2) : desc(projects.totalM2)]
        : [p.dir === 'asc' ? asc(projects.createdAt) : desc(projects.createdAt)];

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: projects.id,
        nameKa: projects.nameKa,
        homeState: projects.homeState,
        totalM2: projects.totalM2,
        totalCost: projects.totalCost,
        status: projects.status,
        createdAt: projects.createdAt,
        styleId: projects.styleId,
        isDesign: isNotNull(projects.plan),
        userName: users.name,
        userEmail: users.email,
      })
      .from(projects)
      .leftJoin(users, eq(projects.userId, users.id))
      .where(filter)
      .orderBy(...orderBy)
      .limit(p.pageSize)
      .offset((p.page - 1) * p.pageSize),
    db.select({ total: count() }).from(projects).leftJoin(users, eq(projects.userId, users.id)).where(filter),
  ]);

  const f = ka.admin.filters;
  const dateLocale = dateLocaleFor(locale);

  return (
    <div className="space-y-5">
      <AdminPageHeader title={ka.admin.projects} subtitle={`${total}`} />

      <FilterBar
        fields={[
          { name: 'q', type: 'search', className: 'w-72' },
          { name: 'kind', type: 'select', label: f.kind, options: [{ value: 'calculator', label: f.calculatorKind }, { value: 'design', label: f.designKind }] },
          { name: 'status', type: 'select', label: f.status, options: (['draft', 'saved', 'submitted'] as const).map((s) => ({ value: s, label: statusLabel(ka, s) })) },
          { name: 'homeState', type: 'select', label: f.homeState, options: (['black_frame', 'white_frame', 'green_frame'] as const).map((s) => ({ value: s, label: homeStateShortLabel(ka, s) })) },
          { name: 'dateFrom', type: 'date', label: f.dateFrom },
          { name: 'dateTo', type: 'date', label: f.dateTo },
          { name: 'costMin', type: 'number', placeholder: f.costFrom, min: 0 },
          { name: 'costMax', type: 'number', placeholder: f.costTo, min: 0 },
        ]}
        sorts={[
          { value: 'newest', label: f.sortNewest },
          { value: 'newest:asc', label: f.sortOldest },
          { value: 'cost', label: f.sortCost },
          { value: 'm2', label: f.sortM2 },
        ]}
        defaultSort="newest"
      />

      <AdminTable>
        <THead>
          <Th>{ka.admin.table.id}</Th>
          <Th>{ka.admin.table.name}</Th>
          <Th>{ka.admin.table.user}</Th>
          <Th>{ka.admin.cols.kind}</Th>
          <Th>{ka.admin.table.state}</Th>
          <Th right>{ka.admin.table.m2Header}</Th>
          <Th right>{ka.admin.table.cost}</Th>
          <Th>{ka.admin.table.status}</Th>
          <Th>{ka.admin.table.date}</Th>
        </THead>
        <tbody>
          {rows.map((r) => (
            <Tr key={r.id}>
              <td className="px-4 py-2.5 text-ink-muted">
                <Link href={`/admin/orders/${r.id}`} className="font-medium text-brand hover:underline">
                  #{r.id}
                </Link>
              </td>
              <td className="px-4 py-2.5 font-medium">
                <Link href={`/admin/orders/${r.id}`} className="hover:text-brand">
                  {r.nameKa ?? '—'}
                </Link>
              </td>
              <td className="px-4 py-2.5 text-ink-muted">
                {r.userName ? (
                  <span>
                    {r.userName}
                    <span className="ml-1 text-xs">({r.userEmail})</span>
                  </span>
                ) : (
                  <span className="text-xs italic">{ka.admin.guestUser}</span>
                )}
              </td>
              <td className="px-4 py-2.5">
                {r.isDesign ? (
                  <Badge variant="secondary">
                    {f.designKind}
                    {r.styleId ? ` · ${r.styleId}` : ''}
                  </Badge>
                ) : (
                  <Badge variant="outline">{f.calculatorKind}</Badge>
                )}
              </td>
              <td className="px-4 py-2.5">
                <Badge>{homeStateShortLabel(ka, r.homeState)}</Badge>
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">{formatM2L(ka, Number(r.totalM2))}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{r.totalCost ? formatGEL(Number(r.totalCost)) : '—'}</td>
              <td className="px-4 py-2.5">
                {r.status === 'saved' ? <Badge variant="success">{statusLabel(ka, r.status)}</Badge> : <Badge variant="outline">{statusLabel(ka, r.status ?? 'draft')}</Badge>}
              </td>
              <td className="px-4 py-2.5 text-ink-muted">{new Date(r.createdAt).toLocaleDateString(dateLocale)}</td>
            </Tr>
          ))}
          {rows.length === 0 && <EmptyRow colSpan={9} text={p.hasFilters ? f.noResults : ka.admin.projectsEmpty} />}
        </tbody>
      </AdminTable>

      <Pager t={ka} pathname={PATH} raw={p.raw} page={p.page} pageSize={p.pageSize} total={Number(total)} />
    </div>
  );
}
