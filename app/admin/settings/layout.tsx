import { requireAdminPage } from '@/lib/admin/guard';

/** Only the people whose job covers settings get past here. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('settings');
  return <>{children}</>;
}
