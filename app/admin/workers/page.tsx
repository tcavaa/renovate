import Link from 'next/link';
import { and, asc, count, desc, eq, gte, like, or, type SQL } from 'drizzle-orm';
import { BadgeCheck, Plus } from 'lucide-react';
import { db } from '@/lib/db';
import { workers } from '@/lib/db/schema';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FilterBar } from '@/components/admin/FilterBar';
import { AdminPageHeader, AdminTable, EmptyRow, Pager, THead, Th, Tr } from '@/components/admin/AdminList';
import { getT } from '@/lib/i18n/server';
import { workerSpecialtyLabel } from '@/lib/i18n/labels';
import { parseListParams, type SearchParams } from '@/lib/admin/list';
import { formatGEL } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const SORTS = ['newest', 'name', 'rating'] as const;
const PATH = '/admin/workers';
const SPECIALTIES = ['tiling', 'painting', 'plumbing', 'electrical', 'carpentry', 'plastering'] as const;

export default async function AdminWorkersPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const ka = await getT();
  const p = parseListParams(searchParams, { sorts: SORTS, defaultSort: 'newest' });

  const where: SQL[] = [];
  if (p.q) {
    const needle = `%${p.q}%`;
    where.push(or(like(workers.nameKa, needle), like(workers.specialty, needle), like(workers.phone, needle))!);
  }
  if (p.get('specialty')) where.push(eq(workers.specialtySlug, p.get('specialty')));
  if (p.get('verified') === 'yes') where.push(eq(workers.isVerified, true));
  if (p.get('verified') === 'no') where.push(eq(workers.isVerified, false));
  if (p.get('status') === 'active') where.push(eq(workers.isActive, true));
  if (p.get('status') === 'inactive') where.push(eq(workers.isActive, false));
  if (p.get('status') === 'pending') where.push(eq(workers.approvalStatus, 'pending'));
  if (p.num('ratingMin') != null) where.push(gte(workers.rating, String(p.num('ratingMin'))));
  const filter = where.length ? and(...where) : undefined;

  const orderBy =
    p.sort === 'name'
      ? [p.dir === 'desc' ? desc(workers.nameKa) : asc(workers.nameKa)]
      : p.sort === 'rating'
        ? [p.dir === 'asc' ? asc(workers.rating) : desc(workers.rating), desc(workers.reviewCount)]
        : [p.dir === 'asc' ? asc(workers.id) : desc(workers.id)];

  const [rows, [{ total }]] = await Promise.all([
    db.select().from(workers).where(filter).orderBy(...orderBy).limit(p.pageSize).offset((p.page - 1) * p.pageSize),
    db.select({ total: count() }).from(workers).where(filter),
  ]);

  const f = ka.admin.filters;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title={ka.admin.workers}
        subtitle={`${total}`}
        actions={
          <Button asChild>
            <Link href="/admin/workers/new">
              <Plus className="h-4 w-4" /> {ka.admin.actions.create}
            </Link>
          </Button>
        }
      />

      <FilterBar
        fields={[
          { name: 'q', type: 'search' },
          { name: 'specialty', type: 'select', label: f.specialty, options: SPECIALTIES.map((s) => ({ value: s, label: workerSpecialtyLabel(ka, s) })) },
          { name: 'verified', type: 'select', label: f.verified, options: [{ value: 'yes', label: f.verified }, { value: 'no', label: f.unverified }] },
          { name: 'status', type: 'select', label: f.status, options: [{ value: 'active', label: f.active }, { value: 'inactive', label: f.inactive }, { value: 'pending', label: f.pending }] },
          { name: 'ratingMin', type: 'number', placeholder: f.ratingMin, min: 0, step: 0.5 },
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
          <Th>{ka.admin.table.specialty}</Th>
          <Th right>{ka.admin.table.price}</Th>
          <Th>{ka.admin.table.rating}</Th>
          <Th>{ka.admin.table.status}</Th>
          <Th right>{ka.admin.table.actions}</Th>
        </THead>
        <tbody>
          {rows.map((w) => (
            <Tr key={w.id}>
              <td className="px-4 py-2.5 font-medium">
                <Link href={`/admin/workers/${w.id}`} className="inline-flex items-center gap-2 hover:text-brand">
                  {w.nameKa}
                  {w.isVerified && <BadgeCheck className="h-4 w-4 text-success" aria-label={ka.workers.verified} />}
                </Link>
                {w.phone && <span className="block text-xs text-ink-muted">{w.phone}</span>}
              </td>
              <td className="px-4 py-2.5 text-ink-muted">{workerSpecialtyLabel(ka, w.specialtySlug ?? w.specialty)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {w.priceUnit === 'm2' && w.pricePerM2
                  ? `${formatGEL(Number(w.pricePerM2))} ${ka.workers.perM2Slash}`
                  : w.pricePerUnit
                    ? `${formatGEL(Number(w.pricePerUnit))} ${ka.workers.perPieceSlash}`
                    : ka.workers.priceByAgreement}
              </td>
              <td className="px-4 py-2.5 tabular-nums">
                {Number(w.rating).toFixed(1)} <span className="text-xs text-ink-muted">({w.reviewCount})</span>
              </td>
              <td className="px-4 py-2.5">
                {w.approvalStatus === 'pending' ? <Badge variant="warning">{ka.admin.approvalPending}</Badge> : w.isActive ? <Badge variant="success">{ka.admin.badges.active}</Badge> : <Badge variant="secondary">{ka.admin.badges.inactive}</Badge>}
              </td>
              <td className="px-4 py-2.5 text-right">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/admin/workers/${w.id}`}>{ka.admin.actions.edit}</Link>
                </Button>
              </td>
            </Tr>
          ))}
          {rows.length === 0 && <EmptyRow colSpan={6} text={p.hasFilters ? f.noResults : ka.admin.workersEmpty} />}
        </tbody>
      </AdminTable>

      <Pager t={ka} pathname={PATH} raw={p.raw} page={p.page} pageSize={p.pageSize} total={Number(total)} />
    </div>
  );
}
