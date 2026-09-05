import { StoreForm } from '@/components/admin/StoreForm';
import { getT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export default function NewStorePage() {
  const ka = getT();
  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl font-bold">{ka.admin.actions.create}</h1>
      <StoreForm />
    </div>
  );
}
