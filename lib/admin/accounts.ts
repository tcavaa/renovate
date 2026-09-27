import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { stores, teams, workers } from '@/lib/db/schema';
import type { AccountLinks } from '@/lib/auth/accounts';

/**
 * Whether the partner an account is being linked to exists. The foreign keys would refuse a
 * wrong id too, but as a 500; admin should be told which field is wrong.
 */
export async function partnerLinkExists(links: AccountLinks): Promise<boolean> {
  if (links.storeId) return (await db.select({ id: stores.id }).from(stores).where(eq(stores.id, links.storeId)).limit(1)).length > 0;
  if (links.workerId) return (await db.select({ id: workers.id }).from(workers).where(eq(workers.id, links.workerId)).limit(1)).length > 0;
  if (links.teamId) return (await db.select({ id: teams.id }).from(teams).where(eq(teams.id, links.teamId)).limit(1)).length > 0;
  return true;
}
