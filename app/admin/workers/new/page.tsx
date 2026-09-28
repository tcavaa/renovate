import { WorkerForm } from '@/components/admin/WorkerForm';
import { getT } from '@/lib/i18n/server';
import { requireAdminPage } from '@/lib/admin/guard';
import { sectionCrumb } from '@/lib/admin/crumbs';
import { AdminPageHeader } from '@/components/admin/AdminList';

export const dynamic = 'force-dynamic';

export default async function NewWorkerPage() {
  await requireAdminPage('workers');
  const ka = await getT();
  return (
    <div className="space-y-6">
      <AdminPageHeader crumbs={[sectionCrumb(ka, 'workers'), { label: ka.admin.newItem.worker }]} title={ka.admin.newItem.worker} />
      <WorkerForm />
    </div>
  );
}
