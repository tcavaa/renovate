import { WorkerForm } from '@/components/admin/WorkerForm';
import { getT } from '@/lib/i18n/server';
import { requireAdminPage } from '@/lib/admin/guard';

export const dynamic = 'force-dynamic';

export default async function NewWorkerPage() {
  await requireAdminPage('workers');
  const ka = await getT();
  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl font-bold">{ka.admin.actions.create}</h1>
      <WorkerForm />
    </div>
  );
}
