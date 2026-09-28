import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { stores } from '@/lib/db/schema';
import { AdminPageHeader } from '@/components/admin/AdminList';
import { SettingsForm } from '@/components/admin/SettingsForm';
import { getT } from '@/lib/i18n/server';
import { loadPlatformSettings } from '@/lib/finance/settings';
import { requireAdminPage } from '@/lib/admin/guard';
import { sectionCrumb } from '@/lib/admin/crumbs';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  await requireAdminPage('settings');
  const ka = await getT();
  const [settings, storeRows] = await Promise.all([
    loadPlatformSettings(),
    db.select({ id: stores.id, name: stores.nameKa }).from(stores).where(eq(stores.isActive, true)).orderBy(asc(stores.nameKa)),
  ]);
  return (
    <div className="space-y-6">
      <AdminPageHeader crumbs={[sectionCrumb(ka, 'settings', true)]} title={ka.admin.settings.title} subtitle={ka.admin.settings.subtitle} />
      <SettingsForm initial={{ ...settings, updatedAt: settings.updatedAt ? settings.updatedAt.toISOString() : null }} stores={storeRows} />
    </div>
  );
}
