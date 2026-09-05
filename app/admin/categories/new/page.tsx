import { CategoryForm } from '@/components/admin/CategoryForm';
import { getT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export default function NewCategoryPage() {
  const ka = getT();
  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl font-bold">{ka.admin.actions.create}</h1>
      <CategoryForm />
    </div>
  );
}
