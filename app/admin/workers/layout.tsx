import { requireAdminPage } from '@/lib/admin/guard';

/** Only the people whose job covers workers get past here. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('workers');
  return <>{children}</>;
}
