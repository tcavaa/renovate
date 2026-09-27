import { StoreForm } from '@/components/admin/StoreForm';
import { getT } from '@/lib/i18n/server';
import { requireAdminPage } from '@/lib/admin/guard';

export const dynamic = 'force-dynamic';

export default async function NewStorePage() {
  const session = await requireAdminPage('stores');
  const ka = await getT();
  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl font-bold">{ka.admin.actions.create}</h1>
      <StoreForm canEditCommission={session.user.role === 'admin'} />
    </div>
  );
}
