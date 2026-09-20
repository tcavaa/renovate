import { requireAdminPage } from '@/lib/admin/guard';

/** Only the people whose job covers stores get past here. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('stores');
  return <>{children}</>;
}
