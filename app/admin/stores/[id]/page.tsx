import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { stores } from '@/lib/db/schema';
import { StoreForm } from '@/components/admin/StoreForm';
import { PartnerApproval } from '@/components/admin/PartnerApproval';
import { requireAdminPage } from '@/lib/admin/guard';
import { sectionCrumb } from '@/lib/admin/crumbs';
import { AdminPageHeader } from '@/components/admin/AdminList';
import { getT } from '@/lib/i18n/server';
import { canDeleteIn } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

export default async function EditStorePage(props: { params: Promise<{ id: string }> }) {
  const session = await requireAdminPage('stores');
  const params = await props.params;
  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();

  const [rows, ka] = await Promise.all([db.select().from(stores).where(eq(stores.id, id)).limit(1), getT()]);
  if (rows.length === 0) notFound();

  return (
    <div className="space-y-6">
      <AdminPageHeader crumbs={[sectionCrumb(ka, 'stores'), { label: rows[0].nameKa }]} title={rows[0].nameKa} />
      <PartnerApproval kind="store" id={rows[0].id} status={rows[0].approvalStatus} />
      <StoreForm store={rows[0]} canEditCommission={session.user.role === 'admin'} canDelete={canDeleteIn(session.user.role, 'stores')} />
    </div>
  );
}
