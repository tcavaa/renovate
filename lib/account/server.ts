import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { forgetAccount } from '@/lib/auth/accountClaims';
import { accountAddress, addressColumns, type AccountContact, type DeliveryAddress } from './contact';

/**
 * The account's contact as the database holds it — server only. The checkout and the booking
 * build an order's contact from it (`resolveContact`), and the profile edits it.
 */
export async function loadAccountContact(userId: number): Promise<AccountContact | null> {
  const [row] = await db
    .select({ name: users.name, email: users.email, phone: users.phone, addressCity: users.addressCity, addressLine: users.addressLine, addressPostalCode: users.addressPostalCode })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return null;
  return { name: row.name, email: row.email, phone: row.phone?.trim() || null, address: accountAddress(row) };
}

/** Writes the contact onto the account: only the parts given (a `null` address clears it). */
export async function updateAccountContact(userId: number, change: { name?: string; phone?: string | null; address?: DeliveryAddress | null }): Promise<void> {
  const set: Partial<typeof users.$inferInsert> = {};
  if (change.name !== undefined) set.name = change.name;
  if (change.phone !== undefined) set.phone = change.phone?.trim() || null;
  if (change.address !== undefined) {
    const columns = addressColumns(change.address);
    set.addressCity = columns.city;
    set.addressLine = columns.line;
    set.addressPostalCode = columns.postalCode;
  }
  if (Object.keys(set).length === 0) return;
  await db.update(users).set(set).where(eq(users.id, userId));
  // The session carries the name: the next read of it takes the new one.
  if (change.name !== undefined) forgetAccount(userId);
}
