import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { workers } from '@/lib/db/schema';
import { WorkerForm } from '@/components/admin/WorkerForm';
import { PartnerApproval } from '@/components/admin/PartnerApproval';
import { getT } from '@/lib/i18n/server';
import { requireAdminPage } from '@/lib/admin/guard';
import { sectionCrumb } from '@/lib/admin/crumbs';
import { AdminPageHeader } from '@/components/admin/AdminList';

export const dynamic = 'force-dynamic';

export default async function EditWorkerPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  await requireAdminPage('workers');
  const params = await props.params;
  const ka = await getT();
  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();
  const rows = await db.select().from(workers).where(eq(workers.id, id)).limit(1);
  if (rows.length === 0) notFound();

  return (
    <div className="space-y-6">
      <AdminPageHeader crumbs={[sectionCrumb(ka, 'workers'), { label: rows[0].nameKa }]} eyebrow={ka.admin.actions.edit} title={rows[0].nameKa} />
      <PartnerApproval kind="worker" id={rows[0].id} status={rows[0].approvalStatus} />
      <WorkerForm worker={rows[0]} />
    </div>
  );
}
