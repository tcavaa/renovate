import { AdminPageHeader } from '@/components/admin/AdminList';
import { SettingsForm } from '@/components/admin/SettingsForm';
import { getT } from '@/lib/i18n/server';
import { loadPlatformSettings } from '@/lib/finance/settings';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  const ka = await getT();
  const settings = await loadPlatformSettings();
  return (
    <div className="space-y-6">
      <AdminPageHeader title={ka.admin.settings.title} subtitle={ka.admin.settings.subtitle} />
      <SettingsForm initial={{ ...settings, updatedAt: settings.updatedAt ? settings.updatedAt.toISOString() : null }} />
    </div>
  );
}
