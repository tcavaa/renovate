import { db } from '@/lib/db';
import { stores, teams, workers } from '@/lib/db/schema';
import { AccountForm } from '@/components/admin/AccountForm';
import { getT } from '@/lib/i18n/server';
import { requireAdminPage } from '@/lib/admin/guard';
import { sectionCrumb } from '@/lib/admin/crumbs';
import { AdminPageHeader } from '@/components/admin/AdminList';

export const dynamic = 'force-dynamic';

/** Admin makes an account — an agent, a partner's login, a customer signed up in person. */
export default async function NewUserPage() {
  await requireAdminPage('users');
  const t = await getT();
  const [partnerStores, partnerWorkers, partnerTeams] = await Promise.all([
    db.select({ id: stores.id, name: stores.nameKa }).from(stores).orderBy(stores.nameKa),
    db.select({ id: workers.id, name: workers.nameKa, specialty: workers.specialty }).from(workers).orderBy(workers.nameKa),
    db.select({ id: teams.id, name: teams.nameKa }).from(teams).orderBy(teams.nameKa),
  ]);

  return (
    <div className="max-w-4xl space-y-6">
      <AdminPageHeader crumbs={[sectionCrumb(t, 'users'), { label: t.accounts.newUser }]} title={t.accounts.newUser} subtitle={t.accounts.newUserSubtitle} />
      <AccountForm stores={partnerStores} workers={partnerWorkers} teams={partnerTeams} />
    </div>
  );
}
