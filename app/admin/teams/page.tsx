import Link from 'next/link';
import { and, asc, count, desc, eq, like, or, type SQL } from 'drizzle-orm';
import { BadgeCheck, Plus } from 'lucide-react';
import { db } from '@/lib/db';
import { teams } from '@/lib/db/schema';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FilterBar } from '@/components/admin/FilterBar';
import { AdminPageHeader, AdminTable, EmptyRow, Pager, THead, Th, Tr } from '@/components/admin/AdminList';
import { membersOf, tradesOf } from '@/lib/teams/queries';
import { getT } from '@/lib/i18n/server';
import { workerSpecialtyLabel } from '@/lib/i18n/labels';
import { parseListParams, type SearchParams } from '@/lib/admin/list';

export const dynamic = 'force-dynamic';

const SORTS = ['newest', 'name', 'rating'] as const;
const PATH = '/admin/teams';

/** Every brigade, with the trades it covers read off the workers in it. */
export default async function AdminTeamsPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const ka = await getT();
  const p = parseListParams(searchParams, { sorts: SORTS, defaultSort: 'newest' });

  const where: SQL[] = [];
  if (p.q) {
    const needle = `%${p.q}%`;
    where.push(or(like(teams.nameKa, needle), like(teams.leadName, needle), like(teams.city, needle), like(teams.phone, needle))!);
  }
  if (p.get('status') === 'active') where.push(eq(teams.isActive, true));
  if (p.get('status') === 'inactive') where.push(eq(teams.isActive, false));
  if (p.get('status') === 'pending') where.push(eq(teams.approvalStatus, 'pending'));
  if (p.get('verified') === 'yes') where.push(eq(teams.isVerified, true));
  if (p.get('verified') === 'no') where.push(eq(teams.isVerified, false));
  const filter = where.length ? and(...where) : undefined;

  const orderBy =
    p.sort === 'name'
      ? [p.dir === 'desc' ? desc(teams.nameKa) : asc(teams.nameKa)]
      : p.sort === 'rating'
        ? [p.dir === 'asc' ? asc(teams.rating) : desc(teams.rating)]
        : [p.dir === 'asc' ? asc(teams.id) : desc(teams.id)];

  const [rows, [{ total }]] = await Promise.all([
    db.select().from(teams).where(filter).orderBy(...orderBy).limit(p.pageSize).offset((p.page - 1) * p.pageSize),
    db.select({ total: count() }).from(teams).where(filter),
  ]);
  const members = await membersOf(rows.map((r) => r.id));

  const f = ka.admin.filters;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title={ka.admin.teams}
        subtitle={`${total}`}
        actions={
          <Button asChild>
            <Link href="/admin/teams/new">
              <Plus className="h-4 w-4" /> {ka.admin.actions.create}
            </Link>
          </Button>
        }
      />

      <FilterBar
        fields={[
          { name: 'q', type: 'search' },
          { name: 'verified', type: 'select', label: f.verified, options: [{ value: 'yes', label: f.verified }, { value: 'no', label: f.unverified }] },
          { name: 'status', type: 'select', label: f.status, options: [{ value: 'active', label: f.active }, { value: 'inactive', label: f.inactive }, { value: 'pending', label: f.pending }] },
        ]}
        sorts={[
          { value: 'newest', label: f.sortNewest },
          { value: 'rating', label: f.sortRating },
          { value: 'name:asc', label: f.sortName },
        ]}
        defaultSort="newest"
      />

      <AdminTable>
        <THead>
          <Th>{ka.admin.table.name}</Th>
          <Th>{ka.teams.coversTitle}</Th>
          <Th>{ka.workers.city}</Th>
          <Th>{ka.admin.table.rating}</Th>
          <Th>{ka.admin.table.status}</Th>
          <Th right>{ka.admin.table.actions}</Th>
        </THead>
        <tbody>
          {rows.map((team) => {
            const own = members.get(team.id) ?? [];
            return (
              <Tr key={team.id}>
                <td className="px-4 py-2.5 font-medium">
                  <Link href={`/admin/teams/${team.id}`} className="inline-flex items-center gap-2 hover:text-brand">
                    {team.nameKa}
                    {team.isVerified && <BadgeCheck className="h-4 w-4 text-success" aria-label={ka.workers.verified} />}
                  </Link>
                  <span className="block text-xs text-ink-muted">{[team.leadName, team.phone].filter(Boolean).join(' · ')}</span>
                </td>
                <td className="px-4 py-2.5 text-xs text-ink-muted">
                  {own.length === 0 ? ka.teams.noMembers : tradesOf(own).map((s) => workerSpecialtyLabel(ka, s)).join(', ')}
                </td>
                <td className="px-4 py-2.5 text-ink-muted">{team.city ?? '—'}</td>
                <td className="px-4 py-2.5 tabular-nums">{Number(team.rating ?? 5).toFixed(1)}</td>
                <td className="px-4 py-2.5">
                  {team.approvalStatus === 'pending' ? <Badge variant="warning">{ka.admin.approvalPending}</Badge> : team.isActive ? <Badge variant="success">{ka.admin.badges.active}</Badge> : <Badge variant="secondary">{ka.admin.badges.inactive}</Badge>}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/admin/teams/${team.id}`}>{ka.admin.actions.edit}</Link>
                  </Button>
                </td>
              </Tr>
            );
          })}
          {rows.length === 0 && <EmptyRow colSpan={6} text={p.hasFilters ? f.noResults : ka.teams.empty} />}
        </tbody>
      </AdminTable>

      <Pager t={ka} pathname={PATH} raw={p.raw} page={p.page} pageSize={p.pageSize} total={Number(total)} />
    </div>
  );
}
