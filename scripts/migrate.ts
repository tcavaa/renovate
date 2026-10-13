/* eslint-disable no-console */
/**
 * Applies pending migrations from lib/db/migrations (PostgreSQL).
 *
 *   pnpm db:migrate
 *
 * Connects through `DATABASE_MIGRATION_URL` when it is set — Supabase's session pooler (port
 * 5432): DDL and the migrator's own bookkeeping want a session of their own, which the
 * transaction pooler the app uses (port 6543) does not promise — and through `DATABASE_URL`
 * otherwise. The migrator runs every pending file in one transaction (Postgres DDL is
 * transactional): a failure leaves the database as it was.
 *
 * The production deployment runs this before it builds (`scripts/vercel-build.mjs`), so a
 * migration that fails stops the deployment and the previous one keeps serving. Migrations are
 * therefore written to be safe while the previous version still runs: add, backfill, and drop
 * only in a later deployment (docs/data-model.md#migrations-on-postgres).
 */
import './lib/loadEnv';

import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { databaseSsl, withoutSslParams } from '../lib/db/ssl';

const MIGRATIONS = path.join(process.cwd(), 'lib', 'db', 'migrations');

async function main() {
  const url = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL (or DATABASE_MIGRATION_URL) is not set');
  const pool = new Pool({
    connectionString: withoutSslParams(url),
    ssl: databaseSsl(process.env.DATABASE_SSL, process.env.DATABASE_SSL_CA),
    max: 1,
    connectionTimeoutMillis: 15_000,
  });
  try {
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS, migrationsSchema: 'drizzle', migrationsTable: '__drizzle_migrations' });
    console.log('✅ migrations up to date');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌ migration failed:', err);
  process.exit(1);
});
