import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { getT } from '@/lib/i18n/server';

export const metadata = { title: 'Admin' };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const ka = await getT();
  if (!session?.user) redirect('/login?callbackUrl=/admin');
  if (session.user.role !== 'admin') {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="rounded-lg border border-line bg-bg-surface p-8 text-center">
          <h1 className="font-serif text-xl font-semibold">{ka.admin.accessTitle}</h1>
          <p className="mt-2 text-sm text-ink-muted">
            {ka.admin.accessDesc}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-bg-base">
      <AdminSidebar />
      <main className="flex-1 overflow-x-auto p-6">{children}</main>
    </div>
  );
}
