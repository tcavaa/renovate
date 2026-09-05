import { db } from '@/lib/db';
import { rates } from '@/lib/db/schema';
import { rateBookFromRows, type RateBook } from '@/lib/calculator/rates';

/**
 * The rate book the estimate actually uses, read from the `rates` table.
 *
 * Server-side counterpart of `useRateBook()`. Every place on the server that prices rooms —
 * saving a project, rendering a saved one, the materials endpoint — goes through this, so the
 * number a user sees in the calculator and the number stored or shown later are computed from
 * the same book. An unseeded table falls through to the shipped defaults.
 */
export async function loadRateBook(): Promise<RateBook> {
  return rateBookFromRows(await db.select().from(rates));
}
