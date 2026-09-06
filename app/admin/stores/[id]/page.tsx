import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { stores } from '@/lib/db/schema';
import { StoreForm } from '@/components/admin/StoreForm';

export const dynamic = 'force-dynamic';

export default async function EditStorePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();

  const rows = await db.select().from(stores).where(eq(stores.id, id)).limit(1);
  if (rows.length === 0) notFound();

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl font-bold">{rows[0].nameKa}</h1>
      <StoreForm store={rows[0]} />
    </div>
  );
}
