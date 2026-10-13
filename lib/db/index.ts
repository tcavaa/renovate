import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, types } from 'pg';
import { attachDatabasePool } from '@vercel/functions';
import * as schema from './schema';
import { env } from '@/lib/env';
import { log } from '@/lib/log';
import { databaseSsl, withoutSslParams } from './ssl';

/**
 * `count(*)` and a sum of integers come back as `bigint`, which node-postgres hands over as a
 * string by default. No column of this schema is a bigint — every one of them is a count — so
 * they are numbers here, as MySQL's counts were. `numeric` (the money columns and their sums)
 * stays a string: decimals are strings (docs/data-model.md).
 */
types.setTypeParser(types.builtins.INT8, (value: string) => Number(value));

const globalForDb = globalThis as unknown as {
  pool: Pool | undefined;
};

/**
 * One pool per server instance. On Vercel that is per function instance, which Fluid compute
 * shares between concurrent requests: a few connections each, through Supabase's transaction
 * pooler (`DATABASE_URL` on port 6543), which is what many short-lived instances are meant to
 * use. `attachDatabasePool` lets Vercel close the idle ones before it suspends the instance (it
 * does nothing anywhere else). No prepared statements are named, so the transaction pooler's
 * one-statement-at-a-time sessions are no trouble.
 */
function createPool(): Pool {
  const created = new Pool({
    connectionString: withoutSslParams(env.DATABASE_URL),
    ssl: databaseSsl(env.DATABASE_SSL, env.DATABASE_SSL_CA),
    max: env.DATABASE_POOL_MAX ?? (process.env.VERCEL ? 5 : 10),
    // Short on Vercel: the instance is kept until its idle connections are closed.
    idleTimeoutMillis: process.env.VERCEL ? 5_000 : 30_000,
    connectionTimeoutMillis: 10_000,
  });
  // An idle client whose connection dies (the pooler restarting, a network blip) emits here;
  // unhandled, it would take the whole process down with it.
  created.on('error', (err) => log.warn('database: idle connection lost', { err }));
  attachDatabasePool(created);
  return created;
}

export const pool = globalForDb.pool ?? createPool();

if (env.NODE_ENV !== 'production') {
  globalForDb.pool = pool;
}

export const db = drizzle(pool, { schema });
export { schema };
export type Database = typeof db;
/** A transaction handed to `db.transaction(async (tx) => …)`. */
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
