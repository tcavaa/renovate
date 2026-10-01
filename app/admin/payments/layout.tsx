import { requireAdminPage } from '@/lib/admin/guard';

/** Only the people whose job covers the money's transactions get past here. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireAdminPage('payments');
  return <>{children}</>;
}
