import { requireAdminPage } from '@/lib/admin/guard';

/** Only the people whose job covers categories get past here. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('categories');
  return <>{children}</>;
}
