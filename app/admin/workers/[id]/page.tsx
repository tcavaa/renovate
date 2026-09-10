import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { workers } from '@/lib/db/schema';
import { WorkerForm } from '@/components/admin/WorkerForm';
import { PartnerApproval } from '@/components/admin/PartnerApproval';
import { getT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export default async function EditWorkerPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  const ka = await getT();
  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();
  const rows = await db.select().from(workers).where(eq(workers.id, id)).limit(1);
  if (rows.length === 0) notFound();

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl font-bold">{ka.admin.actions.edit}</h1>
      <PartnerApproval kind="worker" id={rows[0].id} status={rows[0].approvalStatus} />
      <WorkerForm worker={rows[0]} />
    </div>
  );
}
