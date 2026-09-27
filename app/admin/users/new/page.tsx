import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { db } from '@/lib/db';
import { stores, teams, workers } from '@/lib/db/schema';
import { AccountForm } from '@/components/admin/AccountForm';
import { getT } from '@/lib/i18n/server';
import { requireAdminPage } from '@/lib/admin/guard';

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
      <div>
        <Link href="/admin/users" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-brand">
          <ArrowLeft className="h-4 w-4" />
          {t.accounts.backToAll}
        </Link>
        <h1 className="mt-2 font-serif text-3xl font-bold">{t.accounts.newUser}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t.accounts.newUserSubtitle}</p>
      </div>
      <AccountForm stores={partnerStores} workers={partnerWorkers} teams={partnerTeams} />
    </div>
  );
}
