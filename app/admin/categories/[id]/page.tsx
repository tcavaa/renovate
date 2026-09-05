import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { categories } from '@/lib/db/schema';
import { CategoryForm } from '@/components/admin/CategoryForm';
import { getT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export default async function EditCategoryPage({
  params,
}: {
  params: { id: string };
}) {
  const ka = getT();
  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();
  const rows = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  if (rows.length === 0) notFound();

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl font-bold">{ka.admin.actions.edit}</h1>
      <CategoryForm category={rows[0]} />
    </div>
  );
}
