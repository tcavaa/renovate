import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { workers } from '@/lib/db/schema';
import { AdminPageHeader } from '@/components/admin/AdminList';
import { TeamForm } from '@/components/admin/TeamForm';
import { getT } from '@/lib/i18n/server';
import { requireAdminPage } from '@/lib/admin/guard';
import { sectionCrumb } from '@/lib/admin/crumbs';

export const dynamic = 'force-dynamic';

export default async function NewTeamPage() {
  await requireAdminPage('teams');
  const ka = await getT();
  const list = await db
    .select({ id: workers.id, nameKa: workers.nameKa, specialtySlug: workers.specialtySlug, city: workers.city })
    .from(workers)
    .where(eq(workers.isActive, true))
    .orderBy(asc(workers.nameKa));

  return (
    <div className="space-y-5">
      <AdminPageHeader crumbs={[sectionCrumb(ka, 'teams'), { label: ka.admin.newItem.team }]} title={ka.admin.newItem.team} />
      <TeamForm
        team={{ nameKa: '', nameEn: null, nameRu: null, slug: '', descriptionKa: null, leadName: null, phone: null, email: null, city: null, experienceYears: null, completedJobs: null, markupPct: null, commissionRate: 5, capacityJobs: 1, isVerified: false, isActive: true, memberIds: [], leadWorkerId: null }}
        workers={list}
      />
    </div>
  );
}
