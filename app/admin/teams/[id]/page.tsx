import { notFound } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { workers } from '@/lib/db/schema';
import { AdminPageHeader } from '@/components/admin/AdminList';
import { TeamForm } from '@/components/admin/TeamForm';
import { loadTeam } from '@/lib/teams/queries';
import { getT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export default async function EditTeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ka = await getT();
  const found = await loadTeam(Number(id), { includeInactive: true });
  if (!found) notFound();
  const { team, members } = found;
  const list = await db
    .select({ id: workers.id, nameKa: workers.nameKa, specialtySlug: workers.specialtySlug, city: workers.city })
    .from(workers)
    .where(eq(workers.isActive, true))
    .orderBy(asc(workers.nameKa));

  return (
    <div className="space-y-5">
      <AdminPageHeader title={team.nameKa} subtitle={ka.admin.teams} />
      <TeamForm
        team={{
          id: team.id,
          nameKa: team.nameKa,
          nameEn: team.nameEn,
          nameRu: team.nameRu,
          slug: team.slug,
          descriptionKa: team.descriptionKa,
          leadName: team.leadName,
          phone: team.phone,
          email: team.email,
          city: team.city,
          experienceYears: team.experienceYears,
          completedJobs: team.completedJobs,
          markupPct: team.markupPct == null ? null : Number(team.markupPct),
          commissionRate: team.commissionRate == null ? null : Number(team.commissionRate),
          capacityJobs: team.capacityJobs,
          isVerified: team.isVerified,
          isActive: team.isActive,
          memberIds: members.map((m) => m.workerId),
          leadWorkerId: members.find((m) => m.isLead)?.workerId ?? null,
        }}
        workers={list}
      />
    </div>
  );
}
