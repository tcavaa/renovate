import { requireAdminPage } from '@/lib/admin/guard';

/** Only the people whose job covers teams get past here. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('teams');
  return <>{children}</>;
}
