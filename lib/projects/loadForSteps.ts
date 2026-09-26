import { notFound, redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { savedProjectInput, type SavedProjectInput } from '@/lib/projects/saved';

/**
 * The project a journey's steps are opened on (`/calculator/<id>/…`, `/design/<id>/…`): the
 * caller's own, whole. An id that is not a number — an old bookmark like `/calculator/plan` —
 * goes to the hub; nobody signed in goes to sign in and comes back; somebody else's project,
 * or one that is gone, is a 404.
 */
export async function loadProjectForSteps(rawId: string, journey: 'calculator' | 'design'): Promise<{ project: SavedProjectInput; userId: number }> {
  const hub = journey === 'calculator' ? '/calculator' : '/design';
  if (!/^\d+$/.test(rawId)) redirect(hub);
  const id = Number(rawId);
  const session = await auth();
  if (!session?.user?.id) redirect(`/login?callbackUrl=${encodeURIComponent(`${hub}/${id}`)}`);
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, Number(session.user.id))))
    .limit(1);
  if (!rows[0]) notFound();
  const project = savedProjectInput(rows[0]);
  // The calculator never opens the design's kept versions — they can run to megabytes.
  return { project: journey === 'calculator' ? { ...project, versions: [] } : project, userId: Number(session.user.id) };
}
