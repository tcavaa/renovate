import { auth } from '@/auth';
import { handle, ok } from '@/lib/api/route';
import { planState } from '@/lib/plans/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The caller's plan (docs/subscriptions.md): what it unlocks, what its month has used, what each
 * purchase would cost now — what the studio's locks, the pricing page and the profile read
 * (`usePlan`). A visitor gets `null`: they are on no plan, and the pricing page shows the prices
 * it renders on the server.
 */
export const GET = handle('GET /api/plan', 'Failed to load the plan', async () => {
  const session = await auth();
  if (!session?.user?.id) return ok(null);
  return ok(await planState({ id: Number(session.user.id), role: session.user.role }));
});
