import { redirect } from 'next/navigation';
import { auth } from '@/auth';

export default async function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login?callbackUrl=/profile');

  // Each page sets its own width: the profile is the hubs' full-width frame, a project's page a column.
  return <>{children}</>;
}
