/* eslint-disable no-console */
/**
 * Partner accounts for every active store and worker, so the portal has someone to log in.
 *
 *   pnpm db:seed:partners                      create missing accounts, keep existing ones
 *   PARTNER_PASSWORD=... pnpm db:seed:partners  use one password for every new account
 *
 * Without PARTNER_PASSWORD a password is generated and printed once per account. Stores and
 * workers that have no e-mail get one made up from their name (`store-<slug>@remonti.ge`), so
 * order notifications have somewhere to go in development — replace them with real addresses
 * in admin. Also makes sure the `platform_settings` row exists with the defaults.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, pool } from '../lib/db';
import { platformSettings, stores, users, workers } from '../lib/db/schema';
import { slugify } from '../lib/utils';

function asciiSlug(name: string, fallback: string): string {
  const s = slugify(name).replace(/[^a-z0-9-]/g, '');
  return s.length >= 3 ? s : fallback;
}

async function ensureSettings() {
  const rows = await db.select({ id: platformSettings.id }).from(platformSettings).limit(1);
  if (rows.length === 0) {
    await db.insert(platformSettings).values({});
    console.log('+ platform_settings row created with the defaults');
  }
}

async function main() {
  await ensureSettings();
  const shared = process.env.PARTNER_PASSWORD;
  let created = 0;

  const storeRows = await db.select().from(stores).where(eq(stores.isActive, true));
  for (const store of storeRows) {
    const slug = asciiSlug(store.nameEn ?? store.nameKa, `store-${store.id}`);
    const email = (store.email && store.email.trim()) || `store-${slug}@remonti.ge`;
    if (!store.email) await db.update(stores).set({ email }).where(eq(stores.id, store.id));
    const existing = await db.select({ id: users.id, role: users.role, storeId: users.storeId }).from(users).where(eq(users.email, email)).limit(1);
    if (existing[0]) {
      if (existing[0].role !== 'store' || existing[0].storeId !== store.id) {
        await db.update(users).set({ role: 'store', storeId: store.id, workerId: null }).where(eq(users.id, existing[0].id));
        console.log(`= ${email} linked to store #${store.id} (${store.nameKa})`);
      }
      continue;
    }
    const password = shared ?? randomBytes(9).toString('base64url');
    await db.insert(users).values({ name: store.nameKa, email, passwordHash: await bcrypt.hash(password, 10), role: 'store', storeId: store.id, emailVerifiedAt: new Date() });
    created++;
    console.log(`+ store   ${store.nameKa.padEnd(28)} ${email.padEnd(40)} ${shared ? '(PARTNER_PASSWORD)' : password}`);
  }

  const workerRows = await db.select().from(workers).where(eq(workers.isActive, true));
  for (const worker of workerRows) {
    const slug = asciiSlug(worker.nameEn ?? worker.nameKa, `worker-${worker.id}`);
    const email = (worker.email && worker.email.trim()) || `worker-${slug}-${worker.id}@remonti.ge`;
    if (!worker.email) await db.update(workers).set({ email }).where(eq(workers.id, worker.id));
    const existing = await db.select({ id: users.id, role: users.role, workerId: users.workerId }).from(users).where(eq(users.email, email)).limit(1);
    if (existing[0]) {
      if (existing[0].role !== 'worker' || existing[0].workerId !== worker.id) {
        await db.update(users).set({ role: 'worker', workerId: worker.id, storeId: null }).where(eq(users.id, existing[0].id));
        console.log(`= ${email} linked to worker #${worker.id} (${worker.nameKa})`);
      }
      continue;
    }
    const password = shared ?? randomBytes(9).toString('base64url');
    await db.insert(users).values({ name: worker.nameKa, email, passwordHash: await bcrypt.hash(password, 10), role: 'worker', workerId: worker.id, emailVerifiedAt: new Date() });
    created++;
    console.log(`+ worker  ${worker.nameKa.padEnd(28)} ${email.padEnd(40)} ${shared ? '(PARTNER_PASSWORD)' : password}`);
  }

  console.log(`\n${created} partner account(s) created, ${storeRows.length} stores and ${workerRows.length} workers checked.`);
  if (created > 0 && !shared) console.log('Passwords above are printed only once — set PARTNER_PASSWORD to choose one instead.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
