import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { canAdmin, type AdminSection } from '@/lib/auth/roles';

/**
 * The guard every admin page runs before it reads anything.
 *
 * The layout decides whether the admin opens at all; this decides whether *this* page does.
 * An agent who types a URL their job does not cover is sent back to the dashboard rather
 * than shown a page of numbers they have no business with.
 */
export async function requireAdminPage(section: AdminSection) {
  const session = await auth();
  if (!session?.user) redirect(`/login?callbackUrl=/admin`);
  if (!canAdmin(session.user.role, section)) redirect('/admin');
  return session;
}
