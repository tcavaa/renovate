import { StoreForm } from '@/components/admin/StoreForm';
import { getT } from '@/lib/i18n/server';
import { requireAdminPage } from '@/lib/admin/guard';
import { sectionCrumb } from '@/lib/admin/crumbs';
import { AdminPageHeader } from '@/components/admin/AdminList';

export const dynamic = 'force-dynamic';

export default async function NewStorePage() {
  const session = await requireAdminPage('stores');
  const ka = await getT();
  return (
    <div className="space-y-6">
      <AdminPageHeader crumbs={[sectionCrumb(ka, 'stores'), { label: ka.admin.newItem.store }]} title={ka.admin.newItem.store} />
      <StoreForm canEditCommission={session.user.role === 'admin'} />
    </div>
  );
}
